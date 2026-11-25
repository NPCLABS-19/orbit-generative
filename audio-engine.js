export class MusicEngine {
  constructor(onState, onInterrupted) {
    this.onState = onState; this.onInterrupted = onInterrupted;
    this.context = null; this.node = null; this.playing = false; this.controlledSuspend = false;
    this.volume = 55; this.failed = false;
  }

  async init(mode, seed, values, sequence = {}) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio is unavailable. Use a recent Chrome, Safari or Firefox.');
    this.context = new Audio({ latencyHint: 'interactive' });
    // resume belongs to the original user gesture, before waiting for module loading.
    await this.context.resume();
    if (!this.context.audioWorklet) throw new Error('AudioWorklet is unavailable. Open this on localhost in a recent browser.');
    await this.context.audioWorklet.addModule(new URL('./music-worklet.js?v=7', import.meta.url));
    this.node = new AudioWorkletNode(this.context, 'orbit-music', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { mode, seed, values, sequence },
    });
    this.volumeGain = this.context.createGain(); this.volumeGain.gain.value = this.volume / 100;
    this.playbackGate = this.context.createGain(); this.playbackGate.gain.value = 0;
    this.sessionGate = this.context.createGain(); this.sessionGate.gain.value = 1;
    this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
    this.node.connect(this.volumeGain).connect(this.playbackGate).connect(this.sessionGate).connect(this.analyser).connect(this.context.destination);
    this.node.port.onmessage = ({ data }) => this.onState(data);
    this.node.onprocessorerror = () => { this.failed = true; this.mute(); this.onInterrupted('The audio engine stopped. Press Play to restart.'); };
    this.context.addEventListener('statechange', () => {
      if (['interrupted', 'suspended'].includes(this.context.state) && this.playing && !this.controlledSuspend) {
        this.mute(); this.onInterrupted('Audio interrupted. Press Play to resume.');
      }
    });
  }

  async play() {
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio could not start. Press Play to try again.');
    this.playbackGate.gain.cancelScheduledValues(this.context.currentTime);
    this.playbackGate.gain.setTargetAtTime(1, this.context.currentTime, .035);
    this.playing = true;
  }

  async pause() {
    if (!this.context) return;
    this.controlledSuspend = true;
    this.playbackGate.gain.cancelScheduledValues(this.context.currentTime);
    this.playbackGate.gain.setTargetAtTime(0, this.context.currentTime, .025);
    await new Promise(resolve => setTimeout(resolve, 130));
    this.mute(); await this.context.suspend(); this.controlledSuspend = false;
  }

  mute() {
    this.playing = false;
    if (this.playbackGate) {
      this.playbackGate.gain.cancelScheduledValues(this.context.currentTime);
      this.playbackGate.gain.setValueAtTime(0, this.context.currentTime);
    }
  }

  update(values) { this.node?.port.postMessage({ type: 'update', values }); }
  setMode(mode, seed, values) { this.node?.port.postMessage({ type: 'mode', mode, seed, values, reset: !this.playing }); }
  setPad(point) { this.node?.port.postMessage({ type: 'pad', point }); }
  setMelody(values) { this.node?.port.postMessage({ type: 'melody', values }); }
  setGrid(grid) { this.node?.port.postMessage({ type: 'grid', grid }); }
  setBank(bank) { this.node?.port.postMessage({ type: 'sample', bank }); }
  setLane(lane) { this.node?.port.postMessage({ type: 'lane', lane }); }
  setHold(value) { this.node?.port.postMessage({ type: 'hold', value }); }
  setVolume(value) {
    this.volume = value;
    if (this.context && this.volumeGain) this.volumeGain.gain.setTargetAtTime(value / 100, this.context.currentTime, .04);
  }
  setSession(seconds) {
    if (!this.context) return;
    const time = this.context.currentTime;
    this.sessionGate.gain.cancelScheduledValues(time);
    this.sessionGate.gain.setValueAtTime(1, time);
    if (seconds !== null) {
      this.sessionGate.gain.setValueAtTime(1, time + Math.max(0, seconds - 1));
      this.sessionGate.gain.linearRampToValueAtTime(0, time + Math.max(.01, seconds));
    }
  }
  async close() {
    this.mute(); this.node?.disconnect(); this.node?.port.close();
    await this.context?.close(); this.context = null; this.node = null; this.volumeGain = null;
  }
}
