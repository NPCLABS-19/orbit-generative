import { TouchPad } from './touch-pad.js';
import { forms, melodyControls, melodyDefaults } from './phrases.js';
import { controls, modes, openingPattern } from './music-core.js?v=5';
import { PatternEditor } from './pattern-editor.js';
import { SamplePanel } from './sample-panel.js?v=5';
import { MusicEngine } from './audio-engine.js?v=5';

const $ = id => document.getElementById(id);
const descriptions = {
  tempo: 'The pace of the whole piece', energy: 'Density, accents and fills',
  rhythm: 'Kick, clap and percussion', bass: 'The low-frequency voice',
  sub: 'Tuned sub with glide and saturation', melody: 'Chords and melodic phrases', movement: 'Stereo width and orbit',
  space: 'Room, tails and echo', warmth: 'Filter and soft saturation',
};
const settings = Object.fromEntries(Object.entries(modes).map(([key, mode]) => [key, { ...mode.defaults }]));
const phrasing = Object.fromEntries(Object.entries(melodyDefaults).map(([genre, values]) => [genre, { ...values }]));
const formDescriptions = {
  answer: 'A short call returns as a mirrored answer that settles back on the chord.',
  additive: 'A two-note idea gains one note on each pass before the motif changes.',
  interlock: 'A high line moves forward while a shorter, lower line answers in reverse.',
};
const phraseDescriptions = { length: 'Notes in the source motif', density: 'Space between entrances', variation: 'How much of the motif is rewritten', octave: 'Shift the lead up or down' };
const seeds = Object.fromEntries(Object.keys(modes).map(key => [key, crypto.getRandomValues(new Uint32Array(1))[0]]));
let mode = 'analog', volume = 55, fade = 4, engine, playing = false, busy = false;
let elapsed = 0, began = 0, deadline = 0, snapshot = null, frame = 0;
const points = { analog: null, house: null, techno: null };
const pad = new TouchPad($('performance-pad'), point => {
  points[mode] = point; engine?.setPad(point);
  if (!playing || reducedMotion.matches) drawStage();
}, () => { if (!playing && !busy) $('play').click(); });
$('pad-clear').onclick = () => {
  points[mode] = null; pad.display(null); engine?.setPad(null); drawStage();
};
const editor = new PatternEditor(grid => engine?.setGrid(grid));
const samplePanel = new SamplePanel(bank => engine?.setBank(bank), lane => engine?.setLane(lane));
function openGrid() {
  editor.open(mode, openingPattern(mode, seeds[mode], settings[mode].energy, phrasing[mode], points[mode]));
}

function sliders(items, help) {
  return items.map(c => `<div class="slider-control"><label for="${c.id}">${c.label}<output id="${c.id}-out" for="${c.id}"></output></label><input id="${c.id}" type="range" min="${c.min}" max="${c.max}" step="1" aria-describedby="${c.id}-description"><span class="control-description" id="${c.id}-description">${help[c.id]}</span></div>`).join('');
}
$('controls').innerHTML = sliders(controls, descriptions);
$('phrase-controls').innerHTML = sliders(melodyControls, phraseDescriptions);
for (const [key, title] of Object.entries(forms)) $('phrase-form').append(new Option(title, key));

function changePhrase(id, value) {
  phrasing[mode] = { ...phrasing[mode], [id]: value };
  engine?.setMelody(phrasing[mode]);
  renderPhrase();
  if (!engine) openGrid();
}
function renderPhrase() {
  const values = phrasing[mode];
  $('phrase-form').value = values.form;
  $('form-description').textContent = formDescriptions[values.form];
  for (const c of melodyControls) {
    $(c.id).value = values[c.id];
    $(c.id + '-out').value = values[c.id] + c.unit;
  }
}
$('phrase-form').onchange = event => changePhrase('form', event.target.value);
for (const c of melodyControls) $(c.id).oninput = event => changePhrase(c.id, Number(event.target.value));

