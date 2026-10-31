/**
 * Temporary designer Q&A tuner: Mel chats with Strat-G, Eco-Strat, and league
 * learners. Guidance from Mel is written into agent notes / Eco journal; profiles
 * and experiments are never changed from chat.
 */
import type { StrategistMemory } from '../aiStrategist';
import type { Journal } from './ecoJournal';
import { BLOWOUT_MARGIN, CLOSE_MARGIN, TARGET_BOTH_DESTROYED_RATE, TARGET_CYCLE16_MAX_RATE, TARGET_DESTRUCTION_END_RATE_MAX, TARGET_DESTRUCTION_END_RATE_MIN } from './ecoMetrics';

export type ChatLearnerId = 'strat-g' | 't-5' | 'dv-8' | 'vp-dog';
export type ChatSpeaker = ChatLearnerId | 'eco-strat';
export type ChatAudience = ChatSpeaker | 'both' | 'all';
export type ChatHistoryTurn = { role: 'user' | 'assistant'; content: string; speaker?: string };
export type ChatConfidence = 'strong' | 'moderate' | 'weak' | 'insufficient' | 'unknown';
export type ChatReply = {
  speaker: ChatSpeaker;
  answer: string;
  questionsForMel: string[];
  complaints: string[];
  learned: string[];
  confidence: ChatConfidence;
  sources: { id: string; at?: string }[];
};
export type ChatResult = { replies: ChatReply[]; model: string | null; error?: string };

/** Fixed opener: agents must give top-3 complaints and clarifying questions. */
export const CHAT_KICKOFF_MESSAGE = [
  'Open a temporary designer Q&A tuning session.',
  'Give your top 3 complaints about the current design (game health, economy, strategy, or your play style goals).',
  'Ask up to 2 clarifying questions about mechanics or designer intent you are unsure about.',
  'Be concrete and cite CONTEXT numbers when you have them; say "not recorded" when you do not.',
].join(' ');

export const CHAT_AUDIENCES: ChatAudience[] = ['strat-g', 'eco-strat', 't-5', 'dv-8', 'vp-dog', 'both', 'all'];
export const CHAT_SPEAKERS: ChatSpeaker[] = ['strat-g', 'eco-strat', 't-5', 'dv-8', 'vp-dog'];

const LEARNER_LABEL: Record<ChatLearnerId, string> = {
  'strat-g': 'Strat-G',
  't-5': 'T-5',
  'dv-8': 'DV-8',
  'vp-dog': 'VP-Dog',
};

const REPLY_SCHEMA = `Reply with one JSON object: {"answer": string (<=700: conversational reply to the designer), "questionsForMel": string[] (<=2 short mechanics/design questions; empty if none), "complaints": string[] (<=3 design complaints; required when Mel opened the session / asked for complaints, otherwise only when relevant or empty), "learned": string[] (<=3 short takeaways from Mel's latest message that you will remember; empty on kickoff if Mel taught nothing yet), "confidence": "strong"|"moderate"|"weak"|"insufficient"|"unknown", "sources": [{"id": string, "at"?: string}] (<=8 CONTEXT ids you used)}. Cite only numbers/facts present in CONTEXT; say "not recorded" when missing. Never invent statistics. Never change strategy profiles or experiments yourself — Mel's guidance will be saved as notes.`;

const CONFIDENCES: ChatConfidence[] = ['strong', 'moderate', 'weak', 'insufficient', 'unknown'];

function str(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stringList(value: unknown, count: number, max: number) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).slice(0, count).map(item => (item as string).trim().slice(0, max))
    : [];
}

export function isChatAudience(value: unknown): value is ChatAudience {
  return typeof value === 'string' && (CHAT_AUDIENCES as string[]).includes(value);
}

export function speakersForAudience(audience: ChatAudience): ChatSpeaker[] {
  if (audience === 'both') return ['strat-g', 'eco-strat'];
  if (audience === 'all') return [...CHAT_SPEAKERS];
  return [audience];
}

export function formatChatReplyContent(reply: ChatReply): string {
  const parts = [reply.answer];
  if (reply.complaints.length) parts.push(`Complaints:\n${reply.complaints.map((item, i) => `${i + 1}. ${item}`).join('\n')}`);
  if (reply.questionsForMel.length) parts.push(`Questions for Mel:\n${reply.questionsForMel.map((item, i) => `${i + 1}. ${item}`).join('\n')}`);
  if (reply.learned.length) parts.push(`Learned:\n${reply.learned.map((item, i) => `${i + 1}. ${item}`).join('\n')}`);
  parts.push(`Confidence: ${reply.confidence}`);
  return parts.join('\n\n');
}

