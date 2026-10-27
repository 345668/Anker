// @ts-nocheck
// Ported from the Halyard desktop test/echo-filter.test.js (docs/architecture/62 H1): same fixtures, same assertions, run with vitest.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createEchoFilter, containment, tokenize } from './echo-filter';

// The real capture that prompted this. The system audio was a property tour
// playing through speakers; the microphone heard it and the `you` channel
// transcribed it as the user's own words.
const REMOTE = 'And the first floor. Now, let\'s go this way. Formal living room area, floating steel '
  + 'staircase with open riser design, glass railing that takes us up to the second floor. And to '
  + 'separate the seating bar area from the formal living room, we have this gorgeous wine cellar '
  + 'assembly that kind of separates each room from each other.';

const BLEED = 'From a living room area, floating steel staircase with open riser design, glass '
  + 'railing that takes us up to the second floor. And to separate the seating bar area from the '
  + 'former living room, you have this gorgeous wine cellar assembly that kind of separates each '
  + 'room from each other.';

test('the measured bleed is recognised as an echo', () => {
  const filter = createEchoFilter();
  filter.noteRemote(REMOTE, 1000);

  const verdict = filter.inspect(BLEED, 2500);
  assert.equal(verdict.echo, true, `similarity was ${verdict.similarity.toFixed(2)}`);
});

test('a real turn during the other party\'s speech is kept', () => {
  // The case that makes a careless filter dangerous: the user says something
  // of their own while the remote audio is playing.
  const filter = createEchoFilter();
  filter.noteRemote(REMOTE, 1000);

  const mine = 'Can you send me the floor plan and the service charge breakdown before Friday?';
  assert.equal(filter.inspect(mine, 2000).echo, false);
});

test('short acknowledgements are never suppressed', () => {
  // "yes", "right", "that makes sense" are trivially contained in any long
  // remote turn, and they are exactly what a listener says while listening.
  const filter = createEchoFilter();
  filter.noteRemote(REMOTE, 1000);

  for (const said of ['Yes.', 'Right, okay.', 'That makes sense.', 'Each room, got it.']) {
    assert.equal(filter.inspect(said, 1500).echo, false, `suppressed "${said}"`);
  }
});

test('an echo arriving long after the remote turn is kept', () => {
  // Bleed is simultaneous by nature. A match a minute later is the same topic
  // being discussed, which is a conversation, not an echo.
  const filter = createEchoFilter();
  filter.noteRemote(REMOTE, 1000);

  assert.equal(filter.inspect(BLEED, 1000 + 60000).echo, false);
});

test('a partial overlap is a conversation, not an echo', () => {
  const filter = createEchoFilter();
  filter.noteRemote('We are raising four million at sixty million pre-money.', 1000);

  // Repeating some of it back, with substance of their own added.
  const mine = 'Four million at sixty pre-money — that is a higher multiple than the last round '
    + 'and I want to understand what changed in the meantime.';
  assert.equal(filter.inspect(mine, 2000).echo, false);
});

test('repeating the other party back verbatim is suppressed, and that is accepted', () => {
  // The known false positive, recorded rather than hidden: if the user reads
  // the remote turn back word for word within the window, it is dropped. The
  // trade is deliberate — that utterance adds nothing the record does not
  // already hold one line above.
  const filter = createEchoFilter();
  filter.noteRemote('The ceiling heights were nowhere near enough to carry a price tag like this.', 1000);

  const echoed = 'The ceiling heights were nowhere near enough to carry a price tag like this.';
  assert.equal(filter.inspect(echoed, 2000).echo, true);
});

test('suppressions are counted and the last one is kept for inspection', () => {
  const filter = createEchoFilter();
  filter.noteRemote(REMOTE, 1000);

  assert.equal(filter.report.suppressed, 0);
  filter.isEcho(BLEED, 2000);
  assert.equal(filter.report.suppressed, 1);
  assert.ok(filter.report.last.text.startsWith('From a living room'));
});

test('history is bounded so a long call cannot grow it', () => {
  const filter = createEchoFilter({ history: 3 });
  const first = 'quarterly revenue reached eleven million across four regions';
  filter.noteRemote(first, 1000);
  // Distinct subjects, so a retained turn cannot match the first by accident —
  // the earlier version of this test used near-identical filler and matched
  // turn 19 while claiming to prove something about turn 0.
  for (const later of [
    'the warehouse lease expires in March and renewal is unresolved',
    'hiring paused across engineering until the board meets',
    'customer churn improved after the onboarding rewrite shipped',
    'legal wants the indemnity clause narrowed before signature',
  ]) filter.noteRemote(later, 1000);

  assert.equal(filter.inspect(first, 1000).echo, false,
    'a turn pushed out of history must no longer match');
});

test('reset clears everything between captures', () => {
  const filter = createEchoFilter();
  filter.noteRemote(REMOTE, 1000);
  filter.isEcho(BLEED, 2000);
  filter.reset();

  assert.equal(filter.report.suppressed, 0);
  assert.equal(filter.inspect(BLEED, 2000).echo, false);
});

test('containment is asymmetric, which is the point', () => {
  // An echo is a shorter, degraded copy. A symmetric measure would score a
  // true echo low simply because the remote turn said more.
  const short = tokenize('floating steel staircase');
  const long = tokenize('floating steel staircase with open riser design and a glass railing');
  assert.equal(containment(short, long), 1);
  assert.ok(containment(long, short) < 0.5);
});

test('an empty or punctuation-only turn is never an echo', () => {
  const filter = createEchoFilter();
  filter.noteRemote(REMOTE, 1000);
  for (const junk of ['', '   ', '...', '?!']) {
    assert.equal(filter.inspect(junk, 1500).echo, false);
  }
});

// The order the 2026-09-23 capture actually delivered them in: the
// microphone's copy finished transcribing BEFORE the remote original. The
// filter itself is order-agnostic once both are known; main.js holds a local
// turn while the other party is speaking so the remote one can arrive first.
test('bleed that arrived before its remote original is still recognised once the original is noted', () => {
  const filter = createEchoFilter();
  assert.equal(filter.inspect(BLEED, 1000).echo, false, 'nothing to compare against yet');
  filter.noteRemote(REMOTE, 3500);
  assert.equal(filter.inspect(BLEED, 1000).echo, true);
});
