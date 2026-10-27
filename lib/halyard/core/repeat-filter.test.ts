// @ts-nocheck
// Ported from the Halyard desktop test/repeat-filter.test.js (docs/architecture/62 H1): same fixtures, same assertions, run with vitest.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRepeatFilter } from './repeat-filter';

// From the 2026-09-23 capture: one "Other participant" turn, then the same
// audio again, re-emitted as one block together with the turns that followed.
const FIRST = 'And the first floor. Now, let\'s go this way. Formal living room area, floating steel '
  + 'staircase with open riser design, glass railing that takes us up to the second floor.';
const NEXT = 'panels just looks great. And a dual elevation bar set up here. Take a look at this Onyx. '
  + 'I\'ve never seen Onyx with this kind of a vein cut in detail before.';
const REEMITTED = FIRST + ' ' + 'And a dual elevation bar set up here. Take a look at this Onyx. '
  + 'I\'ve never seen Onyx with this kind of a vein cut in detail before.';

test('a turn re-emitted with the turns after it is caught', () => {
  const f = createRepeatFilter();
  assert.equal(f.isRepeat('them', FIRST, 0), false);
  assert.equal(f.isRepeat('them', NEXT, 5000), false);
  assert.equal(f.isRepeat('them', REEMITTED, 30000), true);
  assert.equal(f.report.suppressed, 1);
});

test('the same audio cut at different boundaries is caught despite formatting', () => {
  const f = createRepeatFilter();
  f.isRepeat('you', 'got a deal and it\'s back on the market for 21 million dollars. You\'re going to find out exactly what\'s wrong with this unit', 0);
  assert.equal(
    f.isRepeat('you', 'Got a deal and it\'s back on the market for $21 million. You\'re going to find out exactly what\'s wrong with this unit by', 4000),
    true,
  );
});

test('a person repeating a short question is kept', () => {
  const f = createRepeatFilter();
  assert.equal(f.isRepeat('you', 'What is 1 plus 1?', 0), false);
  assert.equal(f.isRepeat('you', 'Again, what is 1 plus 1?', 3000), false);
  assert.equal(f.isRepeat('you', 'What is 1 plus 1?', 6000), false);
});

test('a new sentence on the same topic is kept', () => {
  const f = createRepeatFilter();
  f.isRepeat('you', 'Tell me a little bit more about Zalando and how they moved into the fashion marketplace in Berlin', 0);
  assert.equal(
    f.isRepeat('you', 'I would have definitely played for Zalando because the Berlin marketplace for fashion was growing fast', 5000),
    false,
  );
});

test('channels are independent: the other party saying it is not a repeat', () => {
  const f = createRepeatFilter();
  f.isRepeat('them', FIRST, 0);
  assert.equal(f.isRepeat('you', FIRST, 1000), false);
});

test('outside the window it is not a repeat', () => {
  const f = createRepeatFilter({ windowMs: 60000 });
  f.isRepeat('them', FIRST, 0);
  assert.equal(f.isRepeat('them', FIRST, 61000), false);
});
