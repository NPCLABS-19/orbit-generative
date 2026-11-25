import { PhraseMemory } from './phrase-memory.js';
// Original generative composition and synthesis. Shared by the audio worklet and tests.
import { shapeNote } from './performance.js';
import { SlicePlayer } from './sampler.js?v=7';
import { Composer } from './composer.js?v=7';
import { lanes, maskFromSteps, shuffledMasks, validMasks } from './grooves.js?v=7';

export const controls = [
  { id: 'tempo', label: 'Tempo', min: 70, max: 180, unit: ' BPM' },
  { id: 'energy', label: 'Energy', min: 0, max: 100, unit: '%' },
  { id: 'rhythm', label: 'Rhythm', min: 0, max: 100, unit: '%' },
  { id: 'bass', label: 'Bass', min: 0, max: 100, unit: '%' },
  { id: 'sub', label: '808 sub', min: 0, max: 100, unit: '%' },
  { id: 'melody', label: 'Melody', min: 0, max: 100, unit: '%' },
  { id: 'movement', label: 'Movement', min: 0, max: 100, unit: '%' },
  { id: 'space', label: 'Space', min: 0, max: 100, unit: '%' },
  { id: 'warmth', label: 'Warmth', min: 0, max: 100, unit: '%' },
];

export const modes = {
  analog: {
    title: 'Tape garden', genre: 'Warm analog electronica', key: 'G minor',
    description: 'Worn chords. Loose drums. A melody half remembered.', color: '#dfad83',
    defaults: { tempo: 88, energy: 44, rhythm: 65, bass: 60, sub: 62, melody: 72, movement: 45, space: 55, warmth: 76 },
    root: 43, swing: .13,
  },
  house: {
    title: 'Night transit', genre: 'Melodic house', key: 'D minor',
    description: 'Four to the floor. Open chords. Somewhere to go.', color: '#a6bce5',
    defaults: { tempo: 124, energy: 63, rhythm: 76, bass: 70, sub: 76, melody: 67, movement: 52, space: 48, warmth: 42 },
    root: 38, swing: .015,
  },
  techno: {
    title: 'Pressure system', genre: 'Hard techno', key: 'F♯ minor',
    description: 'Heavy kicks. Metallic fragments. Forward, always.', color: '#e6a094',
    defaults: { tempo: 152, energy: 82, rhythm: 85, bass: 70, sub: 84, melody: 43, movement: 36, space: 28, warmth: 53 },
    root: 30, swing: 0,
  },
};

