// A loading thread: runs boot.js jobs and hands the arrays back.
import { run, buffers } from './boot.js';
self.onmessage = (e) => {
  const r = run(e.data.job);
  self.postMessage({ id: e.data.id, r }, buffers(r));
};
