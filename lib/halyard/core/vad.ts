/**
 * Voice activity detection on the server side (ported from the Halyard desktop `src/vad.js`): an adaptive energy VAD with a speech state machine and a ring buffer of pre-speech audio.
 * Thresholds are RATIOS of the measured noise floor, not absolute RMS (the desktop's evaluation, 2026-09-20: absolute thresholds fail in noisy rooms). In the browser the Silero VAD runs;
 * this is the pure fallback and the segmenter's dependency.
 */
export interface VadOptions {
  sampleRate?: number; frameDurationMs?: number; onsetRatio?: number; offsetRatio?: number; silenceFrames?: number; minSpeechFrames?: number; energyWindow?: number; floorMin?: number
  onSpeechStart?: () => void; onSpeechEnd?: (durationMs: number) => void; onVADState?: (state: string) => void
}
export class AdaptiveVAD {
  sampleRate: number; frameDurationMs: number; frameSize: number; onsetRatio: number; offsetRatio: number; silenceFrames: number; minSpeechFrames: number
  noiseFloor = 80; energyWindow: number; energies: number[] = []; floorMin: number
  state: "silence" | "speech" | "trailing" = "silence"
  speechFrameCount = 0; silenceFrameCount = 0; totalSpeechFrames = 0
  onSpeechStart: () => void; onSpeechEnd: (durationMs: number) => void; onVADState: (state: string) => void
  constructor(options: VadOptions = {}) {
    this.sampleRate = options.sampleRate || 16000
    this.frameDurationMs = options.frameDurationMs || 30
    this.frameSize = Math.floor((this.sampleRate * this.frameDurationMs) / 1000)
    this.onsetRatio = options.onsetRatio || 3.0
    this.offsetRatio = options.offsetRatio || 1.6
    this.silenceFrames = options.silenceFrames || 10
    this.minSpeechFrames = options.minSpeechFrames || 4
    this.energyWindow = options.energyWindow || 150
    this.floorMin = options.floorMin || 15
    this.onSpeechStart = options.onSpeechStart || (() => {})
    this.onSpeechEnd = options.onSpeechEnd || (() => {})
    this.onVADState = options.onVADState || (() => {})
  }
  /** Processes a chunk of Int16 little-endian PCM. */
  processChunk(pcm: Buffer): void {
    let offset = 0
    while (offset + this.frameSize * 2 <= pcm.length) {
      this._processFrame(this._computeRMS(pcm.subarray(offset, offset + this.frameSize * 2)))
      offset += this.frameSize * 2
    }
  }
  _computeRMS(frame: Buffer): number {
    let sum = 0
    const n = frame.length / 2
    for (let i = 0; i < frame.length; i += 2) { const s = frame.readInt16LE(i); sum += s * s }
    return Math.sqrt(sum / n)
  }
  _processFrame(energy: number): void {
    this.energies.push(energy)
    if (this.energies.length > this.energyWindow) this.energies.shift()
    let min = Infinity
    for (const e of this.energies) if (e < min) min = e
    this.noiseFloor = this.noiseFloor * 0.9 + Math.max(this.floorMin, min) * 0.1       // smoothed toward the window minimum
    const isSpeech = energy > this.noiseFloor * this.onsetRatio
    const isSilence = energy < this.noiseFloor * this.offsetRatio
    switch (this.state) {
      case "silence":
        if (isSpeech) { this.speechFrameCount = 1; this.state = "speech"; this.onSpeechStart(); this.onVADState("speech") }
        break
      case "speech":
        if (isSpeech) { this.speechFrameCount++; this.totalSpeechFrames++ }
        else if (isSilence) { this.silenceFrameCount = 1; this.state = "trailing" }
        break
      case "trailing":
        if (isSpeech) { this.silenceFrameCount = 0; this.speechFrameCount++; this.state = "speech" }
        else {
          this.silenceFrameCount++
          if (this.silenceFrameCount >= this.silenceFrames) {
            if (this.speechFrameCount >= this.minSpeechFrames) this.onSpeechEnd(this.speechFrameCount * this.frameDurationMs)
            this.state = "silence"; this.speechFrameCount = 0; this.silenceFrameCount = 0
            this.onVADState("silence")
          }
        }
        break
    }
  }
  getState() { return { state: this.state, isSpeaking: this.state !== "silence", noiseFloor: Math.round(this.noiseFloor), speechDurationMs: this.speechFrameCount * this.frameDurationMs } }
  reset(): void { this.state = "silence"; this.speechFrameCount = 0; this.silenceFrameCount = 0; this.totalSpeechFrames = 0; this.noiseFloor = 80 }
}

/** Keeps pre-speech audio so the first word is not lost. */
export class AudioRingBuffer {
  capacity: number; buffer: Buffer; writePos = 0; filled = false
  constructor(durationMs: number, sampleRate = 16000) { this.capacity = Math.floor((sampleRate * 2 * durationMs) / 1000); this.buffer = Buffer.alloc(this.capacity) }
  write(pcm: Buffer): void {
    if (pcm.length >= this.capacity) { pcm.copy(this.buffer, 0, pcm.length - this.capacity); this.writePos = 0; this.filled = true; return }
    const space = this.capacity - this.writePos
    if (pcm.length <= space) { pcm.copy(this.buffer, this.writePos); this.writePos += pcm.length }
    else { pcm.copy(this.buffer, this.writePos, 0, space); pcm.copy(this.buffer, 0, space); this.writePos = pcm.length - space; this.filled = true }
  }
  /** All buffered audio, in order. */
  read(): Buffer { return this.filled ? Buffer.concat([this.buffer.subarray(this.writePos), this.buffer.subarray(0, this.writePos)]) : this.buffer.subarray(0, this.writePos) }
  clear(): void { this.writePos = 0; this.filled = false }
}
