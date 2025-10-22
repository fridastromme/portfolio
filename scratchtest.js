const stackEl = document.getElementById('scratchStack');
const layers = Array.from(stackEl.querySelectorAll('.scratch-layer'));

const BRUSH_RADIUS = 28;       // skraperadius (CSS px)
const REVEAL_THRESHOLD = 0.1;  // 10 % må skrapes for å låse opp neste lag

// ——— Last to egendefinerte fonter ———
// Bytt ut URL-ene under med dine faktiske fontfiler
const primaryFontFace   = new FontFace('PrimaryFont',   "url('/fonts/Mott-Regular.woff') format('woff')");
const secondaryFontFace = new FontFace('SecondaryFont', "url('/fonts/Graphik-Regular.woff') format('woff')");

// DPR-hjelper
const DPR = () => Math.max(1, window.devicePixelRatio || 1);

// Last alle overlay-bilder fra data-overlay
const overlayImages = layers.map(cv => {
  const src = cv.dataset.overlay;
  if (!src) return null;
  const img = new Image();
  img.src = src;
  return img;
});

// Vent (best effort) på bilder + fonter før init
Promise.allSettled([
  ...overlayImages.map(img => img?.decode?.() ?? Promise.resolve()),
  primaryFontFace.load(),
  secondaryFontFace.load()
]).then(() => {
  document.fonts.add(primaryFontFace);
  document.fonts.add(secondaryFontFace);
}).finally(init);

