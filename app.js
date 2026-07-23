const PIN = "2407";

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

const fxCanvas = qs("#fx-canvas");
const starsCanvas = qs("#stars-canvas");

let pendingTransition = null;
let didCelebrate = false;
let isUnlocked = false;
let starfield = null;
let pageAudio = null;
let currentAudioSrc = null;

// Filenames in /audio match each page that has a track
const PAGE_AUDIO = {
  gift1: "audio/home_page.mp3",
  gift2: "audio/gift_page_2.mp3",
  letter: "audio/letter_page.mp3",
};

function ensurePageAudio() {
  if (pageAudio) return pageAudio;
  pageAudio = new Audio();
  pageAudio.preload = "auto";
  pageAudio.loop = true;
  pageAudio.volume = 0.85;
  return pageAudio;
}

function syncPageAudio(page) {
  const audio = ensurePageAudio();
  const src = PAGE_AUDIO[page] || null;

  if (!src) {
    audio.pause();
    audio.removeAttribute("src");
    currentAudioSrc = null;
    return;
  }

  if (currentAudioSrc !== src) {
    audio.pause();
    audio.src = src;
    currentAudioSrc = src;
    audio.load();
  }

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      // Autoplay can be blocked until a user gesture; unlock/nav clicks unlock it.
    });
  }
}

function resizeCanvasToDevicePixels(canvas) {
  const dpr = Math.max(1, Math.min(2.25, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, dpr, w: rect.width, h: rect.height };
}

function setHash(page) {
  location.hash = `#${page}`;
}

function getPageFromHash() {
  const h = (location.hash || "#lock").replace("#", "").trim();
  return h || "lock";
}

function getPageEl(page) {
  return qs(`.page[data-page="${page}"]`);
}

function getActivePageEl() {
  return qs(".page.is-active");
}

function applyEnterAnimation(el, transition) {
  el.classList.remove("anim-zoom-in", "anim-slide-in");
  if (transition === "slide") el.classList.add("anim-slide-in");
  else el.classList.add("anim-zoom-in");
}

function applyExitAnimation(el, transition) {
  el.classList.remove("anim-zoom-out", "anim-slide-out");
  if (transition === "slide") el.classList.add("anim-slide-out");
  else el.classList.add("anim-zoom-out");
}

function showPage(page, transition = "zoom") {
  const next = getPageEl(page);
  if (!next) return;

  const prev = getActivePageEl();
  if (prev === next) return;

  next.style.display = "block";
  next.classList.add("is-active");
  applyEnterAnimation(next, transition);

  if (prev) {
    applyExitAnimation(prev, transition);
    const cleanupPrev = () => {
      prev.classList.remove("is-active", "anim-zoom-out", "anim-slide-out");
      prev.style.display = "none";
      prev.removeEventListener("animationend", cleanupPrev);
    };
    prev.addEventListener("animationend", cleanupPrev, { once: true });
  }

  const cleanupNext = () => {
    next.classList.remove("anim-zoom-in", "anim-slide-in");
    next.removeEventListener("animationend", cleanupNext);
  };
  next.addEventListener("animationend", cleanupNext, { once: true });

  afterPageShown(page);
}

function afterPageShown(page) {
  // Stars only on gift2 + letter
  const shouldStars = page === "gift2" || page === "letter";
  if (shouldStars) startStars();
  else stopStars();

  syncPageAudio(page);

  if (page === "home" && !didCelebrate) {
    didCelebrate = true;
    startCelebrationBurst();
  }

  if (page === "lock") {
    const input = qs("#pin-input");
    if (input) setTimeout(() => input.focus(), 140);
  }
}

function handleRoute() {
  const page = getPageFromHash();
  if (!isUnlocked && page !== "lock") {
    pendingTransition = "zoom";
    setHash("lock");
    return;
  }
  const transition = pendingTransition || "zoom";
  pendingTransition = null;
  showPage(page, transition);
}

// -------------------------
// PIN logic
// -------------------------
function setupPin() {
  const form = qs("#pin-form");
  const input = qs("#pin-input");
  const err = qs("#pin-error");

  if (!form || !input || !err) return;

  const setError = (msg) => {
    err.textContent = msg;
    err.classList.remove("is-shake");
    // restart animation
    void err.offsetWidth;
    err.classList.add("is-shake");
  };

  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^\d]/g, "").slice(0, 4);
    if (err.textContent) err.textContent = "";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = (input.value || "").trim();
    if (val === PIN) {
      err.textContent = "";
      isUnlocked = true;
      pendingTransition = "zoom";
      setHash("home");
      return;
    }
    input.value = "";
    setError("I thing you dont know the secret😶‍🌫️");
    input.focus();
  });
}

