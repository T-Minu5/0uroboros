/**
 * Presentation events derived from an already-resolved Collapse report.
 * This is not a second rules engine.
 */

import type { CollapseNodeReport, CollapseReport, PlayerID } from '../../game/types';
import { collapseReportId, type PresentationEvent } from './queue';
import type { PresentationTiming } from './timing';

export function buildCollapseScript(
  report: CollapseReport,
  viewer: PlayerID,
  timing: PresentationTiming,
): PresentationEvent[] {
  const reportId = collapseReportId(report.serial);
  const events: PresentationEvent[] = [
    {
      id: `${reportId}:title`,
      reportId,
      kind: 'phase_announcement',
      holdMs: timing.collapseTitleMs,
      title: 'Wave Collapse',
      kicker: `Cycle ${report.cycle}`,
      lines: ['Nodes resolve in order, then probability selects the Circuit Reward.'],
      nodeIndex: null,
    },
  ];

  for (const node of report.nodes) {
    const prefix = `${reportId}:n${node.index}`;
    const isLastNode = node.index === report.nodes[report.nodes.length - 1]?.index;
    // Snap sequencing: after each Node's last beat, hold a gap before the next
    // Node begins so cause/effect for that Node can settle.
    const gap = isLastNode ? 0 : timing.collapseNodeGapMs;
    events.push({
      id: `${prefix}:location`,
      reportId,
      kind: 'location_resolution',
      holdMs: timing.locationMinimumReadMs,
      title: node.locationName || `Node ${node.index + 1}`,
      kicker: `Node ${node.index + 1} · Location`,
      lines: [node.locationText || 'No Location text.'],
      nodeIndex: node.index,
    });
    events.push({
      id: `${prefix}:result`,
      reportId,
      kind: 'node_result',
      holdMs: timing.nodeResultMinimumReadMs + (node.rewardText ? 0 : gap),
      title: nodeResultTitle(node, viewer),
      kicker: `Node ${node.index + 1} · Power`,
      lines: [
        `You ${viewer === '0' ? node.power0 : node.power1} · Them ${viewer === '0' ? node.power1 : node.power0}`,
      ],
      nodeIndex: node.index,
    });
    if (node.rewardText) {
      events.push({
        id: `${prefix}:reward`,
        reportId,
        kind: 'location_reward',
        holdMs: timing.locationMinimumReadMs + gap,
        title: 'Location reward',
        kicker: `Node ${node.index + 1} · ${node.locationName}`,
        lines: [node.rewardText],
        nodeIndex: node.index,
      });
    }
  }

  if (report.endedEarly) return events;

  events.push({
    id: `${reportId}:measure`,
    reportId,
    kind: 'collapse_final_probability',
    holdMs: timing.collapseFinalSelectionMs,
    title: 'Probability measurement',
    kicker: 'Wave Collapse',
    lines: ['The remaining weights choose one Node for the Circuit Reward.'],
    nodeIndex: null,
  });
  events.push({
    id: `${reportId}:select`,
    reportId,
    kind: 'collapse_selection',
    holdMs: timing.collapseFinalSelectionMs,
    title:
      report.selectedNode === null
        ? 'No Node selected'
        : `Node ${report.selectedNode + 1} is selected`,
    kicker: 'Final selection',
    lines: [
      report.selectedNode === null
        ? 'No Circuit Reward this Cycle.'
        : report.nodes.find((node) => node.index === report.selectedNode)?.locationName ??
          'Circuit Reward',
    ],
    nodeIndex: report.selectedNode,
  });
  events.push({
    id: `${reportId}:reward`,
    reportId,
    kind: 'circuit_reward',
    holdMs: timing.collapseWinnerMs,
    title: collapseWinnerTitle(report.eligible, viewer),
    kicker: 'Circuit Reward',
    lines: [
      report.selectedNode === null
        ? 'Draft follows.'
        : `Eligibility from Node ${report.selectedNode + 1}.`,
    ],
    nodeIndex: report.selectedNode,
  });

  return events;
}

export function nodeResultTitle(node: CollapseNodeReport, viewer: PlayerID): string {
  if (node.winner === null) return 'Tied';
  return node.winner === viewer ? 'You win the Node' : 'Opponent wins the Node';
}

export function collapseWinnerTitle(eligible: PlayerID[], viewer: PlayerID): string {
  if (eligible.length === 2) return 'Both players share the Wave Collapse';
  if (eligible[0] === viewer) return 'You win the Wave Collapse';
  if (eligible[0]) return `Player ${eligible[0]} wins the Wave Collapse`;
  return 'Wave Collapse ends';
}
