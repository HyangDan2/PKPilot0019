/**
 * Deterministic Web Audio stand-in for the engine integration tests.
 *
 * The real engine only talks to the AudioContext graph, so a small fake with a
 * manually driven clock lets a test reproduce what a performer does: blocks of
 * microphone input at known times, transport changes, track buttons, device
 * swaps and an offline render. Scheduled parameter times are validated the way
 * browsers do (finite, non-negative, no exponential ramp to zero), so a cold
 * load that schedules a click in the past fails here instead of in Safari.
 */

export class FakeAudioParam {
  value: number;
  readonly events: { type: string; value: number; time: number }[] = [];

  constructor(value = 0) {
    this.value = value;
  }

  private check(time: number): void {
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
      throw new RangeError(`AudioParam: invalid time ${String(time)}`);
    }
  }

  setValueAtTime(value: number, time: number): this {
    this.check(time);
    this.events.push({ type: 'set', value, time });
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.check(time);
    this.events.push({ type: 'linear', value, time });
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.check(time);
    if (value <= 0) throw new RangeError('AudioParam: exponential ramp to a non-positive value');
    this.events.push({ type: 'exponential', value, time });
    this.value = value;
    return this;
  }

  setTargetAtTime(value: number, time: number, constant: number): this {
    this.check(time);
    if (!(constant > 0)) throw new RangeError('AudioParam: invalid time constant');
    this.events.push({ type: 'target', value, time });
    this.value = value;
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.check(time);
    this.events.length = 0;
    return this;
  }
}

export class FakeAudioNode {
  readonly incoming = new Set<FakeAudioNode>();
  readonly outgoing = new Set<FakeAudioNode>();

  connect<T extends FakeAudioNode>(destination: T): T {
    this.outgoing.add(destination);
    destination.incoming.add(this);
    return destination;
  }

  disconnect(destination?: FakeAudioNode): void {
    if (destination) {
      this.outgoing.delete(destination);
      destination.incoming.delete(this);
      return;
    }
    for (const node of this.outgoing) node.incoming.delete(this);
    this.outgoing.clear();
  }

  isFeeding(node: FakeAudioNode): boolean {
    return this.outgoing.has(node);
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type = 'lowpass';
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);
}

export class FakeDelayNode extends FakeAudioNode {
  readonly delayTime: FakeAudioParam;

  constructor(maxDelay: number) {
    super();
    this.delayTime = new FakeAudioParam(0);
    void maxDelay;
  }
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam(0);
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 1024;
  private readonly data = new Float32Array(2048);

  getFloatTimeDomainData(target: Float32Array): void {
    target.set(this.data.subarray(0, Math.min(target.length, this.data.length)));
  }
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);
}

export class FakeConvolverNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
}

export class FakeOscillatorNode extends FakeAudioNode {
  type = 'sine';
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
  startTime: number | null = null;
  stopTime: number | null = null;

  start(time = 0): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError(`oscillator.start(${time})`);
    this.startTime = time;
  }

  stop(time = 0): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError(`oscillator.stop(${time})`);
    this.stopTime = time;
  }
}

export class FakeBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started = false;
  stopped = false;
  startTime: number | null = null;
  onended: (() => void) | null = null;

  start(time = 0): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError(`bufferSource.start(${time})`);
    this.started = true;
    this.startTime = time;
  }

  stop(): void {
    this.stopped = true;
  }
}

export interface FakeAudioProcessingEvent {
  playbackTime: number;
  inputBuffer: {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    getChannelData(channel: number): Float32Array;
  };
}

export class FakeScriptProcessorNode extends FakeAudioNode {
  onaudioprocess: ((event: FakeAudioProcessingEvent) => void) | null = null;
  readonly incomingChannels: number;

  constructor(
    readonly bufferSize: number,
    incomingChannels: number,
  ) {
    super();
    this.incomingChannels = incomingChannels;
  }
}

export class FakeMediaStreamTrack {
  kind = 'audio';
  readyState: 'live' | 'ended' = 'live';
  onended: (() => void) | null = null;

  stop(): void {
    this.readyState = 'ended';
  }

