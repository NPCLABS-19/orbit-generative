// Each form arranges material supplied by the genre's melodic voice.
export const forms = {
  answer: 'Call and response',
  additive: 'Additive phrase',
  interlock: 'Interlocking lines',
};
export const melodyDefaults = {
  analog: { form: 'answer', length: 4, density: 48, variation: 42, octave: 0 },
  house: { form: 'additive', length: 6, density: 64, variation: 52, octave: 0 },
  techno: { form: 'interlock', length: 5, density: 66, variation: 65, octave: 0 },
};
export const melodyControls = [
  { id: 'length', label: 'Motif length', min: 3, max: 9, unit: ' notes' },
  { id: 'density', label: 'Note density', min: 0, max: 100, unit: '%' },
  { id: 'variation', label: 'Motif variation', min: 0, max: 100, unit: '%' },
  { id: 'octave', label: 'Register', min: -1, max: 1, unit: ' oct' },
];

export class PhraseWriter {
  constructor(line, random, defaults) {
    this.line = line;
    this.random = random;
    this.settings = { ...defaults };
    this.notes = [];
    this.cursor = 0;
    this.pass = 0;
  }
  configure(values) {
    if (!values) return;
    const next = { ...this.settings };
    if (Object.hasOwn(forms, values.form)) next.form = values.form;
    for (const c of melodyControls) {
      if (Number.isFinite(values[c.id])) next[c.id] = Math.max(c.min, Math.min(c.max, Math.round(values[c.id])));
    }
    if (next.form !== this.settings.form || next.length !== this.settings.length) {
      this.notes = []; this.cursor = 0; this.pass = 0;
    }
    this.settings = next;
  }
  refresh() {
    const n = this.settings.length;
    if (!this.notes.length) {
      this.notes = Array.from({ length: n }, () => this.line.next());
    } else {
      // Retain most of the previous motif at low variation. Replace more notes at higher values.
      const edits = Math.ceil(n * this.settings.variation / 100);
      const start = Math.floor(this.random() * n);
      for (let i = 0; i < edits; i++) this.notes[(start + i) % n] = this.line.next();
    }
  }
  next() {
    if (!this.notes.length) this.refresh();
    const { form, density, length } = this.settings;
    const i = this.cursor, n = this.notes;
    let note, gap, degree, phraseEnd;
    if (form === 'answer') {
      // The reply mirrors the call around its opening note, then lands on a chord tone.
      const reply = i >= length;
      note = n[i % length];
      phraseEnd = i === length * 2 - 1;
      degree = reply ? (phraseEnd ? 0 : 2 * n[0].degree - note.degree + 2) : note.degree;
      gap = note.gap + (i === length - 1 ? 3 : reply ? 1 : 0);
    } else if (form === 'additive') {
      // Expose one extra note on each pass, until the entire motif is heard.
      const width = 2 + this.pass;
      note = n[i]; degree = note.degree; gap = note.gap;
      phraseEnd = i === width - 1;
    } else {
      // One line climbs through the motif; the other walks a shorter cell backwards below it.
      const beat = Math.floor(i / 2), lower = i % 2 === 1;
      const index = lower ? (length - 2 - beat % (length - 1)) : beat % length;
      note = n[index]; degree = note.degree + (lower ? -4 : 3);
      gap = lower ? Math.max(1, note.gap - 1) : note.gap + 1;
      phraseEnd = i === 2 * length - 1;
    }
    this.cursor++;
    if (phraseEnd) {
      this.cursor = 0;
      if (form === 'additive' && this.pass < length - 2) this.pass++;
      else { this.pass = 0; this.refresh(); }
    }
    return { ...note, degree, gap: Math.max(1, Math.round(gap * 2 ** ((50 - density) / 38))) };
  }
}
