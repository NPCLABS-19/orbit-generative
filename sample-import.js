export function youtubeVideo(input) {
  let url;
  try {
    const text = input.trim();
    url = new URL(text.includes('://') ? text : 'https://' + text);
  } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id ?? '')) return null;
  const source = new URL('https://www.youtube.com/watch');
  source.searchParams.set('v', id);
  const time = url.searchParams.get('t') || url.searchParams.get('start');
  if (time && /^(?:\d+|(?:\d+h)?(?:\d+m)?(?:\d+s)?)$/.test(time)) source.searchParams.set('t', time);
  return source.href;
}

// Record only the audio track. getDisplayMedia requires a video track for the chooser.
export async function captureAudio(stream, seconds, signal) {
  const tracks = stream.getAudioTracks();
  try {
    signal.throwIfAborted();
    if (!tracks.length) throw Error('No tab audio was shared. Select the playing YouTube tab and enable Share tab audio.');
    const recorder = new MediaRecorder(new MediaStream(tracks));
    return await new Promise((resolve, reject) => {
      const chunks = [];
      const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      const timer = setTimeout(stop, seconds * 1000);
      const cleanup = () => {
        clearTimeout(timer); signal.removeEventListener('abort', stop);
        for (const t of stream.getTracks()) t.removeEventListener('ended', stop);
      };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { cleanup(); reject(Error('The browser could not record tab audio. Try an audio file.')); };
      recorder.onstop = () => {
        cleanup();
        if (signal.aborted) reject(signal.reason);
        else if (!chunks.length) reject(Error('No audio was captured. Play the video and try again.'));
        else resolve(new Blob(chunks, { type: recorder.mimeType }));
      };
      signal.addEventListener('abort', stop, {once:true});
      for (const t of stream.getTracks()) t.addEventListener('ended', stop, {once:true});
      try { recorder.start(250); } catch (error) { cleanup(); reject(error); }
    });
  } finally { for (const track of stream.getTracks()) track.stop(); }
}

export async function decodeClip(blob, seconds) {
  const rate = 24000;
  const decoder = new OfflineAudioContext(1, 1, rate);
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  const count = Math.min(decoded.length, rate * seconds);
  const pcm = new Float32Array(count);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < count; i++) pcm[i] += data[i] / decoded.numberOfChannels;
  }
  const start = pcm.findIndex(n => Math.abs(n) > .001);
  if (start < 0 || count - start < rate * .16) throw Error('The passage was silent or too short. Play the source and capture again.');
  return pcm.subarray(Math.max(0, start - 120));
}

export function previewWav(pcm, rate) {
  const bytes = new ArrayBuffer(44 + 2 * pcm.length), view = new DataView(bytes);
  const write = (offset, text) => [...text].forEach((c,i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + 2 * pcm.length, true); write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, 2 * rate, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
  return new Blob([bytes], {type:'audio/wav'});
}
