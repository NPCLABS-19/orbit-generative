import { makeBank } from './sampler.js?v=5';
import { recording, segments, segmentURL, timestamp } from './segments.js';

export class SamplePanel {
  constructor(onBank, onLane) {
    this.onBank = onBank;
    this.source = document.getElementById('sample-source');
    this.lane = document.getElementById('sample-lane');
    this.divisions = document.getElementById('slice-count');
    this.status = document.getElementById('sample-status');
    this.credit = document.getElementById('source-credit');
    this.preview = document.getElementById('preview-segment');
    this.audio = new Audio();
    this.audio.volume = .55;
    this.cache = new Map();
    this.version = 0;
    this.bank = null;
    let group;
    for (const segment of segments) {
      if (group?.label !== segment.track) {
        group = document.createElement('optgroup');
        group.label = segment.track; this.source.append(group);
      }
      group.append(new Option(segment.track + ' · ' + timestamp(segment.start) + '–' + timestamp(segment.start + 6), String(segment.start)));
    }
    this.source.onchange = () => this.load();
    this.divisions.onchange = () => { if (this.raw) this.slice(); };
    this.lane.onchange = () => { onLane(this.lane.value); this.showStatus(); };
    this.preview.onclick = async () => {
      if (!this.audio.paused) { this.stopPreview(); return; }
      const version = this.version;
      try { await this.audio.play(); }
      catch { if (version === this.version) this.status.textContent = 'Preview could not start. Try Preview again.'; }
    };
    this.audio.onplay = () => { this.preview.textContent = 'Stop preview'; };
    this.audio.onpause = this.audio.onended = () => { this.preview.textContent = 'Preview'; };
    this.source.value = String(segments[0].start); this.load();
  }

  stopPreview() { this.audio.pause(); this.audio.currentTime = 0; }
  showStatus() {
    if (this.bank) this.status.textContent = this.bank.starts.length + ' slices · triggered by ' + this.lane.selectedOptions[0].text + '.';
  }
  slice() {
    this.bank = makeBank(this.raw, 24000, Number(this.divisions.value));
    document.getElementById('slice-index').textContent = '';
    this.onBank(this.bank); this.showStatus();
  }
  async load() {
    const version = ++this.version;
    this.stopPreview();
    this.preview.disabled = true; this.credit.hidden = true;
    this.raw = null; this.bank = null; this.onBank(null);
    document.getElementById('slice-index').textContent = '';
    const key = this.source.value;
    if (!key) { this.status.textContent = 'Sample mode is off.'; return; }
    const url = segmentURL(key);
    this.status.textContent = 'Preparing segment…';
    try {
      let raw = this.cache.get(key);
      if (!raw) {
        const response = await fetch(url);
        if (!response.ok) throw Error('This segment could not be loaded.');
        const decoder = new OfflineAudioContext(1, 1, 24000);
        const audio = await decoder.decodeAudioData(await response.arrayBuffer());
        raw = audio.getChannelData(0);
        this.cache.set(key, raw);
      }
      if (version !== this.version) return;
      this.raw = raw; this.slice();
      this.audio.src = url.href; this.preview.disabled = false;
      this.credit.href = recording + '&t=' + key + 's'; this.credit.hidden = false;
    } catch (error) {
      if (version === this.version) { this.source.value = ''; this.status.textContent = error.message || 'Could not load segment.'; }
    }
  }
}
