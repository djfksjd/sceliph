"""Optional offline evidence runner; existing float GGUF + installed Transformers.
No downloads/server/custom model code. CPU only, <=3.1GB file/1024 tensors.
"""
import os,json,struct,hashlib,re,sys,time,resource
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
import numpy as np
import torch
from transformers import Qwen3Config,Qwen3ForCausalLM
from transformers.integrations.ggml import GGUFQwen2Converter
if len(sys.argv)!=4:raise SystemExit('usage: offline-qwen-ir.py FLOAT_MODEL.gguf TASKS.json NEW_DIRECTORY')
model_path,tasks_path,out=map(Path,sys.argv[1:]);tasks=json.loads(tasks_path.read_text());out.mkdir()
if not 0<model_path.stat().st_size<=3_100_000_000:raise ValueError('Model file budget')
f=model_path.open('rb')
def read(n):
 b=f.read(n)
 if len(b)!=n:raise ValueError('Truncated GGUF')
 return b
def string():
 n=struct.unpack('<Q',read(8))[0]
 if n>2_000_000:raise ValueError('String budget')
 return read(n).decode()
def value(t):
 formats={0:'B',1:'b',2:'H',3:'h',4:'I',5:'i',6:'f',7:'?',10:'Q',11:'q',12:'d'}
 if t in formats:fmt='<'+formats[t];return struct.unpack(fmt,read(struct.calcsize(fmt)))[0]
 if t==8:return string()
 if t==9:
  typ,n=struct.unpack('<IQ',read(12))
  if n>200_000 or typ==9:raise ValueError('Array budget')
  return [value(typ)for _ in range(n)]
 raise ValueError('Unsupported metadata')
if read(4)!=b'GGUF':raise ValueError('Not GGUF')
version,nt,nk=struct.unpack('<IQQ',read(20))
if version!=3 or nt>1024 or nk>128:raise ValueError('Unsupported header')
kv={}
for _ in range(nk):k=string();kv[k]=value(struct.unpack('<I',read(4))[0])
if kv.get('general.architecture')!='qwen3' or kv.get('qwen3.embedding_length')!=1024 or kv.get('qwen3.block_count')!=28:raise ValueError('Only installed Qwen3/0.6B supported')
tensors=[]
for _ in range(nt):
 name=string();nd=struct.unpack('<I',read(4))[0]
 if not 1<=nd<=2:raise ValueError('Unsupported tensor rank')
 shape=struct.unpack('<'+'Q'*nd,read(8*nd));typ,offset=struct.unpack('<IQ',read(12))
 if typ not in [0,1]:raise ValueError('Use existing llama-quantize float conversion; quantized tensors unsupported')
 tensors.append((name,shape,typ,offset))
alignment=kv.get('general.alignment',32)
if alignment!=32:raise ValueError('Unsupported alignment')
start=(f.tell()+31)//32*32;f.close()
mapping={'token_embd.weight':'model.embed_tokens.weight','output_norm.weight':'model.norm.weight','output.weight':'lm_head.weight'}
layer={'attn_q':'self_attn.q_proj','attn_k':'self_attn.k_proj','attn_v':'self_attn.v_proj','attn_q_norm':'self_attn.q_norm','attn_k_norm':'self_attn.k_norm','attn_output':'self_attn.o_proj','attn_norm':'input_layernorm','ffn_norm':'post_attention_layernorm','ffn_gate':'mlp.gate_proj','ffn_up':'mlp.up_proj','ffn_down':'mlp.down_proj'}
state={};tensor_bytes=0
for name,shape,typ,offset in tensors:
 target=mapping.get(name)
 if not target:
  m=re.fullmatch(r'blk\.(\d+)\.(\w+)\.weight',name)
  if not m or int(m[1])>=28 or m[2] not in layer:raise ValueError('Unknown model tensor '+name)
  target='model.layers.'+m[1]+'.'+layer[m[2]]+'.weight'
 dtype=np.dtype('<f4' if typ==0 else '<f2');n=int(np.prod(shape));size=n*dtype.itemsize;tensor_bytes+=size
 if start+offset+size>model_path.stat().st_size:raise ValueError('Tensor escapes file')
 a=np.memmap(model_path,mode='c',dtype=dtype,offset=start+offset,shape=tuple(reversed(shape)))
 state[target]=torch.from_numpy(a)
