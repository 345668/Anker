// @ts-nocheck
// Ported from the Halyard desktop test/rolling-summary.test.js (docs/architecture/62 H1): same fixtures, same assertions, run with vitest.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  estimateTokens, buildFoldPrompt, shouldFold, applyFold, formatBrief, fitToBudget,
  MAX_BRIEF_CHARS, MIN_TURNS_TO_FOLD,
} from './rolling-summary';
import { extractFigures } from './rolling-summary';

const turn = (channel, text) => ({ channel, text, ts: Date.now() });
const turns = (n, text = 'a normal length sentence in a conversation') =>
  Array.from({ length: n }, (_, i) => turn(i % 2 ? 'them' : 'you', `${text} ${i}`));

test('the brief is regenerated from the previous brief, never appended to', () => {
  const prompt = buildFoldPrompt('earlier: discussed the Series A', turns(8));
  // Both halves are present and the model is told to rewrite, which is what
  // keeps the result bounded across a long call.
  assert.match(prompt, /Running brief of this conversation so far/);
  assert.match(prompt, /discussed the Series A/);
  assert.match(prompt, /Rewrite the running brief/);
});

test('the fold prompt keeps what an interview turns on', () => {
  const prompt = buildFoldPrompt('', turns(8));
  for (const kind of ['name', 'figure', 'committed', 'question that was asked and not answered']) {
    assert.ok(prompt.includes(kind), `the brief should preserve ${kind}`);
  }
  assert.match(prompt, /There is no brief yet/);
});

test('folding waits until it would save something', () => {
  assert.equal(shouldFold(turns(MIN_TURNS_TO_FOLD - 1)), false);
  assert.equal(shouldFold(turns(MIN_TURNS_TO_FOLD)), true);
  assert.equal(shouldFold([]), false);
  assert.equal(shouldFold(undefined), false);
});

test('a brief is bounded, and is cut on a sentence boundary', () => {
  const long = ('Discussed the raise. ').repeat(400);
  const out = applyFold(long);
  assert.ok(out.length <= MAX_BRIEF_CHARS, `brief is ${out.length} chars`);
  assert.ok(out.endsWith('.'), 'a brief cut mid-clause reads as though the model lost its thread');
  assert.equal(applyFold('   '), '');
  assert.equal(applyFold(undefined), '');
});

test('the brief is labelled as summarised, so it is not quoted as speech', () => {
  assert.equal(formatBrief(''), '');
  const block = formatBrief('they committed to intro us to two LPs');
  assert.match(block, /summarised, not verbatim/);
  assert.match(block, /two LPs/);
});

test('the budget is in tokens, because a turn is not a unit of size', () => {
  const short = [turn('you', 'yes')];
  const long = [turn('you', 'word '.repeat(500))];
  assert.equal(fitToBudget('', short, 1000).turns.length, 1);
  // Same turn count, wildly different cost — which is why turn counts cannot
  // bound a prompt.
  assert.equal(fitToBudget('', long, 100).turns.length, 0);
});

test('a tight budget trims the oldest turns and keeps the brief', () => {
  const fitted = fitToBudget('earlier: they asked about burn rate', turns(60), 200);
  assert.match(fitted.brief, /burn rate/, 'the brief represents the hour that was dropped');
  assert.ok(fitted.turns.length > 0 && fitted.turns.length < 60);
  // Newest survive: the oldest are already represented by the brief.
  assert.equal(fitted.turns[fitted.turns.length - 1].text, turns(60)[59].text);
  assert.ok(fitted.tokens <= 200);
});

test('with no brief it degrades to a plain recent-turns window', () => {
  const fitted = fitToBudget('', turns(10), 10000);
  assert.equal(fitted.brief, '');
  assert.equal(fitted.turns.length, 10);
});

test('token estimates are monotonic and non-zero for real text', () => {
  assert.ok(estimateTokens('a longer piece of text') > estimateTokens('short'));
  assert.equal(estimateTokens(''), 0);
});

// (The desktop's tests of how main.js wires the folder are desktop-only and are not ported; the server session wires it in H2.)

// ---- what a real fold lost --------------------------------------------------
// 2026-09-20: a live fold dropped "five LOIs ... around five million" and then
// asserted "No commitments made yet" — the most consequential fact in the
// conversation, lost to the model's judgement about what mattered. Figures are
// cheap to find deterministically and far too expensive to lose.


test('figures said out loud are extracted, not left to the model to notice', () => {
  const said = [
    { channel: 'you', text: 'we have signed five LOIs, the total amount will be around five million' },
    { channel: 'you', text: 'a four million raise, 10 to 15% equity, burn is 90,000 a month with 18 months runway' },
  ];
  const figures = extractFigures(said);
  for (const must of ['five LOIs', 'five million', 'four million', '15%', '18 months']) {
    assert.ok(figures.includes(must), `${must} must survive; it did not last time`);
  }
});

test('the fold prompt carries the figures and forbids denying a commitment', () => {
  const prompt = buildFoldPrompt('', [
    { channel: 'you', text: 'we signed five LOIs worth five million' },
  ]);
  assert.match(prompt, /Carry every one of them into the brief/);
  assert.match(prompt, /- five LOIs/);
  assert.match(prompt, /A signed agreement or an offered introduction IS a commitment/);
  assert.match(prompt, /Never write that there are no commitments/);
});

test('the prompt forbids the editorialising a real fold produced', () => {
  // It wrote "Impact of AI on patient care outcomes requires deeper discussion"
  // — the model's opinion about the conversation, not a fact from it.
  const prompt = buildFoldPrompt('', [{ channel: 'you', text: 'anything' }]);
  assert.match(prompt, /Record only what was said/);
  assert.match(prompt, /needs further discussion/);
  assert.match(prompt, /do not suggest what should happen next/);
});

test('headings and preamble are stripped even when the model ignores the instruction', () => {
  const out = applyFold('**Running Brief:**\n\n## Key Points\n- **4M** raise at 16 pre\n');
  assert.doesNotMatch(out, /Running Brief/i);
  assert.doesNotMatch(out, /^#/m);
  assert.doesNotMatch(out, /\*\*/);
  assert.match(out, /4M raise at 16 pre/);
});

test('no figures means no must-keep block rather than an empty one', () => {
  const prompt = buildFoldPrompt('', [{ channel: 'you', text: 'hello there how are you' }]);
  assert.doesNotMatch(prompt, /Carry every one of them/);
});
