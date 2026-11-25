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
    this.cloud = null; this.grains = [];
    this.cloudL = 0; this.cloudR = 0;
  }
  get active() { return this.voices.length > 0 || this.cloud !== null; }
  setBank(bank) {
    if (this.cloud) this.cloud.release = Math.round(this.rate * .012);
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
    if (!this.cloud && end - start > bank.rate * .028) {
      const duration = Math.round(this.rate * (3.6 + (cut % 5) * .58));
      this.cloud = { pcm:bank.pcm, start, end, speed, age:0, duration, next:0, accent, release:null };
    }
    this.lastCut = cut; this.triggers++;
  }
  tickCloud() {
    this.cloudL = 0; this.cloudR = 0;
    const c = this.cloud;
    if (!c) return;
    if (c.age >= c.next && c.release === null) {
      const length = Math.max(2, Math.floor(Math.min(this.rate * .19, (c.end - c.start - 2) / c.speed)));
      const sweep = c.age / c.duration;
      const offset = (c.end - c.start - 2 - length * c.speed) * (.2 + .65 * sweep);
      this.grains.push({ pos:c.start + Math.max(0, offset), age:0, length, pan:Math.sin(sweep * 4.4 - 1.8) * .64 });
      c.next += Math.max(1, Math.floor(length / 2));
    }
    const envelope = Math.min(1, c.age / (this.rate * .28)) * (1 - c.age / c.duration) ** 2 *
      (c.release === null ? 1 : c.release / Math.round(this.rate * .012)) * c.accent;
    for (let i = this.grains.length - 1; i >= 0; i--) {
      const g = this.grains[i], pos = Math.floor(g.pos), frac = g.pos - pos;
      const window = .5 - .5 * Math.cos(2 * Math.PI * g.age / g.length);
      const value = ((1 - frac) * c.pcm[pos] + frac * c.pcm[pos + 1]) * window * envelope;
      this.cloudL += value * (1 - g.pan); this.cloudR += value * (1 + g.pan);
      g.pos += c.speed; if (++g.age >= g.length) this.grains.splice(i,1);
    }
    if (++c.age >= c.duration || (c.release !== null && --c.release <= 0)) {
      this.cloud = null; this.grains.length = 0;
    }
  }
  tick() {
    this.tickCloud();
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
