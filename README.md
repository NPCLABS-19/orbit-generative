# Orbit generative music

A generative music instrument for the browser. [Play Orbit on GitHub Pages](https://npclabs-19.github.io/orbit-generative/).

## Run and test

```sh
npm start
# Open http://127.0.0.1:4180
npm test
```

No npm dependencies or build step. Python 3 serves static files; Node runs audio validation. A current browser with AudioWorklet support is required. Localhost supplies the secure context the worklet requires.

## The three worlds

- **Tape garden:** warm analog electronica, loose broken drums, detuned chords and slower melodic fragments. Default 88 BPM.
- **Night transit:** melodic house, four-to-the-floor kick, offbeat bass, extended chords and arpeggiated plucks. Default 124 BPM.
- **Pressure system:** hard techno, distorted kicks, rumble, busy hats and short FM stabs. Default 152 BPM.

Every mode has the same mixer, including a dedicated 808 sub level, and the same melody controls. Shared Volume and Effect fade utilities appear in all modes. Each mode remembers its settings while switching. Effect changes use a smoothed transition; same-mode variation changes crossfade over the selected time. Genre switches use a short 90 ms transition. Pausing closes a separate playback gate, independent of volume.

Music is generated in an AudioWorklet rather than a main-thread JavaScript timer. The original DSP is also imported directly by Node tests, so rendered tests exercise the same synthesis and sequencer used live. Each composer carries pitch, rhythm and harmony forward across bars. Tape garden uses long question-and-answer contours. Night transit mutates a small arpeggio cell. Pressure system evolves its pitch and timing cells independently. Fresh page sessions start with fresh seeds. Hold explicitly repeats the current melodic bar.

## Editing the sequence

Generate writes the next bar as playback advances. Click a step to capture the displayed groove and edit its four onset rows. Arrow keys move between steps, and Space toggles a step. Edit holds the rhythm while pitches continue evolving. Shuffle varies the selected pattern every two bars and preserves each lane’s hit count. Each genre has two built-in presets. Named groove presets are saved in this browser.

## Melody pad and phrasing

Touch the pad to start. Bloom plays ringing intervals, Cascade adds ascending pulses, Undertow gives low, spaced answers, and Fracture plays clipped syncopation. Dragging right changes drive and articulation. Moving up raises and brightens the lead. Pressure changes accents on devices that report it. Arrow keys nudge the position and Shift makes larger moves. Release pad returns to the underlying phrase. Edited grid rhythms remain playable in all four quadrants.

Each genre remembers its own phrase form, motif length (3–9 notes), density, variation and octave for the session. Call and response mirrors the opening motif, Additive phrase extends it one note at a time, and Interlocking lines plays two offset registers. Phrase controls apply when the next bar is composed. Pad gestures act on the next sixteenth. The 808 follows bass-row triggers with a tuned 31–62 Hz fundamental, pitch drop, glide and saturation. Bass controls the whole bass layer.

The pad’s range from sustained tones to clipped percussion takes its cue from the requested album. [Jon Hopkins, Immunity](https://jonhopkins.bandcamp.com/album/immunity-2)

## Importing samples

Paste a YouTube video link and open it at the passage you want. In desktop Chrome or Edge, choose Capture tab audio in Orbit, then pick the playing video tab and enable tab audio. Orbit records the selected 6, 12 or 24 seconds, finds slice starts and assigns the cuts to a sequencer row. A compatible local audio file can also supply the passage. Audio stays in the current tab and is cleared on reload.

An imported slice has a rhythmic attack and an overlapping granular tail. The lead remembers short calls and answers 10–28 seconds later on its own clock. Upper percussion rises and falls independently. The pad changes the next note immediately and gradually changes the surrounding levels and depth. The kick and 808 stay centered while the upper voices have independent positions and room sends.

Each row's menu can clear its hits or return it to the live generator. Other rows keep their settings, including their place in Shuffle.

## References

The existing [Orbit soundscape](https://npclabs-19.github.io/odyssey-soundscape/) informed the interface and control behavior. The user supplied [Technopolis by julienp on Dittytoy](https://dittytoy.net/ditty/eff498209d); its separate synth parts and shared effects bus informed the technical investigation. The composition and synthesis are original. The sampler starts empty.

GitHub Pages serves the studio from the root of the main branch.
