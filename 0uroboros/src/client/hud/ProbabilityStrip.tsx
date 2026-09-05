/**
 * Probability distribution.
 *
 * Persistent rather than contextual, because it changes during play and drives
 * the Circuit Reward. Displayed at the configured 0.5% precision so the numbers
 * match the rules exactly.
 */

import type { NodeView } from '../selectors';
import type { FxView } from '../fxPlayback';

export interface ProbabilityStripProps {
  nodes: NodeView[];
  fx?: FxView;
  measuring?: boolean;
  selectedNode?: number | null;
}

export function ProbabilityStrip({
  nodes,
  fx,
  measuring = false,
  selectedNode = null,
}: ProbabilityStripProps) {
  return (
    <div className="chance" style={{ ['--nodes' as string]: nodes.length }}>
      {nodes.map((node) => {
        const value = fx?.chance(node.index) ?? node.probability;
        const moving =
          fx?.active?.kind === 'chance' &&
          (fx.active.fromNode === node.index || fx.active.toNode === node.index);
        const picked = selectedNode === node.index || node.isCollapseSelection;
        return (
        <div
          key={node.index}
          className="chance__cell"
          data-selected={picked}
          data-pulse={moving || measuring}
          data-measure={measuring}
        >
          <div className="chance__row">
            <span>{node.isCollapseSelection ? 'Selected' : `N${node.index + 1}`}</span>
            <span className="chance__pct" data-pop={moving}>
              {formatPercent(value)}
            </span>
          </div>
          <div className="chance__track">
            <div
              className="chance__fill"
              style={{ transform: `scaleX(${value / 100})` }}
            />
          </div>
        </div>
        );
      })}
    </div>
  );
}

/** Show a half-point only when one exists, so 30 does not read as 30.0. */
function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
