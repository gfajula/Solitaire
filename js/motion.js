// v0.5
// Device motion / capability detection.
// Exposes results on window.motionProps so the Info overlay can display them.

const monochrome =
  matchMedia("(monochrome)").matches;

const lowPower =
  navigator.hardwareConcurrency <= 2;
const lowMemory =
  !!(navigator.deviceMemory && navigator.deviceMemory <= 2);
const monochromeDepth =
  window.matchMedia("(max-color: 2)").matches;
const reducedMotionQuery =
  window.matchMedia("(prefers-reduced-motion: reduce)");
const prefersReducedMotion = reducedMotionQuery.matches;

// Shared props bag. fps fills in async once measured.
window.motionProps = {
  monochrome,
  monochromeDepth,
  lowPower,
  lowMemory,
  prefersReducedMotion,
  hardwareConcurrency: navigator.hardwareConcurrency ?? null,
  deviceMemory: navigator.deviceMemory ?? null,
  fps: null,
};

// Live, like game.js's reducedMotionActive(): an OS change mid-session takes
// effect without a reload, so CSS and the JS animation guards never disagree.
function syncReducedMotion() {
  document.documentElement.classList.toggle("reduced-motion", reducedMotionQuery.matches);
  window.motionProps.prefersReducedMotion = reducedMotionQuery.matches;
}
syncReducedMotion();
reducedMotionQuery.addEventListener("change", syncReducedMotion);

// The probe is a diagnostic readout for the Info panel only. It deliberately
// drives nothing: sampling rAF is far too noisy to brand a device for the
// session (the old code did exactly that from a sample taken during the
// opening deal). prefers-reduced-motion is the signal the game acts on.
async function detectLowFPS(samples = 60) {
  return new Promise(resolve => {
    let frames = 0;
    let start = performance.now();

    function frame() {
      // A hidden tab throttles rAF to ~1fps; restart rather than record that.
      if (document.visibilityState !== "visible") {
        frames = 0;
        start = performance.now();
        requestAnimationFrame(frame);
        return;
      }

      frames++;

      if (frames >= samples) {
        const elapsed = performance.now() - start;
        resolve((frames / elapsed) * 1000);
        return;
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  });
}

// Runs on demand (game.js starts it when "Device info" is opened), and not
// until the tab is actually visible.
function whenVisible() {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise(resolve => {
    document.addEventListener("visibilitychange", function onChange() {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    });
  });
}

let fpsProbeRunning = false;

function measureFPS() {
  if (fpsProbeRunning) return;
  fpsProbeRunning = true;
  whenVisible()
    .then(detectLowFPS)
    .then(fps => {
      window.motionProps.fps = Math.round(fps);
      fpsProbeRunning = false;
      // Refresh the Info overlay if it's open / already built.
      if (typeof renderMotionInfo === 'function') renderMotionInfo();
    });
}

window.remeasureFPS = measureFPS;
