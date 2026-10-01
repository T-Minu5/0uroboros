import { normalizeWorkPackageAuthority } from './authority';
import { shouldConsultLookDev } from './lookdev';
import { shouldConsultResearch } from './research';
import type { CanonicalIndex } from './context';
import type {
  EvidenceRecord,
  OrchestrationResult,
  SystemsFinding,
  WorkPackage,
} from './contracts';
import { WorkPackageSchema } from './contracts';
import { assertPlanningOnly } from './governance';
import {
  classifyStartingDeckAuthority,
  historicalCannotOverrideCurrent,
  startingDeckEvidence,
  starterIdentityEvidence,
  actionEconomyEvidence,
  genericRestoreEvidence,
} from './systems';

export const STARTER_RECONCILE_OBJECTIVE =
  'Compare repository STARTING_DECK and CARD_DEFINITIONS against RULE-DECK-001 and RULE-STARTER-001 through RULE-STARTER-008. Produce one IMPLEMENTATION WorkPackage for the smallest correct starter implementation, including minimum Action-economy engine support and generic Restore fallback those approved cards require. Implementation mismatch. Implementation versus canonical. Implementation planning. Repository implementation. Lead engineering. Keep placeholder fixture cards. Do not invent cards. Do not change canonical rules. Do not execute.';

export function objectiveTouchesStartingDeck(objective: string): boolean {
  return /\b(starting[- ]deck|STARTING_DECK|RULE-DECK-001|deck setup|card composition|implementation (?:mismatch|correction|compliance|audit)|canonical implementation)\b/i.test(
    objective,
  );
}

export function collectHarnessVerifiedEvidence(objective?: string): EvidenceRecord[] {
  if (objective !== undefined && !objectiveTouchesStartingDeck(objective)) {
    return [];
  }
  return [
    startingDeckEvidence(),
    starterIdentityEvidence(),
    actionEconomyEvidence(),
    genericRestoreEvidence(),
  ];
}

export function formatVerifiedEvidence(records: EvidenceRecord[]): string {
  return [
    'Harness-verified evidence. This is HARNESS_VERIFIED_EVIDENCE, not a MODEL_CLAIM.',
    'Repository observations establish what the implementation currently does. They do not override approved canonical rules.',
    'HIST-DECK-4-4-2 is superseded by RULE-DECK-001 and has zero authority.',
    JSON.stringify(records, null, 2),
  ].join('\n');
}

export function repositoryCannotOverrideCanonical(
  index: CanonicalIndex,
  evidence: EvidenceRecord,
): boolean {
  if (!evidence.canonical_ids.includes('RULE-DECK-001')) return true;
  const histBlocked = historicalCannotOverrideCurrent(
    index,
    'RULE-DECK-001',
    'HIST-DECK-4-4-2',
  );
  const rule = index.items.find(
    (item) => item.id === 'RULE-DECK-001' && item.status === 'current',
  );
  return Boolean(rule && histBlocked && /5 Character, 3 Crypto, 2 VP/i.test(rule.text));
}

export const STARTER_DECK_WRITE_SCOPE = [
  'src/game/content/cards.ts',
  'src/game/types.ts',
  'src/game/config/defaults.ts',
  'src/game/engine/actions.ts',
  'src/game/engine/effects.ts',
  'src/game/engine/deploy.ts',
  'src/game/engine/cycle.ts',
  'src/game/engine/dataCenters.ts',
  'src/game/OuroborosGame.ts',
  'tests/zones.test.ts',
  'tests/startingDeck.test.ts',
  'tests/dataCenters.test.ts',
  'tests/actions.test.ts',
  'tests/deploy.test.ts',
] as const;

export const STARTER_DECK_READ_SCOPE = [
  'src/game/content/cards.ts',
  'src/game/types.ts',
  'src/game/config/defaults.ts',
  'src/game/engine/effects.ts',
  'src/game/engine/deploy.ts',
  'src/game/engine/cycle.ts',
  'src/game/engine/dataCenters.ts',
  'src/game/OuroborosGame.ts',
  'tests/zones.test.ts',
  'tests/deploy.test.ts',
  'tests/draft.test.ts',
  'tests/helpers.ts',
] as const;

export const STARTER_DECK_PERMITTED_COMMANDS = [
  'npm run typecheck',
  'npx vitest run tests/zones.test.ts',
  'npx vitest run tests/startingDeck.test.ts',
  'npx vitest run tests/dataCenters.test.ts',
  'npx vitest run tests/actions.test.ts',
  'npx vitest run tests/deploy.test.ts',
  'npm test',
] as const;

export const STARTER_DECK_OPERATION =
  'Implement approved RULE-STARTER-001 through RULE-STARTER-008 definitions and RULE-DECK-001 composition, plus the minimum Action-economy and generic Restore engine support those cards require. Keep placeholder fixture cards. Do not invent cards or change canonical rules.';

