const limit = n => Math.max(0, Math.min(1, n));
export const padVoices = [
  { name: 'Bloom', detail: 'Open, ringing tones' },
  { name: 'Cascade', detail: 'Climbing pulses' },
  { name: 'Undertow', detail: 'Low, spaced answers' },
  { name: 'Fracture', detail: 'Clipped syncopation' },
];
export const quadrant = ({x, y}) => (y >= .5 ? 2 : 0) + (x >= .5 ? 1 : 0);
export function padPoint(x, y, pressure = .5) {
  return { x: limit(x), y: limit(y), pressure: limit(pressure) };
}

export function shapeNote(note, point, step, bar, root, scale, chance) {
  const {x, y, pressure} = point;
  const zone = quadrant(point), pulse = bar * 16 + step;
  // Move in scale degrees so live gestures remain in the current genre's key.
  const offset = note.leadNote - root;
  let degree = scale.indexOf(((offset % 12) + 12) % 12);
  degree = (degree < 0 ? 0 : degree) + 7 * Math.floor(offset / 12);
  let interval, decay;
  if (zone === 0) {
    interval = step % 8 < 4 ? 2 : 4;
    note.lead = (note.lead && chance < .58 + x * .7) || (step === 0 && chance < .68);
    decay = .54;
  } else if (zone === 1) {
    interval = Math.floor(pulse / 2) % 5;
    note.lead ||= step % 2 === 0 && chance < x;
    decay = 1.25;
  } else if (zone === 2) {
    interval = step < 8 ? -3 : -5;
    note.lead = (note.lead && step % 2 === 0) || (step % 8 === 0 && chance < .45 + x);
    decay = .72;
  } else {
    interval = chance > .54 ? 3 : -2;
    note.lead ||= step % 4 !== 0 && chance < x * .72;
    decay = 2.5;
  }
  degree += interval + Math.round((.5 - y) * 7);
  note.leadNote = root + scale[((degree % 7) + 7) % 7] + 12 * Math.floor(degree / 7);
  note.decay *= decay * (.75 + x * .65);
  note.attack *= zone === 0 ? 2 : .75;
  note.leadAccent *= .63 + pressure * .6;
  note.brightness = .35 + (1 - y) * 1.4 + pressure * .25;
  return note;
}
