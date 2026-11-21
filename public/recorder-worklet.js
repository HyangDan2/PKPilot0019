/**
 * Lýra loop recorder worklet.
 *
 * Records the incoming track signal and posts Float32Array chunks tagged with
 * the AudioContext time of their first frame. No SharedArrayBuffer involvement,
 * so it runs on a plain static host (GitHub Pages) without COOP/COEP headers.
 */
const BLOCK = 2048;

class LyraRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.pending = null;
    this.pendingTime = 0;
    this.pendingFrames = 0;
    this.port.onmessage = (event) => {
      const type = event.data && event.data.type;
      if (type === 'start') {
        this.recording = true;
        this.pending = null;
        this.pendingFrames = 0;
      } else if (type === 'stop') {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  flush() {
    if (!this.pending || this.pendingFrames === 0) {
      this.pending = null;
      this.pendingFrames = 0;
      return;
    }
    const channels = this.pending.map((channel) => channel.slice(0, this.pendingFrames));
    this.port.postMessage({ time: this.pendingTime, channels }, channels.map((ch) => ch.buffer));
    this.pending = null;
    this.pendingFrames = 0;
  }

  process(inputs) {
    if (!this.recording) return true;
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;
    const frames = input[0].length;
    if (!this.pending) {
      this.pending = input.map(() => new Float32Array(BLOCK));
      this.pendingFrames = 0;
      this.pendingTime = currentTime;
    }
    let written = 0;
    while (written < frames) {
      const room = BLOCK - this.pendingFrames;
      const take = Math.min(room, frames - written);
      for (let ch = 0; ch < input.length; ch += 1) {
        this.pending[ch].set(input[ch].subarray(written, written + take), this.pendingFrames);
      }
      this.pendingFrames += take;
      written += take;
      if (this.pendingFrames >= BLOCK) this.flush();
      if (written < frames && !this.pending) {
        this.pending = input.map(() => new Float32Array(BLOCK));
        this.pendingFrames = 0;
        this.pendingTime = currentTime + written / sampleRate;
      }
    }
    return true;
  }
}

registerProcessor('lyra-recorder', LyraRecorderProcessor);
