import { splitLocationText } from '@0uroboros/engine/locationTriggers';

/** Location copy in white, with trigger prefixes in bold and effect phrases in their colour. */
export function LocationText({text}:{text:string}){
 return <>{splitLocationText(text).map((part,index)=>part.trigger
  ?<span key={index} className='location-trigger' data-trigger={part.trigger} style={{color:part.color}}>{part.text}</span>
  :part.effect
   ?<span key={index} className='location-effect' data-effect={part.effect} style={{color:part.color}}>{part.text}</span>
   :part.text)}</>;
}
