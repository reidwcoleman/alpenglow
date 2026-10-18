// The shared server, on Firebase (project alpenglow-ski-reid):
//   accounts   every rider gets a guest account on first visit; an email + password keeps
//              the same rider (wallet, pass, locker, trick book) on any device
//   users/{uid}                 the cloud save of the profile (meta.js state)
//   names/{lower}               who owns a rider name
//   boards/{board}/scores/{uid} best score (or race time) per rider per board, all time
//                               and per week; the run itself sits in replays/{board}_{uid}
//   Realtime Database           live servers: /lobby/{server}/{uid} presence and
//                               /rooms/{server}/{s,h,e,race} for net.js
// The SDK loads in the background; the game never waits on it to start.
const CONFIG = {
  apiKey: 'AIzaSyDYGxo42Se28enWK9-pTEWjiKRBGGH5rOY',
  authDomain: 'alpenglow-ski-reid.firebaseapp.com',
  databaseURL: 'https://alpenglow-ski-reid-default-rtdb.firebaseio.com',
  projectId: 'alpenglow-ski-reid',
  storageBucket: 'alpenglow-ski-reid.firebasestorage.app',
  messagingSenderId: '178855160860',
  appId: '1:178855160860:web:25b5a32fbe74a4b12143d9',
};

// the public servers, one set per park
export const SERVERS = {
  yard: ['Yard 1', 'Yard 2', 'Yard 3'],
  slope: ['Trick Zone 1', 'Trick Zone 2'],
  forest: ['Forest 1', 'Forest 2'],
  bigair: ['Big Air 1', 'Big Air 2'],
};
export const serverId = (park, name) => (park + '-' + name.toLowerCase().replace(/[^a-z0-9]/g, '')).slice(0, 40);