function parseReply(data: Record<string, unknown>, speaker: ChatSpeaker): ChatReply {
  const sources = Array.isArray(data.sources)
    ? (data.sources as { id?: unknown; at?: unknown }[]).slice(0, 8).map(item => ({
      id: str(item?.id, 80) || 'unknown',
      ...(typeof item?.at === 'string' ? { at: item.at.slice(0, 40) } : {}),
    }))
    : [];
  const answer = str(data.answer, 900)
    || [str(data.observed, 400), str(data.interpretation, 300), str(data.recommendation, 300)].filter(Boolean).join(' ')
    || 'not recorded';
  return {
    speaker,
    answer,
    questionsForMel: stringList(data.questionsForMel, 2, 280),
    complaints: stringList(data.complaints, 3, 280),
    learned: stringList(data.learned, 3, 220),
    confidence: CONFIDENCES.find(level => level === data.confidence) ?? 'unknown',
    sources: sources.filter(item => !!item.id && item.id !== 'unknown'),
  };
}

/** Bounded learner context from memory (and optional notebook excerpt). */
export function learnerChatContext(memory: StrategistMemory, options?: { notebookExcerpt?: string; agentId?: ChatLearnerId; agentName?: string }) {
  const agentId = options?.agentId ?? 'strat-g';
  const name = options?.agentName ?? LEARNER_LABEL[agentId];
  const theories = memory.theories.filter(theory => theory.status !== 'retired').slice(0, 20).map(theory => ({
    id: theory.id, text: theory.text, status: theory.status, confidence: theory.confidence,
    support: theory.support, against: theory.against,
    observation: theory.observation, hypothesis: theory.hypothesis, proposedTest: theory.proposedTest,
    note: 'association score only; supported ≠ adoption-ready',
  }));
  const experiment = memory.experiment
    ? { id: memory.experiment.id, stage: memory.experiment.stage, hypothesis: memory.experiment.hypothesis, change: memory.experiment.changeSummary, prediction: memory.experiment.prediction, verdict: memory.experiment.verdict }
    : null;
  const adopted = memory.experiments.filter(item => item.stage === 'adopted').slice(-8).map(item => ({
    id: item.id, change: item.changeSummary, verdict: item.verdict, concludedAt: item.concludedAt,
  }));
  const recent = memory.experiments.slice(-6).map(item => ({
    id: item.id, stage: item.stage, hypothesis: item.hypothesis, change: item.changeSummary, verdict: item.verdict,
  }));
  const designerNotes = memory.notes.filter(note => /^Designer Q&A:/i.test(note.text)).slice(-12).map(note => ({ at: note.at, text: note.text }));
  return {
    role: `${name} — expert player / strategy perspective`,
    agentId,
    version: memory.version,
    mode: memory.mode,
    record: memory.record,
    planDocumentary: memory.plan,
    executableProfile: {
      economyUntilCycle: memory.profile.economyUntilCycle,
      chaosFromCycle: memory.profile.chaosFromCycle,
      vpFromCycle: memory.profile.vpFromCycle,
      handCryptoTarget: memory.profile.handCryptoTarget,
      minBuyScore: memory.profile.minBuyScore,
      dilution: memory.profile.dilution,
      weights: memory.profile.weights,
    },
    adoptedChanges: adopted,
    runningExperiment: experiment,
    recentExperiments: recent,
    theories,
    recentNotes: memory.notes.slice(-20).map(note => ({ at: note.at, text: note.text })),
    designerGuidance: designerNotes,
    notebookExcerpt: options?.notebookExcerpt?.slice(0, 4000) ?? null,
    authority: 'Numeric profile governs play. Plan text is documentary. Chat may append Designer Q&A notes; it cannot change the profile or experiments.',
  };
}

/** @deprecated Prefer learnerChatContext; kept for existing imports/tests. */
export function stratGChatContext(memory: StrategistMemory, notebookExcerpt?: string) {
  return learnerChatContext(memory, { notebookExcerpt, agentId: 'strat-g', agentName: 'Strat-G' });
}

