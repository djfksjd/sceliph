import {createLatestIntentGate} from './engine/latest-intent';
import {validateAssemblyIR} from './engine/assembly-compiler';
import type {AssemblyIR} from './engine/assembly-ir';
export type AssemblySourceLoadState={status:'ready'}|{status:'reading';name:string}|{status:'failed';name:string;error:string};
/** Shares the viewer's import intent. Retains no source, geometry or approval. */
export class AssemblySourceLoadSession{
 state:AssemblySourceLoadState={status:'ready'};
 constructor(private intent=createLatestIntentGate()){}
 get blocked(){return this.state.status!=='ready';}
 restore(){this.intent.cancel();this.state={status:'ready'};}
 cancel(){this.intent.cancel();}
 assertReady(){if(this.blocked)throw Error('Assembly source is unresolved; open a valid IR or discard the file selection.');}
 async load(file:Pick<File,'name'|'size'|'text'>,active:()=>boolean,publish:(ir:AssemblyIR)=>void,notify:(state:AssemblySourceLoadState)=>void){
  const token=this.intent.begin(),current=()=>active()&&this.intent.isCurrent(token);
  this.state={status:'reading',name:file.name};notify(this.state);
  try{
   if(file.size>2_000_000)throw Error('AssemblyIR exceeds 2 MB.');
   const text=await file.text();if(!current())return;
   const value:unknown=JSON.parse(text);validateAssemblyIR(value);if(!current())return;
   publish(value);this.state={status:'ready'};notify(this.state);
  }catch(error){if(!current())return;this.state={status:'failed',name:file.name,error:error instanceof Error?error.message:String(error)};notify(this.state);}
 }
}
