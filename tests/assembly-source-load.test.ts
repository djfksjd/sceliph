import {expect,it} from 'vitest';
import {AssemblySourceLoadSession} from '../src/assembly-source-load';
import {createBirdPrimaryStudy} from '../src/engine/bird-primary-study';
import {createLatestIntentGate} from '../src/engine/latest-intent';
const source=createBirdPrimaryStudy(),json=JSON.stringify(source);
const file=(text:()=>Promise<string>,size=100)=>({name:'assembly.json',size,text});
function deferred(){let resolve!:(v:string)=>void,reject!:(e:Error)=>void;const promise=new Promise<string>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
it('blocks synchronous save/export/commit guards before a deferred read and accepts only the newest IR',async()=>{
 const s=new AssemblySourceLoadSession(),a=deferred(),b=deferred(),published:unknown[]=[];
 const first=s.load(file(()=>a.promise),()=>true,v=>published.push(v),()=>{});
 expect(()=>s.assertReady()).toThrow(/unresolved/);
 const next=structuredClone(source);next.components[0].position=[1,2,3];
 const second=s.load(file(()=>b.promise),()=>true,v=>published.push(v),()=>{});
 b.resolve(JSON.stringify(next));await second;s.assertReady();a.resolve(json);await first;
 expect(published).toEqual([next]);expect(s.blocked).toBe(false);
});
it('retains the last valid source and blocks old actions after a read failure, including a stale success',async()=>{
 const s=new AssemblySourceLoadSession(),a=deferred();let current=source;
 const first=s.load(file(()=>a.promise),()=>true,v=>{current=v;},()=>{});
 await s.load(file(async()=>{throw Error('read failed');}),()=>true,v=>{current=v;},()=>{});
 a.resolve(json);await first;expect(current).toBe(source);expect(s.state.status).toBe('failed');expect(()=>s.assertReady()).toThrow();
 s.restore();s.assertReady();expect(current).toBe(source);
});
it('blocks oversized, malformed and unsupported sources without partially publishing and recovers via a valid file',async()=>{
 const s=new AssemblySourceLoadSession();let reads=0,publishes=0;
 await s.load(file(async()=>{reads++;return json;},2_000_001),()=>true,()=>publishes++,()=>{});expect(reads).toBe(0);
 for(const text of ['bad JSON',JSON.stringify({...source,units:'m'}),JSON.stringify({...source,schema:'future'})]){
  await s.load(file(async()=>text),()=>true,()=>publishes++,()=>{});expect(()=>s.assertReady()).toThrow();
 }
 expect(publishes).toBe(0);await s.load(file(async()=>json),()=>true,()=>publishes++,()=>{});s.assertReady();expect(publishes).toBe(1);
});
it('discards late success/failure after restore, external intent cancellation or unmount',async()=>{
 for(const mode of ['restore','external','unmount'])for(const outcome of ['resolve','reject']){
  const gate=createLatestIntentGate(),s=new AssemblySourceLoadSession(gate),r=deferred();let alive=true,publishes=0,notifications=0;
  const task=s.load(file(()=>r.promise),()=>alive,()=>publishes++,()=>notifications++);
  if(mode==='restore')s.restore();else if(mode==='external')gate.cancel();else{alive=false;s.cancel();}
  if(outcome==='resolve')r.resolve(json);else r.reject(Error('late failure'));
  await task;expect(publishes).toBe(0);expect(notifications).toBe(1);
 }
});
it('publishes repeated identical saved files as fresh IR objects',async()=>{
 const s=new AssemblySourceLoadSession(),values:unknown[]=[];
 for(let i=0;i<2;i++)await s.load(file(async()=>json),()=>true,v=>values.push(v),()=>{});
 expect(values[0]).toEqual(source);expect(values[1]).toEqual(source);expect(values[0]).not.toBe(values[1]);
});
it('makes a guard captured before React rerender reject a newly unresolved source synchronously',async()=>{
 const s=new AssemblySourceLoadSession(),r=deferred();const guard=()=>!s.blocked;let commits=0;
 const commit=()=>{if(guard())commits++;};expect(guard()).toBe(true);
 const load=s.load(file(()=>r.promise),()=>true,()=>{},()=>{});commit();expect(commits).toBe(0);
 r.reject(Error('disk failure'));await load;commit();expect(commits).toBe(0);
 s.restore();commit();expect(commits).toBe(1);
});
