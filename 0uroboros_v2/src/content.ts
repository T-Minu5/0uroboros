/** Exact recovered fixtures approved by Mel for this evaluation build. */
export type LocationRewardEffect = { kind: "crypto" | "vp" | "draw" | "damageLoser"; amount: number };
export type EvaluationLocation = { id: string; name: string; rule: string; reward: string; effects: readonly LocationRewardEffect[] };
export type CircuitRewardEffect = { kind: "crypto" | "vp" | "restorePrimary"; amount: number };
export type CircuitRewardDefinition = { id: string; name: string; text: string; cost: 0; effect: CircuitRewardEffect; effects?: readonly CircuitRewardEffect[] };
export const EVALUATION_LOCATIONS: readonly EvaluationLocation[] = [
  { id: "data_exchange", name: "Data exchange", rule: "On collapse, the winner gains 2 Crypto.", reward: "+2 Crypto to the winner.", effects: [{ kind: "crypto", amount: 2 }] },
  { id: "occult_archive", name: "Occult archive", rule: "On collapse, the winner gains 2 Victory Points.", reward: "+2 VP to the winner.", effects: [{ kind: "vp", amount: 2 }] },
  { id: "quantum_commons", name: "Quantum commons", rule: "On collapse, the winner gains 1 Crypto and 1 Victory Point.", reward: "+1 Crypto and +1 VP to the winner.", effects: [{ kind: "crypto", amount: 1 }, { kind: "vp", amount: 1 }] },
  { id: "signal_tower", name: "Signal tower", rule: "On collapse, the winner draws 1 card.", reward: "Draw 1 card.", effects: [{ kind: "draw", amount: 1 }] },
  { id: "breach_relay", name: "Breach relay", rule: "On collapse, the loser takes 200 Data Center damage.", reward: "Deal 200 to the final loser's available Data Center. No damage on a tie.", effects: [{ kind: "damageLoser", amount: 200 }] },
];
export const EVALUATION_CIRCUIT_REWARDS: readonly CircuitRewardDefinition[] = [
  { id: "quantum_dividend", name: "Quantum dividend", text: "Gain 5 Crypto for this Draft.", cost: 0, effect: { kind: "crypto", amount: 5 } },
  { id: "serpent_crown", name: "Serpent crown", text: "Gain 4 Victory Points.", cost: 0, effect: { kind: "vp", amount: 4 } },
  { id: "integrity_patch", name: "Integrity patch", text: "Heal up to 400 to your Primary Data Center. Cannot revive a destroyed Primary.", cost: 0, effect: { kind: "restorePrimary", amount: 400 } },
];