function totalTime() { return elapsed + (playing && engine?.context ? engine.context.currentTime - began : 0); }
function syncTimer() { engine?.setSession(deadline ? Math.max(0, deadline - totalTime()) : null); }
function setTimer() { const seconds = Number($('timer').value) * 60; deadline = seconds ? totalTime() + seconds : 0; syncTimer(); }
function setBusy(value) {
  busy = value; $('play').disabled = value;
  document.querySelectorAll('[data-mode], #new-variation, #reset').forEach(button => { button.disabled = value; });
}
function renderState(message) {
  $('status').textContent = message;
  $('play-text').textContent = playing ? 'Pause listening' : 'Start listening';
  $('play').setAttribute('aria-label', playing ? 'Pause music' : 'Start music');
  $('play-icon').innerHTML = playing ? '<path d="M7 5h4v14H7zm7 0h4v14h-4z"/>' : '<path d="m9 5 11 7-11 7Z"/>';
  document.body.classList.toggle('playing', playing);
  if (playing) startVisual(); else { cancelAnimationFrame(frame); frame = 0; drawStage(); }
}
function renderControls() {
  renderPhrase(); pad.display(points[mode]);
  for (const c of controls) {
    $(c.id).value = settings[mode][c.id];
    $(`${c.id}-out`).value = `${settings[mode][c.id]}${c.unit}`;
  }
  $('title').textContent = modes[mode].title; $('description').textContent = modes[mode].description;
  $('key').textContent = modes[mode].key; $('tempo-live').textContent = `${settings[mode].tempo} BPM`;
  $('seed').textContent = `Seed ${seeds[mode]}`;
  document.documentElement.style.setProperty('--accent', modes[mode].color);
  document.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}
function effectMessage(changing = false) {
  $('effect-light').classList.toggle('changing', changing);
  $('effect-state').textContent = changing ? `Blending effects · ${fade} s fade`
    : (!playing && engine ? 'Changes blend when playback resumes' : `Effects settle over ${fade} ${fade === 1 ? 'second' : 'seconds'}`);
}
function receive(data) {
  if (data.mode !== mode) return;
  snapshot = data;
  $('section').textContent = data.section;
  $('bar-label').textContent = `Bar ${data.bar} · beat ${Math.floor(data.beat % 4) + 1}`;
  $('tempo-live').textContent = `${Math.round(data.tempo)} BPM`;
  editor.receive(data, playing);
  $('slice-index').textContent = samplePanel.bank && Number.isInteger(data.slice) ? 'Slice ' + String(data.slice + 1).padStart(2, '0') + ' ·' : '';
  const changing = data.transition < .999 || ['movement', 'space', 'warmth'].some(key => Math.abs(data.current[key] - settings[mode][key]) > 1);
  effectMessage(changing && playing);
  if (playing && data.transition >= .999 && /Switching|new variation/.test($('status').textContent)) $('status').textContent = 'Generating as you listen';
}
function interrupted(message) {
  if (playing && engine?.context) elapsed += engine.context.currentTime - began;
  playing = false; setBusy(false); renderState(message);
}

async function pause(message = 'Paused. Your place is saved.') {
  setBusy(true);
  try {
    await engine.pause(); elapsed += engine.context.currentTime - began;
    if (deadline) elapsed = Math.min(deadline, elapsed);
    playing = false; editor.paint(-1); renderState(message); effectMessage();
  } catch { interrupted('Audio paused. Press Play to resume.'); }
  finally { setBusy(false); }
}

$('play').addEventListener('click', async () => {
  if (busy) return;
  samplePanel.stopPreview();
  if (playing) { await pause(); return; }
  setBusy(true); $('status').textContent = 'Preparing the instrument…';
  try {
    if (engine?.failed) { await engine.close(); engine = null; }
    if (!engine?.context) {
      engine = new MusicEngine(receive, interrupted); engine.volume = volume;
      const sequence = { point: points[mode], melody: phrasing[mode], grid: editor.state, bank: samplePanel.bank, lane: samplePanel.lane.value, hold: $('hold').checked };
      await engine.init(mode, seeds[mode], { ...settings[mode], fade }, sequence);
      // Apply any edits made while the browser was starting its audio context.
      if (points[mode] !== sequence.point) engine.setPad(points[mode]);
      if (phrasing[mode] !== sequence.melody) engine.setMelody(phrasing[mode]);
      if (editor.state !== sequence.grid) engine.setGrid(editor.state);
      if (samplePanel.bank !== sequence.bank) engine.setBank(samplePanel.bank);
      if (samplePanel.lane.value !== sequence.lane) engine.setLane(samplePanel.lane.value);
    }
    engine.update({ ...settings[mode], fade }); engine.setHold($('hold').checked);
    await engine.play(); began = engine.context.currentTime; playing = true;
    if (deadline && elapsed >= deadline) { elapsed = 0; deadline = Number($('timer').value) * 60; }
    syncTimer(); renderState('Generating as you listen');
  } catch (error) {
    playing = false; await engine?.close().catch(() => {}); engine = null;
    renderState(error.message || 'Audio could not start. Please try again.');
  } finally { setBusy(false); }
});

