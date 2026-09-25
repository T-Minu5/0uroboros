/** Runtime decisions only. Resolution/animation clocks never read this rate. */
export class DecisionClock {
 key=''; remaining=0; duration:number|null=null; missed=0; hadInput=false; expired=false;
 begin(key:string,seconds:number|null){if(key===this.key)return;this.key=key;this.duration=seconds;this.remaining=(seconds??0)*1000;this.hadInput=false;this.expired=false;}
 input(){this.hadInput=true;this.missed=0;}
 get rate(){return this.missed>0&&!this.hadInput?1.25:1;}
 tick(milliseconds:number):'turn'|'concede'|null {
  if(this.duration===null||this.expired)return null;
  this.remaining=Math.max(0,this.remaining-milliseconds*this.rate);
  if(this.remaining>0)return null;
  this.expired=true;this.missed=this.hadInput?0:this.missed+1;
  return this.missed>=2?'concede':'turn';
 }
}
