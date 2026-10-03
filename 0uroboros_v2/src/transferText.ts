export type TransferDirection = 'choice' | 'left' | 'right' | 'split';
export type TransferFlow = 'either' | 'push' | 'pull';

/** Fixed-side and legacy probability transfers predate pull, so they stay pushes unless a flow was authored. */
export function transferFlow(effect: { kind?: string; direction?: TransferDirection; flow?: TransferFlow }): TransferFlow {
  return effect.flow ?? (effect.kind !== 'probability' && (effect.direction ?? 'choice') === 'choice' ? 'either' : 'push');
}

export const formatAmount = (amount: number) => String(Number.isInteger(amount) ? amount : Number(amount.toFixed(2)));

/** The Transfer sentence shared by printed card text, the activation notice and the choice question. */
export function transferText(amount: number, direction: TransferDirection = 'choice', flow: TransferFlow = transferFlow({ direction })): string {
  const n = formatAmount(amount);
  const verb = flow === 'push' ? 'Push' : flow === 'pull' ? 'Pull' : 'Push or pull';
  const link = flow === 'push' ? 'to' : flow === 'pull' ? 'from' : 'to or from';
  if (direction === 'left' || direction === 'right') return `${verb} ${n} power ${link} the location on the ${direction}`;
  if (direction === 'split') return `${verb} ${n} power, split ${link} both nearby locations`;
  return flow === 'either' ? `${verb} ${n} power ${link} nearby locations` : `${verb} ${n} power ${link} a nearby location`;
}