  /** Simulates the device disappearing (unplugged). */
  end(): void {
    this.readyState = 'ended';
    this.onended?.();
  }
}

export class FakeMediaStream {
  readonly tracks: FakeMediaStreamTrack[];

  constructor(tracks: FakeMediaStreamTrack[] = [new FakeMediaStreamTrack()]) {
    this.tracks = tracks;
  }

  getTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }

  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
}

export class FakeMediaStreamSourceNode extends FakeAudioNode {
  constructor(readonly stream: FakeMediaStream) {
    super();
  }
}

export class FakeAudioBuffer {
  private readonly data: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: Math.max(1, numberOfChannels) }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    const data = this.data[channel];
    if (!data) throw new RangeError(`channel ${channel} out of range`);
    return data;
  }
}

/** Shared node factory for the realtime and offline fakes. */
class FakeNodeFactory {
  readonly nodes: FakeAudioNode[] = [];
  readonly processors: FakeScriptProcessorNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly bufferSources: FakeBufferSourceNode[] = [];

  protected track<T extends FakeAudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  createGain(): FakeGainNode {
    return this.track(new FakeGainNode());
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return this.track(new FakeBiquadFilterNode());
  }

  createDelay(maxDelay = 1): FakeDelayNode {
    return this.track(new FakeDelayNode(maxDelay));
  }

  createStereoPanner(): FakeStereoPannerNode {
    return this.track(new FakeStereoPannerNode());
  }

  createAnalyser(): FakeAnalyserNode {
    return this.track(new FakeAnalyserNode());
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    return this.track(new FakeDynamicsCompressorNode());
  }

  createConvolver(): FakeConvolverNode {
    return this.track(new FakeConvolverNode());
  }

  createOscillator(): FakeOscillatorNode {
    const node = this.track(new FakeOscillatorNode());
    this.oscillators.push(node);
    return node;
  }

  createBufferSource(): FakeBufferSourceNode {
    const node = this.track(new FakeBufferSourceNode());
    this.bufferSources.push(node);
    return node;
  }

  createBuffer(channels: number, frames: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, frames, sampleRate);
  }

  createScriptProcessor(bufferSize = 2048, inputs = 1, outputs = 1): FakeScriptProcessorNode {
    void outputs;
    const node = this.track(new FakeScriptProcessorNode(bufferSize, inputs));
    this.processors.push(node);
    return node;
  }

  createMediaStreamSource(stream: FakeMediaStream): FakeMediaStreamSourceNode {
    if (!stream) throw new TypeError('createMediaStreamSource: stream required');
    return this.track(new FakeMediaStreamSourceNode(stream));
  }

  createMediaStreamDestination(): { stream: FakeMediaStream; connect: () => void } {
    return { stream: new FakeMediaStream(), connect: () => undefined };
  }
}

export interface FakeContextOptions {
  sampleRate?: number;
  latencyHint?: string | number;
}

export class FakeAudioContext extends FakeNodeFactory {
  readonly sampleRate: number;
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  readonly destination = new FakeAudioNode();
  closed = false;

  constructor(options: FakeContextOptions = {}) {
    super();
    this.sampleRate = options.sampleRate ?? 8000;
    void options.latencyHint;
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
    this.closed = true;
  }
}

/** Offline context: sums every started source into the rendered buffer. */
export class FakeOfflineAudioContext extends FakeNodeFactory {
  readonly destination = new FakeAudioNode();
  readonly length: number;
  readonly sampleRate: number;
  rendered: FakeAudioBuffer | null = null;

  constructor(channels: number, length: number, sampleRate: number) {
    super();
    this.length = length;
    this.sampleRate = sampleRate;
    void channels;
  }

  async startRendering(): Promise<FakeAudioBuffer> {
    const output = new FakeAudioBuffer(2, this.length, this.sampleRate);
    for (const source of this.bufferSources) {
      const buffer = source.buffer;
      if (!source.started || !buffer) continue;
      for (let channel = 0; channel < 2; channel += 1) {
        const dest = output.getChannelData(channel);
        const data = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        for (let i = 0; i < this.length && i < data.length; i += 1) dest[i] += data[i];
      }
    }
    this.rendered = output;
    return output;
  }
}

