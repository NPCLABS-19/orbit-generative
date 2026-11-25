import { MusicDSP } from './music-core.js?v=7';

class OrbitMusicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { mode, seed, values, sequence = {} } = options.processorOptions;
    this.dsp = new MusicDSP(sampleRate, mode, seed); this.dsp.update(values);
    this.dsp.scene.composer.phrase.configure(sequence.melody);
    this.dsp.scene.setPad(sequence.point);
    this.dsp.scene.setGrid(sequence.grid);
    this.dsp.sampler.setBank(sequence.bank);
    this.dsp.sampleLane = sequence.lane ?? 'lead';
    this.dsp.setHold(sequence.hold);
    this.counter = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'update') this.dsp.update(data.values);
      if (data.type === 'mode') { this.dsp.update(data.values); this.dsp.switchMode(data.mode, data.seed, data.reset); }
      if (data.type === 'pad') this.dsp.scene.setPad(data.point);
      if (data.type === 'melody') this.dsp.scene.composer.phrase.configure(data.values);
      if (data.type === 'grid') this.dsp.scene.setGrid(data.grid);
      if (data.type === 'sample') this.dsp.sampler.setBank(data.bank);
      if (data.type === 'lane') this.dsp.sampleLane = data.lane;
      if (data.type === 'hold') this.dsp.setHold(data.value);
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    this.dsp.process(output[0], output[1]);
    if (++this.counter % 32 === 0) this.port.postMessage(this.dsp.snapshot());
    return true;
  }
}
registerProcessor('orbit-music', OrbitMusicProcessor);
