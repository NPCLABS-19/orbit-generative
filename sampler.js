// Select a nearby attack for each cut, outside the audio rendering thread.
export function makeBank(pcm, rate, divisions = 16) {
  const count = Math.min(divisions, Math.max(1, Math.floor(pcm.length / (rate * .16))));
  const starts = [];
  for (let i = 0; i < count; i++) {
    const lo = Math.floor(i * pcm.length / count);
    const hi = Math.floor((i + .55) * pcm.length / count);
    let best = lo, strength = -1, previous = 0;
    for (let k = lo; k < hi; k += 64) {
      let power = 0;
      for (let j = k; j < Math.min(k + 64, pcm.length); j++) power += pcm[j] ** 2;
      const rise = power - previous * .88;
      if (rise > strength) { best = k; strength = rise; }
      previous = power;
    }
    starts.push(best);
  }
  return { pcm, starts, rate };
}

export class SlicePlayer {
  constructor(rate) {
    this.rate = rate;
    this.voices = [];
    this.triggers = 0;
  }
  setBank(bank) {
    this.bank = bank; this.lastCut = null;
    for (const voice of this.voices) voice.remaining = Math.min(voice.remaining, Math.round(.008 * this.rate));
  }
  trigger(index, tempo, accent) {
    const bank = this.bank;
    if (!bank) return;
    const cut = index % bank.starts.length;
    const start = bank.starts[cut], end = bank.starts[cut + 1] ?? bank.pcm.length;
    const speed = bank.rate / this.rate;
    const length = Math.min(Math.floor((end - start - 1) / speed), Math.round(this.rate * 60 / tempo * .72));
    if (length < 2) return;
    for (const v of this.voices) v.remaining = Math.min(v.remaining, Math.round(.008 * this.rate));
    this.voices.push({ pcm: bank.pcm, pos: start, speed, remaining: length, age: 0, gain: accent });
    this.lastCut = cut; this.triggers++;
  }
  tick() {
    let output = 0;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i], at = Math.floor(v.pos), mix = v.pos - at;
      const envelope = Math.min(1, v.age / (.004 * this.rate), v.remaining / (.008 * this.rate));
      output += (v.pcm[at] * (1 - mix) + v.pcm[at + 1] * mix) * envelope * v.gain;
      v.pos += v.speed; v.age++;
      if (--v.remaining <= 0) this.voices.splice(i, 1);
    }
    return output;
  }
}
