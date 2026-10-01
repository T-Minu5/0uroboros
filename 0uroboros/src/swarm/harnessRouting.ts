const HARNESS_INFRA_RE =
  /\b(did (?:the )?(?:obsidian|vault) search|verify (?:whether )?(?:obsidian|vault|packet|concept id|routing|canonical retrieval|specialist (?:result|persistence))|confirm harness|harness (?:bookkeeping|infrastructure)|was (?:the )?(?:packet bounded|concept id preserved|search (?:run|executed)))\b/i;

export function isHarnessInfrastructureRequest(objective: string): boolean {
  return HARNESS_INFRA_RE.test(objective);
}
