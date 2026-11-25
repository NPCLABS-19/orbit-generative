// Start times refer to the supplied full-album recording, in seconds.
export const recording = 'https://www.youtube.com/watch?v=W2avGFXiueo';
export const segments = [
  { track: 'Moja Bhari Moja', start: 26 },
  { track: 'Moja Bhari Moja', start: 238 },
  { track: 'East West Shuffle', start: 516 },
  { track: 'East West Shuffle', start: 697 },
  { track: 'Aaj Shanibar', start: 821 },
  { track: 'Aaj Shanibar', start: 1094 },
  { track: 'Ayee Morshume', start: 1318 },
  { track: 'Ayee Morshume', start: 1762 },
];
export const segmentURL = start => new URL('./samples/rupa-' + start + '.wav', import.meta.url);
export const timestamp = seconds => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
