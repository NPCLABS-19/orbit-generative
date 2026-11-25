import assert from 'node:assert/strict';
import { MusicDSP, modes } from '../music-core.js';
import { maskFromSteps, presets } from '../grooves.js';
import { youtubeVideo } from '../sample-import.js';
import { PhraseMemory } from '../phrase-memory.js';
import { makeBank } from '../sampler.js';

const plan = (scene, bar, energy) => Array.from({length: 16}, (_, step) => scene.plan(step, bar, energy));
for (const [mode, config] of Object.entries(modes)) {
  const scene = new MusicDSP(48000, mode, 2026).scene;
  const bars = Math.ceil(config.defaults.tempo * 60 / 4);
  const sections = new Set(), phrases = new Set();
  let pitches = [], windows = 0;
  for (let bar = 0; bar < bars; bar++) {
    const played = plan(scene, bar, config.defaults.energy).filter(event => event.lead).map(event => event.leadNote);
    for (const pitch of played) assert(Number.isInteger(pitch) && pitch >= 36 && pitch <= 100);
    pitches.push(...played);
    sections.add(scene.score.section);
    if (bar % 8 === 7) {
      assert(pitches.length > 0);
      // Discard timing, timbre, transposition and velocity: detect recycled melodic contours.
      const contour = pitches.slice(1).map((pitch, i) => pitch - pitches[i]).join(',');
      assert(!phrases.has(contour), 'Repeated eight-bar contour in ' + mode);
      phrases.add(contour); windows++; pitches = [];
    }
  }
  assert.equal(sections.size, 3);
  console.log('PASS', mode, bars, 'bars (one simulated hour),', windows, 'distinct eight-bar pitch contours');
  const beat = new MusicDSP(12000, mode, 2026).scene, masks = presets[mode][0].masks;
  beat.setGrid({type:'edit', masks, revision:1});
  for (let bar = 0; bar < 3; bar++) assert.deepEqual(maskFromSteps(plan(beat, bar, 100)), masks);
  beat.setGrid({type:'shuffle', masks, revision:2});
  assert.deepEqual(maskFromSteps(plan(beat, 3, 100)), masks);
  const shuffled = maskFromSteps(plan(beat, 4, 100));
  assert.notDeepEqual(shuffled, masks);
  const density = mask => mask.toString(2).replaceAll('0','').length;
  assert.deepEqual(shuffled.map(density), masks.map(density));
  beat.setGrid({type:'generate', revision:3});
  assert.notDeepEqual(maskFromSteps(plan(beat, 5, 100)), masks);
}

const sampleRate = 24000;
const fixture = Float32Array.from({length:sampleRate * 2}, (_, i) =>
  .5 * Math.sin(i * 2 * Math.PI * 237 / sampleRate) * (.6 + .4 * Math.cos(i / 305)));
function render(dsp, count) {
  const left = new Float32Array(count); dsp.process(left, new Float32Array(count)); return left;
}
for (const divisions of [4, 8, 16]) {
  const sampled = new MusicDSP(12000, 'house', 48), dry = new MusicDSP(12000, 'house', 48);
  const grid = {type:'edit', masks:[0, 0, 0, 1], revision:1};
  sampled.scene.setGrid(grid); dry.scene.setGrid(grid);
  const bank = makeBank(fixture, sampleRate, divisions); assert.equal(bank.starts.length, Math.min(12, divisions));
  sampled.sampler.setBank(bank);
  const wet = render(sampled, 12000), clean = render(dry, 12000);
  let diff = 0;
  wet.forEach((v,i) => { assert(Number.isFinite(v) && Math.abs(v) < .93); diff += Math.abs(v - clean[i]); });
  assert(diff > 1 && sampled.sampler.triggers === 1);
  sampled.sampleLane = 'hat'; render(sampled, 24000); assert.equal(sampled.sampler.triggers, 1);
  sampled.scene.setGrid({type:'edit', masks:[0, 65535, 0, 0], revision:2});
  render(sampled, 6000); assert(sampled.sampler.triggers > 3);
  sampled.sampler.setBank(null);
  const triggers = sampled.sampler.triggers;
  render(sampled, 6000); assert.equal(sampled.sampler.triggers, triggers); assert.equal(sampled.sampler.voices.length, 0);
  console.log('PASS', divisions, 'requested slices, imported sample reaches output, follows edited lane and releases on Off');
}

