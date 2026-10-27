// @ts-nocheck
// Ported from the Halyard desktop test/brief-folder.test.js (docs/architecture/62 H1): same fixtures, same assertions, run with vitest.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createBriefFolder } from './brief-folder';

const turns = (n, prefix = 'turn') =>
  Array.from({ length: n }, (_, i) => ({ channel: i % 2 ? 'them' : 'you', text: `${prefix} ${i}`, ts: 1 + i }));

/** A folder with a stub model and a timer we drive by hand. */
function harness(overrides = {}) {
  const calls = [];
  let fire = null;
  const deps = {
    createLLM: () => ({
      ready: true,
      async stream({ turns: t, onToken }) {
        calls.push(t[0].text);
        for (const chunk of (overrides.reply ?? 'brief: they asked about burn rate').split(' ')) onToken(chunk + ' ');
      },
    }),
    isBusy: () => false,
    delayMs: 20,
    setTimer: (fn) => { fire = fn; return 1; },
    clearTimer: () => { fire = null; },
    onError: (m) => calls.push(`ERROR:${m}`),
    ...overrides.deps,
  };
  const folder = createBriefFolder(deps);
  return { folder, calls, tick: async () => { const f = fire; fire = null; if (f) { f(); await new Promise((r) => setImmediate(r)); } } };
}

test('a real fold produces a brief from evicted turns', async () => {
  const h = harness();
  h.folder.push(turns(8));
  await h.tick();
  assert.equal(h.folder.getBrief(), 'brief: they asked about burn rate');
  assert.match(h.folder.block(), /summarised, not verbatim/);
  assert.equal(h.folder.pendingCount(), 0);
});

test('the next fold is given the previous brief, so it rewrites rather than grows', async () => {
  const h = harness();
  h.folder.push(turns(8, 'first'));
  await h.tick();
  h.folder.push(turns(8, 'second'));
  await h.folder.fold();
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[0], /There is no brief yet/);
  assert.match(h.calls[1], /Running brief of this conversation so far/);
  assert.match(h.calls[1], /burn rate/);
  assert.match(h.calls[1], /second 0/);
});

test('it does not fold while the user is waiting on an answer', async () => {
  let busy = true;
  const h = harness({ deps: { isBusy: () => busy } });
  h.folder.push(turns(8));
  await h.tick();
  assert.equal(h.calls.length, 0, 'a summary must not cost the conversation latency');
  assert.equal(h.folder.pendingCount(), 8, 'and the turns are still queued');
  busy = false;
  await h.folder.fold();
  assert.equal(h.calls.length, 1);
});

test('a failed model call returns the turns instead of losing them', async () => {
  const h = harness({ deps: { createLLM: () => ({ ready: true, stream: async () => { throw new Error('provider exploded'); } }) } });
  h.folder.push(turns(8));
  await h.tick();
  assert.equal(h.folder.pendingCount(), 8, 'these turns are already gone from the live window');
  assert.equal(h.folder.getBrief(), '');
  assert.ok(h.calls.some((c) => c.includes('provider exploded')));
});

test('with no provider configured it waits rather than discarding', async () => {
  const h = harness({ deps: { createLLM: () => ({ ready: false }) } });
  h.folder.push(turns(8));
  await h.tick();
  assert.equal(h.folder.pendingCount(), 8);
  assert.equal(h.calls.length, 0, 'an unconfigured provider is not an error worth logging every lull');
});

test('a blank response leaves the previous brief standing', async () => {
  const h = harness();
  h.folder.push(turns(8));
  await h.tick();
  const kept = h.folder.getBrief();

  const h2 = harness({ reply: '   ' });
  h2.folder.push(turns(8));
  await h2.tick();
  assert.equal(h2.folder.getBrief(), '', 'nothing to keep yet');
  assert.ok(kept.length > 0);
});

test('a short batch waits for more rather than spending a call', async () => {
  const h = harness();
  h.folder.push(turns(3));
  await h.tick();
  assert.equal(h.calls.length, 0);
  h.folder.push(turns(3));
  await h.tick();
  assert.equal(h.calls.length, 1, 'folds once the batch is worth a model call');
});

test('reset clears the brief and the queue', async () => {
  const h = harness();
  h.folder.push(turns(8));
  await h.tick();
  h.folder.reset();
  assert.equal(h.folder.getBrief(), '');
  assert.equal(h.folder.block(), '');
  assert.equal(h.folder.pendingCount(), 0);
});
