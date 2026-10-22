// Multiplayer servers. Everyone on a server publishes their skier's snapshot ~12 times a
// second plus a hello (name, outfit, score) every few seconds; everyone listens to the
// server and draws the others with interpolation. The servers live on our Firebase
// Realtime Database (rooms/<server>/{s,h,e}, see cloud.js); if that can't be reached the
// same messages go over public MQTT brokers instead.
//   topics: alpenglow/v2/<park>/<room>/{s|h|e}/<id>
import * as THREE from 'three';
import { Skier } from './skier.js';
import { snap, applySnap, SNAP_N } from './snap.js';
import { patchTree } from './atmos.js';
import { toB64, fromB64 } from './cloud.js';

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const enc = new TextEncoder(), dec = new TextDecoder();

// --- a minimal MQTT 3.1.1 client: connect, subscribe, QoS 0 publish, ping, last will ---
function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function vlen(n) { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; }
function packet(type, body) { const b = body instanceof Uint8Array ? body : Uint8Array.from(body); const h = Uint8Array.from([type, ...vlen(b.length)]); const o = new Uint8Array(h.length + b.length); o.set(h); o.set(b, h.length); return o; }

class Mqtt {
  constructor() { this.ws = null; this.onmessage = null; this.onclose = null; this.mid = 1; }

  connect(url, clientId, will) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url, ['mqtt']);
      ws.binaryType = 'arraybuffer';
      const to = setTimeout(() => { ws.close(); rej(new Error('timeout')); }, 12000);
      this.buf = new Uint8Array(0);
      ws.onopen = () => {
        const flags = 0x02 | (will ? 0x04 : 0);
        const body = [...str('MQTT'), 4, flags, 0, 40, ...str(clientId)];
        if (will) body.push(...str(will.topic), ...str(will.payload));
        ws.send(packet(0x10, body));
      };
      ws.onmessage = (e) => {
        const add = new Uint8Array(e.data);
        const b = new Uint8Array(this.buf.length + add.length); b.set(this.buf); b.set(add, this.buf.length);
        this.buf = b;
        this.drain(() => { clearTimeout(to); this.ws = ws; this.ping = setInterval(() => this.send(packet(0xc0, [])), 25000); res(); });
      };
      ws.onerror = () => { clearTimeout(to); rej(new Error('ws error')); };
      ws.onclose = () => { clearInterval(this.ping); if (this.ws === ws) { this.ws = null; this.onclose?.(); } };
    });
  }

  drain(onConnack) {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      let len = 0, mul = 1, i = 1;
      for (;;) { if (i >= b.length) return; const d = b[i++]; len += (d & 127) * mul; mul *= 128; if (!(d & 128)) break; }
      if (b.length < i + len) return;
      const type = b[0] >> 4, body = b.subarray(i, i + len);
      this.buf = b.slice(i + len);
      if (type === 2) onConnack?.();
      else if (type === 3) {
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tl));
        const qos = (b[0] >> 1) & 3;
        this.onmessage?.(topic, body.slice(2 + tl + (qos ? 2 : 0)));
      }
    }
  }

  send(p) { if (this.ws && this.ws.readyState === 1 && this.ws.bufferedAmount < 256e3) this.ws.send(p); }
  subscribe(topic) { const id = this.mid++; this.send(packet(0x82, [id >> 8, id & 255, ...str(topic), 0])); }
  publish(topic, payload) {
    const p = typeof payload === 'string' ? enc.encode(payload) : payload;
    const t = Uint8Array.from(str(topic));
    const body = new Uint8Array(t.length + p.length); body.set(t); body.set(p, t.length);
    this.send(packet(0x30, body));
  }
  close() { try { this.send(packet(0xe0, [])); this.ws?.close(); } catch { /* gone */ } this.ws = null; clearInterval(this.ping); }
}

// the same three kinds of message over the Realtime Database
class FireLink {
  constructor(room, cloud) { this.room = room; this.c = cloud; this.live = false; this.offs = []; }

