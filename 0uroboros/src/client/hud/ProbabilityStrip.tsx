/**
 * Probability distribution.
 *
 * Persistent rather than contextual, because it changes during play and drives
 * the Circuit Reward. Displayed at the configured 0.5% precision so the numbers
 * match the rules exactly.
 */

import type { NodeView } from '../selectors';

export interface ProbabilityStripProps {
  nodes: NodeView[];
}

export function ProbabilityStrip({ nodes }: ProbabilityStripProps) {
  return (
    <div className="chance" style={{ ['--nodes' as string]: nodes.length }}>
      {nodes.map((node) => (
        <div key={node.index} className="chance__cell" data-selected={node.isCollapseSelection}>
          <div className="chance__row">
            <span>{node.isCollapseSelection ? 'Selected' : `N${node.index + 1}`}</span>
            <span className="chance__pct">{formatPercent(node.probability)}</span>
          </div>
          <div className="chance__track">
            <div className="chance__fill" style={{ width: `${node.probability}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Show a half-point only when one exists, so 30 does not read as 30.0. */
function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
