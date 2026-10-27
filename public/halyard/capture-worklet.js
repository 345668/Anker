// Halyard capture worklet: the microphone at the device's sample rate to 16 kHz mono 16-bit PCM, in 30 ms frames (480 samples).
// A plain script (no imports) because an AudioWorklet module is loaded by URL.
class HalyardCapture extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.acc = 0; this.n = 0; this.out = new Int16Array(480); this.filled = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    // Box-filter decimation: average every `ratio` input samples into one output sample (enough to avoid harsh aliasing for speech).
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.n++; this.pos++
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio
        const v = Math.max(-1, Math.min(1, this.acc / this.n)); this.acc = 0; this.n = 0
        this.out[this.filled++] = v < 0 ? v * 0x8000 : v * 0x7fff
        if (this.filled === 480) { this.port.postMessage(this.out.buffer.slice(0)); this.filled = 0 }
      }
    }
    return true
  }
}
registerProcessor("halyard-capture", HalyardCapture)
