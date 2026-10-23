// Loading threads: a few workers sharing out boot.js jobs, so the mountain is worked out on
// every core at once. Without workers the jobs run here in turn.
import { run } from './boot.js';
import { PARK_ID } from './course.js';

export class Pool {
  constructor(n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    this.workers = [];
    this.waiting = new Map();
    this.queue = [];
    this.id = 0;
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./bootWorker.js', import.meta.url), { type: 'module', name: 'park=' + PARK_ID });
        w.busy = false;
        w.onmessage = (e) => { w.busy = false; const f = this.waiting.get(e.data.id); (window.__jobs ??= []).push([f.job.kind, Math.round(e.data.ms), Math.round(e.data.at - performance.timeOrigin), i]); this.waiting.delete(e.data.id); f.res(e.data.r); this.pump(); };
        w.onerror = (e) => { w.busy = false; w.dead = true; console.warn('loading thread', e.message); this.pump(); };
        this.workers.push(w);
      }
    } catch { this.workers = []; }
  }

  // a job's result (a promise); the jobs go out to whichever thread is free first
  job(job) {
    if (!this.workers.length) return new Promise((res) => setTimeout(() => res(run(job)), 0));
    return new Promise((res, rej) => { const id = ++this.id; this.waiting.set(id, { res, rej, job }); this.queue.push(id); this.pump(); });
  }

  pump() {
    for (const w of this.workers) {
      if (w.busy || w.dead || !this.queue.length) continue;
      const id = this.queue.shift();
      w.busy = true;
      w.postMessage({ id, job: this.waiting.get(id).job });
    }
    // every thread failed: do the rest here
    if (this.queue.length && this.workers.every((w) => w.dead)) {
      for (const id of this.queue.splice(0)) { const f = this.waiting.get(id); this.waiting.delete(id); try { f.res(run(f.job)); } catch (e) { f.rej(e); } }
    }
  }

  close() { for (const w of this.workers) w.terminate(); this.workers = []; }
}
