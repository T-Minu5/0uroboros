import { boardScanTotalMs } from './NeonHorizonScan';
import type { RuntimeEvent } from './runtime';

export function isNoTargetEvent(event: Pick<RuntimeEvent, 'text' | 'amount'>): boolean {
  return /no target/i.test(event.text);
}

/** Presentation only: every authoritative event still executes and enters history. */
export function eventTime(event: RuntimeEvent, fast: boolean): number {
 if(event.text==='No scheduled Runtime effects.')return 0;
 if(isNoTargetEvent(event))return fast?450:700;
 if(event.stage==='node-close')return fast?1000:1400;
 if(event.stage==='node-award')return fast?280:500;
 if(event.kind==='collapse'&&event.text.startsWith('Wave Collapse'))return boardScanTotalMs(fast);
 if(event.kind==='reward'&&!event.target)return 0;
 if(event.target&&event.amount===0)return 0;
 if(event.kind==='collapse'&&(event.text.startsWith('No starter card')||event.text.startsWith('No card onCollapse')||event.text.includes('No Duration cards')))return 0;
 if(['move','morph','probability','trash','bank'].includes(event.kind)||event.kind==='power'&&(event.targetNode!==undefined||event.targetCardId!==undefined))return fast?650:1100;
 const duration=event.kind==='circuit'?2200:event.target?1050:event.kind==='reveal'?760:event.kind==='power'?480:event.kind==='location'?220:event.kind==='turn'?650:event.kind==='draft'?280:600;
 // Even fast mode leaves a readable contact and recovery interval.
 return fast?Math.max(event.target?500:160,duration*.55):duration;
}
