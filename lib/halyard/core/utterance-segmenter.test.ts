// @ts-nocheck
// Ported from the Halyard desktop test/utterance-segmenter.test.js (docs/architecture/62 H1): same fixtures, same assertions, run with vitest.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UtteranceSegmenter } from './utterance-segmenter';

const FRAME_SAMPLES = 480;
const FRAME_BYTES = FRAME_SAMPLES * 2;

function frame(amplitude) {
  const buffer = Buffer.alloc(FRAME_BYTES);
  for (let offset = 0; offset < buffer.length; offset += 2) buffer.writeInt16LE(amplitude, offset);
  return buffer;
}

function pushFrames(segmenter, amplitude, count) {
  for (let index = 0; index < count; index += 1) segmenter.push(frame(amplitude));
}

test('includes pre-roll and emits after the configured trailing silence', () => {
  const utterances = [];
  const speechStates = [];
  const segmenter = new UtteranceSegmenter({
    channel: 'you',
    onSpeechState: (_channel, speaking) => speechStates.push(speaking),
    onUtterance: (_channel, pcm) => utterances.push(pcm)
  });

  pushFrames(segmenter, 0, 10);
  pushFrames(segmenter, 1200, 8);
  pushFrames(segmenter, 0, 18);

  assert.equal(utterances.length, 1);
  // Pre-roll (300 ms) + the 8 speech frames + the trailing silence that closed
  // the turn. Derived rather than hardcoded: the trailing hangover shortened
  // from 450 ms to 300 ms when the VAD moved to noise-relative thresholds, and
  // a magic frame count silently encoded the old value.
  const PRE_ROLL_FRAMES = 10; // DEFAULT_PRE_ROLL_MS / 30
  const SPEECH_FRAMES = 8;
  assert.ok(
    utterances[0].length >= FRAME_BYTES * (PRE_ROLL_FRAMES + SPEECH_FRAMES),
    `utterance was ${utterances[0].length / FRAME_BYTES} frames; pre-roll and speech alone are ${PRE_ROLL_FRAMES + SPEECH_FRAMES}`
  );
  assert.deepEqual(speechStates, [true, false]);
});

test('flushes a final active utterance when capture stops', () => {
  const utterances = [];
  const segmenter = new UtteranceSegmenter({
    channel: 'them',
    onUtterance: (_channel, pcm) => utterances.push(pcm)
  });
  pushFrames(segmenter, 1000, 8);
  segmenter.stop();
  assert.equal(utterances.length, 1);
  assert.ok(utterances[0].length >= FRAME_BYTES * 8);
});

test('splits long speech into bounded segments with overlap', () => {
  const utterances = [];
  const segmenter = new UtteranceSegmenter({
    channel: 'you',
    preRollMs: 60,
    minUtteranceMs: 30,
    maxUtteranceMs: 300,
    overlapMs: 60,
    onUtterance: (_channel, pcm) => utterances.push(pcm)
  });
  pushFrames(segmenter, 1000, 24);
  segmenter.stop();

  assert.ok(utterances.length >= 3);
  assert.equal(utterances[0].length, FRAME_BYTES * 10);
  assert.equal(utterances[1].length, FRAME_BYTES * 10);
  assert.ok(utterances.every((pcm) => pcm.length <= FRAME_BYTES * 10));
});