config=Qwen3Config(vocab_size=len(kv['tokenizer.ggml.tokens']),hidden_size=1024,intermediate_size=3072,num_hidden_layers=28,num_attention_heads=16,num_key_value_heads=8,head_dim=128,max_position_embeddings=40960,rope_theta=kv['qwen3.rope.freq_base'],rms_norm_eps=kv['qwen3.attention.layer_norm_rms_epsilon'],tie_word_embeddings=False,attention_bias=False)
config._attn_implementation='sdpa'
with torch.device('meta'):model=Qwen3ForCausalLM(config)
model.load_state_dict(state,strict=True,assign=True)
# RoPE is a non-persistent buffer, so state loading cannot materialize it.
from transformers.models.qwen3.modeling_qwen3 import Qwen3RotaryEmbedding
model.model.rotary_emb=Qwen3RotaryEmbedding(config,device='cpu')
if any(t.is_meta for t in list(model.parameters())+list(model.buffers())):raise ValueError('Unmaterialized runtime tensor')
model.eval();torch.set_num_threads(4)
tokenizer=GGUFQwen2Converter({'tokens':kv['tokenizer.ggml.tokens'],'merges':kv['tokenizer.ggml.merges']}).converted()
from tokenizers import AddedToken
# Qwen3 adds user-defined thinking tokens beyond the Qwen2 converter's
# three controls. Register the GGUF token declarations, preserving token IDs.
for token,kind in zip(kv['tokenizer.ggml.tokens'],kv['tokenizer.ggml.token_type']):
 if kind in [3,4]:tokenizer.add_tokens([AddedToken(token,normalized=False,special=kind==3)])
for token in ['<|im_start|>','<|im_end|>','<think>','</think>']:
 if tokenizer.encode(token).ids!=[kv['tokenizer.ggml.tokens'].index(token)]:raise ValueError('Tokenizer control ID mismatch')
