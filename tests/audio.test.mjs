import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { MusicDSP, controls, modes } from '../music-core.js';

const rate = 48000;
const results = [];
mkdirSync(new URL('../.qa/', import.meta.url), { recursive: true });

function render(dsp, seconds, collect = false) {
  const length = Math.round(rate * seconds), l = new Float32Array(128), r = new Float32Array(128);
  const pcm = collect ? new Float32Array(length * 2) : null;
  let peak = 0, sum = 0, difference = 0, maxJump = 0, previous = 0, count = 0;
  const started = performance.now();
  for (let offset = 0; offset < length; offset += 128) {
    const n = Math.min(128, length - offset), left = n === 128 ? l : l.subarray(0, n), right = n === 128 ? r : r.subarray(0, n);
    dsp.process(left, right);
    for (let i = 0; i < n; i++) {
      assert(Number.isFinite(left[i]) && Number.isFinite(right[i]), 'Output must be finite');
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      if (offset + i > rate) { sum += left[i] ** 2 + right[i] ** 2; difference += Math.abs(left[i] - right[i]); count++; }
      maxJump = Math.max(maxJump, Math.abs(left[i] - previous)); previous = left[i];
      if (pcm) { pcm[(offset + i) * 2] = left[i]; pcm[(offset + i) * 2 + 1] = right[i]; }
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, count * 2)), stereoDifference: difference / Math.max(1, count),
    maxJump, realtimeRatio: (performance.now() - started) / 1000 / seconds, pcm };
}
function wav(pcm, path) {
  const buffer = Buffer.alloc(44 + pcm.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((sample, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2));
  writeFileSync(path, buffer);
}
function report(name, values = {}) { results.push({ name, passed: true, ...values }); console.log(`PASS ${name}`, JSON.stringify(values)); }

for (const [mode, config] of Object.entries(modes)) {
  assert.deepEqual(Object.keys(config.defaults).sort(), controls.map(c => c.id).sort());
  const dsp = new MusicDSP(rate, mode, 190024);
  const { pcm, ...metrics } = render(dsp, 12, true);
  assert(metrics.peak < .93 && metrics.peak > .1);
  assert(metrics.rms > .015 && metrics.stereoDifference > .0001);
  assert(metrics.realtimeRatio < .8, 'DSP must be comfortably faster than playback');
  const state = dsp.snapshot();
  assert(state.events.kick > 8 && state.events.bass > 8 && state.events.melody > 4);
  wav(pcm, new URL(`../.qa/${mode}.wav`, import.meta.url));
  report(`${mode}: same controls, audible stereo output, musical events, headroom and real-time speed`, { ...metrics, events: state.events });
}

for (const mode of Object.keys(modes)) {
  const dsp = new MusicDSP(rate, mode, 42);
  const maximum = Object.fromEntries(controls.map(c => [c.id, c.max]));
  Object.assign(dsp.params, maximum); dsp.update(maximum);
  const metrics = render(dsp, 5);
  assert(metrics.peak < .93 && metrics.rms > .02);
  report(`${mode}: maximum controls stay below clipping`, { peak: metrics.peak });
}

const silent = new MusicDSP(rate, 'house', 42);
for (const key of ['rhythm', 'bass', 'melody']) { silent.params[key] = 0; silent.targets[key] = 0; }
assert.equal(render(silent, 2).peak, 0);
report('Muting the three musical layers produces exact silence');

const a = new MusicDSP(rate, 'analog', 55), b = new MusicDSP(rate, 'analog', 55), different = new MusicDSP(rate, 'analog', 56);
const first = render(a, 2, true).pcm, same = render(b, 2, true).pcm, next = render(different, 2, true).pcm;
assert.deepEqual(first, same); assert.notDeepEqual(first, next);
report('Seeds reproduce the same piece; new variations change the output');

const fx = new MusicDSP(rate, 'house', 88);
fx.params.space = 0; fx.targets.space = 0; fx.update({ fade: 4, space: 100, warmth: 90, movement: 90 });
assert.equal(fx.params.space, 0);
render(fx, .01); assert(fx.params.space > 0 && fx.params.space < 2);
render(fx, 3.99); assert(fx.params.space > 94 && fx.params.space < 97);
report('Effects blend progressively, reaching 95% of the new amount over the selected four seconds', { spaceAfterFourSeconds: fx.params.space });

const switching = new MusicDSP(rate, 'analog', 190024);
render(switching, 1); switching.update({ ...modes.techno.defaults, fade: 2 }); switching.switchMode('techno', 88);
render(switching, .045); assert(switching.transition > .49 && switching.transition < .51);
render(switching, .05); assert.equal(switching.transition, 1); assert.equal(switching.outgoing, null);
report('Genre changes switch in 90 ms independently of the effect fade and release the outgoing scene');

const held = new MusicDSP(rate, 'analog', 99);
held.setHold(true);
const notes0 = Array.from({ length: 16 }, (_, i) => held.scene.plan(i, 0, 60).leadNote);
const notes8 = Array.from({ length: 16 }, (_, i) => held.scene.plan(i, 8, 60).leadNote);
assert.deepEqual(notes0, notes8);
report('Hold preserves the melodic variation between phrases');

writeFileSync(new URL('../.qa/test-results.json', import.meta.url), JSON.stringify({ passed: results.length, results }, null, 2));
console.log(`\n${results.length} audio checks passed. Listening renders saved in .qa/.`);
