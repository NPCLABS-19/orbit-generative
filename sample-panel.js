import { makeBank } from './sampler.js?v=7';
import { youtubeVideo, captureAudio, decodeClip, previewWav } from './sample-import.js';
const $ = id => document.getElementById(id);

export class SamplePanel {
  constructor(onBank, onLane) {
    this.onBank = onBank;
    this.lane = $('sample-lane'); this.divisions = $('slice-count'); this.status = $('sample-status');
    this.preview = $('preview-segment'); this.audio = new Audio(); this.audio.volume = .55;
    this.bank = null; this.raw = null; this.job = null;
    this.supportsCapture = Boolean(navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder);
    $('video-url').oninput = () => this.refresh();
    $('open-video').onclick = () => window.open(youtubeVideo($('video-url').value), '_blank', 'noopener,noreferrer');
    $('capture-video').onclick = () => this.importSample();
    $('cancel-capture').onclick = () => { this.job?.abort(); this.job = null; this.refresh(); this.showStatus(); };
    $('audio-file').onchange = event => {
      const file = event.target.files[0]; event.target.value = '';
      if (file) this.importSample(file);
    };
    this.divisions.onchange = () => { if (this.raw) this.slice(); };
    this.lane.onchange = () => { onLane(this.lane.value); this.showStatus(); };
    this.preview.onclick = async () => {
      if (!this.audio.paused) { this.stopPreview(); return; }
      try { await this.audio.play(); } catch { this.status.textContent = 'Preview could not start. Try again.'; }
    };
    this.audio.onplay = () => { this.preview.textContent = 'Stop preview'; };
    this.audio.onpause = this.audio.onended = () => { this.preview.textContent = 'Preview'; };
    $('clear-sample').onclick = () => this.clear();
    this.refresh(); this.showStatus();
  }
  refresh() {
    const valid = Boolean(youtubeVideo($('video-url').value));
    $('open-video').disabled = Boolean(this.job) || !valid;
    $('capture-video').disabled = Boolean(this.job) || !valid || !this.supportsCapture;
    $('video-url').disabled = Boolean(this.job); $('capture-seconds').disabled = Boolean(this.job);
    $('audio-file').disabled = Boolean(this.job);
    $('cancel-capture').hidden = !this.job;
    $('video-hint').textContent = !this.supportsCapture ? 'For tab capture, open Orbit in desktop Chrome or Edge. You can load an audio file here.'
      : $('video-url').value && !valid ? 'Enter a YouTube video link, such as a watch, Shorts or youtu.be URL.'
      : 'Open the video and play the passage. Return here, choose Capture, then select its tab with Share tab audio enabled.';
    this.preview.disabled = !this.bank; $('clear-sample').disabled = !this.bank;
  }
  stopPreview() { this.audio.pause(); this.audio.currentTime = 0; }
  showStatus() {
    this.status.textContent = this.bank ? this.name + ' · ' + this.bank.starts.length + ' slices on ' + this.lane.selectedOptions[0].text + '.' : 'No sample loaded.';
  }
  slice() {
    this.bank = makeBank(this.raw, 24000, Number(this.divisions.value));
    $('slice-index').textContent = ''; this.onBank(this.bank); this.showStatus();
  }
  clear() {
    this.job?.abort(); this.job = null; this.stopPreview();
    this.raw = null; this.bank = null; this.onBank(null); this.audio.removeAttribute('src');
    if (this.previewURL) URL.revokeObjectURL(this.previewURL);
    this.previewURL = null; $('slice-index').textContent = ''; this.refresh(); this.showStatus();
  }
  async importSample(file) {
    if (this.job) return;
    const job = new AbortController(); this.job = job; this.stopPreview(); this.refresh();
    const seconds = Number($('capture-seconds').value);
    try {
      let blob = file;
      if (file && file.size > 48 * 1024 * 1024) throw Error('Choose a file smaller than 48 MB.');
      if (!file) {
        if (!youtubeVideo($('video-url').value)) throw Error('Enter a YouTube video link first.');
        this.status.textContent = 'Select the playing video tab and enable tab audio.';
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video:{displaySurface:'browser'}, audio:true, selfBrowserSurface:'exclude', systemAudio:'exclude', monitorTypeSurfaces:'exclude'
        });
        if (this.job === job) this.status.textContent = 'Capturing ' + seconds + ' seconds of tab audio…';
        blob = await captureAudio(stream, seconds, job.signal);
      }
      job.signal.throwIfAborted(); this.status.textContent = 'Finding slice starts…';
      const raw = await decodeClip(blob, seconds);
      job.signal.throwIfAborted();
      this.raw = raw; this.name = file?.name || 'YouTube capture';
      if (this.previewURL) URL.revokeObjectURL(this.previewURL);
      this.previewURL = URL.createObjectURL(previewWav(raw, 24000)); this.audio.src = this.previewURL;
      this.slice();
    } catch (error) {
      if (!job.signal.aborted) this.status.textContent = error.name === 'NotAllowedError'
        ? 'Tab sharing was cancelled or unavailable. Try again or load a file.' : error.message || 'Audio import failed.';
    } finally { if (this.job === job) { this.job = null; this.refresh(); } }
  }
}
