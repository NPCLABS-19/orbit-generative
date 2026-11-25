import { padPoint, padVoices, quadrant } from './performance.js';

export class TouchPad {
  constructor(surface, onChange, onPlay) {
    this.surface = surface;
    this.onChange = onChange;
    this.onPlay = onPlay;
    this.buttons = [...surface.querySelectorAll('[data-zone]')];
    this.dot = document.getElementById('pad-dot');
    this.readout = document.getElementById('pad-readout');
    this.pointer = null;
    this.buttons.forEach((button, i) => {
      button.onclick = event => {
        if (event.detail === 0) this.perform(i % 2 ? .75 : .25, i < 2 ? .25 : .75, .5);
      };
      button.onkeydown = event => {
        const directions = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
        const move = directions[event.key];
        if (!move) return;
        event.preventDefault();
        const p = this.point ?? { x: i % 2 ? .75 : .25, y: i < 2 ? .25 : .75 };
        const amount = event.shiftKey ? .15 : .04;
        this.perform(p.x + move[0] * amount, p.y + move[1] * amount, .5);
        this.buttons[quadrant(this.point)].focus({preventScroll:true});
      };
    });
    const fromPointer = event => {
      const rect = surface.getBoundingClientRect();
      this.perform((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height,
        event.pointerType === 'mouse' || !event.pressure ? .5 : event.pressure);
    };
    surface.onpointerdown = event => {
      if (this.pointer !== null || event.button !== 0) return;
      this.pointer = event.pointerId; surface.setPointerCapture(event.pointerId);
      surface.classList.add('touching'); fromPointer(event);
    };
    surface.onpointermove = event => { if (this.pointer === event.pointerId) fromPointer(event); };
    const end = event => {
      if (this.pointer !== event.pointerId) return;
      this.pointer = null; surface.classList.remove('touching');
    };
    surface.onpointerup = surface.onpointercancel = surface.onlostpointercapture = end;
  }
  perform(x, y, pressure) {
    const point = padPoint(x, y, pressure);
    this.display(point); this.onChange(point); this.onPlay();
  }
  display(point) {
    this.point = point;
    const active = point ? quadrant(point) : -1;
    this.buttons.forEach((b,i) => b.setAttribute('aria-pressed', String(i === active)));
    this.dot.hidden = !point;
    if (point) {
      this.dot.style.left = point.x * 100 + '%'; this.dot.style.top = point.y * 100 + '%';
      this.dot.style.setProperty('--force', .85 + point.pressure * .45);
      this.readout.textContent = padVoices[active].name + ' · ' + Math.round(point.x * 100) + '% drive · ' + Math.round((1-point.y) * 100) + '% lift';
    } else this.readout.textContent = 'Touch to play. Drag right for drive, up for lift.';
  }
}
