import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAT_KICKOFF_MESSAGE, chatWithStrat, ecoChatContext, formatChatReplyContent, isChatAudience, speakersForAudience, stratGChatContext,
} from '../server/agents/chat';
import { appendDesignerGuidance, answerOpenQuestions, emptyJournal } from '../server/agents/ecoJournal';
import { createAgentSystem } from '../server/agents/index';
import { createStrategist } from '../server/aiStrategist';

const AT = '2026-10-26T12:00:00.000Z';

describe('Chat with Strat context', () => {
  it('builds Strat-G context from memory without inventing adoption', () => {
    const agent = createStrategist({ root: '/tmp/unused-chat-strat', log: () => undefined });
    const memory = agent.memory();
    const context = stratGChatContext(memory, '# notebook\nplan');
    expect(context.authority).toMatch(/cannot change the profile|Designer Q&A/);
    expect(context.theories[0]).toMatchObject({ note: expect.stringMatching(/association/) });
    expect(context.notebookExcerpt).toContain('notebook');
  });

  it('builds Eco context with Mel margin targets, open questions, and designer guidance', () => {
    const journal = emptyJournal(AT);
    journal.currentBuild = 'b1';
    journal.builds.push({ id: 'b1', label: 'build', contentRevision: 1, firstSeen: AT });
    journal.games.push(
      { id: 'g1', source: 'self-play', buildId: 'b1', at: AT, valid: true, winner: 0, endedBy: 'destruction', cycles: 12, finalVP: [20, 10] },
      { id: 'g2', source: 'self-play', buildId: 'b1', at: AT, valid: true, winner: 0, endedBy: 'cycle16', cycles: 16, finalVP: [40, 10] },
    );
    journal.recommendations.push({
      id: 'r1', at: AT, buildId: 'b1', reportId: 'rep', title: 'Trim cost', observed: 'x', evidence: 'y',
      likelyCause: 'z', adjustment: 'Cut 1', expectedEffect: 'e', risks: '', confidence: 'moderate', test: 't', status: 'candidate',
    });
    journal.questions.push({ id: 'q1', at: AT, buildId: 'b1', text: 'Does Circuit snowball?', status: 'open' });
    appendDesignerGuidance(journal, ['Designer Q&A: Mel said — Circuit lead of 2 should not auto-win'], AT);
    const context = ecoChatContext(journal, '## Report\nbothDestroyed in 2 of 5', {
      rules: { cycles: 16, victory: 'Most VP after Cycle 16 or both Servers destroyed.' },
      configurable: [{ id: 'draftCrypto', surface: 'configure', label: 'Draft Crypto shelf', default: false, cohortDefault: false, notes: 'off by default' }],
      cards: [{ id: 'dash', name: 'Dash', pool: 'Base', cost: 2, text: 'Gain Actions.' }],
      locations: [], circuitRewards: [], mods: [], startingDeck: [{ name: 'Shyte-Coin', count: 6 }],
    });
    expect(context.targets.closeMarginUnder).toBe(12);
    expect(context.targets.blowoutMarginOver).toBe(21);
    expect(context.measured.destructionEndings).toBe(1);
    expect(context.measured.margins).toMatchObject({ close: 1, mid: 0, blowout: 1 });
    expect(context.candidateRecommendations).toHaveLength(1);
    expect(context.openQuestions).toEqual([{ id: 'q1', text: 'Does Circuit snowball?', at: AT }]);
    expect(context.designerGuidance?.[0].text).toMatch(/Circuit lead/);
    expect(context.facts?.rules).toMatchObject({ cycles: 16 });
    expect(context.facts?.configurable?.[0].id).toBe('draftCrypto');
    expect(context.facts?.catalog.cards).toBe(1);
    expect(context.authority).toMatch(/CONTEXT\.facts|designerGuidance/);
  });

  it('answers open Eco questions that match prior agent asks', () => {
    const journal = emptyJournal(AT);
    journal.questions.push(
      { id: 'q1', at: AT, buildId: 'b1', text: 'Does Circuit snowball?', status: 'open' },
      { id: 'q2', at: AT, buildId: 'b1', text: 'Is Restore viable?', status: 'open' },
    );
    const count = answerOpenQuestions(journal, 'Circuit of 2 does not guarantee the win; Locations matter more.', ['Does Circuit snowball?'], AT);
    expect(count).toBe(1);
    expect(journal.questions[0].status).toBe('answered');
    expect(journal.questions[0].answer).toMatch(/Locations matter/);
    expect(journal.questions[1].status).toBe('open');
  });
});

describe('Chat audiences and reply formatting', () => {
  it('accepts learner audiences and expands both/all', () => {
    expect(isChatAudience('t-5')).toBe(true);
    expect(isChatAudience('all')).toBe(true);
    expect(isChatAudience('mentor')).toBe(false);
    expect(speakersForAudience('both')).toEqual(['strat-g', 'eco-strat']);
    expect(speakersForAudience('all')).toEqual(['strat-g', 'eco-strat', 't-5', 'dv-8', 'vp-dog']);
    expect(speakersForAudience('vp-dog')).toEqual(['vp-dog']);
  });

  it('formats kickoff-shaped replies for history', () => {
    const text = formatChatReplyContent({
      speaker: 'eco-strat',
      answer: 'Economy sinks are weak.',
      complaints: ['Wallets overflow', 'Circuit snowballs', 'VP market underpriced'],
      questionsForMel: ['Should Draft Crypto stay off by default?'],
      learned: [],
      confidence: 'moderate',
      sources: [{ id: 'economy' }],
    });
    expect(text).toMatch(/Complaints:/);
    expect(text).toMatch(/Questions for Mel:/);
    expect(text).toMatch(/Should Draft Crypto/);
  });
});