// -------------------------
// Navigation buttons
// -------------------------
function setupNav() {
  const goGift = qs("#go-gift");
  const goLetter = qs("#go-letter");
  const giftNext = qs("#gift-next");

  if (goGift) {
    goGift.addEventListener("click", () => {
      pendingTransition = "zoom";
      setHash("gift1");
    });
  }
  if (goLetter) {
    goLetter.addEventListener("click", () => {
      pendingTransition = "zoom";
      setHash("letter");
    });
  }
  if (giftNext) {
    giftNext.addEventListener("click", () => {
      pendingTransition = "slide";
      setHash("gift2");
    });
  }

  qsa("[data-home-fab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingTransition = "zoom";
      setHash("home");
    });
  });
}

// -------------------------
// Celebration FX (confetti + swirl + wrinkle ribbons)
// -------------------------
function startCelebrationBurst() {
  fxCanvas.classList.add("is-on");
  const { ctx, w, h } = resizeCanvasToDevicePixels(fxCanvas);

  const now = () => performance.now();
  const start = now();
  const durationMs = 5200;

  const colors = [
    "#ff7aa7",
    "#ffd1dc",
    "#b6e1ff",
    "#fff2b5",
    "#d7b7ff",
    "#ffffff",
  ];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const particles = [];
  const emit = (count, mode = "burst") => {
    for (let i = 0; i < count; i++) {
      const kindRoll = Math.random();
      const kind = kindRoll < 0.52 ? "confetti" : kindRoll < 0.78 ? "swirl" : "ribbon";
      const angle = rand(-Math.PI * 0.9, -Math.PI * 0.1);
      const speed = mode === "burst" ? rand(520, 980) : rand(220, 520);
      const vx = Math.cos(angle) * speed * rand(0.75, 1.15);
      const vy = Math.sin(angle) * speed * rand(0.75, 1.15);
      particles.push({
        x: w * 0.5 + rand(-18, 18),
        y: h * 0.58 + rand(-10, 10),
        vx,
        vy,
        g: rand(700, 1200),
        rot: rand(0, Math.PI * 2),
        rotV: rand(-9, 9),
        size: rand(6, 16),
        life: rand(0.75, 1.25),
        born: now(),
        color: pick(colors),
        kind,
        wobble: rand(0, Math.PI * 2),
        curl: rand(0.25, 0.9),
      });
    }
  };

  emit(Math.floor(Math.min(220, 120 + (w * h) / 9000)), "burst");
  setTimeout(() => emit(70, "drift"), 280);
  setTimeout(() => emit(55, "drift"), 900);

  let lastT = now();
  function frame() {
    const t = now();
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = (t - p.born) / 1000;
      if (age > p.life) {
        particles.splice(i, 1);
        continue;
      }

      // motion
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
      p.wobble += dt * rand(4.2, 7.4);

      // fade + subtle depth
      const fade = 1 - age / p.life;
      const alpha = Math.max(0, Math.min(1, fade));

      ctx.save();
      ctx.translate(p.x, p.y);

      if (p.kind === "swirl") {
        ctx.rotate(p.rot * 0.2);
        ctx.globalAlpha = alpha * 0.75;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.2;
        const r = p.size * 0.95;
        ctx.beginPath();
        for (let s = 0; s < 12; s++) {
          const a = (s / 11) * Math.PI * 2;
          const rr = r * (0.35 + 0.65 * (s / 11));
          const xx = Math.cos(a + p.wobble) * rr;
          const yy = Math.sin(a + p.wobble) * rr * 0.55;
          if (s === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      } else if (p.kind === "ribbon") {
        // wrinkled ribbon strip
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha * 0.85;
        const w0 = p.size * 1.6;
        const h0 = p.size * 0.55;
        const wrinkles = 5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (let k = 0; k <= wrinkles; k++) {
          const u = k / wrinkles;
          const xx = (u - 0.5) * w0;
          const yy = Math.sin(u * Math.PI * 2 + p.wobble) * (h0 * p.curl);
          if (k === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        for (let k = wrinkles; k >= 0; k--) {
          const u = k / wrinkles;
          const xx = (u - 0.5) * w0;
          const yy = Math.sin(u * Math.PI * 2 + p.wobble) * (h0 * p.curl) + h0 * 0.95;
          ctx.lineTo(xx, yy);
        }
        ctx.closePath();
        ctx.fill();

        // highlight to fake depth
        ctx.globalAlpha = alpha * 0.25;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        // confetti
        const squish = 0.35 + 0.65 * Math.abs(Math.cos(p.rot));
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7 * squish, 4);
        ctx.fill();
      }

      ctx.restore();
    }

    const elapsed = t - start;
    if (elapsed < durationMs || particles.length) {
      requestAnimationFrame(frame);
      return;
    }

    fxCanvas.classList.remove("is-on");
    ctx.clearRect(0, 0, w, h);
  }

  requestAnimationFrame(frame);
}

// -------------------------
// Stars FX (gift2 + letter)
// -------------------------
class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.stars = [];
    this.raf = 0;
    this.lastT = 0;
  }

  resize() {
    const { ctx, w, h } = resizeCanvasToDevicePixels(this.canvas);
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    const count = Math.floor(Math.min(180, 90 + (w * h) / 9000));
    if (this.stars.length !== count) {
      this.stars = Array.from({ length: count }, () => this.makeStar());
    }
  }

  makeStar() {
    const r = Math.random();
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      z: 0.3 + Math.random() * 0.9,
      s: 0.8 + Math.random() * 1.9,
      tw: Math.random() * Math.PI * 2,
      sp: 0.2 + Math.random() * 0.8,
      dx: (r < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.2),
      dy: -0.3 + Math.random() * 0.9,
    };
  }

  start() {
    this.canvas.classList.add("is-on");
    this.resize();
    this.lastT = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.033, (t - this.lastT) / 1000);
      this.lastT = t;
      this.draw(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.classList.remove("is-on");
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  }

  draw(dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "lighter";

    for (const s of this.stars) {
      s.tw += dt * (1.0 + s.sp * 1.8);
      s.x += s.dx * dt * 12 * s.z;
      s.y += s.dy * dt * 12 * s.z;
      if (s.x < -20) s.x = this.w + 20;
      if (s.x > this.w + 20) s.x = -20;
      if (s.y < -20) s.y = this.h + 20;
      if (s.y > this.h + 20) s.y = -20;

      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(s.tw));
      const alpha = 0.12 + 0.55 * twinkle;
      const radius = s.s * (0.7 + 1.0 * twinkle);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // small sparkle cross
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x - radius * 1.7, s.y);
      ctx.lineTo(s.x + radius * 1.7, s.y);
      ctx.moveTo(s.x, s.y - radius * 1.7);
      ctx.lineTo(s.x, s.y + radius * 1.7);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function startStars() {
  if (!starfield) starfield = new Starfield(starsCanvas);
  starfield.start();
}

function stopStars() {
  if (starfield) starfield.stop();
}

// -------------------------
// Init
// -------------------------
function init() {
  setupPin();
  setupNav();

  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("resize", () => {
    resizeCanvasToDevicePixels(fxCanvas);
    if (starfield) starfield.resize();
  });

  // first route
  handleRoute();
}

// Safari/iOS roundRect fallback guard
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = typeof r === "number" ? r : 0;
    const radius = Math.max(0, Math.min(rr, Math.min(w, h) / 2));
    this.beginPath();
    this.moveTo(x + radius, y);
    this.lineTo(x + w - radius, y);
    this.quadraticCurveTo(x + w, y, x + w, y + radius);
    this.lineTo(x + w, y + h - radius);
    this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    this.lineTo(x + radius, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    return this;
  };
}

document.addEventListener("DOMContentLoaded", init);