for (const c of controls) $(c.id).addEventListener('input', event => {
  const value = Number(event.target.value); settings[mode][c.id] = value;
  $(`${c.id}-out`).value = `${value}${c.unit}`; engine?.update({ [c.id]: value });
  if (['movement', 'space', 'warmth'].includes(c.id)) effectMessage(playing);
  if (!playing && c.id === 'tempo') $('tempo-live').textContent = `${value} BPM`;
});
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (busy || mode === button.dataset.mode) return;
  mode = button.dataset.mode; snapshot = null; renderControls();
  engine?.setMode(mode, seeds[mode], { ...settings[mode], fade }); engine?.setMelody(phrasing[mode]); engine?.setPad(points[mode]); openGrid();
  if (playing) renderState('Switching instruments');
  else { $('bar-label').textContent = 'Waiting for the first bar'; $('section').textContent = 'Ready'; drawStage(); }
  effectMessage(playing);
}));
$('reset').addEventListener('click', () => {
  points[mode] = null; engine?.setPad(null);
  settings[mode] = { ...modes[mode].defaults }; phrasing[mode] = { ...melodyDefaults[mode] }; engine?.setMelody(phrasing[mode]); if (!engine) openGrid(); renderControls(); engine?.update({ ...settings[mode], fade }); effectMessage(playing);
});
$('new-variation').addEventListener('click', () => {
  const value = new Uint32Array(1); crypto.getRandomValues(value); seeds[mode] = value[0];
  renderControls(); engine?.setMode(mode, seeds[mode], { ...settings[mode], fade }); engine?.setMelody(phrasing[mode]); engine?.setPad(points[mode]); openGrid(); effectMessage(playing);
  if (playing) renderState('A new variation is finding its way');
});
$('hold').addEventListener('change', () => engine?.setHold($('hold').checked));
$('volume').addEventListener('input', event => { volume = Number(event.target.value); samplePanel.audio.volume = volume / 100; $('volume-out').value = `${volume}%`; engine?.setVolume(volume); });
$('fade').addEventListener('input', event => { fade = Number(event.target.value); $('fade-out').value = `${fade} s`; engine?.update({ fade }); effectMessage(playing); });
$('timer').addEventListener('change', setTimer);
setInterval(() => {
  const total = deadline ? Math.min(totalTime(), deadline) : totalTime();
  $('elapsed').textContent = `${Math.floor(total / 60).toString().padStart(2, '0')}:${Math.floor(total % 60).toString().padStart(2, '0')}`;
  if (playing && !busy && deadline && totalTime() >= deadline) pause('Session complete.');
}, 250);

const canvas = $('scope'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const waveform = new Uint8Array(128);
function drawStage() {
  const { width, height } = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  if (playing && engine?.analyser && !reducedMotion.matches) engine.analyser.getByteTimeDomainData(waveform);
  else waveform.fill(128);
  const cx = width * (points[mode]?.x ?? .5), cy = height * (points[mode]?.y ?? .5);
  const radius = Math.min(29, width * .08), color = modes[mode].color;
  ctx.strokeStyle = '#344745'; ctx.lineWidth = 1;
  for (let ring = 0; ring < 3; ring++) {
    ctx.beginPath(); ctx.ellipse(cx, cy, radius + 17 + ring * 17, radius * .63 + ring * 12, (ring - 1) * .4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = color; ctx.globalAlpha = .66; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let n = 0; n <= 128; n++) {
    const angle = n / 128 * Math.PI * 2;
    const amplitude = (waveform[n % 128] - 128) / 128 * 33;
    const r = radius + amplitude;
    const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
    if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  const angle = playing && !reducedMotion.matches ? (snapshot?.beat || 0) * .26 : -.8;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * (radius + 42), cy + Math.sin(angle) * (radius * .63 + 12), 3, 0, Math.PI * 2); ctx.fill();
}
function startVisual() {
  if (frame || document.hidden) return;
  function draw() { frame = 0; drawStage(); if (playing && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(draw); }
  frame = requestAnimationFrame(draw);
}
new ResizeObserver(drawStage).observe(canvas);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { drawStage(); if (playing) startVisual(); } });
window.addEventListener('pagehide', () => { samplePanel.stopPreview(); engine?.close().catch(() => {}); playing = false; cancelAnimationFrame(frame); frame = 0; renderState('Ready when you are'); });
renderControls(); openGrid(); drawStage();