describe('Chat with Strat API', () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

  const project = async () => {
    const root = await mkdtemp(join(tmpdir(), 'chat-'));
    roots.push(root);
    await mkdir(join(root, 'content'), { recursive: true });
    await writeFile(join(root, 'content/authored-content.json'), JSON.stringify({ revision: 1, document: { cards: [], locations: [], circuitRewards: [], startingDeck: [] } }));
    return root;
  };

  const request = (method: string, url: string, body?: unknown): IncomingMessage => {
    const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
    Object.assign(stream, { method, url, headers: { host: '127.0.0.1:5173' }, socket: { remoteAddress: '127.0.0.1' } });
    return stream;
  };

  const response = () => {
    const result = { status: 0, body: '' };
    const res = { statusCode: 0, setHeader: () => undefined, end(text: string) { result.status = res.statusCode; result.body = text; } };
    return { res: res as unknown as ServerResponse, result };
  };

  it('rejects bad audience and empty messages, and returns grounded replies when the model answers', async () => {
    const root = await project();
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: 'Record shows 0 games in CONTEXT.',
        questionsForMel: ['What destruction end rate do you want this build to hit?'],
        complaints: ['Too few games to judge sinks', 'No Circuit signal yet', 'Margins unknown'],
        learned: [],
        confidence: 'insufficient',
        sources: [{ id: 'record' }],
      }) } }],
    }), { status: 200 })) as typeof fetch;
    const system = createAgentSystem({
      cwd: root,
      env: { OPENAI_API_KEY: 'sk-test', AI_STRATEGIST_MODEL: 'gpt-test' },
      loadModule: async path => import(/* @vite-ignore */ resolve(`.${path}`)),
      log: () => undefined,
    });
    const empty = response();
    await system.middlewares.at(-1)!(request('POST', '/api/agents/chat', { audience: 'strat-g', message: '' }), empty.res, () => undefined);
    expect(empty.result.status).toBe(400);

    const bad = response();
    await system.middlewares.at(-1)!(request('POST', '/api/agents/chat', { audience: 'mentor', message: 'hi' }), bad.res, () => undefined);
    expect(bad.result.status).toBe(400);

    const okAudience = response();
    await system.middlewares.at(-1)!(request('POST', '/api/agents/chat', { audience: 't-5', message: 'hi' }), okAudience.res, () => undefined);
    // Route will try the real env key path; without injection it may 503 — audience validation must not 400.
    expect(okAudience.result.status).not.toBe(400);

    const guided: string[] = [];
    const ecoGuided: string[] = [];
    const direct = await chatWithStrat({
      audience: 'both',
      message: 'Circuit lead of 2 should not auto-win; keep Locations meaningful.',
      history: [{
        role: 'assistant', speaker: 'eco-strat',
        content: formatChatReplyContent({
          speaker: 'eco-strat', answer: 'Opening.', complaints: [],
          questionsForMel: ['Does Circuit snowball?'], learned: [], confidence: 'weak', sources: [],
        }),
      }],
      learners: {
        'strat-g': {
          memory: system.strategist.memory(),
          recordGuidance: texts => { guided.push(...texts); },
        },
      },
      eco: {
        journal: system.eco.journal(),
        recordGuidance: texts => { ecoGuided.push(...texts); },
        answerQuestions: async (answer, matching) => {
          answerOpenQuestions(system.eco.journal(), answer, matching, AT);
        },
      },
      apiKey: 'sk-test',
      fetchImpl,
    });
    expect(direct.replies).toHaveLength(2);
    expect(direct.replies[0].speaker).toBe('strat-g');
    expect(direct.replies[1].speaker).toBe('eco-strat');
    expect(direct.replies[0].answer).toMatch(/0 games|not recorded|Record/i);
    expect(direct.replies[0].complaints).toHaveLength(3);
    expect(direct.replies[0].questionsForMel.length).toBeGreaterThan(0);
    expect(direct.replies.every(reply => reply.confidence === 'insufficient')).toBe(true);
    expect(guided.some(text => /Circuit lead/i.test(text))).toBe(true);
    expect(ecoGuided.length).toBeGreaterThan(0);

    const beforeKickoff = ecoGuided.length;
    const kickoff = await chatWithStrat({
      audience: 'eco-strat',
      message: CHAT_KICKOFF_MESSAGE,
      learners: {},
      eco: {
        journal: system.eco.journal(),
        recordGuidance: texts => { ecoGuided.push(...texts); },
      },
      apiKey: 'sk-test',
      fetchImpl,
    });
    expect(kickoff.replies[0].complaints.length).toBe(3);
    // Kickoff itself is not stored as designer guidance.
    expect(ecoGuided.length).toBe(beforeKickoff);
  });

  it('persists designer guidance on a live strategist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chat-guide-'));
    roots.push(root);
    await writeFile(join(root, 'authored-content.json'), JSON.stringify({ revision: 1, document: { cards: [], locations: [], circuitRewards: [], startingDeck: [] } }));
    const agent = createStrategist({ root, contentFile: join(root, 'authored-content.json'), log: () => undefined, apiKey: undefined });
    await agent.recordGuidance(['Designer Q&A: Mel said — prefer Locations over Circuit chase']);
    expect(agent.memory().notes.some(note => /prefer Locations/.test(note.text))).toBe(true);
  });
});