end=tokenizer.token_to_id('<|im_end|>')
if not isinstance(tasks,list) or not 1<=len(tasks)<=12:raise ValueError('Task budget')
rows=[]
for task in tasks:
 if set(task) not in [{'id','system','request'},{'id','system','request','prefix'},{'id','system','request','candidates'},{'id','system','request','candidates','choiceSeed'}] or not re.fullmatch(r'[a-z0-9-]{1,80}',task['id']):raise ValueError('Task contract')
 if len(task['system'])+len(task['request'])>8192:raise ValueError('Prompt budget')
 prefix=task.get('prefix','')
 if not isinstance(prefix,str) or len(prefix)>512:raise ValueError('Prefix budget')
 if 'choiceSeed' in task:
  if type(task['choiceSeed']) is not int or not 0<=task['choiceSeed']<=2**31-1 or not isinstance(task['candidates'],list) or not 2<=len(task['candidates'])<=8:raise ValueError('Sampled choice budget')
  options='\n'.join(chr(65+i)+': '+c['description'] for i,c in enumerate(task['candidates']))
  task={**task,'request':task['request']+'\nChoose the correct option. Reply with one letter only.\n'+options}
 prompt='<|im_start|>system\n'+task['system']+'<|im_end|>\n<|im_start|>user\n'+task['request']+'\n/no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n'+prefix
 ids=tokenizer.encode(prompt).ids
 if len(ids)>2048:raise ValueError('Context budget')
 (out/(task['id']+'.prompt.txt')).write_text(prompt)
 input_ids=torch.tensor([ids]);begin=time.monotonic();torch.manual_seed(task.get('choiceSeed',42))
 if 'choiceSeed' in task:
  candidates=task['candidates'];letters=[tokenizer.encode(chr(65+i)).ids for i in range(len(candidates))]
  if any(len(x)!=1 for x in letters):raise ValueError('Choice tokenization')
  with torch.inference_mode():logits=model(input_ids,attention_mask=torch.ones_like(input_ids),use_cache=False).logits[0,-1].float()
  probabilities=torch.softmax(logits[torch.tensor([x[0] for x in letters])]/.7,dim=0)
  best=int(torch.multinomial(probabilities,1));output_ids=letters[best];response=json.dumps(candidates[best]['response'],separators=(',',':'));suffix=response;strategy='sampled-constrained-choice-token'
  (out/(task['id']+'.ranking.json')).write_text(json.dumps({'strategy':strategy,'seed':task['choiceSeed'],'temperature':.7,'selectedId':candidates[best]['id'],'letter':chr(65+best),'probabilities':probabilities.tolist()},indent=2)+'\n')
 elif 'candidates' in task:
  candidates=task['candidates']
  if not isinstance(candidates,list) or not 2<=len(candidates)<=32:raise ValueError('Candidate budget')
  scores=[]
  for candidate in candidates:
   if set(candidate)!={'id','description','response'} or len(candidate['description'])>512:raise ValueError('Candidate contract')
   choice=tokenizer.encode(candidate['description']).ids
   sequence=torch.tensor([ids+choice])
   with torch.inference_mode():
    logits=model(sequence,attention_mask=torch.ones_like(sequence),use_cache=False).logits[0,len(ids)-1:-1].float()
    lp=torch.log_softmax(logits,dim=-1).gather(1,torch.tensor(choice).unsqueeze(1)).squeeze(1)
   score=float(lp.mean())
   if not np.isfinite(score):raise ValueError('Non-finite action score')
   scores.append({'id':candidate['id'],'meanLogProbability':score,'tokenIds':choice,'tokenLogProbabilities':lp.tolist()})
  ordered=sorted(range(len(scores)),key=lambda i:scores[i]['meanLogProbability'],reverse=True);best=ordered[0];gap=scores[best]['meanLogProbability']-scores[ordered[1]]['meanLogProbability']
  if gap<.01:raise ValueError('Ambiguous action ranking; minimum log-score gap0.01')
  response=json.dumps(candidates[best]['response'],separators=(',',':'));output_ids=scores[best]['tokenIds']
  (out/(task['id']+'.ranking.json')).write_text(json.dumps({'strategy':'model-ranked-engine-actions','minimumGap':.01,'gap':gap,'selectedId':scores[best]['id'],'scores':scores},indent=2)+'\n')
  strategy='model-ranked-engine-actions';suffix=response
 else:
  with torch.inference_mode():result=model.generate(input_ids,attention_mask=torch.ones_like(input_ids),max_new_tokens=640,do_sample=False,eos_token_id=end,pad_token_id=end)
  output_ids=result[0,len(ids):].tolist();suffix=tokenizer.decode(output_ids,skip_special_tokens=True);response=prefix+suffix;strategy='free-generation-with-declared-prefix'
 (out/(task['id']+'.raw-suffix.txt')).write_text(suffix)
 (out/(task['id']+'.response.txt')).write_text(response)
 rows.append({'id':task['id'],'promptSha256':hashlib.sha256(prompt.encode()).hexdigest(),'responseSha256':hashlib.sha256(response.encode()).hexdigest(),'outputTokenIds':output_ids,'strategy':strategy,'choiceSeed':task.get('choiceSeed'),'assistantPrefix':prefix,'suffixSha256':hashlib.sha256(suffix.encode()).hexdigest(),'seconds':time.monotonic()-begin,'inputTokens':len(ids),'outputTokens':len(output_ids)})
 (out/'run.json').write_text(json.dumps({'schema':'sceliph.offline-qwen-evidence/0.1','model':'installed Qwen3/0.6B; float-dequantized existing GGUF','modelPath':str(model_path),'transformers':__import__('transformers').__version__,'torch':torch.__version__,'runtime':'CPU,4threads','networkCalls':0,'greedy':not any('choiceSeed' in t for t in tasks),'maximumNewTokens':640,'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'tensorBytes':tensor_bytes,'rows':rows},indent=2)+'\n')
 print(task['id'],len(output_ids),'tokens',round(rows[-1]['seconds'],2),'seconds',flush=True)
