import type { EvaluationEffect } from './game';

/** Exact recovered fixtures approved by Mel for this evaluation build. */
/** Location/circuit recipes accept the full evaluation set; legacy aliases remain valid. */
export type LocationRewardEffect = EvaluationEffect;
export type LocationScheduleEntry = { at: 2 | 3; effects: readonly LocationRewardEffect[] };
export type EvaluationLocation = {
  id: string;
  name: string;
  rule: string;
  reward: string;
  /** On Collapse — winner/loser (or once for node-wide card effects). */
  effects: readonly LocationRewardEffect[];
  /** Each Runtime turn after reveal, while this Location is open. Beneficiary = current controller (opponent → trailer). */
  ongoing?: readonly LocationRewardEffect[];
  /** When a card reveals at this Location. Beneficiary = that card's owner. */
  onPlay?: readonly LocationRewardEffect[];
  /** After Runtime turn `at` ends (never turn 1). Only fires if this Location was already open that turn. */
  schedule?: readonly LocationScheduleEntry[];
};
export type CircuitRewardEffect = EvaluationEffect;
export type CircuitRewardDefinition = { id: string; name: string; text: string; cost: 0; effect: CircuitRewardEffect; effects?: readonly CircuitRewardEffect[] };
export const EVALUATION_LOCATIONS: readonly EvaluationLocation[] = [
  { id: "data_exchange", name: "Data exchange", rule: "On collapse, the winner gains 2 Crypto.", reward: "+2 Crypto to the winner.", effects: [{ kind: "crypto", amount: 2 }] },
  { id: "occult_archive", name: "Occult archive", rule: "On collapse, the winner gains 2 Victory Points.", reward: "+2 VP to the winner.", effects: [{ kind: "vp", amount: 2 }] },
  { id: "quantum_commons", name: "Quantum commons", rule: "On collapse, the winner gains 1 Crypto and 1 Victory Point.", reward: "+1 Crypto and +1 VP to the winner.", effects: [{ kind: "crypto", amount: 1 }, { kind: "vp", amount: 1 }] },
  { id: "signal_tower", name: "Signal tower", rule: "On collapse, the winner draws 1 card.", reward: "Draw 1 card.", effects: [{ kind: "draw", amount: 1 }] },
  { id: "breach_relay", name: "Breach relay", rule: "On collapse, the loser takes 200 Server damage.", reward: "Deal 200 to the final loser's available Server. No damage on a tie.", effects: [{ kind: "damageLoser", amount: 200 }] },
  { id: "trash_compactor", name: "Trash Compactor", rule: "On collapse, trash the lowest-Power revealed card at this Location, regardless of who controls it.", reward: "Trash the lowest-Power card here.", effects: [{ kind: "trashLowestAtLocation", amount: 1, boardSide: "either" }] },
];
export const EVALUATION_CIRCUIT_REWARDS: readonly CircuitRewardDefinition[] = [
  { id: "quantum_dividend", name: "Quantum dividend", text: "Gain 5 Crypto for this Draft.", cost: 0, effect: { kind: "crypto", amount: 5 } },
  { id: "serpent_crown", name: "Serpent crown", text: "Gain 4 Victory Points.", cost: 0, effect: { kind: "vp", amount: 4 } },
  { id: "integrity_patch", name: "Integrity patch", text: "Heal up to 400 to your Primary Server. Cannot revive a destroyed Primary.", cost: 0, effect: { kind: "restorePrimary", amount: 400 } },
];