export class FakeMediaDevices {
  requests: { deviceId: string | null }[] = [];
  fail = false;
  readonly streams: FakeMediaStream[] = [];

  async getUserMedia(constraints: {
    audio?: { deviceId?: { exact?: string } } | boolean;
  }): Promise<FakeMediaStream> {
    const audio = typeof constraints.audio === 'object' && constraints.audio ? constraints.audio : {};
    this.requests.push({ deviceId: audio.deviceId?.exact ?? null });
    if (this.fail) throw new Error('NotAllowedError');
    const stream = new FakeMediaStream();
    this.streams.push(stream);
    return stream;
  }

  async enumerateDevices(): Promise<{ deviceId: string; kind: string; label: string }[]> {
    return [];
  }
}

export interface AudioEnvironment {
  devices: FakeMediaDevices;
  contexts: FakeAudioContext[];
  latestContext(): FakeAudioContext;
  restore(): void;
}

/**
 * Install the fake context + fake microphone into the global scope used by the
 * engine, and hand back the pieces a test drives.
 */
export function installAudioEnvironment(): AudioEnvironment {
  const contexts: FakeAudioContext[] = [];
  const devices = new FakeMediaDevices();

  class TestAudioContext extends FakeAudioContext {
    constructor(options: FakeContextOptions = {}) {
      super(options);
      contexts.push(this);
    }
  }

  const scope = globalThis as unknown as Record<string, unknown>;
  const browserWindow = (globalThis as unknown as { window?: Record<string, unknown> }).window;
  const savedAudioContext = scope.AudioContext;
  const savedWindowAudioContext = browserWindow?.AudioContext;
  const savedOffline = scope.OfflineAudioContext;
  const savedWindowOffline = browserWindow?.OfflineAudioContext;

  scope.AudioContext = TestAudioContext;
  if (browserWindow) browserWindow.AudioContext = TestAudioContext;

  class TestOfflineAudioContext extends FakeOfflineAudioContext {}
  scope.OfflineAudioContext = TestOfflineAudioContext;
  if (browserWindow) browserWindow.OfflineAudioContext = TestOfflineAudioContext;

  const previousMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices });

  return {
    devices,
    contexts,
    latestContext() {
      const ctx = contexts[contexts.length - 1];
      if (!ctx) throw new Error('no fake AudioContext was created');
      return ctx;
    },
    restore() {
      scope.AudioContext = savedAudioContext;
      if (browserWindow) browserWindow.AudioContext = savedWindowAudioContext;
      scope.OfflineAudioContext = savedOffline;
      if (browserWindow) browserWindow.OfflineAudioContext = savedWindowOffline;
      if (previousMediaDevices) Object.defineProperty(navigator, 'mediaDevices', previousMediaDevices);
      else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
    },
  };
}

/**
 * Feed `signal` into a recorder's script-processor input over [from, to) in the
 * block sizes a browser would deliver.
 */
export function pumpInput(
  ctx: FakeAudioContext,
  node: FakeScriptProcessorNode,
  from: number,
  to: number,
  signal: (time: number) => number,
  blockSize = 2048,
): void {
  const sampleRate = ctx.sampleRate;
  let cursor = from;
  let guard = 0;
  while (cursor < to - 1e-9 && guard < 100000) {
    guard += 1;
    const frames = Math.max(1, Math.min(blockSize, Math.round((to - cursor) * sampleRate)));
    const channels = Array.from({ length: node.incomingChannels }, () => new Float32Array(frames));
    for (let i = 0; i < frames; i += 1) {
      const value = signal(cursor + i / sampleRate);
      for (const channel of channels) channel[i] = value;
    }
    node.onaudioprocess?.({
      playbackTime: cursor,
      inputBuffer: {
        numberOfChannels: channels.length,
        length: frames,
        sampleRate,
        getChannelData: (channel: number) => channels[Math.min(channel, channels.length - 1)],
      },
    });
    cursor += frames / sampleRate;
  }
}

/** Let queued promises (recorder flushes) settle. */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