/** Implemented-game facts Eco-Strat must cite for rules / what Mel can configure. */
export type EcoChatFacts = {
  rules?: Record<string, string | number>;
  configurable?: { id: string; surface: string; label: string; default: string | number | boolean; cohortDefault: string | number | boolean; notes: string }[];
  market?: unknown;
  startingDeck?: { name: string; count: number }[];
  cards?: { id: string; name: string; pool: string; cost: number; vp?: number; text?: string }[];
  locations?: { id: string; name: string; rule: string; read?: string }[];
  circuitRewards?: { id: string; name: string; text: string; awardTrailing?: boolean }[];
  mods?: { id: string; name: string; text: string; kind?: string }[];
};

/** Bounded Eco-Strat context from journal, optional report excerpt, and authoritative game facts. */
export function ecoChatContext(journal: Journal, lastReportMarkdown?: string | null, facts?: EcoChatFacts | null) {
  const buildId = journal.currentBuild;
  const games = journal.games.filter(game => game.valid && game.buildId === buildId);
  const destruction = games.filter(game => game.endedBy === 'destruction').length;
  const margins = games.map(game => Math.abs(game.finalVP[0] - game.finalVP[1]));
  const close = margins.filter(margin => margin < CLOSE_MARGIN).length;
  const blowout = margins.filter(margin => margin > BLOWOUT_MARGIN).length;
  const mid = margins.length - close - blowout;
  const recommendations = journal.recommendations.filter(item => item.status === 'candidate').slice(-8).map(item => ({
    id: item.id, title: item.title, adjustment: item.adjustment, confidence: item.confidence, reportId: item.reportId, at: item.at,
  }));
  const hypotheses = journal.hypotheses.filter(item => item.status === 'open').slice(0, 12).map(item => ({
    id: item.id, topic: item.topic, statement: item.statement, plain: item.plain,
  }));
  const observations = journal.observations.filter(item => item.buildId === buildId).sort((a, b) => b.occurrences - a.occurrences).slice(0, 15).map(item => ({
    id: item.key, topic: item.topic, text: item.text, occurrences: item.occurrences,
  }));
  const openQuestions = journal.questions.filter(item => item.status === 'open').slice(-12).map(item => ({
    id: item.id, text: item.text, at: item.at,
  }));
  const designerGuidance = (journal.designerGuidance ?? []).slice(-12).map(item => ({ id: item.id, at: item.at, text: item.text }));
  const lastReport = journal.reports.at(-1);
  const cardList = facts?.cards ?? [];
  const factsForChat = facts ? {
    authority: 'FACTS are the implemented game from running code. Prefer them over memory or design lore when answering rules or "what can we change" questions.',
    rules: facts.rules ?? null,
    configurable: facts.configurable ?? [],
    market: facts.market ?? null,
    startingDeck: facts.startingDeck ?? [],
    catalog: {
      cards: cardList.length,
      byPool: Object.fromEntries(['Base', 'Chaos', 'VP', 'Crypto'].map(pool => [pool, cardList.filter(card => card.pool === pool).length])),
      locations: facts.locations?.length ?? 0,
      circuitRewards: facts.circuitRewards?.length ?? 0,
      mods: facts.mods?.length ?? 0,
    },
    cards: cardList.slice(0, 80).map(card => ({
      id: card.id, name: card.name, pool: card.pool, cost: card.cost, ...(card.vp ? { vp: card.vp } : {}), ...(card.text ? { text: card.text.slice(0, 220) } : {}),
    })),
    locations: (facts.locations ?? []).slice(0, 40).map(location => ({
      id: location.id, name: location.name, rule: location.rule.slice(0, 280), ...(location.read ? { read: location.read.slice(0, 160) } : {}),
    })),
    circuitRewards: (facts.circuitRewards ?? []).slice(0, 40).map(reward => ({
      id: reward.id, name: reward.name, text: reward.text.slice(0, 220), ...(reward.awardTrailing ? { awardTrailing: true } : {}),
    })),
    mods: (facts.mods ?? []).slice(0, 40).map(mod => ({
      id: mod.id, name: mod.name, kind: mod.kind ?? 'authored', text: mod.text.slice(0, 220),
    })),
  } : null;
  return {
    role: 'Eco-Strat — game-health / economy / balance perspective (observer only; recommendations are candidates)',
    buildId,
    gamesOnBuild: games.length,
    targets: {
      destructionEndRateMin: TARGET_DESTRUCTION_END_RATE_MIN,
      destructionEndRateMax: TARGET_DESTRUCTION_END_RATE_MAX,
      cycle16MaxRate: TARGET_CYCLE16_MAX_RATE,
      bothDestroyedRate: TARGET_BOTH_DESTROYED_RATE,
      closeMarginUnder: CLOSE_MARGIN,
      blowoutMarginOver: BLOWOUT_MARGIN,
    },
    measured: {
      destructionEndings: destruction,
      destructionEndRate: games.length ? destruction / games.length : null,
      cycle16Endings: games.filter(game => game.endedBy === 'cycle16').length,
      cycle16EndRate: games.length ? games.filter(game => game.endedBy === 'cycle16').length / games.length : null,
      bothDestroyed: 'not recorded on journal game entries; cite lastReportExcerpt if it states bothDestroyed / winnerKill',
      winnerKill: 'cite lastReportExcerpt for winner without full kill (didNotDestroyBothServers); not on journal game entries',
      margins: { closeUnder: CLOSE_MARGIN, blowoutOver: BLOWOUT_MARGIN, close, mid, blowout, avg: margins.length ? Number((margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(2)) : null },
    },
    hypotheses,
    observations,
    openQuestions,
    designerGuidance,
    candidateRecommendations: recommendations,
    lastReport: lastReport ? { id: lastReport.id, at: lastReport.at, kind: lastReport.kind, games: lastReport.games } : null,
    lastReportExcerpt: lastReportMarkdown?.slice(0, 5000) ?? null,
    pointOfView: journal.pointOfView ? { summary: journal.pointOfView.summary, at: journal.pointOfView.at } : null,
    study: journal.study ? { summary: journal.study.summary, economyModel: journal.study.economyModel?.slice(0, 10), at: journal.study.at } : null,
    facts: factsForChat,
    authority: 'Never auto-apply balance. Distinguish healthy strategic skill from systemic imbalance. Prefer small testable proposals. Do not invent numbers. For rules and configurables, cite CONTEXT.facts (or study). Mel guidance in designerGuidance is authoritative designer intent for this tuning session.',
  };
}

async function askSpeaker(options: {
  speaker: ChatSpeaker;
  system: string;
  context: unknown;
  message: string;
  history: ChatHistoryTurn[];
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
}): Promise<{ reply: ChatReply; model: string } | { error: string }> {
  const historyLines = options.history.slice(-8).map(turn => `${turn.role}${turn.speaker ? ` (${turn.speaker})` : ''}: ${turn.content}`).join('\n');
  const kickoff = options.message.trim() === CHAT_KICKOFF_MESSAGE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await options.fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${options.system}\n\n${REPLY_SCHEMA}${kickoff ? '\nThis message opens the session: fill complaints (exactly 3 when you can) and questionsForMel (1–2). learned may be empty.' : ''}` },
          { role: 'user', content: `CONTEXT (authoritative; do not invent beyond it):\n${JSON.stringify(options.context)}\n\n${historyLines ? `RECENT CHAT:\n${historyLines}\n\n` : ''}DESIGNER MESSAGE:\n${options.message}` },
        ],
      }),
    });
    if (!response.ok) return { error: `OpenAI responded ${response.status}: ${(await response.text()).slice(0, 200)}` };
    const body = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return { error: 'Empty model reply.' };
    const data = JSON.parse(content) as Record<string, unknown>;
    return { reply: parseReply(data, options.speaker), model: options.model };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); }
}

export type LearnerChatBundle = {
  memory: StrategistMemory;
  notebookExcerpt?: string;
  agentName?: string;
  recordGuidance?: (texts: string[]) => Promise<void> | void;
};

export type ChatWithStratOptions = {
  audience: ChatAudience;
  message: string;
  history?: ChatHistoryTurn[];
  /** Strat-G and league learners keyed by id. */
  learners: Partial<Record<ChatLearnerId, LearnerChatBundle>>;
  eco: {
    journal: Journal;
    lastReportMarkdown?: string | null;
    facts?: EcoChatFacts | null;
    recordGuidance?: (texts: string[]) => Promise<void> | void;
    answerQuestions?: (answer: string, matchingTexts?: string[]) => Promise<void> | void;
  };
  apiKey?: string;
  stratGModel?: string;
  ecoModel?: string;
  fetchImpl?: typeof fetch;
};

const learnerSystem = (name: string) =>
  `You are ${name} in a temporary designer Q&A tuning chat. Expert player/strategy perspective for your style. Use only CONTEXT. Numeric profile governs play; plan text is documentary. Ask Mel about mechanics or intent when unclear. Give concrete design complaints when asked. Put lasting takeaways from Mel in "learned". You may disagree with other agents — do not invent consensus. Chat may save Designer Q&A notes; it will not change your profile.`;

/**
 * Ask one or more agents. Guidance callbacks persist Mel's teaching into notes/journal.
 */
export async function chatWithStrat(options: ChatWithStratOptions): Promise<ChatResult> {
  const message = options.message.trim().slice(0, 2000);
  if (!message) return { replies: [], model: null, error: 'Message is required.' };
  if (!isChatAudience(options.audience)) {
    return { replies: [], model: null, error: 'audience must be strat-g, eco-strat, t-5, dv-8, vp-dog, both, or all.' };
  }
  if (!options.apiKey) return { replies: [], model: null, error: 'No OpenAI API key configured for agents.' };
  const fetchImpl = options.fetchImpl ?? fetch;
  const history = Array.isArray(options.history) ? options.history.slice(-12) : [];
  const speakers = speakersForAudience(options.audience);
  const replies: ChatReply[] = [];
  let model: string | null = null;
  const errors: string[] = [];
  const kickoff = message === CHAT_KICKOFF_MESSAGE;

  for (const speaker of speakers) {
    if (speaker === 'eco-strat') {
      const result = await askSpeaker({
        speaker, apiKey: options.apiKey, model: options.ecoModel || options.stratGModel || 'gpt-4o-mini', fetchImpl, message, history,
        system: `You are Eco-Strat in a temporary designer Q&A tuning chat. Game-health, economy and balance perspective. You never play and never coach Strat-G. Use only CONTEXT. CONTEXT.facts is the implemented game — use it for rules or "what can we change"; do not invent knobs outside facts.configurable. Distinguish healthy strategic skill from systemic imbalance. Ask Mel when intent is unclear. Give concrete design complaints when asked. Put lasting takeaways in "learned". Recommendations stay candidates. You may disagree with other agents.`,
        context: ecoChatContext(options.eco.journal, options.eco.lastReportMarkdown, options.eco.facts),
      });
      if ('error' in result) errors.push(`Eco-Strat: ${result.error}`);
      else { replies.push(result.reply); model = result.model; }
      continue;
    }

    const bundle = options.learners[speaker];
    if (!bundle) {
      errors.push(`${LEARNER_LABEL[speaker]}: not available.`);
      continue;
    }
    const name = bundle.agentName ?? LEARNER_LABEL[speaker];
    const result = await askSpeaker({
      speaker, apiKey: options.apiKey, model: options.stratGModel || 'gpt-4o-mini', fetchImpl, message, history,
      system: learnerSystem(name),
      context: learnerChatContext(bundle.memory, { notebookExcerpt: bundle.notebookExcerpt, agentId: speaker, agentName: name }),
    });
    if ('error' in result) errors.push(`${name}: ${result.error}`);
    else { replies.push(result.reply); model = result.model; }
  }

  if (!replies.length) return { replies: [], model: null, error: errors.join(' ') || 'Chat failed.' };

  // Persist Mel's teaching (skip treating the kickoff prompt itself as guidance).
  if (!kickoff) {
    const priorQuestions = history
      .filter(turn => turn.role === 'assistant')
      .slice(-4)
      .flatMap(turn => {
        const block = /Questions for Mel:\n([\s\S]*?)(?:\n\n|$)/i.exec(turn.content)?.[1] ?? '';
        return block.split('\n').map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
      });
    for (const reply of replies) {
      const texts = [
        `Designer Q&A: Mel said — ${message.slice(0, 500)}`,
        ...reply.learned.map(item => `Designer Q&A: learned — ${item}`),
      ];
      try {
        if (reply.speaker === 'eco-strat') {
          await options.eco.recordGuidance?.(texts);
          if (priorQuestions.length) await options.eco.answerQuestions?.(message, priorQuestions);
        } else {
          await options.learners[reply.speaker]?.recordGuidance?.(texts);
        }
      } catch (error) {
        errors.push(`guidance ${reply.speaker}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { replies, model, ...(errors.length ? { error: errors.join(' ') } : {}) };
}