// Use the same seed to isolate the effect of each live performance control.
function playScore(settings, point) {
  const s = new MusicDSP(12000, 'house', 707).scene;
  s.composer.phrase.configure(settings);
  s.setPad(point);
  return Array.from({length: 16}, (_, bar) => plan(s, bar, 75)).flat().filter(n => n.lead);
}
const pitchList = notes => notes.map(n => n.leadNote);
const formScores = ['answer','additive','interlock'].map(form => pitchList(playScore({form})).join(','));
assert.equal(new Set(formScores).size, 3);
assert.notDeepEqual(pitchList(playScore({length:3})), pitchList(playScore({length:9})));
assert.notDeepEqual(pitchList(playScore({variation:0})), pitchList(playScore({variation:100})));
assert(playScore({density:80}).length > playScore({density:20}).length);
const low = pitchList(playScore({octave:-1})), high = pitchList(playScore({octave:1}));
assert.deepEqual(low.map(n=>n+24),high);
console.log('PASS phrase forms, length, density, variation and octave change the generated lead');
const zones = [[.25,.25],[.75,.25],[.25,.75],[.75,.75]];
const scores = zones.map(([x,y]) => pitchList(playScore({}, {x,y,pressure:.5})).join(','));
assert.equal(new Set(scores).size, 4);
const softTouch = playScore({}, {x:.3,y:.4,pressure:.1});
const firmTouch = playScore({}, {x:.3,y:.4,pressure:.9});
assert(softTouch.every((n,i)=>n.leadAccent < firmTouch[i].leadAccent));
assert.notDeepEqual(playScore({}, {x:.3,y:.4,pressure:.5}), playScore({}, {x:.38,y:.35,pressure:.5}));
const edited = new MusicDSP(12000,'house',707).scene;
const mask = [0, 0, 0, 0x42]; edited.setGrid({type:'edit',masks:mask});
for (const [x,y] of zones) {
  edited.setPad({x,y,pressure:1});
  assert.deepEqual(maskFromSteps(plan(edited, 0, 75)),mask);
}
console.log('PASS quadrant voicings, continuous coordinates, pressure accents and edited gates');
for (const name of Object.keys(modes)) {
  const synth = new MusicDSP(12000,name,53), dry = new MusicDSP(12000,name,53);
  dry.params.sub = dry.targets.sub = 0;
  synth.params.sub = synth.targets.sub = 100;
  const a = render(synth,24000), b = render(dry,24000);
  const diff = a.reduce((sum,v,i)=>sum+(v-b[i])**2,0);
  assert(diff/a.length > .001 && synth.scene.subTarget >=31 && synth.scene.subTarget<=62);
}
console.log('PASS tuned 808 makes a measurable change to the mix in all three genres');

assert.equal(youtubeVideo('https://youtu.be/abcdefghij1?t=2m3s'), 'https://www.youtube.com/watch?v=abcdefghij1&t=2m3s');
assert.equal(youtubeVideo('https://www.youtube.com/shorts/abcdefghij1'), 'https://www.youtube.com/watch?v=abcdefghij1');
assert.equal(youtubeVideo('https://example.org/watch?v=abcdefghij1'), null);
const memory = new PhraseMemory(1000, () => .5);
for (const [i,n] of [60,64,67].entries()) memory.remember({leadNote:n,decay:1,attack:.1,leadAccent:1}, i*401, 0);
assert.equal(memory.reply(memory.next-1, 0),null);
const answerTime = memory.next;
assert.equal(memory.reply(answerTime, 2).leadNote, 50);
assert(memory.next > answerTime && memory.next-answerTime !== 401);
const rowTest = new MusicDSP(12000,'house',707).scene;
rowTest.setGrid({type:'edit',masks:[0,0,0,0],liveRows:2,cycle:1});
const mixed = maskFromSteps(plan(rowTest,3,65));
assert.equal(mixed[0]+mixed[2]+mixed[3],0); assert(mixed[1]>0);
const cloud = new MusicDSP(12000,'house',42).sampler;
cloud.setBank(makeBank(fixture,sampleRate,4)); cloud.trigger(0,120,1);
let tail=0; for(let i=0;i<24000;i++){ cloud.tick(); if(i>12000)tail+=Math.abs(cloud.cloudL);}
assert(tail>10 && cloud.voices.length===0);
cloud.setBank(null); for(let i=0;i<300;i++)cloud.tick();assert(!cloud.active);
console.log('PASS YouTube links, timed melodic answers, independent row reset and granular release');
