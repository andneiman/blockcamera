/* global URL, navigator, window, document */

const els = {
  panelInit: document.getElementById("panelInit"),
  panelPreview: document.getElementById("panelPreview"),
  panelLoading: document.getElementById("panelLoading"),
  panelResult: document.getElementById("panelResult"),
  initText: document.getElementById("initText"),
  initHint: document.getElementById("initHint"),
  btnEnable: document.getElementById("btnEnable"),
  btnShot: document.getElementById("btnShot"),
  btnFlip: document.getElementById("btnFlip"),
  video: document.getElementById("video"),
  canvas: document.getElementById("canvas"),
  resultImg: document.getElementById("resultImg"),
};

let stream = null;
let facingMode = "environment"; // "user" | "environment"

function qs() {
  const p = new URLSearchParams(window.location.search);
  return {
    facing: p.get("facing"), // user|environment
    postMessage: p.get("postMessage") !== "0",
    targetOrigin: p.get("targetOrigin") || "*",
    minLoadingMs: Math.max(0, Number(p.get("minLoadingMs") || "650") || 0),
    jpegQuality: Math.min(0.98, Math.max(0.5, Number(p.get("jpegQuality") || "0.92") || 0.92)),
  };
}

const opts = qs();
if (opts.facing === "user" || opts.facing === "environment") facingMode = opts.facing;

function show(which) {
  const map = {
    init: els.panelInit,
    preview: els.panelPreview,
    loading: els.panelLoading,
    result: els.panelResult,
  };
  Object.values(map).forEach((n) => (n.hidden = true));
  map[which].hidden = false;
}

async function stopStream() {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
  stream = null;
}

async function startCamera() {
  els.btnEnable.hidden = true;
  els.initText.textContent = "Запрашиваем доступ к камере…";

  if (!navigator.mediaDevices?.getUserMedia) {
    els.initText.textContent = "Этот браузер не поддерживает доступ к камере.";
    els.initHint.textContent = "";
    return;
  }

  const constraints = {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  try {
    await stopStream();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    els.video.srcObject = stream;
    show("preview");
  } catch (e) {
    const name = e?.name || "Error";
    const msg = e?.message || String(e);

    // Some browsers require a user gesture to call getUserMedia.
    const gestureLikely = name === "NotAllowedError" || name === "SecurityError";

    if (window.isSecureContext !== true) {
      els.initText.textContent = "Нужен HTTPS (или localhost), чтобы включить камеру.";
      els.initHint.textContent = msg;
      return;
    }

    if (gestureLikely) {
      els.initText.textContent = "Нажми «Включить камеру», чтобы запросить доступ.";
      els.btnEnable.hidden = false;
      return;
    }

    els.initText.textContent = "Не удалось открыть камеру.";
    els.initHint.textContent = `${name}: ${msg}`;
  }
}

function waitForVideoReady(video) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return resolve();
    const onOk = () => {
      cleanup();
      if (video.videoWidth > 0 && video.videoHeight > 0) resolve();
      else reject(new Error("Video has no dimensions"));
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Video failed to load"));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onOk);
      video.removeEventListener("canplay", onOk);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener("loadedmetadata", onOk, { once: true });
    video.addEventListener("canplay", onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

function toJpegDataUrl(canvas, quality) {
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // fallback
    return canvas.toDataURL();
  }
}

async function takePhoto() {
  els.btnShot.disabled = true;
  els.btnFlip.disabled = true;

  try {
    await waitForVideoReady(els.video);

    show("loading");
    const startedAt = performance.now();

    const vw = els.video.videoWidth;
    const vh = els.video.videoHeight;
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas context unavailable");

    // Keep a portrait-ish output when possible, but preserve content.
    const outW = vw;
    const outH = vh;
    canvas.width = outW;
    canvas.height = outH;
    ctx.drawImage(els.video, 0, 0, outW, outH);

    const dataUrl = toJpegDataUrl(canvas, opts.jpegQuality);

    // Ensure visible loading even on fast devices.
    const elapsed = performance.now() - startedAt;
    const waitMs = Math.max(0, opts.minLoadingMs - elapsed);
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));

    await stopStream();

    // Result: show only an image block.
    els.resultImg.src = dataUrl;
    show("result");

    // Make it embed-friendly: notify parent window.
    if (opts.postMessage && window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "camera:image", dataUrl, mimeType: "image/jpeg" },
        opts.targetOrigin
      );
    }
  } catch (e) {
    show("init");
    els.initText.textContent = "Не получилось сделать фото. Попробуй ещё раз.";
    els.initHint.textContent = e?.message || String(e);
  } finally {
    els.btnShot.disabled = false;
    els.btnFlip.disabled = false;
  }
}

async function flipCamera() {
  facingMode = facingMode === "environment" ? "user" : "environment";
  show("init");
  await startCamera();
}

els.btnEnable.addEventListener("click", () => startCamera());
els.btnShot.addEventListener("click", () => takePhoto());
els.btnFlip.addEventListener("click", () => flipCamera());

// Start immediately to request permission on first open.
show("init");
startCamera();

// Clean up on page hide (e.g., iOS background / iframe navigation).
window.addEventListener("pagehide", () => stopStream());