export function startingDeckCorrectionPackage(
  runId: string,
  canonicalVersion: string,
  evidence: EvidenceRecord,
): WorkPackage {
  return WorkPackageSchema.parse({
    id: `wp-${runId}-deck-align`,
    objective:
      'Align CARD_DEFINITIONS and STARTING_DECK with RULE-DECK-001 and RULE-STARTER-001 through RULE-STARTER-008.',
    owner_role: 'engineering',
    authorized_rule_ids: [
      'RULE-DECK-001',
      'RULE-DECK-002',
      'RULE-DECK-005',
      'RULE-STARTER-001',
      'RULE-STARTER-002',
      'RULE-STARTER-003',
      'RULE-STARTER-004',
      'RULE-STARTER-005',
      'RULE-STARTER-006',
      'RULE-STARTER-007',
      'RULE-STARTER-008',
      'RULE-CARD-003',
      'RULE-CARD-004',
      'RULE-CARD-005',
      'RULE-DATA-001',
      'RULE-DATA-002',
      'RULE-DATA-003',
      'RULE-DATA-005',
      'RULE-DATA-006',
      'RULE-DATA-007',
      'RULE-DATA-008',
      'RULE-ACTION-001',
      'RULE-ACTION-003',
      'RULE-ACTION-004',
    ],
    authorized_tech_ids: [],
    scope: [...STARTER_DECK_WRITE_SCOPE],
    files_or_domains_allowed: [...STARTER_DECK_WRITE_SCOPE],
    dependencies: [
      `Harness-verified ${evidence.source}#${evidence.source_location} = ${evidence.observed_value}`,
      `Harness-verified ${starterIdentityEvidence().source}#${starterIdentityEvidence().source_location} = ${starterIdentityEvidence().observed_value}`,
      `Harness-verified ${actionEconomyEvidence().source}#${actionEconomyEvidence().source_location} = ${actionEconomyEvidence().observed_value}`,
      `Harness-verified ${genericRestoreEvidence().source}#${genericRestoreEvidence().source_location} = ${genericRestoreEvidence().observed_value}`,
      'Placeholder STARTING_DECK identities: cipher_runner, echo_analyst, phase_broker, breach_daemon, crypto_shard x4, ledger_sigil x2.',
      'Approved identities: Slash-Dot, Dash-Dot, Dotkrawler, Rezz-Razor, Rezz-Blade, Byte-Coin x2, Kilo-Coin x1, Vault Encryption x2. IDs: slash_dot, dash_dot, dotkrawler, rezz_razor, rezz_blade, byte_coin, kilo_coin, vault_encryption.',
      'Keep placeholder CARD_DEFINITIONS for fixtures and MARKET_POOLS. Do not retarget fractal_seed.',
      'Minimum Action engine: PlayerState.actions, gainActions op, RULE-ACTION-001 turn grants, RULE-CARD-003/004 deploy costs, RULE-ACTION-004 OnReveal timing. No HUD.',
      'ExecutionPacket caps canonical_ids at 16 and acceptance_criteria at 12. Keep the full rule list on the WorkPackage. Slice only at packet construction.',
      `Read scope: ${STARTER_DECK_READ_SCOPE.join(', ')}`,
      `Operation: ${STARTER_DECK_OPERATION}`,
      `Permitted commands: ${STARTER_DECK_PERMITTED_COMMANDS.join('; ')}`,
      'Exclusions: canonical mutation, assets, Obsidian, HUD/playerView, swarm, docs, git, host copy-back, inventing cards, market-pool redesign, unrelated cleanup.',
    ],
    acceptance_criteria: [
      'STARTING_DECK is 10 cards: 5 Character, 3 Crypto, 2 VP with approved starter identities and counts.',
      'Structured ops implement RULE-STARTER-001 through RULE-STARTER-008: draw, gainCrypto, Drain, Restore, and gainActions. Display text is not authoritative.',
      'Byte-Coin and Kilo-Coin are not deployable and credit cryptoValue 2 and 3 at Draft. Costs 3 and 6.',
      'Vault Encryption is deployable, Power 2, cost 3, Restore 100. No invented static VP number.',
      'Generic Drain and Restore omit a named Data Center. Restore heals Primary first, then Backup, without overheal.',
      'Character deploy costs 1 Action. VP deploy costs 0. Insufficient Actions blocks Character deploy.',
      'Turn 1 grants +2 Actions, Turn 2 +1, Turn 3 +1. OnReveal Action gain is usable on the next Runtime turn.',
      'Placeholder fixture cards remain. STARTING_DECK no longer uses them. MARKET_POOLS unchanged.',
      'tests/zones.test.ts no longer asserts 4/4/2. New tests cover identities, Action spend/grants, and Restore fallback.',
      'RULE-DECK-002 identical Cycle 1 decks are unchanged. HIST-DECK-4-4-2 is not authority.',
      'No HUD, assets, canonical, or opportunistic cleanup in this package.',
      'Executor STOP if a required approved starter definition is missing or a write leaves authorized scope.',
    ],
    tests_required: [
      'Starting-deck composition is 10 cards, 5/3/2, with RULE-STARTER identities and counts.',
      'Starter Power, cost, kind, deployability, and structured ops match the approved starter rules.',
      'Byte-Coin and Kilo-Coin cannot deploy. Vault Encryption can. Draft credits their cryptoValue.',
      'Character deploy spends 1 Action. VP spends 0. Insufficient Actions is illegal.',
      'Turn Action grants match RULE-ACTION-001. OnReveal Action gain is next-turn usable.',
      'Generic Restore targets Primary first, then Backup, without overheal.',
      'Cycle 1 still gives both players identical decks.',
    ],
    proposed_authority_level: 'IMPLEMENTATION',
    authority_level: 'IMPLEMENTATION',
    approval_required: true,
    execution_tools_allowed: [],
    canonical_version: canonicalVersion,
  });
}

