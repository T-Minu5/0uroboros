export type TransferDirection = 'choice' | 'left' | 'right' | 'split';
export type TransferFlow = 'either' | 'push' | 'pull';

/** Fixed-side and legacy probability transfers predate pull, so they stay pushes unless a flow was authored. */
export function transferFlow(effect: { kind?: string; direction?: TransferDirection; flow?: TransferFlow }): TransferFlow {
  return effect.flow ?? (effect.kind !== 'probability' && (effect.direction ?? 'choice') === 'choice' ? 'either' : 'push');
}

export const formatAmount = (amount: number) => String(Number.isInteger(amount) ? amount : Number(amount.toFixed(2)));

/** The Transfer sentence shared by printed card text, the activation notice and the choice question.
 * "Push or pull 2 power", "Push 2 power right", "Pull 2 power from the left". A split moves half the amount each way. */
export function transferText(amount: number, direction: TransferDirection = 'choice', flow: TransferFlow = transferFlow({ direction })): string {
  const n = formatAmount(amount);
  const verb = flow === 'push' ? 'Push' : flow === 'pull' ? 'Pull' : 'Push or pull';
  const sides = (left: string, right: string, join: string) => flow === 'pull' ? `from the ${left}${join}${right}` : `${left}${join}${right}`;
  if (direction === 'left' || direction === 'right') {
    if (flow === 'either') return `${verb} ${n} power on the ${direction}`;
    return `${verb} ${n} power ${flow === 'pull' ? `from the ${direction}` : direction}`;
  }
  if (direction === 'split') return amount % 2 === 0 ? `${verb} ${formatAmount(amount / 2)} power ${sides('left', 'right', ' and ')}` : `${verb} ${n} power, split ${sides('left', 'right', ' and ')}`;
  return flow === 'either' ? `${verb} ${n} power` : `${verb} ${n} power ${sides('left', 'right', ' or ')}`;
}
