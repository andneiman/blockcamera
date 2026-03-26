/* global URL, navigator, window, document */

const els = {
  btnShot: document.getElementById("btnShot"),
  video: document.getElementById("video"),
  canvas: document.getElementById("canvas"),
  resultImg: document.getElementById("resultImg"),
  overlay: document.getElementById("overlay"),
  overlayText: document.getElementById("overlayText"),
};

let stream = null;
let facingMode = "environment"; // "user" | "environment"
let resetHoldTimer = null;

function qs() {
  const p = new URLSearchParams(window.location.search);
  return {
    facing: p.get("facing"), // user|environment
    postMessage: p.get("postMessage") !== "0",
    targetOrigin: p.get("targetOrigin") || "*",
    jpegQuality: Math.min(0.98, Math.max(0.5, Number(p.get("jpegQuality") || "0.92") || 0.92)),
  };
}

const opts = qs();
if (opts.facing === "user" || opts.facing === "environment") facingMode = opts.facing;

function showOverlay(text, hint = "") {
  els.overlayText.textContent = text;
  els.overlay.hidden = false;
}

function hideOverlay() {
  els.overlay.hidden = true;
}

async function stopStream() {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
  stream = null;
}

async function startCamera() {
  els.btnShot.disabled = true;
  els.resultImg.hidden = true;
  hideOverlay();

  if (!navigator.mediaDevices?.getUserMedia) {
    showOverlay("Этот браузер не поддерживает доступ к камере.", "");
    els.btnShot.disabled = false;
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
    // Help iOS/Safari avoid showing play UI; muted+playsinline is required.
    try {
      els.video.muted = true;
      els.video.playsInline = true;
      els.video.setAttribute("playsinline", "");
      els.video.setAttribute("webkit-playsinline", "");
      els.video.disablePictureInPicture = true;
      await els.video.play().catch(() => {});
    } catch {}
    hideOverlay();
    els.btnShot.disabled = false;
  } catch (e) {
    const name = e?.name || "Error";
    const msg = e?.message || String(e);

    if (window.isSecureContext !== true) {
      showOverlay("");
      els.btnShot.disabled = false;
      return;
    }

    // In some browsers getUserMedia needs a user gesture.
    const gestureLikely = name === "NotAllowedError" || name === "SecurityError";
    if (gestureLikely) {
      showOverlay("");
      els.btnShot.disabled = false;
      return;
    }

    showOverlay("");
    els.btnShot.disabled = false;
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

  try {
    // Single-button UI: if camera isn't running yet, try to start it.
    if (!stream) {
      await startCamera();
      return;
    }

    await waitForVideoReady(els.video);

    const vw = els.video.videoWidth;
    const vh = els.video.videoHeight;
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas context unavailable");

    const outW = vw;
    const outH = vh;
    canvas.width = outW;
    canvas.height = outH;
    ctx.drawImage(els.video, 0, 0, outW, outH);

    const dataUrl = toJpegDataUrl(canvas, opts.jpegQuality);

    await stopStream();

    els.resultImg.src = dataUrl;
    els.resultImg.hidden = false;
    hideOverlay();

    // Make it embed-friendly: notify parent window.
    if (opts.postMessage && window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "camera:image", dataUrl, mimeType: "image/jpeg" },
        opts.targetOrigin
      );
    }
  } catch (e) {
    showOverlay("");
  } finally {
    els.btnShot.disabled = false;
  }
}

async function resetToCamera() {
  els.resultImg.hidden = true;
  els.resultImg.src = "";
  hideOverlay();
  await startCamera();
}

els.btnShot.addEventListener("click", () => takePhoto());

function clearResetHoldTimer() {
  if (resetHoldTimer) window.clearTimeout(resetHoldTimer);
  resetHoldTimer = null;
}

function armResetHold() {
  clearResetHoldTimer();
  resetHoldTimer = window.setTimeout(() => {
    resetHoldTimer = null;
    resetToCamera();
  }, 3000);
}

// Long press on the photo for 3s -> restart camera.
els.resultImg.addEventListener("pointerdown", (e) => {
  if (els.resultImg.hidden) return;
  els.resultImg.setPointerCapture?.(e.pointerId);
  armResetHold();
});
["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach((ev) => {
  els.resultImg.addEventListener(ev, () => clearResetHoldTimer());
});

// Start immediately to request permission on first open.
startCamera();

// Clean up on page hide (e.g., iOS background / iframe navigation).
window.addEventListener("pagehide", () => stopStream());
