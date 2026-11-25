import { maskFromSteps, presets, validMasks } from './grooves.js?v=7';

const $ = id => document.getElementById(id);
const labels = ['Kick', 'Hats', 'Bass', 'Melody'];
const storageKey = 'orbit.grooves.v1';

export class PatternEditor {
  constructor(onChange) {
    this.onChange = onChange;
    this.states = {};
    this.saved = {};
    try { this.saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch {}
    this.revision = 0; this.cycle = 0;
    this.cells = [];
    labels.forEach((label, row) => {
      const line = document.createElement('div');
      line.className = 'pattern-row';
      const name = document.createElement('span'); name.className = 'lane-label'; name.textContent = label;
      const actions = document.createElement('select');
      actions.setAttribute('aria-label', label + ' row actions');
      actions.append(new Option('Row ▾', ''), new Option('Reset to generator', 'reset'), new Option('Clear hits', 'clear'));
      actions.onchange = () => { if (actions.value) this.changeRow(row, actions.value); actions.value = ''; };
      name.append(actions); line.append(name);
      for (let step = 0; step < 16; step++) {
        const cell = document.createElement('button');
        cell.type = 'button'; cell.className = 'step'; cell.setAttribute('aria-label', label + ', step ' + (step + 1));
        cell.tabIndex = step === 0 ? 0 : -1;
        cell.onclick = () => {
          const masks = [...this.visible];
          masks[row] ^= 1 << step;
          this.apply('edit', masks, '', this.state.liveRows & ~(1 << row));
        };
        cell.onkeydown = event => {
          const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 16, ArrowUp: -16 }[event.key];
          if (!delta) return;
          event.preventDefault();
          this.cells[(row * 16 + step + delta + 64) % 64].focus();
        };
        cell.onfocus = () => {
          for (const button of line.querySelectorAll('button')) button.tabIndex = button === cell ? 0 : -1;
        };
        this.cells.push(cell); line.append(cell);
      }
      $('pattern').append(line);
    });
    for (const button of document.querySelectorAll('[data-pattern]')) button.onclick = () => {
      if (this.state.type !== button.dataset.pattern) this.apply(button.dataset.pattern, [...this.visible]);
    };
    $('groove-preset').onchange = event => {
      if (!event.target.value) return;
      const entry = this.entries[Number(event.target.value)];
      if (entry) this.apply(this.state.type === 'shuffle' ? 'shuffle' : 'edit', [...entry.masks], entry.name);
    };
    $('save-groove').onclick = () => { $('preset-form').hidden = false; $('preset-name').focus(); };
    $('cancel-save').onclick = () => { $('preset-form').hidden = true; $('save-groove').focus(); };
    $('preset-form').onsubmit = event => {
      event.preventDefault();
      const name = $('preset-name').value.trim();
      if (!name) return;
      const existing = this.savedEntries();
      if (presets[this.mode].some(entry => entry.name === name) || existing.some(entry => entry.name === name)) {
        $('grid-hint').textContent = 'Choose a new preset name.'; return;
      }
      const entry = { name, masks: [...this.visible] };
      const saved = { ...this.saved, [this.mode]: [...existing, entry] };
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); }
      catch { $('grid-hint').textContent = 'Browser storage is unavailable. Your current groove is still playable.'; return; }
      this.saved = saved; this.populate(); this.apply('edit', entry.masks, name);
      $('preset-name').value = ''; $('preset-form').hidden = true; $('save-groove').focus();
    };
  }
  open(mode, steps) {
    this.mode = mode; this.generated = maskFromSteps(steps);
    $('preset-form').hidden = true; this.populate();
    const state = this.states[mode] ?? { type: 'generate', masks: this.generated };
    this.apply(state.type, state.masks, state.name, state.liveRows);
  }
  changeRow(row, action) {
    const bit = 1 << row, state = this.state;
    if (state.type === 'generate' && action === 'reset') {
      $('grid-hint').textContent = labels[row] + ' already follows the generator.';
      return;
    }
    const live = state.type === 'generate' ? 15 : state.liveRows;
    const masks = [...(state.type === 'generate' ? this.visible : state.masks)];
    masks[row] = action === 'reset' ? this.generated[row] : 0;
    const liveRows = action === 'reset' ? live | bit : live & ~bit;
    const type = liveRows === 15 ? 'generate' : state.type === 'shuffle' ? 'shuffle' : 'edit';
    this.apply(type, masks, '', liveRows, state.cycle);
    $('grid-hint').textContent = labels[row] + (action === 'reset' ? ' follows the generator.' : ' cleared.');
  }
  savedEntries() {
    const entries = this.saved?.[this.mode];
    return Array.isArray(entries) ? entries.filter(e => e && typeof e.name === 'string' && validMasks(e.masks)) : [];
  }
  populate() {
    this.entries = [...presets[this.mode], ...this.savedEntries()];
    $('groove-preset').replaceChildren(new Option('Choose preset…', ''), ...this.entries.map((e, i) => new Option(e.name, i)));
  }
  apply(type, masks, name = '', liveRows = 0, cycle = ++this.cycle) {
    const previous = this.state;
    this.state = { type, masks, name, liveRows, cycle, revision: ++this.revision };
    this.states[this.mode] = this.state;
    this.visible = masks.map((mask, row) => {
      if (type === 'generate' || (liveRows & (1 << row))) return this.generated[row];
      if (type === 'shuffle' && previous?.cycle === cycle && mask === previous.masks[row]) return this.visible[row];
      return mask;
    });
    $('groove-preset').value = name ? String(this.entries.findIndex(e => e.name === name)) : '';
    for (const button of document.querySelectorAll('[data-pattern]')) button.setAttribute('aria-pressed', String(type === button.dataset.pattern));
    $('grid-hint').textContent = { generate: 'Composed live. Tap a step to edit this bar.', edit: 'Tap steps to set the rhythm. Pitches keep evolving.', shuffle: 'The groove reshuffles every two bars. Tap a step to keep it.' }[type];
    this.paint(-1); this.onChange(this.state);
  }
  receive(data, playing) {
    if (this.state.revision !== data.revision) return;
    this.visible = maskFromSteps(data.pattern);
    this.generated = data.generated ?? [...this.generated];
    this.paint(playing ? data.step : -1);
  }
  paint(current) {
    this.cells.forEach((cell, i) => {
      const on = Boolean(this.visible[Math.floor(i / 16)] & (1 << (i % 16)));
      cell.classList.toggle('on', on); cell.classList.toggle('current', i % 16 === current);
      cell.setAttribute('aria-pressed', String(on));
    });
  }
}
