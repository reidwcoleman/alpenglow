// A loading thread: runs boot.js jobs and hands the arrays back.
import { run, buffers } from './boot.js';
self.onmessage = (e) => {
  const t = performance.now();
  const r = run(e.data.job);
  self.postMessage({ id: e.data.id, r, ms: performance.now() - t, at: performance.timeOrigin + t }, buffers(r));
};
