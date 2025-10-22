const canvas = document.getElementById("scratchCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const container = document.querySelector(".scratch-container");

const REVEAL_THRESHOLD = 0.2;   // 🔹 nå bare 20 %
const BRUSH_RADIUS = 40;

const overlayImg = new Image();
overlayImg.src = "images/mott bakgrunn 1.jpg"; // unngå mellomrom i filnavn

const customFont = new FontFace(
  "MottRegular",
  "url('/fonts/Mott-Regular.woff') format('woff')"
);

// Vent på bilde + font før første tegning
Promise.all([
  overlayImg.decode().catch(() => {}),
  customFont.load(),
]).then(([_, loadedFont]) => {
  document.fonts.add(loadedFont);
  resizeCanvas();
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  drawOverlay();
}

function drawOverlay() {
  const rect = canvas.getBoundingClientRect();
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Tegn overlay-bilde eller fallback-farge
  if (overlayImg.complete && overlayImg.naturalWidth > 0) {
    ctx.drawImage(overlayImg, 0, 0, rect.width, rect.height);
  } else {
    ctx.fillStyle = "#2C3031";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  // Tekst midt på canvas
  ctx.font = "bold 20em 'MottRegular'";
  ctx.fillStyle = "#2C3031";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("MOTL", rect.width / 2, rect.height / 2);
}

window.addEventListener("resize", resizeCanvas);

// Hjelpefunksjon: konverter museposisjon til canvas-koordinater
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

let isDrawing = false;

canvas.addEventListener("pointerdown", (e) => {
  if (container.classList.contains("unlocked")) return;
  isDrawing = true;
  canvas.setPointerCapture(e.pointerId);
  scratchAt(e);
  maybeCheckProgress();
});

canvas.addEventListener("pointermove", (e) => {
  if (!isDrawing || container.classList.contains("unlocked")) return;
  scratchAt(e);
  maybeCheckProgress();
});

canvas.addEventListener("pointerup", () => {
  isDrawing = false;
  if (!container.classList.contains("unlocked")) {
    const p = getRevealProgress(6);
    if (p >= REVEAL_THRESHOLD) unlock();
  }
});

function scratchAt(e) {
  const { x, y } = getPos(e);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------ */
/*      PROGRESS-MÅLING OG LÅS OPP VED 20 % AVSLØRT       */
/* ------------------------------------------------------ */

let rafId = null;
function maybeCheckProgress() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const p = getRevealProgress(8); // stride 8 for fart
    if (p >= REVEAL_THRESHOLD) unlock();
  });
}

function unlock() {
  container.classList.add("unlocked");
}

function getRevealProgress(stride = 8) {
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let samples = 0;
  let cleared = 0;
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = (y * w + x) * 4 + 3; // alfa
      samples++;
      if (data[i] === 0) cleared++;
    }
  }
  return cleared / samples;
}