const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
const soft = x => x / (1 + Math.abs(x));
const hash = (seed, index) => {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

class Scene {
  constructor(mode, seed, rate) {
    this.mode = mode; this.config = modes[mode]; this.seed = seed >>> 0; this.rate = rate;
    this.noiseState = (this.seed || 1) >>> 0;
    this.beat = 0; this.sample = 0; this.lastStep = -1; this.composer = new Composer(mode, this.config.root, this.seed);
    this.barIndex = -1; this.score = null;
    this.grid = { type: 'generate', revision: 0 }; this.gridStart = 0; this.masks = null;
    this.kickAge = 10; this.kickPhase = 0; this.hatAge = 10; this.hatOpen = false; this.clapAge = 10;
    this.hatVelocity = 0; this.hatLP = 0; this.clapLP = 0;
    this.bassPhase = 0; this.bassAmp = 0; this.bassTime = 0;
    this.bassFrequency = frequency(this.config.root); this.bassTarget = this.bassFrequency;
    this.subPhase = 0; this.subHz = 44; this.subTarget = 44; this.subEnvelope = 0; this.subGain = 0; this.subBend = 0;
    this.glide = 1 - Math.exp(-1 / (.035 * rate)); this.subAttack = 1 - Math.exp(-1 / (.006 * rate));
    this.subRelease = Math.exp(-1 / ((mode === 'techno' ? .39 : .65) * rate));
    this.bendRelease = Math.exp(-1 / (.023 * rate));
    this.padPoint = null; this.gesture = false; this.lastGesturePoint = null;
    this.padPhases = [0, .19, .43, .71]; this.padPhasesB = [.12, .38, .61, .89];
    this.padFreqs = [0, 3, 7, 10].map(n => frequency(this.config.root + 24 + n));
    this.padTargets = [...this.padFreqs]; this.padLP = 0;
    this.leads = []; this.stepEvents = { kick: 0, hat: 0, bass: 0, melody: 0 };
    let draw = 0;
    this.memory = new PhraseMemory(rate, () => hash(this.seed ^ 0x38d9, draw++));
    this.fieldX = .5; this.fieldY = .5;
    this.fieldSlew = 1 - Math.exp(-1 / (5 * rate));
    this.nextSubAttack = 0; this.actualLead = null;
    this.left = 0; this.right = 0; this.sendL = 0; this.sendR = 0;
  }

  noise() {
    this.noiseState = (Math.imul(this.noiseState, 1664525) + 1013904223) >>> 0;
    return this.noiseState / 2147483648 - 1;
  }

  setPad(point) {
    this.padPoint = point;
    const last = this.lastGesturePoint;
    if (!point || !last || Math.hypot(point.x - last.x, point.y - last.y) >= .07) {
      this.gesture = Boolean(point);
      this.lastGesturePoint = point;
    }
  }

  setGrid(grid) {
    if (!grid || !['generate', 'edit', 'shuffle'].includes(grid.type)) return;
    if (grid.type !== 'generate' && !validMasks(grid.masks)) return;
    if (this.grid.type !== grid.type || grid.cycle === undefined || this.grid.cycle !== grid.cycle) this.gridStart = Math.max(0, this.barIndex);
    if (grid.type !== 'generate' && !(grid.liveRows & 8)) this.memory.clear();
    this.grid = grid;
    this.refreshMasks();
  }

  refreshMasks() {
    this.masks = this.grid.type === 'shuffle'
      ? shuffledMasks(this.grid.masks, this.mode, this.seed, Math.floor((this.barIndex - this.gridStart) / 2))
      : this.grid.masks;
  }

  scoreFor(bar) {
    while (this.barIndex < bar) {
      this.barIndex++;
      this.score = this.composer.nextBar();
      this.refreshMasks();
    }
    return this.score;
  }

  plan(step, bar, energy, generatedOnly = false) {
    const score = this.scoreFor(bar), e = energy / 100;
    const variation = hash(this.seed, bar * 16 + step);
    const analog = this.mode === 'analog', techno = this.mode === 'techno';
    const note = score.notes[step];
    const events = {
      kick: analog ? step === 0 || step === 8 || ((step === 6 || step === 14) && variation < .35 + e * .45)
        : step % 4 === 0 || (techno && step === 15 && variation < .17 * e),
      hat: step % 2 === 0 || variation < e * (techno ? .95 : .55) * score.intensity,
      bass: analog ? [0, 3, 7, 10, 14].includes(step) && (step === 0 || variation < .82)
        : step % 4 === 2 || (techno && step % 8 === 3 && variation < e),
      lead: note.onset && note.threshold < (.64 + .36 * e) * score.intensity,
    };
    const result = { ...events, clap: step === 4 || step === 12, velocity: .65 + variation * .35,
      bassNote: this.config.root + score.chordRoot + (analog && step === 10 ? 7 : 0),
      leadNote: note.pitch, leadAccent: note.accent, decay: note.decay ?? 6, brightness: 1,
      attack: note.attack ?? .008, color: note.color ?? 2, open: step % 4 === 2,
    };
    if (this.padPoint) shapeNote(result, this.padPoint, step, bar, this.config.root, this.composer.scale, variation);
    if (this.memory.waiting && !this.composer.held && variation > (techno ? .54 : analog ? .23 : .38)) result.lead = false;
    if (!generatedOnly && this.grid.type !== 'generate') {
      lanes.forEach((lane, row) => {
        if (!(this.grid.liveRows & (1 << row))) result[lane] = Boolean(this.masks[row] & (1 << step));
      });
    }
    return result;
  }

  trigger(step, bar, p) {
    const note = this.plan(step, bar, p.energy);
    if (this.gesture && (this.grid.type === 'generate' || (this.grid.liveRows & 8))) note.lead = true;
    this.gesture = false;
    this.lastNote = note;
    if (note.kick) { this.kickAge = 0; this.kickPhase = 0; this.stepEvents.kick++; }
    if (note.hat) { this.hatAge = 0; this.hatOpen = note.open; this.hatVelocity = note.velocity; this.stepEvents.hat++; }
    if (note.clap) this.clapAge = 0;
    if (note.bass) {
      this.bassTarget = frequency(note.bassNote);
      this.subTarget = this.bassTarget;
      while (this.subTarget > 62) this.subTarget *= .5;
      while (this.subTarget < 31) this.subTarget *= 2;
      if (this.sample >= this.nextSubAttack) {
        this.subEnvelope = note.velocity; this.subBend = .52;
        const breath = hash(this.seed ^ 0x284, this.lastStep);
        this.nextSubAttack = this.sample + this.rate * (this.mode === 'techno' ? .37 : .65) * (1 + breath * 1.4);
      }
      this.bassTime = (this.mode === 'analog' ? .33 : this.mode === 'house' ? .21 : .14) * (120 / p.tempo);
      this.stepEvents.bass++;
    }
    if (note.lead) {
      this.soundLead(note);
      if (!this.composer.held && (this.grid.type === 'generate' || (this.grid.liveRows & 8)))
        this.memory.remember(note, this.sample, this.score.chordRoot);
    }
    if (step === 0) {
      const { chord, chordRoot } = this.score;
      this.padTargets = chord.map(n => frequency(this.config.root + 24 + chordRoot + n));
    }
  }

  soundLead(note) {
    const start = hash(this.seed ^ 0x621f, this.stepEvents.melody);
    this.leads.push({ age: 0, phase: 0, phaseB: .2, frequency: frequency(note.leadNote), velocity: note.leadAccent,
      decay: note.decay, attack: note.attack, color: note.color, brightness: note.brightness,
      azimuth: start * TAU, distance: hash(this.seed ^ 0x316a, this.stepEvents.melody) });
    if (this.leads.length > 10) this.leads.shift();
    this.stepEvents.melody++; this.actualLead = note;
  }

  tick(p) {
    this.actualLead = null;
    const dt = 1 / this.rate;
    const abs = Math.floor(this.beat * 4 + 1e-8), step = abs % 16, bar = Math.floor(abs / 16);
    // Odd sixteenths land later in the analog mode; the following even step stays on-grid.
    const swing = this.config.swing * (step % 2) * .25;
    if (abs !== this.lastStep && this.beat >= abs * .25 + swing) {
      this.lastStep = abs; this.trigger(step, bar, p);
    }
    if (this.sample >= this.memory.next && !this.composer.held) {
      const answer = this.memory.reply(this.sample, this.score.chordRoot);
      if (answer) this.soundLead(answer);
    }
    this.fieldX += this.fieldSlew * ((this.padPoint?.x ?? .5) - this.fieldX);
    this.fieldY += this.fieldSlew * ((this.padPoint?.y ?? .5) - this.fieldY);
    const time = this.sample * dt;
    const noise = this.noise();
    this.kickAge += dt; this.hatAge += dt; this.clapAge += dt;
    const techno = this.mode === 'techno', analog = this.mode === 'analog';
    const kickEnd = techno ? 48 : analog ? 51 : 49;
    const kickHz = kickEnd + (techno ? 150 : 110) * Math.exp(-this.kickAge * 43);
    this.kickPhase += kickHz * dt;
    const kickEnv = Math.min(1, this.kickAge * 1500) * Math.exp(-this.kickAge * (techno ? 10 : 16));
    let kick = Math.sin(TAU * this.kickPhase) * kickEnv;
    if (techno) kick = soft(kick * 3) * 1.3 + noise * Math.exp(-this.kickAge * 450) * .12;
    const hatDecay = this.hatOpen ? (techno ? 13 : 18) : 72;
    this.hatLP += .18 * (noise - this.hatLP);
    let hat = (noise - this.hatLP) * Math.exp(-this.hatAge * hatDecay) * this.hatVelocity * .23;
    const clapBursts = Math.exp(-this.clapAge * 26) * (.55 + .45 * Math.sin(this.clapAge * 1250));
    this.clapLP += .28 * (noise - this.clapLP);
    const clap = (noise - this.clapLP) * clapBursts * .32;
    const air = .5 + .5 * Math.sin(time * .19 + this.seed % 13);
    const clapLevel = clap * (.48 + .44 * Math.sin(time * .103 + 1.8)) * p.rhythm / 100;
    const drums = kick * .77 * p.rhythm / 100 + clapLevel;
    hat *= p.rhythm / 100 * (.24 + .76 * air) * (.7 + .6 * this.fieldX);

    this.bassFrequency += .006 * (this.bassTarget - this.bassFrequency);
    this.bassTime -= dt;
    const bassTargetAmp = this.bassTime > 0 ? .30 : 0;
    this.bassAmp += (this.bassTime > 0 ? .012 : .0016) * (bassTargetAmp - this.bassAmp);
    this.bassPhase = (this.bassPhase + this.bassFrequency * dt) % 1;
    const bassWave = Math.sin(TAU * this.bassPhase) + (analog ? .19 : .28) * Math.sin(TAU * this.bassPhase * 2);
    const duck = 1 - (techno ? .78 : .58) * Math.exp(-(this.beat % 1) * 9);
    this.subHz += this.glide * (this.subTarget - this.subHz);
    this.subPhase = (this.subPhase + this.subHz * (1 + this.subBend) * dt) % 1;
    this.subBend *= this.bendRelease; this.subEnvelope *= this.subRelease;
    this.subGain += this.subAttack * (this.subEnvelope - this.subGain);
    const subWave = Math.sin(TAU * this.subPhase) + .24 * Math.sin(2 * TAU * this.subPhase);
    const sub = Math.tanh(subWave * 1.65) * this.subGain * .66 * p.sub / 100 * p.bass / 100 * (.6 + .4 * duck);
    const bass = sub + bassWave * this.bassAmp * p.bass / 100 * duck;
    let pad = 0;
    const wow = Math.sin(this.sample * dt * 2.1) * (analog ? .0045 : .001);
    for (let i = 0; i < 4; i++) {
      this.padFreqs[i] += .00035 * (this.padTargets[i] - this.padFreqs[i]);
      this.padPhases[i] = (this.padPhases[i] + this.padFreqs[i] * (1 + wow) * dt) % 1;
      this.padPhasesB[i] = (this.padPhasesB[i] + this.padFreqs[i] * (1.0028 + wow) * dt) % 1;
      pad += Math.sin(TAU * this.padPhases[i]) + Math.sin(TAU * this.padPhasesB[i]) * .55;
    }
    this.padLP += .11 * (pad - this.padLP);
    pad = this.padLP * (techno ? .007 : analog ? .034 : .026) * p.melody / 100 * (.65 + .35 * duck);
    pad *= .65 + .35 * Math.sin(time * .071 + this.seed % 7);
    let leadL = 0, leadR = 0, depthL = 0, depthR = 0;
    for (let i = this.leads.length - 1; i >= 0; i--) {
      const voice = this.leads[i]; voice.age += dt;
      const env = Math.min(1, voice.age / voice.attack) * Math.exp(-voice.age * voice.decay);
      if (voice.age * voice.decay > 8) { this.leads.splice(i, 1); continue; }
      voice.phase = (voice.phase + voice.frequency * dt) % 1;
      voice.phaseB = (voice.phaseB + voice.frequency * (techno ? 2.003 : 1.001) * dt) % 1;
      const wave = techno ? Math.sin(TAU * voice.phase + voice.color * voice.brightness * Math.sin(TAU * voice.phaseB))
        : Math.sin(TAU * voice.phase) + .3 * voice.brightness * Math.sin(TAU * voice.phase * 2) + .15 * Math.sin(TAU * voice.phaseB);
      const pan = Math.sin(voice.azimuth + time * .077) * p.movement / 100 * .8;
      const depth = Math.min(1, .12 + .5 * voice.distance + .38 * this.fieldY);
      const tone = wave * env * voice.velocity * (techno ? .14 : analog ? .10 : .13) * p.melody / 100;
      leadL += tone * (1 - pan) * (1 - depth * .36);
      leadR += tone * (1 + pan) * (1 - depth * .36);
      depthL += tone * depth * (1 - pan); depthR += tone * depth * (1 + pan);
    }
    const pan = Math.sin(this.beat * .11 + .7) * p.movement / 100 * .7;
    const padPan = Math.sin(this.beat * .057 + 2) * p.movement / 100 * .55;
    const bedNoise = analog ? noise * .0018 * p.melody / 100 : 0;
    const rumble = techno ? Math.sin(TAU * this.kickPhase * .5) * kickEnv * .09 * p.bass / 100 : 0;
    const modeLevel = techno ? .73 : 1;
    this.left = (drums + bass + rumble + hat * (1 - pan * .3) + leadL + pad * (1 - padPan) + bedNoise) * modeLevel;
    this.right = (drums + bass + rumble + hat * (1 + pan * .3) + leadR + pad * (1 + padPan) - bedNoise) * modeLevel;
    this.sendL = (depthL + pad * (1 - padPan) * (.4 + this.fieldY) + .4 * hat + .25 * clapLevel) * modeLevel;
    this.sendR = (depthR + pad * (1 + padPan) * (.4 + this.fieldY) + .4 * hat + .25 * clapLevel) * modeLevel;
    this.beat += p.tempo / 60 * dt; this.sample++;
  }
}

export class MusicDSP {
  constructor(rate = 48000, mode = 'analog', seed = 190024) {
    this.rate = rate; this.mode = modes[mode] ? mode : 'analog'; this.seed = seed >>> 0;
    this.params = { ...modes[this.mode].defaults }; this.targets = { ...this.params };
    this.fadeSeconds = 4; this.scene = new Scene(this.mode, this.seed, rate); this.outgoing = null;
    this.transition = 1; this.transitionFrames = 1; this.hold = false;
    this.delayL = new Float32Array(rate * 2); this.delayR = new Float32Array(rate * 2); this.delayIndex = 0;
    this.combs = [.0297, .0371, .0411, .0437].map(seconds => ({ data: new Float32Array(Math.round(rate * seconds)), index: 0, lp: 0 }));
    this.lowL = 0; this.lowR = 0; this.dcL = 0; this.dcR = 0;
    this.sampler = new SlicePlayer(rate); this.sampleLane = 'lead';
    this.sampleCount = 0; this.peak = 0;
    this.updateCoefficients();
  }

  updateCoefficients() {
    this.effectCoefficient = 1 - Math.exp(-3 / (this.fadeSeconds * this.rate));
    this.levelCoefficient = 1 - Math.exp(-1 / (.045 * this.rate));
    this.tempoCoefficient = 1 - Math.exp(-1 / (.3 * this.rate));
  }

  update(values) {
    for (const c of controls) if (Number.isFinite(values[c.id])) this.targets[c.id] = clamp(values[c.id], c.min, c.max);
    if (Number.isFinite(values.fade)) { this.fadeSeconds = clamp(values.fade, .25, 12); this.updateCoefficients(); }
  }

  switchMode(mode, seed = this.seed, reset = false) {
    if (!modes[mode]) return;
    const genreChanged = mode !== this.mode;
    const next = new Scene(mode, seed, this.rate);
    next.composer.held = this.hold;
    // Retain one outgoing scene only, even during rapid mode changes.
    this.outgoing = reset ? null : this.scene;
    this.outgoingParams = { ...this.params };
    if (genreChanged) this.params.tempo = this.targets.tempo;
    this.scene = next; this.mode = mode; this.seed = seed >>> 0;
    this.transition = reset ? 1 : 0; this.transitionFrames = Math.round(this.rate * (genreChanged ? .09 : this.fadeSeconds));
  }

  setHold(value) {
    this.hold = Boolean(value);
    for (const scene of [this.scene, this.outgoing]) if (scene) {
      scene.composer.held = this.hold;
      if (this.hold) scene.memory.clear();
    }
  }

  process(left, right) {
    const p = this.params, target = this.targets;
    for (let i = 0; i < left.length; i++) {
      for (const c of controls) {
        const coefficient = c.id === 'tempo' ? this.tempoCoefficient
          : (c.id === 'movement' || c.id === 'space' || c.id === 'warmth') ? this.effectCoefficient : this.levelCoefficient;
        p[c.id] += (target[c.id] - p[c.id]) * coefficient;
      }
      const previousStep = this.scene.lastStep;
      this.scene.tick(p);
      const triggerSample = this.sampleLane === 'lead' ? this.scene.actualLead :
        previousStep !== this.scene.lastStep && this.scene.lastNote[this.sampleLane] && this.scene.lastNote;
      if (this.sampler.bank && triggerSample) {
        const n = triggerSample;
        const cut = Math.floor(hash(this.seed ^ n.leadNote, this.scene.lastStep) * this.sampler.bank.starts.length);
        this.sampler.trigger(cut, p.tempo, n.leadAccent);
      }
      let l = this.scene.left, r = this.scene.right;
      let sendL = this.scene.sendL, sendR = this.scene.sendR;
      if (this.outgoing) {
        this.outgoing.tick(this.outgoingParams); this.transition = Math.min(1, this.transition + 1 / this.transitionFrames);
        // Linear crossfade avoids a boost when the two related scenes overlap.
        l = l * this.transition + this.outgoing.left * (1 - this.transition);
        r = r * this.transition + this.outgoing.right * (1 - this.transition);
        sendL = sendL * this.transition + this.outgoing.sendL * (1 - this.transition);
        sendR = sendR * this.transition + this.outgoing.sendR * (1 - this.transition);
        if (this.transition === 1) this.outgoing = null;
      }
      if (this.sampler.active) {
        const chop = this.sampler.tick() * .55 * p.melody / 100;
        const wash = p.melody / 100 * (.15 + .24 * this.scene.fieldY);
        l += chop + this.sampler.cloudL * wash; r += chop + this.sampler.cloudR * wash;
        sendL += chop * .35 + this.sampler.cloudL * wash; sendR += chop * .35 + this.sampler.cloudR * wash;
      }
      const warmth = p.warmth / 100;
      const cutoff = 15000 * Math.pow(.075, warmth);
      const filter = 1 - Math.exp(-TAU * cutoff / this.rate);
      this.lowL += filter * (l - this.lowL); this.lowR += filter * (r - this.lowR);
      const drive = 1 + warmth * 1.8;
      l = soft(this.lowL * drive) / (1 + warmth * .32);
      r = soft(this.lowR * drive) / (1 + warmth * .32);
      const delayLength = Math.round(this.rate * 60 / p.tempo * .75);
      const read = (this.delayIndex - delayLength + this.delayL.length) % this.delayL.length;
      const dl = this.delayL[read], dr = this.delayR[read];
      this.delayL[this.delayIndex] = sendL + dr * .29;
      this.delayR[this.delayIndex] = sendR + dl * .29;
      this.delayIndex = (this.delayIndex + 1) % this.delayL.length;
      let roomL = 0, roomR = 0;
      for (let c = 0; c < this.combs.length; c++) {
        const comb = this.combs[c], reflected = comb.data[comb.index];
        comb.lp += .3 * (reflected - comb.lp);
        comb.data[comb.index] = (sendL + sendR) * .18 + comb.lp * .72;
        comb.index = (comb.index + 1) % comb.data.length;
        if (c % 2) roomL += reflected; else roomR += reflected;
      }
      const wet = p.space / 100;
      l += (dl * .32 + roomL * .48) * wet;
      r += (dr * .32 + roomR * .48) * wet;
      this.dcL += .003 * (l - this.dcL); this.dcR += .003 * (r - this.dcR);
      l = Math.tanh((l - this.dcL) * 1.1) * .92;
      r = Math.tanh((r - this.dcR) * 1.1) * .92;
      left[i] = l; right[i] = r;
      this.peak = Math.max(this.peak, Math.abs(l), Math.abs(r)); this.sampleCount++;
    }
  }

  snapshot() {
    const bar = Math.floor(this.scene.beat / 4), step = Math.floor(this.scene.beat * 4) % 16;
    const pattern = Array.from({ length: 16 }, (_, n) => this.scene.plan(n, bar, this.params.energy));
    return { mode: this.mode, seed: this.seed, bar: bar + 1, step, beat: this.scene.beat,
      generated: maskFromSteps(this.scene.grid.type === 'generate' ? pattern :
        Array.from({length:16}, (_, n) => this.scene.plan(n, bar, this.params.energy, true))),
      section: this.scene.score.section, revision: this.scene.grid.revision,
      transition: this.transition, tempo: this.params.tempo, pattern,
      current: { movement: this.params.movement, space: this.params.space, warmth: this.params.warmth },
      slice: this.sampler.lastCut, events: { ...this.scene.stepEvents, chops: this.sampler.triggers },
    };
  }
}

// Build the stopped transport's first bar with the same planner as the audio thread.
export function openingPattern(mode, seed, energy, melody, point) {
  const scene = new Scene(mode, seed, 48000);
  scene.composer.phrase.configure(melody); scene.setPad(point);
  return Array.from({ length: 16 }, (_, step) => scene.plan(step, 0, energy));
}
