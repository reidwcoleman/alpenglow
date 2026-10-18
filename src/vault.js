// Saved runs for the Replays tab: the last five runs, plus any you keep, in IndexedDB.
// A run is its 30 Hz snapshots (one flat Float32Array), their times, the trick marks
// and enough about the rider to dress the stand-in again.
const DB = 'alpenglow', OS = 'runs', LAST = 5;

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(OS, mode);
    const out = fn(t.objectStore(OS));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  }));
}

// everything but the frames, newest first
export async function listRuns() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return all.map(({ frames, times, ...meta }) => meta).sort((a, b) => b.date - a.date);
  } catch { return []; }
}

export async function getRun(id) {
  try { return await tx('readonly', (s) => s.get(id)); } catch { return null; }
}

export async function saveRun(run) {
  try {
    await tx('readwrite', (s) => s.put(run));
    // only the newest five that nobody kept stay
    const list = await listRuns();
    const loose = list.filter((r) => !r.keep).slice(LAST);
    if (loose.length) await tx('readwrite', (s) => { for (const r of loose) s.delete(r.id); });
    return true;
  } catch { return false; }
}

export async function keepRun(id, keep) {
  try {
    const r = await getRun(id);
    if (!r) return;
    r.keep = keep;
    await tx('readwrite', (s) => s.put(r));
  } catch { /* storage off */ }
}

export async function deleteRun(id) {
  try { await tx('readwrite', (s) => s.delete(id)); } catch { /* storage off */ }
}
