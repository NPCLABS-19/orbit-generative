import { PhraseWriter, melodyDefaults } from './phrases.js';
// Musical time is measured in sixteenths. Each voice keeps its own cursor across bars.
const minor = [0, 2, 3, 5, 7, 8, 10];
const phrygian = [0, 1, 3, 5, 7, 8, 10];
const mod = (n, m) => ((n % m) + m) % m;
const scalePitch = (degree, scale) => scale[mod(degree, 7)] + 12 * Math.floor(degree / 7);
const reflect = (n, low, high) => n < low ? low + (low - n) : n > high ? high - (n - high) : n;

export function randomStream(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

class TapeLine {
  constructor(pick) {
    this.pick = pick;
    this.degree = pick([2, 4, 7]);
    this.direction = 1;
    this.remaining = 0;
  }
  next() {
    if (this.remaining-- <= 0) {
      this.direction *= -1;
      this.remaining = this.pick([2, 3, 4, 5]);
    }
    this.degree = reflect(this.degree + this.direction * this.pick([0, 1, 1, 2, 3]), -2, 10);
    // A line breathes at the end of its arc. Its next entrance can fall across a bar line.
    const gap = this.remaining === 0 ? this.pick([7, 9, 12]) : this.pick([3, 4, 5, 6]);
    return { degree: this.degree, gap, decay: this.pick([1.7, 2.2, 3.0]), attack: .025, color: .2 };
  }
}

class TransitLine {
  constructor(pick) {
    this.pick = pick;
    this.cell = Array.from({ length: pick([4, 5, 6]) }, () => pick([0, 2, 4, 6, 7]));
    this.index = 0;
    this.offset = 0;
  }
  next() {
    if (this.index === this.cell.length) {
      this.index = 0;
      const i = this.pick(this.cell.map((_, index) => index));
      this.cell[i] = reflect(this.cell[i] + this.pick([-2, -1, 1, 2]), -2, 9);
      this.offset = reflect(this.offset + this.pick([-1, 0, 0, 1]), -2, 3);
    }
    const degree = this.cell[this.index++] + this.offset;
    const gap = this.index === this.cell.length ? this.pick([2, 3, 4, 6]) : this.pick([1, 2, 2, 2, 3]);
    return { degree, gap, decay: this.pick([4, 5, 7]), attack: .006, color: .4 };
  }
}

class PressureLine {
  constructor(pick) {
    this.pick = pick;
    this.pitches = Array.from({ length: pick([3, 5, 7]) }, () => pick([0, 0, 1, 4, 7]));
    this.gaps = Array.from({ length: pick([4, 6]) }, () => pick([1, 2, 3, 3, 5]));
    this.index = 0;
    this.resonance = 2;
  }
  next() {
    const i = this.index++;
    if (i && i % this.pitches.length === 0) {
      this.pitches[this.pick(this.pitches.map((_, index) => index))] = this.pick([-3, 0, 1, 3, 4, 7, 8]);
      this.resonance = reflect(this.resonance + this.pick([-.55, .35, .75]), 1, 4);
    }
    if (i && i % this.gaps.length === 0) {
      this.gaps[this.pick(this.gaps.map((_, index) => index))] = this.pick([1, 2, 3, 5, 7]);
    }
    return { degree: this.pitches[i % this.pitches.length], gap: this.gaps[i % this.gaps.length],
      decay: this.pick([10, 15, 21]), attack: .004, color: this.resonance };
  }
}

const profiles = {
  analog: { line: TapeLine, roots: [0, 2, 3, 5, -1], spans: [2, 3, 4, 5], labels: ['Drift', 'Bloom', 'Still'] },
  house: { line: TransitLine, roots: [0, 3, 5, -1, -2], spans: [1, 2, 2, 4], labels: ['Pulse', 'Lift', 'Suspension'] },
  techno: { line: PressureLine, roots: [0, 0, 0, 1, -3], spans: [3, 5, 7, 8], labels: ['Drive', 'Pressure', 'Release'] },
};

export class Composer {
  constructor(mode, root, seed) {
    this.mode = mode;
    this.root = root;
    this.profile = profiles[mode];
    this.scale = mode === 'techno' ? phrygian : minor;
    this.random = randomStream(seed ^ { analog: 367, house: 619, techno: 919 }[mode]);
    this.pick = items => items[Math.floor(this.random() * items.length)];
    this.phrase = new PhraseWriter(new this.profile.line(this.pick), this.random, melodyDefaults[mode]);
    this.nextNote = this.pick([0, 1, 2]);
    this.harmony = 0;
    this.chordBars = 0;
    this.section = 0;
    this.sectionBars = this.pick([5, 7, 9, 13]);
    this.position = 0;
    this.lastPitch = root + 24;
    this.held = false;
  }

  nextBar() {
    if (this.held && this.current) return this.current;
    if (this.sectionBars-- === 0) {
      this.section = (this.section + this.pick([1, 2])) % 3;
      this.sectionBars = this.pick([4, 6, 9, 11, 15]);
    }
    if (this.chordBars === 0) {
      if (this.position) this.harmony = this.pick(this.profile.roots);
      this.chordBars = this.pick(this.profile.spans);
    }
    this.chordBars--;
    const scale = this.scale, rootDegree = this.harmony;
    const chordRoot = scalePitch(rootDegree, scale);
    const chord = [0, 2, 4, this.mode === 'techno' ? 7 : 6].map(d => scalePitch(rootDegree + d, scale) - chordRoot);
    const notes = [];
    const start = this.position;
    for (let i = 0; i < 16; i++) {
      const onset = start + i === this.nextNote;
      if (onset) {
        const note = this.phrase.next();
        this.lastPitch = this.root + (this.mode === 'analog' ? 24 : 36) + scalePitch(rootDegree + note.degree, scale);
        // Fold high inversions back into the lead's singing register.
        while (this.lastPitch > 94) this.lastPitch -= 12;
        while (this.lastPitch < 48) this.lastPitch += 12;
        this.lastPitch += 12 * this.phrase.settings.octave;
        this.lastVoice = note;
        this.nextNote += note.gap + (this.section === 2 && this.random() < .28 ? 2 : 0);
      }
      notes.push({ ...this.lastVoice, pitch: this.lastPitch, onset, threshold: this.random() * .92,
        accent: .72 + .28 * this.random() });
    }
    this.position += 16;
    this.current = { notes, chordRoot, chord, section: this.profile.labels[this.section], intensity: [1, 1.16, .76][this.section] };
    return this.current;
  }
}