  async start() {
    const c = this.c, D = c.D, R = this.room, uid = R.me.id;
    const base = `rooms/${R.key}`;
    this.paths = { s: `${base}/s/${uid}`, h: `${base}/h/${uid}`, lobby: `lobby/${R.key}/${uid}` };
    for (const p of Object.values(this.paths)) D.onDisconnect(c.ref(p)).remove();
    const sRef = c.ref(`${base}/s`), hRef = c.ref(`${base}/h`);
    const onS = (snap) => { if (snap.key !== uid && typeof snap.val() === 'string') R.recv('s', snap.key, new Float32Array(fromB64(snap.val()).buffer)); };
    const onH = (snap) => { if (snap.key !== uid && snap.val()) R.recv('h', snap.key, snap.val()); };
    this.offs.push(D.onChildAdded(sRef, onS), D.onChildChanged(sRef, onS), D.onChildAdded(hRef, onH), D.onChildChanged(hRef, onH),
      D.onChildRemoved(hRef, (snap) => R.recv('e', snap.key, { type: 'bye' })));
    // only events from now on
    const eq = D.query(c.ref(`${base}/e`), D.orderByChild('t'), D.startAt(c.now() - 2000));
    this.offs.push(D.onChildAdded(eq, (snap) => { const e = snap.val(); if (e?.u && e.u !== uid) R.recv('e', e.u, e); }));
    // a shared race start: everyone on the server gets the same moment
    this.offs.push(D.onValue(c.ref(`${base}/race`), (snap) => R.emit('raceCall', snap.val())));
    const conn = D.onValue(c.ref('.info/connected'), (s) => { this.live = !!s.val(); R.refresh(); if (this.live) { R.hello(); this.presence(); } });
    this.offs.push(conn);
    this.lobbyT = setInterval(() => this.presence(), 60000);
  }

  presence() { if (this.live) this.c.D.set(this.c.ref(this.paths.lobby), { n: this.room.me.name, t: this.c.D.serverTimestamp() }).catch(() => {}); }

  send(kind, data) {
    if (!this.live) return;
    const D = this.c.D;
    // (the database refuses undefined values)
    if (kind !== 's') data = JSON.parse(JSON.stringify(data));
    if (kind === 's') D.set(this.c.ref(this.paths.s), toB64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))).catch(() => {});
    else if (kind === 'h') D.set(this.c.ref(this.paths.h), data).catch(() => {});
    else if (kind === 'e') {
      const r = D.push(this.c.ref(`rooms/${this.room.key}/e`), { ...data, u: this.room.me.id, t: D.serverTimestamp() });
      // events are fire and forget: clear our own after a while
      setTimeout(() => D.remove(r).catch(() => {}), 15000);
    }
  }

  callRace(at) { if (this.live) return this.c.D.set(this.c.ref(`rooms/${this.room.key}/race`), { at, by: this.room.me.name, u: this.room.me.id }); }

  close() {
    clearInterval(this.lobbyT);
    for (const off of this.offs) off();
    const D = this.c.D;
    for (const p of Object.values(this.paths ?? {})) D.remove(this.c.ref(p)).catch(() => {});
  }
}

// a name tag that keeps the same size on screen
function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '400 54px Knewave, "Barlow Condensed", sans-serif';
  const w = Math.min(500, g.measureText(name).width + 48);
  g.fillStyle = 'rgba(16,20,28,0.62)';
  g.beginPath(); g.roundRect((512 - w) / 2, 10, w, 74, 22); g.fill();
  g.fillStyle = color; g.fillRect((512 - w) / 2 + 18, 38, 12, 12);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 256 + 10, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  sp.scale.set(0.16, 0.03, 1);
  sp.material.sizeAttenuation = false;
  sp.renderOrder = 20;
  return sp;
}

