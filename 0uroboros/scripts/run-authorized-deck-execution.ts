import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadLocalEnv } from './openai-connection-config';
import { CANONICAL_VERSION, requireLiveApiKey, resolveSwarmConfig } from '../src/swarm/config';
import { createExecutionAuthorization } from '../src/swarm/executionAuthorization';
import {
  inspectStartingDeckSource,
  sourceDefinesCanonicalStarterIdentities,
} from '../src/swarm/executionAcceptance';
import { runExecutionHarness } from '../src/swarm/executionHarness';
import { targetFilesAreDirty } from '../src/swarm/executionSandbox';
import { startingDeckCorrectionPackage, formatVerifiedEvidence } from '../src/swarm/evidence';
import { startingDeckEvidence } from '../src/swarm/systems';

const HOST_CARDS = 'src/game/content/cards.ts';

async function main(): Promise<void> {
  const hostRoot = process.cwd();
  loadLocalEnv(hostRoot);
  const config = resolveSwarmConfig();
  requireLiveApiKey(config);

  const hostCardsPath = join(hostRoot, HOST_CARDS);
  const hostBefore = readFileSync(hostCardsPath, 'utf8');
  const hostBeforeHash = createHash('sha256').update(hostBefore).digest('hex');
  const observed = inspectStartingDeckSource(hostBefore);

  if (targetFilesAreDirty(hostRoot, [HOST_CARDS])) {
    console.error('WORKTREE_CONFLICT: src/game/content/cards.ts has uncommitted changes.');
    process.exit(2);
  }

  const evidence = startingDeckEvidence();
  const workPackage = startingDeckCorrectionPackage('mel-authorized-2026-09-07', CANONICAL_VERSION, evidence);
  const operation = 'Align STARTING_DECK composition in src/game/content/cards.ts to RULE-DECK-001 without inventing cards.';
  const read_scope = [HOST_CARDS, 'src/game/engine/cycle.ts', 'tests/zones.test.ts'];
  const write_scope = [HOST_CARDS];
  const permitted_commands: string[] = [];
  const authorization = createExecutionAuthorization({
    workPackage,
    authorized_by: 'human:mel',
    operation,
    read_scope,
    write_scope,
    permitted_commands,
  });

  const output = await runExecutionHarness({
    workPackage,
    operation,
    read_scope,
    write_scope,
    permitted_commands,
    authorization,
    hostRoot,
    cwd: hostRoot,
    config,
    skipModel: false,
    canonical_excerpts: [
      'RULE-DECK-001 Both players start with 10 cards: 5 Character, 3 Crypto, 2 VP.',
      'RULE-STARTER-001 Slash-Dot: Power 3. +3 Cards. Cost 4.',
      'RULE-STARTER-002 Dash-Dot: Power 2. +1 Card. +1 Action. Cost 3.',
      'RULE-STARTER-003 Dotkrawler: Power 1. +1 Card. +1 Action. +1 Crypto. Cost 3.',
      'RULE-STARTER-004 Rezz-Razor: Power 4. Drain 75. +1 Card. +1 Action. Cost 3.',
      'RULE-STARTER-005 Rezz-Blade: Power 3. Drain 100. +1 Card. +2 Actions. Cost 4.',
      'RULE-STARTER-006 Vault Encryption x2: VP. Power 2. Restore 100. Cost 3.',
      'RULE-STARTER-007 Byte-Coin x2: Crypto. +2 Crypto. Cost 3. RULE-STARTER-008 Kilo-Coin x1: Crypto. +3 Crypto. Cost 6. HIST-DECK-4-4-2 is superseded.',
    ],
    harness_verified_evidence: [
      formatVerifiedEvidence([evidence]),
      `Live inspection before mutation: ${JSON.stringify(observed)}`,
      `Canonical starter identities present in CARD_DEFINITIONS: ${sourceDefinesCanonicalStarterIdentities(hostBefore)}`,
    ],
    constraints: [
      'Do not invent cards or new CARD_DEFINITIONS entries.',
      'Do not substitute market Base or Chaos cards as starting Characters.',
      'Canonical starting identities are RULE-STARTER-001 through RULE-STARTER-008.',
      'If CARD_DEFINITIONS lacks those approved starter cards, STOP with INCOMPLETE. Do not invent them.',
      'Do not edit tests. Do not copy changes to the host repository.',
      'Do not change card effects, Power, Draft cost, or names of existing definitions.',
    ],
  });

  const hostAfter = readFileSync(hostCardsPath, 'utf8');
  const hostAfterHash = createHash('sha256').update(hostAfter).digest('hex');
  const sandboxCards = join(output.workspaceRoot, HOST_CARDS);
  const sandboxAfter = existsSync(sandboxCards) ? readFileSync(sandboxCards, 'utf8') : '';

  writeFileSync(
    join(output.artifactDir, 'authorization-evidence.json'),
    `${JSON.stringify(
      {
        authorization,
        work_package: workPackage,
        host_cards_sha256_before: hostBeforeHash,
        host_cards_sha256_after: hostAfterHash,
        host_unchanged: hostBeforeHash === hostAfterHash,
        observed_before: observed,
        sandbox_after: inspectStartingDeckSource(sandboxAfter),
        canonical_starters_in_host_definitions: sourceDefinesCanonicalStarterIdentities(hostBefore),
        skip_model: false,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        execution_id: output.execution_id,
        status: output.result.status,
        authorization_id: authorization.authorization_id,
        work_package_id: workPackage.id,
        artifactDir: output.artifactDir,
        workspaceRoot: output.workspaceRoot,
        host_unchanged: hostBeforeHash === hostAfterHash,
        files_modified: output.result.files_modified,
        scope_violations: output.result.scope_violations,
        acceptance: output.result.acceptance_criteria_results,
        unresolved: output.result.unresolved_issues,
        warnings: output.result.warnings,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
