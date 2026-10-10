// v0.4
/* ====================================================================
   ConfettiEngine — transparent canvas confetti for the win moment.
   Multiple bursts from the bottom corners with physics (gravity, drag,
   spin), variety of shapes and a warm celebratory palette.
   ==================================================================== */

class ConfettiEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.running = false;
    this._rafId = null;
    this._showId = 0;
    this.dpr = 1;
    this.w = 0; this.h = 0;
    // Sizing a full-screen canvas is costly at load; defer until a show runs.
    window.addEventListener('resize', () => { if (this.running) this.resize(); });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.w = w; this.h = h;
  }

  clear() {
    this.particles = [];
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  }

  burst(x, y, opts = {}) {
    const count = opts.count ?? 80;
    const angle = opts.angle ?? -Math.PI / 2;
    const spread = opts.spread ?? Math.PI / 5;        // half-angle
    const speedMin = opts.speedMin ?? 14;
    const speedMax = opts.speedMax ?? 26;
    const palette = opts.palette ?? ConfettiEngine.PALETTE;

    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() * 2 - 1) * spread;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const shape = Math.random();
      const size = 6 + Math.random() * 8;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size,
        w: size * (0.6 + Math.random() * 0.8),
        h: size * (1.2 + Math.random() * 0.8),
        color: palette[(Math.random() * palette.length) | 0],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.45,
        // wobble
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.08 + Math.random() * 0.07,
        wobbleAmp: 0.5 + Math.random() * 1.2,
        // shape kind
        kind: shape < 0.45 ? 'rect' : shape < 0.7 ? 'strip' : shape < 0.88 ? 'circle' : 'triangle',
        // life — softened gravity + stronger air drag so particles
        // hang in the air long enough for the doubled-duration show.
        opacity: 1,
        gravity: 0.22 + Math.random() * 0.06,
        drag: 0.995,
      });
    }
    this._start();
  }

  celebrate() {
    this.resize();
    this.clear();
    // Every scheduled burst belongs to this show; stop() invalidates them so a
    // New Game mid-celebration doesn't rain over the fresh board.
    const show = ++this._showId;
    const later = (fn, ms) => setTimeout(() => {
      if (show === this._showId) fn();
    }, ms);
    const W = this.w, H = this.h;
    // Bumped from the original ~1.7s schedule to ~3.4s — each timed burst
    // is doubled, and per-particle physics are softened so confetti
    // lingers in the air long enough to overlap the new beats.
    const SCALE = 2;

    // Two big side bursts arcing inward
    this.burst(W * 0.05, H * 0.95, { count: 110, angle: -Math.PI / 2 + 0.55, spread: 0.35, speedMin: 22, speedMax: 36 });
    this.burst(W * 0.95, H * 0.95, { count: 110, angle: -Math.PI / 2 - 0.55, spread: 0.35, speedMin: 22, speedMax: 36 });

    // Center cannon a beat later
    later(() => {
      this.burst(W * 0.5, H * 0.95, { count: 140, angle: -Math.PI / 2, spread: 0.45, speedMin: 26, speedMax: 42 });
    }, 220 * SCALE);

    // Two more from the upper edges falling down
    later(() => {
      this.burst(W * 0.25, H * 0.95, { count: 90, angle: -Math.PI / 2 + 0.25, spread: 0.4, speedMin: 20, speedMax: 32 });
      this.burst(W * 0.75, H * 0.95, { count: 90, angle: -Math.PI / 2 - 0.25, spread: 0.4, speedMin: 20, speedMax: 32 });
    }, 600 * SCALE);

    // Gentle finishing sprinkle from the top
    later(() => {
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * W;
        this.burst(x, -10, { count: 1, angle: Math.PI / 2, spread: 0.6, speedMin: 4, speedMax: 9 });
      }
    }, 1100 * SCALE);

    // A final mid-air pop
    later(() => {
      this.burst(W * 0.5, H * 0.45, { count: 80, angle: -Math.PI / 2, spread: Math.PI, speedMin: 8, speedMax: 18 });
    }, 1700 * SCALE);

    // An extra rain to bridge the longer schedule
    later(() => {
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * W;
        this.burst(x, -10, { count: 1, angle: Math.PI / 2, spread: 0.7, speedMin: 3, speedMax: 8 });
      }
    }, 2600 * SCALE);
  }

  // rAF, not setInterval: vsync-aligned (no beat-frequency jank against the
  // display refresh) and the browser parks it in a hidden tab instead of
  // letting it tick on. The dt math already handles variable frame times.
  _start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / (1000 / 60), 2.2);
      last = now;
      this._update(dt);
      this._draw();
      if (!this.particles.length) {
        this.running = false;
        this._rafId = null;
        this.ctx.clearRect(0, 0, this.w, this.h);
        return;
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stop() {
    this._showId++; // cancels any burst still queued from the current show
    if (this._rafId !== null && this._rafId !== undefined) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.running = false;
    this.particles.length = 0;
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  _update(dt) {
    const wind = Math.sin(performance.now() / 1500) * 0.04;
    const live = [];
    for (const p of this.particles) {
      p.vx = p.vx * Math.pow(p.drag, dt) + wind * dt;
      p.vy = p.vy * Math.pow(p.drag, dt) + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.wobble += p.wobbleSpeed * dt;

      // Fade as they fall below or after they slow — halved fade
      // rate so settled particles linger about twice as long.
      if (p.y > this.h - 80) {
        p.opacity -= 0.012 * dt;
      }
      if (p.opacity > 0 && p.y < this.h + 60 && p.x > -80 && p.x < this.w + 80) {
        live.push(p);
      }
    }
    this.particles = live;
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
      const wobbleX = Math.cos(p.wobble) * p.wobbleAmp;
      ctx.translate(p.x + wobbleX, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      switch (p.kind) {
        case 'circle': {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'triangle': {
          const s = p.size * 0.7;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.86, s * 0.5);
          ctx.lineTo(-s * 0.86, s * 0.5);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'strip': {
          // a thin strip with a slight scale on Y to suggest flutter
          const sy = Math.cos(p.wobble * 1.4);
          ctx.scale(1, sy);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          // subtle highlight
          ctx.globalAlpha *= 0.45;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h / 3);
          break;
        }
        default: { // rect
          const sy = Math.cos(p.wobble);
          ctx.scale(1, sy);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
      }
      ctx.restore();
    }
  }
}

ConfettiEngine.PALETTE = [
  '#FFD166', // warm gold
  '#EF476F', // pink red
  '#06D6A0', // mint
  '#118AB2', // blue
  '#F78C6B', // peach
  '#C49AFF', // lilac
  '#FFFFFF', // bright white
  '#FF6B9D', // hot pink
  '#5BD0F0', // sky
  '#FAD02E', // sun yellow
];