export class Room {
  // room: a server's name ('Yard 1') or a private code; cloud: the Firebase link when it's up
  constructor(game, park, room, me, cloud = null) {
    this.g = game;
    this.park = park; this.room = (room || 'public').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'public';
    this.label = room || 'public';
    this.key = `${park}-${this.room}`;
    this.me = me; // { id, name, outfit }
    this.base = `alpenglow/v2/${park}/${this.room}`;
    this.peers = new Map();
    this.fire = cloud && cloud.status === 'online' && cloud.uid ? new FireLink(this, cloud) : null;
    if (this.fire) this.me.id = cloud.uid;
    // every relay at once: whichever ones two riders share links them; messages are de-duplicated
    this.links = this.fire ? [] : BROKERS.map((url) => ({ url, mq: new Mqtt(), live: false }));
    this.seen = new Map();
    this.sendT = 0; this.helloT = 0;
    this.status = 'connecting';
    this.buf = new Float32Array(SNAP_N + 1);
    this.listeners = {};
  }

  on(e, f) { (this.listeners[e] ??= []).push(f); }
  emit(e, d) { for (const f of this.listeners[e] ?? []) f(d); }

  connect() {
    if (this.fire) {
      return this.fire.start().then(() => new Promise((res) => {
        const t0 = performance.now();
        const wait = () => (this.fire.live || performance.now() - t0 > 8000 ? res(this.status === 'live') : setTimeout(wait, 100));
        wait();
      }));
    }
    return new Promise((res) => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(this.status === 'live'); } };
      setTimeout(() => { if (this.status !== 'live') { this.status = 'offline'; this.emit('status', this.status); } finish(); }, 13000);
      for (const L of this.links) this.link(L).then(() => { if (L.live) finish(); });
    });
  }

  async link(L) {
    if (this.closed || L.live || L.busy) return;
    L.busy = true;
    const will = { topic: `${this.base}/e/${this.me.id}`, payload: JSON.stringify({ type: 'bye' }) };
    try {
      await L.mq.connect(L.url, 'ag-' + this.me.id + '-' + Math.random().toString(36).slice(2, 6), will);
      L.live = true;
      L.mq.onmessage = (t, p) => this.message(t, p);
      L.mq.onclose = () => { L.live = false; this.refresh(); setTimeout(() => this.link(L), 4000); };
      L.mq.subscribe(`${this.base}/#`);
      this.refresh();
      this.hello();
    } catch {
      setTimeout(() => this.link(L), 8000);
    }
    L.busy = false;
  }

  refresh() {
    const st = this.links.some((L) => L.live) || this.fire?.live ? 'live' : 'offline';
    if (st !== this.status) { this.status = st; this.emit('status', st); }
    this.url = this.fire ? 'stomped server' : this.links.filter((L) => L.live).map((L) => L.url.split('/')[2]).join(', ');
  }

  // kind: 's' snapshot (Float32Array), 'h' hello (object), 'e' event (object)
  send(kind, data) {
    if (this.fire) { this.fire.send(kind, data); return; }
    const payload = kind === 's' ? new Uint8Array(data.buffer.slice(0)) : JSON.stringify(data);
    for (const L of this.links) if (L.live) L.mq.publish(`${this.base}/${kind}/${this.me.id}`, payload);
  }

  hello() {
    const s = this.g.sc;
    this.send('h', { name: this.me.name, outfit: this.me.outfit, score: s?.score ?? 0, mode: this.g.mode ?? 'menu', lv: this.me.level ?? 1, t: Date.now() });
    this.fire?.presence();
  }

  event(e) { this.send('e', { ...e, n: Math.random().toString(36).slice(2, 9) }); }

  // everyone on the server races from the same moment (Firebase servers only)
  callRace(at) { return this.fire?.callRace(at); }

  message(topic, payload) {
    const parts = topic.split('/');
    const kind = parts[4], id = parts[5];
    if (!id || id === this.me.id) return;
    if (kind === 's') this.recv('s', id, new Float32Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + (SNAP_N + 1) * 4)));
    else this.recv(kind, id, JSON.parse(dec.decode(payload)));
  }

  recv(kind, id, data) {
    let p = this.peers.get(id);
    if (kind === 'h') {
      const h = data;
      if (!p) { p = this.addPeer(id, h); this.emit('join', p); }
      else if (!!h.outfit?.board !== p.skier.board) {
        // switched between skis and a board: a new stand-in
        p.skier.dispose();
        p.skier = new Skier({ scene: this.g.scene, tracks: null, skiers: [] }, { outfit: h.outfit, name: h.name });
        patchTree(p.skier.model.group);
      }
      p.score = h.score; p.mode = h.mode; p.seen = performance.now();
    } else if (kind === 's' && p) {
      const f = data;
      if (f.length < SNAP_N + 1) return;
      // the same frame through another relay
      if (p.lastT != null && f[SNAP_N] <= p.lastT) return;
      p.lastT = f[SNAP_N];
      const now = performance.now();
      // the sender's clock: map it onto ours with the smallest delay seen
      const off = now - f[SNAP_N];
      p.off = p.off == null ? off : Math.min(p.off + 0.02, off);
      p.frames.push({ t: f[SNAP_N] + p.off, f });
      if (p.frames.length > 40) p.frames.shift();
      p.seen = now;
    } else if (kind === 'e') {
      const e = data;
      if (e.n) { if (this.seen.has(e.n)) return; this.seen.set(e.n, 1); if (this.seen.size > 200) this.seen.delete(this.seen.keys().next().value); }
      if (e.type === 'bye') { if (p) this.dropPeer(id); return; }
      if (p) this.emit(e.type, { peer: p, ...e });
    }
  }

  addPeer(id, h) {
    const g = this.g;
    const s = new Skier({ scene: g.scene, tracks: null, skiers: [] }, { outfit: h.outfit, name: h.name });
    patchTree(s.model.group);
    const color = '#' + new THREE.Color(h.outfit?.jacket ?? 0xffffff).getHexString();
    const tag = nameTag(h.name, color);
    g.scene.add(tag);
    const p = { id, name: h.name, color, skier: s, tag, frames: [], score: h.score, seen: performance.now(), off: null };
    this.peers.set(id, p);
    return p;
  }

  dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    p.skier.dispose();
    this.g.scene.remove(p.tag);
    this.peers.delete(id);
    this.emit('leave', p);
  }

  // every rendered frame: send ours, pose theirs ~120 ms in the past
  update(dt, player, camPos) {
    if (this.status !== 'live') return;
    this.sendT -= dt; this.helloT -= dt;
    if (this.sendT <= 0 && player) {
      this.sendT = 1 / 12;
      snap(player, this.buf);
      this.buf[SNAP_N] = performance.now();
      this.send('s', this.buf);
    }
    if (this.helloT <= 0) { this.helloT = 3; this.hello(); }
    const now = performance.now(), rt = now - 140;
    for (const [id, p] of this.peers) {
      if (now - p.seen > 9000) { this.dropPeer(id); continue; }
      const F = p.frames;
      if (!F.length) { p.skier.model.group.visible = false; p.skier.far = false; p.tag.visible = false; continue; }
      let i = F.length - 1;
      while (i > 0 && F[i - 1].t > rt) i--;
      const a = F[Math.max(0, i - 1)], b = F[i];
      const k = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
      applySnap(p.skier, a.f, b.f, k);
      p.skier.updateVisual(dt, camPos);
      p.tag.position.set(p.skier.pos.x, p.skier.pos.y + 2.3, p.skier.pos.z);
      p.tag.visible = p.skier.model.group.visible && camPos.distanceTo(p.skier.pos) < 400;
    }
  }

  close() {
    this.closed = true;
    if (!this.fire) this.event({ type: 'bye' });
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
    this.fire?.close();
    setTimeout(() => { for (const L of this.links) L.mq.close(); }, 100);
  }
}

// a short random rider id that sticks for this browser
export function myId() {
  try {
    let id = localStorage.getItem('alpenglow.id');
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem('alpenglow.id', id); }
    return id;
  } catch { return Math.random().toString(36).slice(2, 10); }
}
