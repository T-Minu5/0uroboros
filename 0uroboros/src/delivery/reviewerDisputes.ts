/**
 * Grounded classification of Reviewer findings.
 * Findings contradicted by canonical or deterministic evidence do not restart
 * expensive repair loops.
 */

export type ReviewerFindingClass =
  | 'VALID_BLOCKER'
  | 'VALID_NONBLOCKING_NOTE'
  | 'CONTRADICTED_BY_CANONICAL_EVIDENCE'
  | 'CONTRADICTED_BY_DETERMINISTIC_EVIDENCE'
  | 'REVIEWER_INTERPRETATION_REQUIRES_RULE_AUTHORITY';

export interface ClassifiedReviewerFinding {
  source_run: string;
  summary: string;
  classification: ReviewerFindingClass;
  evidence: string;
  status: 'open' | 'superseded' | 'closed';
}

export const STARTER_RECONCILIATION_DISPUTES: ClassifiedReviewerFinding[] = [
  {
    source_run: 'run-2026-09-07T18-58-47-812Z-1d48994c',
    summary: 'RULE-STARTER-001 through RULE-STARTER-008 specify only nine cards.',
    classification: 'CONTRADICTED_BY_DETERMINISTIC_EVIDENCE',
    evidence:
      'RULE-STARTER-007 is Byte-Coin x2. 5 Character + Byte-Coin x2 + Kilo-Coin x1 + Vault Encryption x2 = 10.',
    status: 'closed',
  },
  {
    source_run: 'run-2026-09-07T18-53-40-954Z-35e345ce',
    summary: 'Drain implementation cannot be certified without additional Drain rules.',
    classification: 'CONTRADICTED_BY_CANONICAL_EVIDENCE',
    evidence:
      'Generic Drain is RULE-DATA-002 and already implemented by unnamed damageDataCenter. RULE-DATA-001/003/004/008 are current canonical records.',
    status: 'closed',
  },
  {
    source_run: 'run-2026-09-07T18-56-10-942Z-9bd0bbce',
    summary: 'Destroyed-Primary Restore fallback needs a new eligibility ruling.',
    classification: 'CONTRADICTED_BY_CANONICAL_EVIDENCE',
    evidence:
      'RULE-DATA-005 targets Primary first then Backup. RULE-DATA-007 forbids restoring a destroyed Data Center, so a destroyed Primary is skipped.',
    status: 'closed',
  },
  {
    source_run: 'run-2026-09-07T18-53-40-954Z-35e345ce',
    summary: 'Action carryover has no printed default.',
    classification: 'VALID_NONBLOCKING_NOTE',
    evidence:
      'RULE-ACTION-003 is configurable, same class as cycleLimit. Default false is an implementation config value, not a rule change.',
    status: 'closed',
  },
  {
    source_run: 'run-2026-09-07T18-58-47-812Z-1d48994c',
    summary: 'WorkPackage scope mixed file paths with behavioral prose.',
    classification: 'VALID_BLOCKER',
    evidence: 'mergeStarterCorrectionPackage now locks factory file-path scope. Superseded for future packages.',
    status: 'superseded',
  },
];
