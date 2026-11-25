import { randomStream } from './composer.js';

export const lanes = ['kick', 'hat', 'bass', 'lead'];
// Each four-character group is one beat; bits are stored in playback order.
const groove = (name, ...rows) => ({ name, masks: rows.map(row => [...row.replaceAll(' ', '')].reduce((mask, bit, i) => mask | (Number(bit) << i), 0)) });
export const presets = {
  analog: [
    groove('Loose pocket', '1000 0010 1000 0010', '1010 1010 1011 1010', '1001 0001 0010 0010', '0010 0100 0100 0001'),
    groove('Long shadows', '1000 0000 0010 0000', '0010 0010 0010 0011', '1000 0000 1000 0010', '1000 0001 0000 0100'),
  ],
  house: [
    groove('Offbeat lift', '1000 1000 1000 1000', '0010 0010 0010 0011', '0010 0010 0010 0010', '1010 0110 1010 0101'),
    groove('After hours', '1000 1000 1000 1000', '1010 0010 1010 0010', '0010 0001 0010 0010', '0100 1001 0010 0100'),
  ],
  techno: [
    groove('Steel pulse', '1000 1000 1000 1000', '1011 1010 1110 1011', '0011 0010 0011 0010', '1001 0010 0010 0010'),
    groove('Ratchet', '1000 1000 1000 1010', '1110 1011 1110 1111', '0010 0100 0010 0101', '0100 1010 0101 0011'),
  ],
};

export function maskFromSteps(pattern) {
  return lanes.map(lane => pattern.reduce((mask, step, index) => mask | (Number(Boolean(step[lane])) << index), 0));
}

export const validMasks = masks => Array.isArray(masks) && masks.length === lanes.length &&
  masks.every(mask => Number.isInteger(mask) && mask >= 0 && mask <= 65535);

export function shuffledMasks(original, mode, seed, turn) {
  if (turn <= 0) return original;
  return original.map((mask, row) => {
    const rand = randomStream(seed ^ Math.imul(turn, 1664525) ^ Math.imul(row, 0x9e3779b1));
    const on = [], off = [];
    for (let i = 0; i < 16; i++) {
      // Keep the downbeat, and the four-on-the-floor kick when the source has one.
      if (row === 0 && ((mode === 'analog' && i === 0) || (mode !== 'analog' && i % 4 === 0))) continue;
      ((mask >> i) & 1 ? on : off).push(i);
    }
    const swaps = Math.min(row === 0 ? 1 : 2, on.length, off.length);
    for (let i = 0; i < swaps; i++) {
      mask ^= 1 << on.splice(Math.floor(rand() * on.length), 1)[0];
      mask ^= 1 << off.splice(Math.floor(rand() * off.length), 1)[0];
    }
    return mask;
  });
}