// the week a score counts for (ISO-ish: Monday starts it)
export function weekKey(t = Date.now()) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// a replay squeezed for the server: 15 frames a second, positions as floats, the rest as
// 16-bit steps between each column's own min and max, then gzip
export async function packReplay(pk, SNAP_N) {
  const n0 = pk.times.length;
  const keep = [];
  let last = -1;
  for (let i = 0; i < n0; i++) if (pk.times[i] - last >= 1 / 15 - 1e-4 || i === n0 - 1) { keep.push(i); last = pk.times[i]; }
  const n = keep.length, C = SNAP_N;
  const lo = new Float32Array(C).fill(Infinity), hi = new Float32Array(C).fill(-Infinity);
  for (const i of keep) for (let c = 3; c < C; c++) { const v = pk.frames[i * C + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  const head = 8 + C * 8;
  const buf = new ArrayBuffer(head + n * 4 + n * 12 + n * (C - 3) * 2);
  const dv = new DataView(buf);
  dv.setUint32(0, n, true); dv.setUint32(4, C, true);
  for (let c = 0; c < C; c++) { dv.setFloat32(8 + c * 8, c < 3 ? 0 : lo[c], true); dv.setFloat32(12 + c * 8, c < 3 ? 0 : hi[c], true); }
  let o = head;
  for (const i of keep) { dv.setFloat32(o, pk.times[i], true); o += 4; }
  for (const i of keep) for (let c = 0; c < 3; c++) { dv.setFloat32(o, pk.frames[i * C + c], true); o += 4; }
  for (const i of keep) for (let c = 3; c < C; c++) {
    const r = hi[c] - lo[c];
    dv.setUint16(o, r > 0 ? Math.round(((pk.frames[i * C + c] - lo[c]) / r) * 65535) : 0, true); o += 2;
  }
  return gz(new Uint8Array(buf), 'CompressionStream');
}

export async function unpackReplay(bytes) {
  const u = await gz(bytes, 'DecompressionStream');
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const n = dv.getUint32(0, true), C = dv.getUint32(4, true);
  const lo = new Float32Array(C), hi = new Float32Array(C);
  for (let c = 0; c < C; c++) { lo[c] = dv.getFloat32(8 + c * 8, true); hi[c] = dv.getFloat32(12 + c * 8, true); }
  let o = 8 + C * 8;
  const times = new Float32Array(n), frames = new Float32Array(n * C);
  for (let i = 0; i < n; i++) { times[i] = dv.getFloat32(o, true); o += 4; }
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { frames[i * C + c] = dv.getFloat32(o, true); o += 4; }
  for (let i = 0; i < n; i++) for (let c = 3; c < C; c++) { frames[i * C + c] = lo[c] + (dv.getUint16(o, true) / 65535) * (hi[c] - lo[c]); o += 2; }
  // discrete fields (trick type, grab, flags) must come back as whole numbers
  for (let i = 0; i < n; i++) for (const c of [16, 17, 18, 30, 34, 35, 36, 38, 42, 43, 51]) if (c < C) frames[i * C + c] = Math.round(frames[i * C + c]);
  return { times, frames };
}

async function gz(bytes, kind) {
  if (typeof globalThis[kind] !== 'function') return bytes;
  const s = new Blob([bytes]).stream().pipeThrough(new globalThis[kind]('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
const fromB64 = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
export { toB64, fromB64 };

const ERR = {
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/invalid-email': 'That email does not look right.',
  'auth/weak-password': 'Use at least 6 characters for the password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection to the server.',
  'auth/credential-already-in-use': 'That email already has an account. Sign in instead.',
  taken: 'That rider name is taken.',
};
export const errText = (e) => ERR[e?.code ?? e?.message] ?? (e?.message || 'Something went wrong').replace(/^Firebase: /, '');

export class Cloud {
  constructor() {
    this.user = null;
    this.status = 'loading'; // loading | online | offline
    this.listeners = {};
    this.cache = new Map();
    // (the game loads first: the server's code waits till the mountain's up)
    this.go = new Promise((r) => { this.start = r; });
    this.ready = this.init().catch((e) => { console.warn('cloud', e); this.status = 'offline'; this.emit('status', this.status); return false; });
  }

  on(e, f) { (this.listeners[e] ??= []).push(f); }
  emit(e, d) { for (const f of this.listeners[e] ?? []) f(d); }

  async init() {
    await this.go;
    const [A, U, F, D] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/database')]);
    this.A = A; this.U = U; this.F = F; this.D = D;
    const app = (this.app = A.initializeApp(CONFIG));
    this.auth = U.getAuth(app);
    await U.setPersistence(this.auth, U.browserLocalPersistence).catch(() => {});
    this.fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
    this.db = D.getDatabase(app);
    // server clock offset, for races that start at the same moment everywhere
    D.onValue(D.ref(this.db, '.info/serverTimeOffset'), (s) => { this.skew = s.val() ?? 0; });
    D.onValue(D.ref(this.db, '.info/connected'), (s) => { this.live = !!s.val(); this.emit('live', this.live); });
    await new Promise((res) => {
      let first = true;
      U.onAuthStateChanged(this.auth, async (u) => {
        if (!u) { U.signInAnonymously(this.auth).catch((e) => { console.warn('guest sign-in', e); this.status = 'offline'; this.emit('status', this.status); res(); }); return; }
        this.user = u;
        this.status = 'online';
        this.emit('user', u);
        this.emit('status', this.status);
        if (first) { first = false; res(); }
      });
    });
    return true;
  }

  get uid() { return this.user?.uid ?? null; }
  get guest() { return !this.user || this.user.isAnonymous; }
  get email() { return this.user?.email ?? ''; }
  now() { return Date.now() + (this.skew ?? 0); }

  // ------------------------------------------------ accounts
  // a guest turns into an account (keeping everything), or a new account is made
  async signUp(email, pass) {
    await this.ready;
    const { U } = this;
    const cred = U.EmailAuthProvider.credential(email.trim(), pass);
    if (this.user?.isAnonymous) {
      const r = await U.linkWithCredential(this.user, cred);
      this.user = r.user;
      this.emit('user', r.user);
    } else await U.createUserWithEmailAndPassword(this.auth, email.trim(), pass);
    return this.user;
  }

  async signIn(email, pass) {
    await this.ready;
    const r = await this.U.signInWithEmailAndPassword(this.auth, email.trim(), pass);
    return r.user;
  }

  async signOut() { await this.ready; await this.U.signOut(this.auth); }

  async resetPassword(email) { await this.ready; await this.U.sendPasswordResetEmail(this.auth, email.trim()); }

  // ------------------------------------------------ the profile
  async loadProfile() {
    if (!(await this.ready) || !this.uid) return null;
    const { F } = this;
    try {
      const s = await F.getDoc(F.doc(this.fs, 'users', this.uid));
      return s.exists() ? s.data() : null;
    } catch (e) { console.warn('load profile', e); return null; }
  }

  // writes are bunched: the last state wins, at most one write every couple of seconds
  saveProfile(data) {
    this.pending = data;
    if (this.saveT) return;
    this.saveT = setTimeout(() => this.flush(), 1800);
  }

  async flush() {
    clearTimeout(this.saveT); this.saveT = null;
    const data = this.pending;
    this.pending = null;
    if (!data || !(await this.ready) || !this.uid) return;
    const { F } = this;
    try { await F.setDoc(F.doc(this.fs, 'users', this.uid), { ...data, updated: F.serverTimestamp() }); } catch (e) { console.warn('save profile', e); }
  }

  // a rider name is first come, first served
  async claimName(name, old) {
    if (!(await this.ready) || !this.uid) throw new Error('offline');
    const { F } = this;
    const key = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const oldKey = old?.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || key === oldKey) return name;
    await F.runTransaction(this.fs, async (tx) => {
      // (every read before any write)
      const ref = F.doc(this.fs, 'names', key);
      const oref = oldKey ? F.doc(this.fs, 'names', oldKey) : null;
      const s = await tx.get(ref);
      const os = oref ? await tx.get(oref).catch(() => null) : null;
      if (s.exists() && s.data().uid !== this.uid) throw new Error('taken');
      if (!s.exists()) tx.set(ref, { uid: this.uid, name });
      if (os?.exists() && os.data().uid === this.uid) tx.delete(oref);
    }).catch((e) => { throw e.message === 'taken' ? { code: 'taken' } : e; });
    return name;
  }

  // ------------------------------------------------ leaderboards
  // entry: { name, score | time, gear, jacket, level, best, park, date }; lower time wins on race boards
  async submit(board, entry, replay) {
    if (!(await this.ready) || !this.uid) return null;
    const { F } = this;
    const race = entry.time != null && entry.score == null;
    const better = (a, b) => (race ? a.time < b.time : a.score > b.score);
    const out = { allTime: false, week: false };
    for (const [b, key] of [[board, 'allTime'], [`${board}-w${weekKey()}`, 'week']]) {
      const ref = F.doc(this.fs, 'boards', b, 'scores', this.uid);
      try {
        const s = await F.getDoc(ref);
        if (s.exists() && !better(entry, s.data())) continue;
        const rid = replay ? `${board}_${this.uid}` : null;
        await F.setDoc(ref, { ...entry, uid: this.uid, rid, date: Date.now() });
        out[key] = true;
        this.cache.delete(b);
      } catch (e) { console.warn('submit', b, e); }
    }
    if ((out.allTime || out.week) && replay) {
      try {
        // (the all-time best's run; a weekly best that isn't the all-time one shares the slot)
        const bytes = await replay();
        if (bytes.length < 900000) await F.setDoc(F.doc(this.fs, 'replays', `${board}_${this.uid}`), { uid: this.uid, board, park: entry.park ?? null, name: entry.name, outfit: entry.outfit ?? null, data: F.Bytes.fromUint8Array(bytes), date: Date.now() });
      } catch (e) { console.warn('replay upload', e); }
    }
    return out;
  }

  async top(board, { week = false, race = false, n = 50 } = {}) {
    if (!(await this.ready)) return null;
    const { F } = this;
    const b = week ? `${board}-w${weekKey()}` : board;
    const hit = this.cache.get(b);
    if (hit && performance.now() - hit.t < 30000) return hit.rows;
    try {
      const q = F.query(F.collection(this.fs, 'boards', b, 'scores'), F.orderBy(race ? 'time' : 'score', race ? 'asc' : 'desc'), F.limit(n));
      const s = await F.getDocs(q);
      const rows = s.docs.map((d) => d.data());
      this.cache.set(b, { t: performance.now(), rows });
      return rows;
    } catch (e) { console.warn('top', b, e); return null; }
  }

  async replay(rid) {
    if (!(await this.ready)) return null;
    const { F } = this;
    try {
      const s = await F.getDoc(F.doc(this.fs, 'replays', rid));
      if (!s.exists()) return null;
      const d = s.data();
      return { ...(await unpackReplay(d.data.toUint8Array())), outfit: d.outfit, name: d.name, park: d.park };
    } catch (e) { console.warn('replay', e); return null; }
  }

  // ------------------------------------------------ live servers (Realtime Database)
  ref(path) { return this.D.ref(this.db, path); }

  // who's on every server right now: cb({ serverId: count })
  watchLobby(cb) {
    let off = null;
    this.ready.then((ok) => {
      if (!ok) return;
      const { D } = this;
      off = D.onValue(this.ref('lobby'), (s) => {
        const v = s.val() ?? {}, out = {};
        const now = this.now();
        for (const [k, riders] of Object.entries(v)) out[k] = Object.values(riders ?? {}).filter((r) => !r.t || now - r.t < 120000).length;
        cb(out);
      }, () => cb(null));
    });
    return () => off?.();
  }
}
