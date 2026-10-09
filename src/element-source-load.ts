import {DomainRequestMismatch}from'./engine/domain-requirements';
import type {DeclarationCorrection}from'./engine/declaration-correction';
import {createLatestIntentGate} from './engine/latest-intent';
import {parseProject,type ElementProject} from './engine/element-project';
export type ElementSourceLoadState={status:'ready'}|{status:'reading';name:string}|{status:'failed';name:string;error:string;correction?:DeclarationCorrection};
/** Owns file-import intent, not geometry validation or permanent approval.
 * A failed/new selection blocks reuse until explicit restore or valid import.
 */
export class ElementSourceLoadSession{
 constructor(private readonly decode:(text:string)=>ElementProject=parseProject){}
 private intent=createLatestIntentGate();
 state:ElementSourceLoadState={status:'ready'};
 get blocked():boolean{return this.state.status!=='ready';}
 restore():void{this.intent.cancel();this.state={status:'ready'};}
 cancel():void{this.intent.cancel();}
 async load(file:Pick<File,'name'|'size'|'text'>,active:()=>boolean,publish:(project:ElementProject)=>void,notify:(state:ElementSourceLoadState)=>void,decode:(text:string)=>ElementProject=this.decode):Promise<void>{
  const token=this.intent.begin(),current=()=>active()&&this.intent.isCurrent(token);
  this.state={status:'reading',name:file.name};notify(this.state);
  try{
   if(file.size>2_000_000)throw Error('File exceeds 2 MB');
   const text=await file.text();if(!current())return;
   const project=decode(text);if(!current())return;
   publish(project);this.state={status:'ready'};notify(this.state);
  }catch(error){
   if(!current())return;
   this.state={status:'failed',name:file.name,error:error instanceof Error?error.message:String(error),...(error instanceof DomainRequestMismatch&&error.feedback?{correction:error.feedback}:{})};notify(this.state);
  }
 }
}
