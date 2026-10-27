// @ts-nocheck
// Ported from the Halyard desktop test/prompts.test.js (docs/architecture/62 H1): same fixtures, same assertions, run with vitest.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MODES } from './prompts';
import { CALL_MODES, SPOKEN_ONLY, SPOKEN_MAX_TOKENS } from './prompts';

test('assist mode gives a direct answer in first person', () => {
  const system = MODES.assist.buildSystem(null);
  const text = system + '\n' + MODES.assist.build({ transcript: [], userText: '' });
  // System prompt must instruct to answer in first person with no preamble
  assert.match(text, /first person/i);
  assert.match(text, /no preamble|preamble/i);
});

test('say mode produces a spoken answer not a question', () => {
  const system = MODES.say.buildSystem(null);
  const text = system + '\n' + MODES.say.build({ transcript: [], userText: '' });
  assert.match(text, /say out loud|in first person/i);
  // Must instruct to write actual spoken words (not meta-instructions)
  assert.match(text, /actual words|Write the|2.5 sentences/i);
});

// (The coding solver and the interview-coaching prompts are desktop-only and are not part of the server core.)

const RULES = 'Never use the word synergy. Keep answers under two sentences.';

test('every non-leetcode mode injects AI rules into its system prompt', () => {
  for (const [name, mode] of Object.entries(MODES)) {
    if (name === 'leetcode') continue;
    const withRules = mode.buildSystem(null, RULES);
    assert.match(withRules, /--- USER RULES ---/, `${name}.buildSystem should append USER RULES block`);
    assert.ok(withRules.includes(RULES), `${name}.buildSystem should include the user's rules verbatim`);
  }
});

test('every non-leetcode mode returns the base prompt unchanged when no rules are set', () => {
  for (const [name, mode] of Object.entries(MODES)) {
    if (name === 'leetcode') continue;
    const without = mode.buildSystem(null, '');
    const blank = mode.buildSystem(null, null);
    assert.ok(!without.includes('USER RULES'), `${name} should not include USER RULES when aiRules is empty`);
    assert.ok(!blank.includes('USER RULES'), `${name} should not include USER RULES when aiRules is null`);
  }
});

// ── Spoken output ───────────────────────────────────────────────────────────
// 2026-09-23: "What should I say?" came back as a plan ("I should focus on…
// I'll start by highlighting…") rather than words to say.

test('spoken actions end with the spoken-only contract', () => {
  const ctx = { transcript: [{ channel: 'them', text: 'Tell me about yourself.' }], userText: 'Why this firm?' };
  for (const set of [CALL_MODES]) {
    for (const mode of ['say', 'answerThis']) {
      const turn = set[mode].build(ctx);
      assert.ok(turn.includes(SPOKEN_ONLY), mode + ' must carry the contract');
      assert.ok(set[mode].maxTokens >= SPOKEN_MAX_TOKENS, mode);
    }
  }
  assert.match(SPOKEN_ONLY, /ONLY the exact words/);
  assert.match(SPOKEN_ONLY, /no quotation marks/);
});

test('earlier suggestions are shown with a do-not-repeat instruction, and absent when there are none', () => {
  const ctx = { transcript: [{ channel: 'them', text: 'Tell me about yourself.' }], previous: ['ZZ_EARLIER_ANSWER'] };
  for (const set of [CALL_MODES]) {
    const turn = set.say.build(ctx);
    assert.match(turn, /ZZ_EARLIER_ANSWER/);
    assert.match(turn, /Do not repeat any of it/);
    assert.doesNotMatch(set.say.build({ transcript: ctx.transcript }), /already suggested/);
  }
});

test('call answers stay short', () => {
  assert.match(CALL_MODES.say.build({ transcript: [] }), /1–4 sentences/);
});

test('answer-this carries recent context, so a follow-up can be answered', () => {
  const ctx = { transcript: [{ channel: 'them', text: 'Tell me about the Northwind exit.' }, { channel: 'you', text: 'We sold in sixteen months.' }], userText: 'Why did you do it that way?' };
  for (const set of [CALL_MODES]) {
    const turn = set.answerThis.build(ctx);
    assert.match(turn, /Recent conversation, for context only:[\s\S]*Northwind[\s\S]*Why did you do it that way\?/);
  }
  assert.doesNotMatch(CALL_MODES.answerThis.build({ transcript: [], userText: 'q' }), /Recent conversation/);
});