export function mergeStarterCorrectionPackage(
  candidate: WorkPackage,
  required: WorkPackage,
): WorkPackage {
  return WorkPackageSchema.parse({
    ...candidate,
    objective: required.objective,
    authorized_rule_ids: uniqueStrings([
      ...required.authorized_rule_ids,
      ...candidate.authorized_rule_ids,
    ]),
    scope: [...required.scope],
    files_or_domains_allowed: [...required.files_or_domains_allowed],
    dependencies: uniqueStrings([...required.dependencies, ...candidate.dependencies]),
    acceptance_criteria: [...required.acceptance_criteria],
    tests_required: [...required.tests_required],
    authority_level: 'IMPLEMENTATION',
    proposed_authority_level: 'IMPLEMENTATION',
    approval_required: true,
    execution_tools_allowed: [],
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function applyHarnessVerifiedMismatches(
  result: OrchestrationResult,
  evidence: EvidenceRecord[],
  index: CanonicalIndex,
  runId: string,
): OrchestrationResult {
  if (!objectiveTouchesStartingDeck(result.objective)) {
    return {
      ...result,
      verified_evidence: [],
    };
  }
  const deckEvidence = evidence.find(
    (item) =>
      item.authority === 'HARNESS_VERIFIED_EVIDENCE' &&
      item.source_location === 'STARTING_DECK',
  );
  if (!deckEvidence || !repositoryCannotOverrideCanonical(index, deckEvidence)) {
    return { ...result, verified_evidence: evidence };
  }
  const mismatch = classifyStartingDeckAuthority(index);
  if (mismatch.kind !== 'IMPLEMENTATION_MISMATCH') {
    return { ...result, verified_evidence: evidence };
  }
  const finding: SystemsFinding = {
    ...mismatch,
    evidence_records: [deckEvidence],
  };
  const hasFinding = result.systems_findings.some(
    (item) =>
      item.kind === 'IMPLEMENTATION_MISMATCH' &&
      item.canonical_ids.includes('RULE-DECK-001'),
  );
  const isStarterWorkPackage = (item: { authorized_rule_ids: string[]; scope: string[] }) =>
    item.authorized_rule_ids.includes('RULE-DECK-001') ||
    item.authorized_rule_ids.some((id) => id.startsWith('RULE-STARTER-')) ||
    item.scope.some((scope) => scope.includes('cards.ts'));
  const matchIndex = result.work_packages.findIndex(isStarterWorkPackage);
  const skipAutoPackage =
    (shouldConsultResearch(result.objective) || shouldConsultLookDev(result.objective)) &&
    !objectiveTouchesStartingDeck(result.objective);
  const factory = startingDeckCorrectionPackage(runId, result.canonical_version, deckEvidence);
  return {
    ...result,
    verified_evidence: evidence,
    systems_findings: hasFinding
      ? result.systems_findings.map((item) =>
          item.kind === 'IMPLEMENTATION_MISMATCH' &&
          item.canonical_ids.includes('RULE-DECK-001')
            ? { ...item, evidence_records: [deckEvidence] }
            : item,
        )
      : [...result.systems_findings, finding],
    work_packages: (skipAutoPackage
      ? result.work_packages
      : matchIndex >= 0
        ? result.work_packages.map((item, index) =>
            index === matchIndex ? mergeStarterCorrectionPackage(item, factory) : item,
          )
        : [...result.work_packages, factory]
    ).map((workPackage) =>
      normalizeWorkPackageAuthority(workPackage, { evidence }),
    ),
  };
}

export function assertCorrectionUnexecuted(): void {
  assertPlanningOnly();
}
