/**
 * Segments one PCM channel into bounded utterances without writing audio to disk (ported from the Halyard desktop `src/utterance-segmenter.js`): pre-roll 300 ms, minimum 180 ms,
 * maximum 25 s with a 300 ms overlap at each forced cut.
 */
import { AdaptiveVAD, AudioRingBuffer, type VadOptions } from "./vad"

export const DEFAULT_SAMPLE_RATE = 16000
const PCM_BYTES_PER_SAMPLE = 2
export const DEFAULT_PRE_ROLL_MS = 300
export const DEFAULT_MIN_UTTERANCE_MS = 180
export const DEFAULT_MAX_UTTERANCE_MS = 25000
export const DEFAULT_OVERLAP_MS = 300

export interface SegmenterOptions {
  channel: string; sampleRate?: number; preRollMs?: number; minUtteranceMs?: number; maxUtteranceMs?: number; overlapMs?: number; vadOptions?: VadOptions
  onSpeechState?: (channel: string, speaking: boolean, durationMs?: number) => void
  onUtterance?: (channel: string, pcm: Buffer) => void
}
export class UtteranceSegmenter {
  channel: string; sampleRate: number; minimumBytes: number; maximumBytes: number; overlapBytes: number
  onSpeechState: NonNullable<SegmenterOptions["onSpeechState"]>; onUtterance: NonNullable<SegmenterOptions["onUtterance"]>
  ringBuffer: AudioRingBuffer; utteranceChunks: Buffer[] = []; utteranceBytes = 0
  collecting = false; startedDuringPush = false; endedDuringPush = false; vad: AdaptiveVAD
  constructor({ channel, sampleRate = DEFAULT_SAMPLE_RATE, preRollMs = DEFAULT_PRE_ROLL_MS, minUtteranceMs = DEFAULT_MIN_UTTERANCE_MS, maxUtteranceMs = DEFAULT_MAX_UTTERANCE_MS, overlapMs = DEFAULT_OVERLAP_MS, vadOptions = {}, onSpeechState = () => {}, onUtterance = () => {} }: SegmenterOptions) {
    if (!channel) throw new Error("UtteranceSegmenter requires a channel.")
    this.channel = channel
    this.sampleRate = sampleRate
    this.minimumBytes = this._millisecondsToBytes(minUtteranceMs)
    this.maximumBytes = this._millisecondsToBytes(maxUtteranceMs)
    this.overlapBytes = this._millisecondsToBytes(overlapMs)
    this.onSpeechState = onSpeechState
    this.onUtterance = onUtterance
    this.ringBuffer = new AudioRingBuffer(preRollMs, sampleRate)
    this.vad = new AdaptiveVAD({ sampleRate, ...vadOptions, onSpeechStart: () => this._beginUtterance(), onSpeechEnd: (durationMs) => this._requestUtteranceEnd(durationMs) })
  }
  push(pcm: Uint8Array | Buffer | number[]): void {
    const chunk = Buffer.from(pcm || [])
    if (chunk.length < PCM_BYTES_PER_SAMPLE) return
    if (chunk.length % PCM_BYTES_PER_SAMPLE !== 0) throw new Error("PCM chunks must contain complete 16-bit samples.")
    this.startedDuringPush = false
    this.endedDuringPush = false
    const wasCollecting = this.collecting
    if (!wasCollecting) this.ringBuffer.write(chunk)
    this.vad.processChunk(chunk)
    if (wasCollecting) this._appendChunk(chunk)                    // a chunk that triggered speech start is already present in the pre-roll
    if (this.endedDuringPush) this._finalizeUtterance()
  }
  stop(): void { if (this.collecting) this._finalizeUtterance(); this.reset() }
  reset(): void { this.collecting = false; this.startedDuringPush = false; this.endedDuringPush = false; this.utteranceChunks = []; this.utteranceBytes = 0; this.ringBuffer.clear(); this.vad.reset() }
  _beginUtterance(): void {
    this.collecting = true
    this.startedDuringPush = true
    const preRoll = this.ringBuffer.read()
    this.utteranceChunks = preRoll.length ? [Buffer.from(preRoll)] : []
    this.utteranceBytes = preRoll.length
    this.ringBuffer.clear()
    this.onSpeechState(this.channel, true)
  }
  _requestUtteranceEnd(durationMs: number): void { this.endedDuringPush = true; this.onSpeechState(this.channel, false, durationMs) }
  _appendChunk(chunk: Buffer): void {
    this.utteranceChunks.push(chunk)
    this.utteranceBytes += chunk.length
    while (this.utteranceBytes >= this.maximumBytes) {
      const combined = Buffer.concat(this.utteranceChunks, this.utteranceBytes)
      this._emit(combined.subarray(0, this.maximumBytes))
      const nextStart = Math.max(0, this.maximumBytes - this.overlapBytes)
      const remainder = Buffer.from(combined.subarray(nextStart))
      this.utteranceChunks = remainder.length ? [remainder] : []
      this.utteranceBytes = remainder.length
    }
  }
  _finalizeUtterance(): void {
    if (!this.collecting) return
    const utterance = Buffer.concat(this.utteranceChunks, this.utteranceBytes)
    if (utterance.length >= this.minimumBytes) this._emit(utterance)
    this.collecting = false; this.endedDuringPush = false; this.utteranceChunks = []; this.utteranceBytes = 0
    this.ringBuffer.clear()
  }
  _emit(pcm: Buffer): void { this.onUtterance(this.channel, Buffer.from(pcm)) }
  _millisecondsToBytes(durationMs: number): number { return Math.floor((this.sampleRate * PCM_BYTES_PER_SAMPLE * durationMs) / 1000) }
}