function init() {
  const state = layers.map((canvas, i) => initLayer(canvas, overlayImages[i]));

  // Resize alle lag når vinduet endrer seg
  const onResize = () => state.forEach(s => s.resize());
  window.addEventListener('resize', onResize);
  onResize();

  // Pekehendelser (delegert til topp-aktive laget)
  stackEl.addEventListener('pointerdown', pointerDown);
  stackEl.addEventListener('pointermove', pointerMove);
  stackEl.addEventListener('pointerup', pointerUp);

  function activeIndex() {
    // sist i DOM = øverst visuelt
    for (let i = state.length - 1; i >= 0; i--) {
      if (!state[i].unlocked) return i;
    }
    return -1;
  }

  function pointerDown(e) {
    const i = activeIndex(); if (i < 0) return;
    const layer = state[i];
    if (layer.unlocked) return;
    layer.isDrawing = true;

    // Optional/trygg capture – kun hvis treff på det canvaset
    if (e.target === layer.canvas && layer.canvas.setPointerCapture) {
      try { layer.canvas.setPointerCapture(e.pointerId); } catch(_) {}
    }

    scratchAt(layer, e);
    throttledCheck(layer);
  }

  function pointerMove(e) {
    const i = activeIndex(); if (i < 0) return;
    const layer = state[i];
    if (!layer.isDrawing || layer.unlocked) return;
    scratchAt(layer, e);
    throttledCheck(layer);
  }

  function pointerUp() {
    const i = activeIndex(); if (i < 0) return;
    const layer = state[i];
    layer.isDrawing = false;
    if (!layer.unlocked && getRevealProgress(layer, 6) >= REVEAL_THRESHOLD) {
      unlockLayer(layer);
    }
  }

  function scratchAt(layer, e) {
    const { ctx, canvas } = layer;
    const { x, y } = getPos(canvas, e);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function throttledCheck(layer) {
    if (layer._raf) return;
    layer._raf = requestAnimationFrame(() => {
      layer._raf = null;
      const p = getRevealProgress(layer, 8); // stride 8 for OK ytelse
      if (p >= REVEAL_THRESHOLD) unlockLayer(layer);
    });
  }

  function unlockLayer(layer) {
    layer.unlocked = true;
    layer.canvas.classList.add('unlocked'); // fade ut + klikk gjennom
  }
}

// Init ett lag og tegn overlay + (valgfri) tekst m/bakgrunnsboks
function initLayer(canvas, overlayImg) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const layer = {
    canvas, ctx, overlayImg,
    isDrawing: false, unlocked: false, _raf: null,
    resize
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = DPR();
    canvas.width  = Math.round(rect.width  * scale);
    canvas.height = Math.round(rect.height * scale);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(scale, scale);
    drawOverlayWithText();
  }

  function drawOverlayWithText() {
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, rect.width, rect.height);

    // (1) Tegn bildet
    if (overlayImg && overlayImg.complete && overlayImg.naturalWidth > 0) {
      // Tegn bildet med "object-fit: cover"-logikk
const imgRatio = overlayImg.width / overlayImg.height;
const canvasRatio = rect.width / rect.height;
let drawWidth, drawHeight, offsetX, offsetY;

if (imgRatio > canvasRatio) {
  // Bildet er bredere enn canvas – fyll i høyden
  drawHeight = rect.height;
  drawWidth = imgRatio * rect.height;
  offsetX = (rect.width - drawWidth) / 2;
  offsetY = 0;
} else {
  // Bildet er høyere enn canvas – fyll i bredden
  drawWidth = rect.width;
  drawHeight = rect.width / imgRatio;
  offsetX = 0;
  offsetY = (rect.height - drawHeight) / 2;
}

ctx.drawImage(overlayImg, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      // Nøytral fallback uten tekst
      const g = ctx.createLinearGradient(0,0,rect.width,rect.height);
      g.addColorStop(0, '#2C3031'); g.addColorStop(1, '#1c1f20');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // (2) Tekst + bakgrunnsboks (valgfritt)
    let text = (canvas.dataset.text || '').trim();
    if (!text) return;

    // Valgfritt: maks antall tegn (kommenter inn ved behov)
    // const MAX_CHARS = 200;
    // if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '…';

    const size    = parseInt(canvas.dataset.textSize || '32', 10);
    const align   = (canvas.dataset.textAlign || 'left').toLowerCase(); // venstre som default
    const yPct    = parseFloat(canvas.dataset.textY || '50');           // 0..100 %
    const maxW    = parseInt(canvas.dataset.textMax || Math.floor(rect.width * 0.8), 10);
    const pad     = parseInt(canvas.dataset.textPad || '24', 10);       // standard padding 24px
    const bgColor = canvas.dataset.textBg || '#F9EF96';                 // standard gul bakgrunn
    const fontKey = (canvas.dataset.font || 'secondary').toLowerCase();
    const fontFam = fontKey === 'primary' ? 'PrimaryFont' : 'SecondaryFont';

    ctx.save();
    ctx.font = `700 ${size}px "${fontFam}", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = (align === 'left') ? 'left' : (align === 'right') ? 'right' : 'center';

    const lineHeight = Math.round(size * 1.25);
    const { lines, blockWidth } = measureWrappedLines(ctx, text, maxW);
    const blockHeight = lines.length * lineHeight;

    // Vertikal posisjon
    const y = (yPct / 100) * rect.height;

    // Horisontal posisjon:
    // - venstrejustert: 10% inn fra venstre
    // - høyrejustert:   10% inn fra høyre
    // - center:         midten
    const marginPct = 0.10; // 10% margin
    const x = (align === 'left')
      ? rect.width * marginPct
      : (align === 'right')
        ? rect.width * (1 - marginPct)
        : rect.width / 2;

    // Bakgrunnsboks bak teksten
    const boxX = (align === 'left')
      ? x
      : (align === 'right')
        ? x - blockWidth
        : x - blockWidth / 2;
    const boxY = y - blockHeight / 2;

    drawRoundedRect(
      ctx,
      boxX - pad,
      boxY - pad,
      blockWidth + pad * 2,
      blockHeight + pad * 2,
      10,
      bgColor
    );

    // Tekstfarge: svart, ingen skygge
    ctx.fillStyle = '#000000';

    // Tegn linjene
    let cy = y - blockHeight / 2 + lineHeight / 2;
    for (const line of lines) {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
    }

    ctx.restore();
  }

  return layer;
}

// ——— Tekstwrap + hjelpefunksjoner ———
function measureWrappedLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  let widest = 0;

  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    const w = ctx.measureText(test).width;
    if (w <= maxWidth) {
      line = test;
      widest = Math.max(widest, w);
    } else {
      if (line) lines.push(line);
      line = words[i];
      widest = Math.max(widest, ctx.measureText(line).width);
    }
  }
  if (line) {
    lines.push(line);
    widest = Math.max(widest, ctx.measureText(line).width);
  }
  return { lines, blockWidth: Math.ceil(widest) };
}

function drawRoundedRect(ctx, x, y, w, h, r, fillStyle) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y,     x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x,     y + h, radius);
  ctx.arcTo(x,     y + h, x,     y,     radius);
  ctx.arcTo(x,     y,     x + w, y,     radius);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function getPos(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x, y };
}

// Sample alfakanalen – anslå hvor mye som er avslørt (0..1)
function getRevealProgress(layer, stride = 8) {
  const { ctx, canvas } = layer;
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let samples = 0, cleared = 0;
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const a = data[(y * w + x) * 4 + 3];
      samples++; if (a === 0) cleared++;
    }
  }
  return cleared / samples;
}


const lyd = document.getElementById("lyd");

// Spill første gang brukeren interagerer (f.eks. ved å starte scratch)
window.addEventListener("pointerdown", () => {
  lyd.play().catch(() => {}); // ignorer feil hvis ikke støttet
}, { once: true }); // bare første gang