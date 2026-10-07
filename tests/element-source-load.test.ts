import {expect,it} from 'vitest';
import {ElementSourceLoadSession} from '../src/element-source-load';
import {generateBearingProject} from '../src/engine/bearing-pack';
import {editPart,serializeProject,type ElementProject} from '../src/engine/element-project';
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const file=(text:()=>Promise<string>,size=100)=>({name:'source.json',size,text});
const source=generateBearingProject({}),json=serializeProject(source);
it('blocks immediately, parses actual native IR and accepts only the newest selection',async()=>{
 const session=new ElementSourceLoadSession(),a=deferred<string>(),b=deferred<string>(),published:ElementProject[]=[];
 const notify=()=>{},first=session.load(file(()=>a.promise),()=>true,p=>published.push(p),notify);
 expect(session.blocked).toBe(true);expect(session.state.status).toBe('reading');
 const next=editPart(source,'ball_0000',{position:[10,20,30]}),second=session.load(file(()=>b.promise),()=>true,p=>published.push(p),notify);
 b.resolve(serializeProject(next));await second;expect(session.blocked).toBe(false);expect(published).toEqual([next]);
 a.resolve(json);await first;expect(published).toEqual([next]);expect(session.state).toEqual({status:'ready'});
});
it('keeps old project unchanged and blocked after read failure; stale success cannot unblock it',async()=>{
 const session=new ElementSourceLoadSession(),a=deferred<string>(),old=structuredClone(source);let project=source;
 const first=session.load(file(()=>a.promise),()=>true,p=>{project=p;},()=>{});
 await session.load(file(async()=>{throw Error('disk read failed');}),()=>true,p=>{project=p;},()=>{});
 expect(session.state).toEqual({status:'failed',name:'source.json',error:'disk read failed'});expect(session.blocked).toBe(true);
 a.resolve(json);await first;expect(session.blocked).toBe(true);expect(project).toEqual(old);
 session.restore();expect(session.blocked).toBe(false);expect(project).toEqual(old);
});
it('rejects oversized or malformed sources before applying and recovers only through explicit restore or valid load',async()=>{
 const session=new ElementSourceLoadSession();let reads=0,publishes=0;
 await session.load(file(async()=>{reads++;return json;},2_000_001),()=>true,()=>publishes++,()=>{});
 expect(reads).toBe(0);expect(session.blocked).toBe(true);
 await session.load(file(async()=>'{invalid'),()=>true,()=>publishes++,()=>{});expect(session.blocked).toBe(true);
 await session.load(file(async()=>JSON.stringify({schema:'future'})),()=>true,()=>publishes++,()=>{});expect(publishes).toBe(0);
 await session.load(file(async()=>json),()=>true,()=>publishes++,()=>{});expect(publishes).toBe(1);expect(session.blocked).toBe(false);
});
it('discards late success/failure after restore or unmount without publishing state',async()=>{
 for(const mode of ['restore','unmount'])for(const outcome of ['resolve','reject']){
  const session=new ElementSourceLoadSession(),read=deferred<string>();let alive=true,publishes=0,notifications=0;
  const task=session.load(file(()=>read.promise),()=>alive,()=>publishes++,()=>notifications++);
  if(mode==='restore')session.restore();else{alive=false;session.cancel();}
  if(outcome==='resolve')read.resolve(json);else read.reject(Error('late failure'));
  await task;expect(publishes).toBe(0);expect(notifications).toBe(1);
  if(mode==='restore')expect(session.blocked).toBe(false);
 }
});
it('reloads identical saved IR as a fresh import and permits further native editing without accumulating translation',async()=>{
 const session=new ElementSourceLoadSession();let project=source;const moved=editPart(source,'ball_0000',{position:[10,20,30]}),text=serializeProject(moved);
 for(let i=0;i<2;i++){await session.load(file(async()=>text),()=>true,p=>{project=p;},()=>{});expect(project).toEqual(moved);expect(session.blocked).toBe(false);}
 const edited=editPart(project,'ball_0000',{position:[11,20,30]});expect(edited.parts.find(p=>p.id==='ball_0000')?.position).toEqual([11,20,30]);
 expect(source.parts.find(p=>p.id==='ball_0000')?.position).not.toEqual([11,20,30]);
});
