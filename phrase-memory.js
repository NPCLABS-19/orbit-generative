// Remember a short call, leave space, then answer on the audio clock.
export class PhraseMemory {
  constructor(rate, random) {
    this.rate = rate; this.random = random; this.clear();
  }
  clear() {
    this.call = []; this.index = 0; this.next = Infinity; this.restUntil = 0;
  }
  remember(note, frame, chordRoot) {
    if (this.call.length >= 3 || frame < this.restUntil) return;
    this.call.push({ note: {...note}, frame, chordRoot });
    if (this.call.length === 3) {
      this.next = frame + Math.round(this.rate * (10 + 18 * this.random()));
      this.stretch = 1.15 + this.random() * .7;
      this.octave = this.random() < .55 ? -12 : 12;
    }
  }
  reply(frame, chordRoot) {
    if (frame < this.next) return null;
    const saved = this.call[this.index++];
    const note = { ...saved.note, leadNote: saved.note.leadNote + this.octave + chordRoot - saved.chordRoot,
      attack: saved.note.attack * 2.6, decay: saved.note.decay * .57, leadAccent: saved.note.leadAccent * .78 };
    if (this.index < this.call.length) {
      this.next = frame + Math.round(Math.min(this.rate * 2.4, this.call[this.index].frame - saved.frame) * this.stretch);
    } else {
      this.clear(); this.restUntil = frame + Math.round(this.rate * (3 + 5 * this.random()));
    }
    return note;
  }
  get waiting() { return this.call.length === 3; }
}
