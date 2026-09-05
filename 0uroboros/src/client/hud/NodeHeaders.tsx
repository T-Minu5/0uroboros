/**
 * Node headers, rendered in 2D above the 3D columns.
 *
 * Text and numerals stay out of Three.js. The grid uses the same column count as
 * the board, and the board camera is orthographic with a fixed frustum, so the
 * headers stay aligned with their Nodes at any viewport size.
 */

import type { NodeView } from '../selectors';

export interface NodeHeadersProps {
  nodes: NodeView[];
  legalNodes: number[];
}

const STATE_LABELS: Record<NodeView['state'], string> = {
  closed: 'Closed',
  open: 'Open',
  collapsed: 'Collapsed',
};

export function NodeHeaders({ nodes, legalNodes }: NodeHeadersProps) {
  return (
    <div className="node-heads" style={{ ['--nodes' as string]: nodes.length }}>
      {nodes.map((node) => (
        <div
          key={node.index}
          className="node-head"
          data-state={node.state}
          data-legal={legalNodes.includes(node.index)}
        >
          <span className="node-head__index">
            {`Node ${node.index + 1} · ${STATE_LABELS[node.state]}`}
          </span>
          <span className="node-head__name">
            {node.state === 'closed' ? 'Location hidden' : node.locationName}
          </span>
          <span className="node-head__power">
            <b className="rival">{node.rivalPower}</b>
            <span className="sep">vs</span>
            <b className="self">{node.selfPower}</b>
          </span>
          <span className="node-head__lead">
            {node.leader === null
              ? 'Tied'
              : node.leader === 'self'
                ? 'You lead'
                : 'Opponent leads'}
          </span>
        </div>
      ))}
    </div>
  );
}
