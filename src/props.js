// Everything built by people: the chairlift, race gates, start house,
// finish arena and crowd, village chalets, piste markers, safety nets,
// plus rocks and terrain-park dressing.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, centerX, halfWidth, GATES, KICKERS, LIFT, START_Z, FINISH_Z, SECTIONS, ZONES, slopeAt, MAP, JUMPS, RAILS, HOSPITAL } from './course.js';
import { mulberry32, makeSimplex, smoothstep } from './noise.js';
import { pbr } from './terrain.js';
import { crowd, bodies } from './people.js';

// boulders: scanned rock (triplanar) with real snow settled on the tops
function rockMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const u = {
    uRockC: { value: pbr('rock_face_04_c.webp', true) }, uRockN: { value: pbr('rock_face_04_n.webp', false) },
    uSnowC: { value: pbr('snow_02_c.webp', true) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        mat4 rM = modelMatrix;
        #ifdef USE_INSTANCING
          rM = modelMatrix * instanceMatrix;
        #endif
        vRW = (rM * vec4(transformed, 1.0)).xyz;
        vRN = normalize(mat3(rM) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uRockC, uRockN, uSnowC; varying vec3 vRW; varying vec3 vRN; float rSnow; vec3 rW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vRN);
          rW = pow(abs(n), vec3(4.0)); rW /= rW.x + rW.y + rW.z;
          vec3 q = vRW / 2.6;
          vec3 rc = texture2D(uRockC, q.zy).rgb * rW.x + texture2D(uRockC, q.xz).rgb * rW.y + texture2D(uRockC, q.xy).rgb * rW.z;
          float j = fract(sin(dot(floor(vRW.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
          rSnow = smoothstep(0.35, 0.75, n.y + (j - 0.5) * 0.25);
          vec3 sc = texture2D(uSnowC, vRW.xz / 3.1).rgb * 1.15;
          diffuseColor.rgb = mix(rc * 0.9, sc, rSnow);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.82, 0.6, rSnow);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 q = vRW / 2.6;
          vec2 tx = texture2D(uRockN, q.zy).xy * 2.0 - 1.0, ty = texture2D(uRockN, q.xz).xy * 2.0 - 1.0, tz = texture2D(uRockN, q.xy).xy * 2.0 - 1.0;
          vec3 rn = vec3(0.0, tx.y, tx.x) * rW.x + vec3(ty.x, 0.0, -ty.y) * rW.y + vec3(tz.x, tz.y, 0.0) * rW.z;
          vec3 nW = normalize(normalize(vRN) + rn * 1.2 * (1.0 - rSnow * 0.8));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'rock';
  return m;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function colorize(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// snow on upward faces
function snowCap(geo, base, thresh = 0.55) {
  const c = new THREE.Color(base), s = new THREE.Color(0xf2f5fb);
  const n = geo.attributes.normal, cnt = n.count;
  const a = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const k = smoothstep(thresh, thresh + 0.2, n.getY(i));
    a[i * 3] = c.r + (s.r - c.r) * k; a[i * 3 + 1] = c.g + (s.g - c.g) * k; a[i * 3 + 2] = c.b + (s.b - c.b) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function nonIndexed(g) { return g.index ? g.toNonIndexed() : g; }
function merge(list) {
  return mergeGeometries(list.map((g) => {
    g = nonIndexed(g);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  }), false);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// a run's difficulty from its name: blue, red or black
export function trailDiff(n) {
  if (/^(Drop In|Finish|Village)$/.test(n)) return 'blue';
  return /Wall|Glacier|Chute|Couloir|Face|Cornice|Steep|Drop|Pillow|Mega|Big Air|XXL|Gap/.test(n) ? 'black'
    : /Start|Drop In|Village|Run-out|Green|Flats|Cat|Long Road|Road|Inrun|Finish/.test(n) ? 'blue' : 'red';
}

export class Props {
  constructor(scene, forest, env, smash) {
    this.scene = scene;
    this.forest = forest;
    this.smash = smash;
    this.rnd = mulberry32(555);
    this.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
    this.windowMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: 0xffb45a, emissiveIntensity: 1.2, roughness: 0.3 });
    this.buildLift();
    this.buildGates();
    this.buildStart();
    this.buildFinish();
    this.buildHospital();
    this.buildVillage();
    this.buildMarkers();
    this.buildNets();
    this.buildRocks();
    this.buildPark();
    this.buildSnowGuns();
    this.buildSigns();
    this.buildSnowNames();
  }

  // ---------------- snowmaking ----------------
  // fan guns on short towers along the piste edge, aimed across the run
  buildSnowGuns() {
    const yellow = 0xf2c419, grey = 0x3a3e46, dark = 0x16181d;
    const housing = colorize(new THREE.CylinderGeometry(0.52, 0.56, 1.15, 20, 1, false).rotateX(Math.PI / 2), yellow);
    const ring = colorize(new THREE.TorusGeometry(0.5, 0.06, 8, 24).translate(0, 0, 0.6), dark);
    const grill = colorize(new THREE.CylinderGeometry(0.47, 0.47, 0.02, 20).rotateX(Math.PI / 2).translate(0, 0, 0.6), 0x2a2d33);
    const back = colorize(new THREE.CylinderGeometry(0.3, 0.45, 0.35, 16).rotateX(Math.PI / 2).translate(0, 0, -0.72), grey);
    const head = merge([housing, ring, grill, back]);
    // tilt the barrel up and lift it onto the yoke
    head.rotateX(-0.42); head.translate(0, 3.25, 0);
    const tower = colorize(new THREE.CylinderGeometry(0.09, 0.12, 3.0, 8).translate(0, 1.5, 0), grey);
    const yoke = colorize(new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(0, 3.0, 0), grey);
    const base = colorize(new THREE.BoxGeometry(1.1, 0.25, 0.9).translate(0, 0.12, 0), grey);
    const box = colorize(new THREE.BoxGeometry(0.4, 0.55, 0.3).translate(0.45, 0.6, 0), 0xc7c9cc);
    const hydrant = colorize(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8).translate(-0.9, 0.45, 0.4), 0xd23a2a);
    const geo = merge([head, tower, yoke, base, box, hydrant]);
    const list = [];
    let side = 1;
    for (let z = START_Z + 40; z < FINISH_Z - 140; z += 150) {
      const hw = halfWidth(z);
      let dx = side * (hw + 4.2);
      const blocked = (d) => JUMPS.some((J) => z > J.z - 12 && z < J.z + J.len + 8 && Math.abs(d - J.dx) < J.w / 2 + 6)
        || RAILS.some((R) => z > R.z - 8 && z < R.z + R.len + 6 && Math.abs(d - R.dx) < 6);
      if (blocked(dx)) dx = -dx;
      side = -side;
      if (blocked(dx)) continue;
      const x = centerX(z) + dx;
      // pointed back across the run, a little down the hill
      list.push([x, z, Math.atan2(-Math.sign(dx) * 0.9, 0.45)]);
    }
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }), list.length);
    list.forEach((p, i) => {
      tmpM.compose(tmpP.set(p[0], heightAt(p[0], p[1]) - 0.1, p[1]), tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p[2]), tmpS.set(1, 1, 1));
      im.setMatrixAt(i, tmpM);
    });
    im.castShadow = true;
    this.scene.add(im);
    for (const p of list) this.forest.addCollider(p[0], p[1], 0.7, 'pole');
  }

  // the name of each part of the run sprayed on the snow in piste-marker dye, stretched long
  // so it reads from a skier's eye height as you ride onto it
  buildSnowNames() {
    let z0 = START_Z;
    for (const Z of ZONES) {
      const za = z0; z0 = Z.z1;
      // (not at the very top: the start is right on it and it reads as a slab)
      if (Z.name === 'Finish' || za > FINISH_Z - 80 || za < START_Z + 60) continue;
      const hw = halfWidth(za + 20);
      const W = Math.min(hw * 0.75, 15), L = W * 0.25 * 7;
      // somewhere clear of jumps and rails, near the top of it
      let z = Math.max(za, START_Z + 4) + 16;
      const busy = (zz) => [...JUMPS, ...RAILS].some((f) => f.z + (f.len ?? f.L ?? 10) + 8 > zz - L / 2 && f.z - 12 < zz + L / 2 && Math.abs(f.dx ?? 0) < W / 2 + 4);
      for (let k = 0; k < 8 && busy(z); k++) z += 12;
      if (busy(z) || z > Z.z1 - L) continue;
      const d = trailDiff(Z.name);
      const col = d === 'blue' ? '#2a5fe0' : d === 'red' ? '#e0393e' : '#2a2f3a';
      const tex = canvasTex(1024, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = col;
        let fs = 150, t = Z.name.toUpperCase();
        g.font = `900 ${fs}px Helvetica, Arial`;
        while (g.measureText(t).width > w - 210 && fs > 70) { fs -= 6; g.font = `900 ${fs}px Helvetica, Arial`; }
        const tw = g.measureText(t).width, x0 = (w - tw - 170) / 2;
        // the difficulty symbol, then the name
        g.save(); g.translate(x0 + 70, h / 2);
        if (d === 'blue') { g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill(); }
        else if (d === 'red') g.fillRect(-56, -56, 112, 112);
        else { g.rotate(Math.PI / 4); g.fillRect(-50, -50, 100, 100); }
        g.restore();
        g.textBaseline = 'middle';
        g.fillText(t, x0 + 170, h / 2 + 8);
        // sprayed dye: soft speckled edges where the snow shows through
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 1800; i++) { g.globalAlpha = Math.random() * 0.4; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      });
      const NX = 24, NZ = 24, pos = [], uv = [], idx = [];
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
        const u = i / NX, v = j / NZ;
        const zz = z - L / 2 + v * L;
        // (it follows the piste's curve; looking down the hill, screen right is -x)
        const x = centerX(zz) + W / 2 - u * W;
        pos.push(x, heightAt(x, zz) + 0.14, zz);
        uv.push(u, v);
      }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        // (x runs right to left, so this winding faces up)
        idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.72, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.scene.add(m);
    }
  }

  // trail signs at the top of every section: name and difficulty
  buildSigns() {
    const diff = trailDiff;
    const post = colorize(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8).translate(0, 1.2, 0), 0x5b3d24);
    const postM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    for (const sec of SECTIONS) {
      const z = Math.max(sec.z0 + 6, START_Z + 12);
      if (z > FINISH_Z - 60) continue;
      const d = diff(sec.name);
      const tex = canvasTex(512, 160, (g, w, h) => {
        g.fillStyle = '#f3efe4'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#5b3d24'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
        // the difficulty symbol: blue circle, red square, black diamond
        g.fillStyle = d === 'blue' ? '#1f5fd0' : d === 'red' ? '#d42a2a' : '#111';
        g.save(); g.translate(78, h / 2);
        if (d === 'blue') { g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.fill(); }
        else if (d === 'red') g.fillRect(-40, -40, 80, 80);
        else { g.rotate(Math.PI / 4); g.fillRect(-36, -36, 72, 72); }
        g.restore();
        g.fillStyle = '#1b1d22'; g.font = 'bold 58px Helvetica, Arial'; g.textBaseline = 'middle';
        let t = sec.name.toUpperCase(), fs = 58;
        while (g.measureText(t).width > w - 160 && fs > 30) { fs -= 4; g.font = `bold ${fs}px Helvetica, Arial`; }
        g.fillText(t, 140, h / 2 + 3);
      });
      const hw = halfWidth(z);
      for (const s of [-1, 1]) {
        const x = centerX(z) + s * (hw + 2.4);
        const y = heightAt(x, z);
        const grp = new THREE.Group();
        grp.position.set(x, y - 0.15, z);
        const p = new THREE.Mesh(post, postM); p.castShadow = true; grp.add(p);
        const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.81, 0.06), [postM, postM, postM, postM, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), postM]);
        board.position.set(0, 2.0, 0.06); board.castShadow = true;
        // face the riders coming down, turned a little in toward the run
        grp.rotation.y = Math.PI + s * 0.35;
        grp.add(board);
        // a cap of snow on top of the board
        const cap = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0xf4f6fb, roughness: 0.9 }));
        cap.position.set(0, 2.43, 0.06); grp.add(cap);
        this.scene.add(grp);
        this.smash?.add(x, z, 0.45, [grp], { h: 2.5, slow: 0.08, kind: 'sign' });
      }
    }
  }

  // ---------------- chairlift ----------------
  buildLift() {
    const { x0, z0, x1, z1 } = LIFT;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const at = (t) => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
    const H = 11;
    const top = (t) => { const [x, z] = at(t); return heightAt(x, z) + H; };
    const onPiste = (t) => { const [x, z] = at(t); return Math.abs(x - centerX(z)) < halfWidth(z) + 4; };
    const towers = [0, 1];
    const split = (a, b, depth) => {
      if (depth > 12) return;
      const ya = top(a), yb = top(b);
      let worst = 0, wt = -1;
      const n = Math.max(4, Math.ceil(((b - a) * len) / 5));
      for (let i = 1; i < n; i++) {
        const t = a + ((b - a) * i) / n;
        const [x, z] = at(t);
        const cy = ya + (yb - ya) * (i / n);
        const clear = cy - heightAt(x, z);
        if (7 - clear > worst) { worst = 7 - clear; wt = t; }
      }
      if (wt < 0 && (b - a) * len > 230) wt = (a + b) / 2;
      if (wt < 0) return;
      // nudge the tower off the piste
      for (let d = 0; d < 0.05 && onPiste(wt); d += 0.002) {
        if (!onPiste(wt + d)) { wt += d; break; }
        if (!onPiste(wt - d)) { wt -= d; break; }
      }
      if (wt - a < 0.004 || b - wt < 0.004) return;
      towers.push(wt);
      split(a, wt, depth + 1); split(wt, b, depth + 1);
    };
    split(0, 1, 0);
    towers.sort((a, b) => a - b);
    const dir = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize();
    const side = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const parts = [];
    const steel = 0x6f7680;
    this.liftPoints = [];
    for (const t of towers) {
      const [x, z] = at(t);
      const gy = heightAt(x, z);
      const isStation = t === 0 || t === 1;
      if (!isStation) {
        const pole = colorize(new THREE.CylinderGeometry(0.3, 0.46, H + 1, 14), steel);
        pole.translate(0, (H + 1) / 2 - 0.5, 0);
        const foot = colorize(new THREE.CylinderGeometry(0.75, 0.9, 0.9, 12), 0x9a9da3); foot.translate(0, 0.1, 0);
        const head = colorize(new THREE.BoxGeometry(0.7, 0.7, 0.7), steel); head.translate(0, H + 0.45, 0);
        const arm = colorize(new THREE.BoxGeometry(5.8, 0.38, 0.32), steel); arm.translate(0, H + 0.62, 0);
        const sub = [pole, foot, head, arm];
        // a sheave train each side: a beam with six wheels the cable runs over
        for (const sx of [-2.4, 2.4]) {
          const beam = colorize(new THREE.BoxGeometry(0.16, 0.22, 2.6), 0x2b2f36); beam.translate(sx, H + 0.32, 0); sub.push(beam);
          for (let k = 0; k < 6; k++) { const wh = colorize(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12).rotateZ(Math.PI / 2), 0x1a1c20); wh.translate(sx, H + 0.13, -1.05 + k * 0.42); sub.push(wh); }
        }
        // ladder rungs up the side, a maintenance rail and the lightning rod
        for (let y = 1.2; y < H; y += 0.42) { const rung = colorize(new THREE.BoxGeometry(0.44, 0.04, 0.04), 0x3a3f46); rung.translate(0, y, 0.48); sub.push(rung); }
        for (const sx of [-0.22, 0.22]) { const rail = colorize(new THREE.BoxGeometry(0.04, H - 1, 0.04), 0x3a3f46); rail.translate(sx, (H + 1) / 2 + 0.2, 0.48); sub.push(rail); }
        const rail2 = colorize(new THREE.BoxGeometry(5.6, 0.05, 0.05), 0xd8b84a); rail2.translate(0, H + 1.6, 0.25); sub.push(rail2);
        const rod = colorize(new THREE.CylinderGeometry(0.02, 0.03, 2.2, 5), 0x9a9da3); rod.translate(0, H + 1.9, -0.2); sub.push(rod);
        const g = merge(sub);
        tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        g.applyQuaternion(tmpQ);
        g.translate(x, gy, z);
        parts.push(g);
        this.forest.addCollider(x, z, 0.6, 'tower');
      }
      this.liftPoints.push(new THREE.Vector3(x, gy + H + 0.3, z));
    }
    // stations: an open terminal, the bullwheel under a long canopy on two columns, a loading
    // platform, and the operator's hut beside it
    const signs = [];
    for (const t of [0, 1]) {
      const [x, z] = at(t);
      const gy = heightAt(x, z);
      const back = t === 0 ? -1 : 1; // the bullwheel end
      const sub = [];
      const conc = 0x9a9ea5, blue = 0x2c5f9e, dark = 0x2b2f36;
      const pad = colorize(new THREE.BoxGeometry(12, 3, 22), conc); pad.translate(0, -1.2, back * 2); sub.push(pad);
      for (const sx of [-1, 1]) { const col = colorize(new THREE.BoxGeometry(0.9, H + 1.2, 0.9), steel); col.translate(sx * 1.6, (H + 1.2) / 2, back * 5); sub.push(col); }
      const cover = colorize(new THREE.BoxGeometry(7.4, 1.9, 13), blue); cover.translate(0, H + 1.5, back * 4.5); sub.push(cover);
      const lid = snowCap(new THREE.BoxGeometry(7.8, 0.35, 13.4), 0x22497a, 0.5); lid.translate(0, H + 2.6, back * 4.5); sub.push(lid);
      const wheel = colorize(new THREE.TorusGeometry(2.4, 0.16, 8, 32).rotateX(Math.PI / 2), dark); wheel.translate(0, H + 0.3, back * 8); sub.push(wheel);
      for (let k = 0; k < 6; k++) { const sp = colorize(new THREE.BoxGeometry(4.8, 0.08, 0.08).rotateY((k * Math.PI) / 6), dark); sp.translate(0, H + 0.3, back * 8); sub.push(sp); }
      const deck = colorize(new THREE.BoxGeometry(6.5, 0.5, 10), conc); deck.translate(0, 0.5, -back * 3); sub.push(deck);
      const ramp = colorize(new THREE.BoxGeometry(6.5, 0.2, 4).rotateX(back * 0.12), conc); ramp.translate(0, 0.3, -back * 9.6); sub.push(ramp);
      // the operator's hut, windows all round
      const hut = colorize(new THREE.BoxGeometry(3.2, 2.6, 3.2), 0xe8e9ec); hut.translate(5.6, 1.3 + 0.75, -back * 2); sub.push(hut);
      const win = colorize(new THREE.BoxGeometry(3.25, 1.0, 3.25), 0x1b2a3a); win.translate(5.6, 2.3, -back * 2); sub.push(win);
      const hroof = snowCap(new THREE.BoxGeometry(3.8, 0.3, 3.8), 0x22497a, 0.5); hroof.translate(5.6, 3.55, -back * 2); sub.push(hroof);
      // a rope line and a couple of sign posts at the load
      for (const sx of [-3.4, 3.4]) { const post = colorize(new THREE.BoxGeometry(0.08, 1.1, 0.08), 0xd8b84a); post.translate(sx, 1.3, -back * 7); sub.push(post); }
      const g = merge(sub);
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      g.applyQuaternion(tmpQ);
      g.translate(x, gy, z);
      parts.push(g);
      this.forest.addCollider(x, z, 7, 'station');
      // the lift's name along the canopy
      signs.push({ x, y: gy + H + 1.5, z, q: tmpQ.clone(), back });
    }
    const liftTex = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#2c5f9e'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = 'bold 70px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('SHREDLINE EXPRESS', w / 2, h / 2 + 4);
    });
    for (const sg of signs) for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.25), new THREE.MeshStandardMaterial({ map: liftTex, roughness: 0.6 }));
      m.position.set(s * 3.72, 0, sg.back * 4.5).applyQuaternion(sg.q).add(new THREE.Vector3(sg.x, sg.y, sg.z));
      m.quaternion.copy(sg.q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, s * Math.PI / 2));
      this.scene.add(m);
    }
    const mesh = new THREE.Mesh(merge(parts), this.metal);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);

    // cables (up and down lines)
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.8 });
    const cables = [];
    this.cableLines = [[], []];
    for (const [li, off] of [[0, 2.4], [1, -2.4]]) {
      const pts = this.liftPoints.map((p) => p.clone().addScaledVector(side, off));
      this.cableLines[li] = pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const l = a.distanceTo(b);
        const g = new THREE.CylinderGeometry(0.035, 0.035, l, 5, 1, true);
        g.applyQuaternion(tmpQ.setFromUnitVectors(UP, tmpP.subVectors(b, a).normalize()));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        cables.push(g);
      }
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(cables.map((g) => { g.deleteAttribute('uv'); return g; })), cableMat));

    // chairs
    const steelC = 0x9ea5b0, frameC = 0x3a3f46, pad = 0x1f5fa8, padD = 0x173f72;
    const cp = [];
    // the grip on the cable and the hanger arm curving down behind the back
    const grip = colorize(new THREE.BoxGeometry(0.3, 0.28, 0.7), 0x2b2f36); grip.translate(0, -0.05, 0); cp.push(grip);
    const hang = colorize(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8), frameC); hang.translate(0, -1.0, -0.05); cp.push(hang);
    const elbow = colorize(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8).rotateX(0.9), frameC); elbow.translate(0, -1.95, -0.3); cp.push(elbow);
    // seat frame and four cushions, backrest cushions
    const frame = colorize(new THREE.BoxGeometry(2.7, 0.07, 0.66), frameC); frame.translate(0, -2.52, 0.08); cp.push(frame);
    const bframe = colorize(new THREE.BoxGeometry(2.7, 0.8, 0.06).rotateX(-0.22), frameC); bframe.translate(0, -2.05, -0.27); cp.push(bframe);
    for (let i = 0; i < 4; i++) {
      const dx = -1.0 + i * 0.667;
      const c = colorize(new THREE.BoxGeometry(0.6, 0.11, 0.58), i % 2 ? pad : padD); c.translate(dx, -2.44, 0.1); cp.push(c);
      const b = colorize(new THREE.BoxGeometry(0.6, 0.66, 0.09).rotateX(-0.22), i % 2 ? pad : padD); b.translate(dx, -2.02, -0.21); cp.push(b);
    }
    // armrests, the safety bar overhead (up) and its footrest
    for (const sx of [-1.38, 1.38]) {
      const side = colorize(new THREE.BoxGeometry(0.06, 0.06, 0.66), steelC); side.translate(sx, -2.2, 0.06); cp.push(side);
      const up = colorize(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), steelC); up.translate(sx, -2.36, 0.33); cp.push(up);
      const bar = colorize(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6).rotateX(0.5), steelC); bar.translate(sx, -1.55, 0.32); cp.push(bar);
    }
    const topBar = colorize(new THREE.CylinderGeometry(0.035, 0.035, 2.76, 6).rotateZ(Math.PI / 2), steelC); topBar.translate(0, -1.17, 0.52); cp.push(topBar);
    const chairGeo = merge(cp);
    this.chairGeo = chairGeo;
    const riders = [];
    for (const dx of [-0.55, 0.55]) {
      const body = new THREE.CapsuleGeometry(0.17, 0.32, 4, 8); body.translate(dx, -2.0, 0.02);
      const head = new THREE.SphereGeometry(0.13, 10, 8); head.translate(dx, -1.55, 0.05);
      const legs = new THREE.BoxGeometry(0.3, 0.16, 0.55); legs.translate(dx, -2.38, 0.42);
      const shin = new THREE.BoxGeometry(0.26, 0.5, 0.16); shin.translate(dx, -2.7, 0.66);
      const ski = new THREE.BoxGeometry(0.1, 0.03, 1.6); ski.translate(dx, -2.95, 0.75);
      riders.push(body, head, legs, shin, ski);
    }
    const riderGeo = merge(riders.map((g) => colorize(g, 0xffffff)));
    const total = 0; let totalLen = [0, 0];
    for (const li of [0, 1]) {
      const pts = this.cableLines[li];
      let L = 0;
      for (let i = 0; i < pts.length - 1; i++) L += pts[i].distanceTo(pts[i + 1]);
      totalLen[li] = L;
    }
    const spacing = 34;
    this.chairs = [];
    for (const li of [0, 1]) for (let d = 0; d < totalLen[li]; d += spacing) this.chairs.push({ li, d, ride: this.rnd() < 0.55 });
    this.chairMesh = new THREE.InstancedMesh(chairGeo, this.vc, this.chairs.length);
    this.riderMesh = new THREE.InstancedMesh(riderGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), this.chairs.length);
    const jackets = [0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0xf06d1a, 0x8e3fd1, 0x1d1f26, 0xff4f8b];
    this.chairs.forEach((c, i) => this.riderMesh.setColorAt(i, new THREE.Color(jackets[i % jackets.length])));
    this.chairMesh.castShadow = this.riderMesh.castShadow = true;
    this.chairMesh.frustumCulled = this.riderMesh.frustumCulled = false;
    this.scene.add(this.chairMesh, this.riderMesh);
    this.totalLen = totalLen;
    this.liftDir = dir;
    this.updateLift(0);
  }

  cablePoint(li, d, out) {
    const pts = this.cableLines[li];
    const n = pts.length;
    // line 0 runs bottom -> top, line 1 returns top -> bottom
    for (let k = 0; k < n - 1; k++) {
      const i = li === 0 ? k : n - 1 - k, j = li === 0 ? k + 1 : n - 2 - k;
      const l = pts[i].distanceTo(pts[j]);
      if (d <= l) return out.lerpVectors(pts[i], pts[j], d / l);
      d -= l;
    }
    return out.copy(pts[li === 0 ? n - 1 : 0]);
  }

  updateLift(time, cam) {
    this.liftT = time;
    const v = 4.6;
    const yawUp = Math.atan2(this.liftDir.x, this.liftDir.z);
    let ri = 0;
    this.chairs.forEach((c, i) => {
      const d = (c.d + time * v) % this.totalLen[c.li];
      this.cablePoint(c.li, d, tmpP);
      tmpQ.setFromAxisAngle(UP, c.li === 0 ? yawUp : yawUp + Math.PI);
      tmpS.set(1, 1, 1);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.chairMesh.setMatrixAt(i, tmpM);
      // (close up the real riders sit there instead of the stand-ins)
      c.near = !!(this.seats && cam && tmpP.distanceToSquared(cam) < 280 * 280);
      if (!c.ride || c.li === 1 || c.near) tmpS.set(0, 0, 0);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.riderMesh.setMatrixAt(i, tmpM);
    });
    this.chairMesh.instanceMatrix.needsUpdate = true;
    this.riderMesh.instanceMatrix.needsUpdate = true;
    if (this.seats) {
      const off = new THREE.Matrix4();
      this.seats.forEach((st, i) => {
        this.chairMesh.getMatrixAt(st.ci, tmpM);
        tmpM.multiply(off.makeTranslation(st.dx, 0, 0));
        if (!this.chairs[st.ci].near) tmpM.multiply(off.makeScale(0, 0, 0));
        st.im.setMatrixAt(st.k, tmpM);
        this.seatSkis.setMatrixAt(i, tmpM);
      });
      for (const im of this.seatMeshes) if (im) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      this.seatSkis.instanceMatrix.needsUpdate = true;
      this.seatSkis.computeBoundingSphere();
    }
  }

  // ---------------- race gates ----------------
  buildGates() {
    const panel = (color) => canvasTex(128, 96, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, h * 0.42, w, h * 0.16);
      g.fillStyle = color; g.font = 'bold 15px Helvetica'; g.textAlign = 'center'; g.fillText('SHREDLINE', w / 2, h * 0.54);
    });
    const red = new THREE.MeshStandardMaterial({ map: panel('#d42a2a'), side: THREE.DoubleSide, roughness: 0.7 });
    const blue = new THREE.MeshStandardMaterial({ map: panel('#1f4fc9'), side: THREE.DoubleSide, roughness: 0.7 });
    const poleG = new THREE.CylinderGeometry(0.022, 0.022, 1.9, 6); poleG.translate(0, 0.95, 0);
    const poleM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const cloth = new THREE.PlaneGeometry(1.15, 0.85);
    this.gateGroup = new THREE.Group();
    this.gateObjs = [];
    for (const gt of GATES) {
      const grp = new THREE.Group();
      const mat = gt.i % 2 ? blue : red;
      for (const s of [-1, 1]) {
        const px = gt.x + s * (gt.width / 2 + 0.6);
        // breakaway poles: clip one and the panel folds over
        const side = new THREE.Group();
        side.position.set(px, heightAt(px, gt.z) - 0.1, gt.z);
        for (const o of [-0.6, 0.6]) {
          const pole = new THREE.Mesh(poleG, poleM);
          pole.position.set(o, heightAt(px + o, gt.z) - heightAt(px, gt.z), 0);
          pole.castShadow = true;
          side.add(pole);
        }
        const c = new THREE.Mesh(cloth, mat);
        c.position.set(0, 1.4, 0);
        c.castShadow = true;
        side.add(c);
        grp.add(side);
        this.smash?.add(px, gt.z, 0.75, [side], { h: 1.9, slow: 0.02, kind: 'gate', off: true });
      }
      this.gateGroup.add(grp);
      this.gateObjs.push(grp);
    }
    this.gateGroup.visible = false;
    this.scene.add(this.gateGroup);
  }

  // ---------------- start house ----------------
  buildStart() {
    const z = START_Z - 7, x = centerX(z);
    const gy = heightAt(x, z);
    const wood = 0x6b4a32;
    const hut = colorize(new THREE.BoxGeometry(12, 3.4, 5), wood); hut.translate(0, 1.7, -2);
    const roof = snowCap(new THREE.BoxGeometry(13, 0.4, 6.4).rotateX(-0.12), 0x2c2622, 0.4); roof.translate(0, 3.7, -2.2);
    const postL = colorize(new THREE.BoxGeometry(0.4, 3.4, 0.4), wood); postL.translate(-5.6, 1.7, 0.6);
    const postR = postL.clone(); postR.translate(11.2, 0, 0);
    const wand = colorize(new THREE.BoxGeometry(10.5, 0.08, 0.08), 0xd42a2a); wand.translate(0, 0.6, 0.8);
    const g = merge([hut, roof, postL, postR, wand]);
    g.translate(x, gy, z);
    const m = new THREE.Mesh(g, this.vc); m.castShadow = m.receiveShadow = true;
    this.scene.add(m);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.1), new THREE.MeshStandardMaterial({
      map: canvasTex(1024, 104, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff6a3d'); gr.addColorStop(1, '#ffb347');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff'; c.font = 'bold 64px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('SHREDLINE  ·  START', w / 2, h / 2 + 3);
      }), roughness: 0.6,
    }));
    banner.position.set(x, gy + 3.0, z + 0.55);
    this.scene.add(banner);
  }

  // ---------------- finish arena ----------------
  buildFinish() {
    const z = FINISH_Z, cx = centerX(z), hw = halfWidth(z);
    const gy = heightAt(cx, z);
    // inflatable arch
    const archW = 26;
    const arch = new THREE.TorusGeometry(archW / 2, 0.9, 12, 40, Math.PI);
    const archMesh = new THREE.Mesh(arch, new THREE.MeshStandardMaterial({ color: 0xe8432e, roughness: 0.55 }));
    archMesh.position.set(cx, gy - 1, z);
    archMesh.castShadow = true;
    this.scene.add(archMesh);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 0.4), [
      ...Array(4).fill(new THREE.MeshStandardMaterial({ color: 0xe8432e })),
      new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (c, w, h) => {
        c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff'; c.font = 'bold 70px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FINISH', w / 2, h / 2 + 4);
      }) }),
      new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (c, w, h) => {
        c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ffb347'; c.font = 'bold 60px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SHREDLINE CUP', w / 2, h / 2 + 4);
      }) }),
    ]);
    sign.position.set(cx, gy + archW / 2 - 2.2, z);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);
    this.forest.addCollider(cx - archW / 2, z, 1.0, 'arch');
    this.forest.addCollider(cx + archW / 2, z, 1.0, 'arch');

    // A-board fences + banners on both sides of the last 260 m, then the finish corral
    const boardTex = canvasTex(1024, 128, (c, w, h) => {
      const brands = [['#1f4fc9', 'SUMMIT'], ['#e8432e', 'SHREDLINE'], ['#111', 'FRESH TRACKS'], ['#f2b705', 'POWDER CO.'], ['#18a868', 'GLACIER']];
      const bw = w / brands.length;
      brands.forEach(([col, t], i) => {
        c.fillStyle = col; c.fillRect(i * bw, 0, bw, h);
        c.fillStyle = col === '#f2b705' ? '#111' : '#fff'; c.font = 'bold 34px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(t, i * bw + bw / 2, h / 2 + 2);
      });
    });
    boardTex.wrapS = THREE.RepeatWrapping;
    const boards = [];
    for (const s of [-1, 1]) {
      for (let zz = z - 260; zz < z + 60; zz += 4) {
        const za = zz, zb = zz + 4;
        const xa = centerX(za) + s * (halfWidth(za) * (zz < z ? 0.92 : 1) + 2), xb = centerX(zb) + s * (halfWidth(zb) * (zz < z ? 0.92 : 1) + 2);
        const ya = heightAt(xa, za), yb = heightAt(xb, zb);
        const pts = [xa, ya + 0.05, za, xb, yb + 0.05, zb, xa, ya + 1.0, za - s * 0.0, xb, yb + 1.0, zb];
        boards.push({ pts, u0: (zz - (z - 260)) / 40, u1: (zz + 4 - (z - 260)) / 40 });
      }
    }
    const pos = [], uv = [], idx = [];
    boards.forEach((b, i) => {
      const p = b.pts;
      pos.push(...p);
      uv.push(b.u0, 0, b.u1, 0, b.u0, 1, b.u1, 1);
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bg.setIndex(idx); bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: boardTex, side: THREE.DoubleSide, roughness: 0.6 }));
    bm.castShadow = true; bm.receiveShadow = true;
    this.scene.add(bm);

    // crowd behind the fences near the finish
    const body = new THREE.CapsuleGeometry(0.22, 0.75, 4, 8); body.translate(0, 0.62 + 0.22, 0);
    const head = new THREE.SphereGeometry(0.14, 10, 8); head.translate(0, 1.55, 0);
    const hat = new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); hat.translate(0, 1.6, 0);
    const person = merge([colorize(body, 0xffffff), colorize(head, 0xe0b89a), colorize(hat, 0xffffff)]);
    const people = [];
    for (const s of [-1, 1]) for (let zz = z - 150; zz < z + 30; zz += 1.1) {
      for (let row = 0; row < 3; row++) {
        if (this.rnd() < 0.25) continue;
        const off = halfWidth(zz) * (zz < z ? 0.92 : 1) + 3.2 + row * 1.0 + this.rnd() * 0.4;
        const x = centerX(zz) + s * off;
        people.push([x, heightAt(x, zz) + row * 0.15, zz + this.rnd() * 0.5]);
      }
    }
    this.crowd = new THREE.InstancedMesh(person, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), people.length);
    const cols = [0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0xf06d1a, 0x8e3fd1, 0xe8e8ea, 0x1d1f26, 0xff4f8b, 0x14b8c4];
    this.crowdData = people;
    people.forEach((p, i) => {
      // facing the course, turned a little up the hill toward who's coming
      p[3] = (p[0] > cx ? -1 : 1) * (Math.PI / 2 - 0.35) + (this.rnd() - 0.5) * 0.6;
      p[4] = 0.92 + this.rnd() * 0.16;
      tmpM.compose(tmpP.set(p[0], p[1], p[2]), tmpQ.setFromAxisAngle(UP, p[3]), tmpS.setScalar(p[4]));
      this.crowd.setMatrixAt(i, tmpM);
      this.crowd.setColorAt(i, new THREE.Color(cols[Math.floor(this.rnd() * cols.length)]));
    });
    this.crowd.castShadow = true;
    this.scene.add(this.crowd);
    this.finishX = cx;
  }

  // the whole people at the finish when you're near it, the simple figures from far away
  updatePeople(cam) {
    if (!this.crowdNear) return;
    const near = Math.hypot(cam.x - this.finishX, cam.z - FINISH_Z) < 420;
    if (near === this.crowdIsNear) return;
    this.crowdIsNear = near;
    for (const im of this.crowdNear) im.visible = near;
    this.crowd.visible = !near;
  }

  cheer(t, k) {
    // the crowd bounces when someone crosses the line
    if (!this.crowd && !this.crowdSlots) return;
    if (k <= 0 && this._still) return;
    this._still = k <= 0;
    this.crowdData.forEach((p, i) => {
      const hop = k > 0 ? Math.max(0, Math.sin(t * 9 + i * 1.7)) * 0.18 * k : 0;
      const im = this.crowdSlots ? this.crowdSlots[i].im : this.crowd, j = this.crowdSlots ? this.crowdSlots[i].k : this.crowdIdx?.[i] ?? i;
      im.getMatrixAt(j, tmpM);
      tmpM.decompose(tmpP, tmpQ, tmpS);
      tmpP.y = p[1] + hop;
      tmpM.compose(tmpP, tmpQ, tmpS);
      im.setMatrixAt(j, tmpM);
      im.instanceMatrix.needsUpdate = true;
    });
  }

  // once the people have loaded: real spectators at the finish and real riders on the chairs
  buildPeople() {
    const rnd = mulberry32(808);
    // two rows at the fences is plenty (every one of them is a whole person)
    const keep = this.crowdData.map((p, i) => i).filter((i) => this.crowdData[i][2] > FINISH_Z - 130 && rnd() < 0.52);
    this.crowdIdx = keep;
    this.crowdData = keep.map((i) => this.crowdData[i]);
    const c = crowd(this.scene, this.crowdData.map((p) => ({ x: p[0], y: p[1], z: p[2], yaw: p[3], s: p[4] })), ['stand', 'cheer', 'clap'], rnd);
    if (c) {
      // the simple figures stay for the crowd seen from far off
      this.crowdSlots = c.slots;
      this.crowdNear = c.meshes;
      this.crowd.visible = false;
    }
    // chair riders: everyone sitting back with their skis on
    const B = bodies(['sit'], rnd);
    if (!B.length) return;
    const seatY = -2.45 + 0.19;
    for (const b of B) {
      const pel = b.kit.bindP[b.kit.I('Bip01_Pelvis')];
      b.geo.translate(0, seatY - pel.y, 0.12 - pel.z);
    }
    const seats = [];
    // two to four on each chair going up
    this.chairs.forEach((ch, ci) => { if (ch.ride && ch.li === 0) for (const dx of [-1.0, -0.333, 0.333, 1.0]) if (rnd() < 0.62) seats.push({ ci, dx, b: Math.floor(rnd() * B.length) }); });
    this.seatMeshes = B.map((b, bi) => {
      const n = seats.filter((s) => s.b === bi).length;
      if (!n) return null;
      const im = new THREE.InstancedMesh(b.geo, b.mat, n);
      im.castShadow = true;
      this.scene.add(im);
      return im;
    });
    const used = B.map(() => 0);
    const jackets = [0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0xf06d1a, 0x8e3fd1, 0x1d1f26, 0xff4f8b];
    for (const st of seats) {
      st.im = this.seatMeshes[st.b]; st.k = used[st.b]++;
      st.im.setColorAt(st.k, new THREE.Color(jackets[Math.floor(rnd() * jackets.length)]));
    }
    this.seatMeshes.forEach((im) => im && (im.instanceColor.needsUpdate = true));
    this.seats = seats;
    // their skis hanging off the boots
    const ski = colorize(new THREE.BoxGeometry(0.09, 0.03, 1.65), 0xffffff);
    const skis = merge([ski.clone().translate(0.11, seatY - 0.56, 0.62), ski.clone().translate(-0.11, seatY - 0.56, 0.62)]);
    this.seatSkis = new THREE.InstancedMesh(skis, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), seats.length);
    seats.forEach((st, i) => this.seatSkis.setColorAt(i, new THREE.Color([0xd8342c, 0x1d1f26, 0xf2b705, 0x2a7de1][i % 4])));
    this.seatSkis.castShadow = true;
    this.scene.add(this.seatSkis);
    this.updateLift(this.liftT ?? 0);
  }

  // ---------------- the hospital ----------------
  // the slope-side clinic the rescue helicopter flies you to: a white block with a red
  // cross, glass doors under a canopy and a helipad beside it
  buildHospital() {
    const best = HOSPITAL, { x, z } = best;
    const W = 26, D = 13, Hh = 9;
    // it faces the piste
    const yaw = best.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    let gy = Infinity, gyMax = -Infinity;
    for (let a = -W / 2; a <= W / 2; a += 4) for (let b = -D / 2; b <= D / 2; b += 4) { const h = heightAt(x - b, z + a); gy = Math.min(gy, h); gyMax = Math.max(gyMax, h); }
    // set into the slope: the uphill side a little buried, a short plinth downhill
    const floor = Math.max(gyMax - 2.2, gy) + 0.2;
    const white = 0xeef1f4, grey = 0x7c776f;
    const parts = [];
    // (with a terrace out front at floor level, steps down at its edge)
    const plinth = colorize(new THREE.BoxGeometry(W + 1, floor - gy + 6, D + 7), grey); plinth.translate(0, floor - (floor - gy + 6) / 2, 3); parts.push(plinth);
    for (let k = 1; k <= 4; k++) { const st = colorize(new THREE.BoxGeometry(6, floor - gy + 6, 0.6), 0x9a9ea5); st.translate(0, floor - k * 0.35 - (floor - gy + 6) / 2, D / 2 + 6.5 + k * 0.6); parts.push(st); }
    const body = colorize(new THREE.BoxGeometry(W, Hh, D), white); body.translate(0, floor + Hh / 2, 0); parts.push(body);
    const roof = snowCap(new THREE.BoxGeometry(W + 0.8, 0.5, D + 0.8), 0xc9ccd1, 0.5); roof.translate(0, floor + Hh + 0.25, 0); parts.push(roof);
    // a red band round the top, the entrance canopy
    const band = colorize(new THREE.BoxGeometry(W + 0.1, 0.7, D + 0.1), 0xd3232c); band.translate(0, floor + Hh - 0.6, 0); parts.push(band);
    const canopy = snowCap(new THREE.BoxGeometry(6, 0.3, 3), 0xd3232c, 0.5); canopy.translate(0, floor + 3.2, D / 2 + 1.5); parts.push(canopy);
    for (const s of [-1, 1]) { const post = colorize(new THREE.BoxGeometry(0.2, 3.2, 0.2), grey); post.translate(s * 2.8, floor + 1.6, D / 2 + 2.8); parts.push(post); }
    const g = merge(parts);
    g.rotateY(yaw); g.translate(x, 0, z);
    const m = new THREE.Mesh(g, this.vc); m.castShadow = m.receiveShadow = true;
    this.scene.add(m);
    // windows, doors, the cross and the sign: on the front face (local +z)
    const grp = new THREE.Group();
    grp.position.set(x, 0, z); grp.rotation.y = yaw;
    const glassM = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.08, metalness: 0.8 });
    for (const row of [0, 1]) for (let i = 0; i < 7; i++) {
      if (row === 0 && (i === 3)) continue;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), glassM);
      w.position.set(-W / 2 + 2.4 + i * 3.55, floor + 2.0 + row * 3.4, D / 2 + 0.03);
      grp.add(w);
      if (row === 1 || i !== 3) { const back = w.clone(); back.position.z = -D / 2 - 0.03; back.rotation.y = Math.PI; grp.add(back); }
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.6, emissive: 0x223844, emissiveIntensity: 0.6 }));
    door.position.set(0, floor + 1.3, D / 2 + 0.04); grp.add(door);
    const cross = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d3232c'; c.fillRect(w * 0.36, h * 0.1, w * 0.28, h * 0.8); c.fillRect(w * 0.1, h * 0.36, w * 0.8, h * 0.28);
    });
    for (const sx of [-1, 1]) {
      const cr = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshStandardMaterial({ map: cross, roughness: 0.5, emissive: 0xffffff, emissiveMap: cross, emissiveIntensity: 0.25 }));
      cr.position.set(sx * (W / 2 - 3), floor + Hh - 3.3, D / 2 + 0.05); grp.add(cr);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshStandardMaterial({ map: canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      let fs = 78; c.font = `bold ${fs}px Helvetica, Arial`;
      while (c.measureText('SHREDLINE MOUNTAIN HOSPITAL').width > w - 40) { fs -= 4; c.font = `bold ${fs}px Helvetica, Arial`; }
      c.fillStyle = '#d3232c'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('SHREDLINE MOUNTAIN HOSPITAL', w / 2, h / 2 + 4);
    }), roughness: 0.6 }));
    sign.position.set(0, floor + 4.3, D / 2 + 0.06); grp.add(sign);
    // the helipad, level, beside the building
    const pad = new THREE.Vector3().set(W / 2 + 13, 0, 2).applyAxisAngle(UP, yaw).add(new THREE.Vector3(x, 0, z));
    let ph = -Infinity;
    for (let a = -9; a <= 9; a += 3) for (let b = -9; b <= 9; b += 3) ph = Math.max(ph, heightAt(pad.x + a, pad.z + b));
    pad.y = ph + 0.25;
    const padTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#6d7178'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffd21e'; c.lineWidth = 18; c.beginPath(); c.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 300px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, h / 2 + 12);
    });
    const padM = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.3, 40), [new THREE.MeshStandardMaterial({ color: 0x5c6067 }), new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x5c6067 })]);
    padM.position.copy(pad); padM.receiveShadow = true; padM.rotation.y = yaw;
    this.scene.add(padM);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9, 8, 32), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.9 }));
    base.position.set(pad.x, pad.y - 4.15, pad.z); this.scene.add(base);
    this.scene.add(grp);
    this.forest.addCollider(x, z, Math.max(W, D) * 0.55, 'chalet');
    const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, yaw);
    this.hospital = { at: new THREE.Vector3(x, floor, z), door: new THREE.Vector3(0, floor, D / 2 + 0.6).applyAxisAngle(UP, yaw).add(new THREE.Vector3(x, 0, z)), out, pad, yaw };
  }

  // ---------------- village ----------------
  buildVillage() {
    const parts = [], wins = [];
    const placed = [];
    const woods = [0x5b3a24, 0x6e472c, 0x4a2f1f, 0x7a5236];
    let tries = 0;
    while (placed.length < 46 && tries++ < 3000) {
      const z = FINISH_Z + 60 + this.rnd() * 520;
      const s = this.rnd() < 0.5 ? -1 : 1;
      const off = 55 + this.rnd() * 230;
      const x = centerX(z) + s * off;
      if (slopeAt(x, z) > 0.35) continue;
      const w = 8 + this.rnd() * 7, d = 9 + this.rnd() * 8, h = 4 + this.rnd() * 4;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < Math.max(w, d) + p[2] + 4)) continue;
      if (this.hospital && Math.hypot(this.hospital.at.x - x, this.hospital.at.z - z) < 48 + Math.max(w, d)) continue;
      placed.push([x, z, Math.max(w, d)]);
      const gy = Math.min(heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z + d / 2), heightAt(x, z));
      const yaw = Math.round(this.rnd() * 3) * Math.PI / 2 + (this.rnd() - 0.5) * 0.3;
      const base = colorize(new THREE.BoxGeometry(w, 1.4, d), 0x8b8580); base.translate(0, 0.7, 0);
      const body = colorize(new THREE.BoxGeometry(w, h, d), woods[Math.floor(this.rnd() * woods.length)]); body.translate(0, 1.4 + h / 2, 0);
      // gable roof with overhang, snow on top
      const rh = w * 0.42;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 - 0.9, 0); shape.lineTo(0, rh); shape.lineTo(w / 2 + 0.9, 0); shape.lineTo(w / 2 + 0.9, -0.35); shape.lineTo(0, rh - 0.35); shape.lineTo(-w / 2 - 0.9, -0.35);
      const roof = new THREE.ExtrudeGeometry(shape, { depth: d + 1.8, bevelEnabled: false });
      roof.translate(0, 1.4 + h, -d / 2 - 0.9);
      roof.computeVertexNormals();
      snowCap(roof, 0x2e2420, 0.25);
      const chim = colorize(new THREE.BoxGeometry(0.9, 2.4, 0.9), 0x6d6660); chim.translate(w * 0.22, 1.4 + h + rh * 0.6, d * 0.2);
      const balcony = colorize(new THREE.BoxGeometry(w * 0.8, 0.15, 1.4), 0x3d2818); balcony.translate(0, 1.4 + h * 0.55, d / 2 + 0.7);
      const rail = colorize(new THREE.BoxGeometry(w * 0.8, 0.9, 0.08), 0x3d2818); rail.translate(0, 1.4 + h * 0.55 + 0.45, d / 2 + 1.35);
      const g = merge([base, body, roof, chim, balcony, rail]);
      g.rotateY(yaw); g.translate(x, gy, z);
      parts.push(g);
      // windows
      for (const face of [1, -1]) for (let k = 0; k < Math.floor(w / 3); k++) for (const fl of [0, 1]) {
        if (fl === 1 && h < 6) continue;
        if (this.rnd() < 0.3) continue;
        const wg = new THREE.PlaneGeometry(1.1, 1.3);
        if (face < 0) wg.rotateY(Math.PI);
        wg.translate(-w / 2 + 1.6 + k * 3, 1.4 + 1.6 + fl * 2.6, face * (d / 2 + 0.03));
        wg.rotateY(yaw); wg.translate(x, gy, z);
        wins.push(wg);
      }
      this.forest.addCollider(x, z, Math.max(w, d) * 0.55, 'chalet');
    }
    const m = new THREE.Mesh(merge(parts), this.vc);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    if (wins.length) this.scene.add(new THREE.Mesh(mergeGeometries(wins), this.windowMat));
  }

  setDusk(k) { this.windowMat.emissiveIntensity = 0.25 + k * 2.4; }

  // ---------------- piste markers ----------------
  buildMarkers() {
    const pole = colorize(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6).translate(0, 0.95, 0), 0xf26a1b);
    const cap = new THREE.CylinderGeometry(0.045, 0.045, 0.35, 6).translate(0, 1.75, 0);
    const list = [];
    const diff = (z) => { const n = SECTIONS.find((s) => z < s.z1)?.name; return n === 'The Wall' || n === 'Glacier Bowl' ? 0x111111 : n === 'Run-out' || n === 'Village' || n === 'Summit Start' ? 0x2a6fe0 : 0xd42a2a; };
    for (let z = 40; z < FINISH_Z - 260; z += 42) for (const s of [-1, 1]) {
      const x = centerX(z) + s * (halfWidth(z) + 1.5);
      list.push([x, z, diff(z)]);
    }
    const geo = merge([pole, colorize(cap, 0xffffff)]);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), list.length);
    list.forEach((p, i) => {
      tmpM.compose(tmpP.set(p[0], heightAt(p[0], p[1]) - 0.2, p[1]), tmpQ.identity(), tmpS.set(1, 1, 1));
      im.setMatrixAt(i, tmpM);
      im.setColorAt(i, new THREE.Color(1, 1, 1));
    });
    im.castShadow = true;
    this.scene.add(im);
    // difficulty caps as a second instanced set
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8).translate(0, 1.72, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), list.length);
    list.forEach((p, i) => {
      tmpM.compose(tmpP.set(p[0], heightAt(p[0], p[1]) - 0.2, p[1]), tmpQ.identity(), tmpS.set(1, 1, 1));
      caps.setMatrixAt(i, tmpM);
      caps.setColorAt(i, new THREE.Color(p[2]));
    });
    this.scene.add(caps);
    list.forEach((p, i) => this.smash?.add(p[0], p[1], 0.22, [{ im, i }, { im: caps, i }], { h: 1.8, slow: 0.025 }));
  }

  // ---------------- course nets ----------------
  // blue mesh fencing down both sides of the whole run (the skier physics bounces off it)
  buildNets() {
    const tex = canvasTex(128, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(40,120,235,1)'; c.lineWidth = 3;
      c.beginPath();
      for (let i = -w; i < w * 2; i += 8) { c.moveTo(i, 0); c.lineTo(i + h, h); c.moveTo(i, h); c.lineTo(i + h, 0); }
      c.stroke();
      c.fillStyle = 'rgba(30,96,215,1)'; c.fillRect(0, 0, w, 7); c.fillRect(0, h - 4, w, 4);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.75 });
    // ride into it and it gives: the mesh bulges out round the rider and wobbles back
    this.netHits = [0, 1, 2, 3].map(() => ({ z: 0, s: 0, a: 0, v: 0, push: 0 }));
    const uHit = { value: this.netHits.map(() => new THREE.Vector4()) };
    this.netU = uHit;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHit = uHit;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uHit[4]; attribute vec2 aOut; attribute float aSide; attribute float aH;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float bulge = 0.0;
          for (int i = 0; i < 4; i++) {
            vec4 h = uHit[i];
            float dz = position.z - h.x;
            bulge += step(abs(aSide - h.z), 0.5) * h.y * exp(-dz * dz / 7.0);
          }
          transformed.xz += aOut * bulge * (0.3 + 0.7 * sin(aH * 2.8));`);
    };
    const runs = [[64, FINISH_Z - 262]];
    const H = 1.25, seg = 1.5, rows = 3;
    const pos = [], uv = [], idx = [], out = [], sides = [], hs = [];
    let v = 0;
    for (const [za, zb] of runs) for (const s of [-1, 1]) {
      let u = 0;
      for (let z = za; z < zb; z += seg) {
        const x0 = centerX(z) + s * (halfWidth(z) + 2.8), x1 = centerX(z + seg) + s * (halfWidth(z + seg) + 2.8);
        const y0 = heightAt(x0, z), y1 = heightAt(x1, z + seg);
        const d = Math.hypot(x1 - x0, seg) / 2.6;
        const ox = s * seg / Math.hypot(x1 - x0, seg), oz = -s * (x1 - x0) / Math.hypot(x1 - x0, seg);
        // a few rows up the height so it can bulge in the middle
        for (let r = 0; r <= rows; r++) {
          const k = r / rows, yy = -0.12 + k * (H + 0.12);
          pos.push(x0, y0 + yy, z, x1, y1 + yy, z + seg);
          uv.push(u, k, u + d, k);
          out.push(ox, oz, ox, oz); sides.push(s, s); hs.push(k, k);
        }
        for (let r = 0; r < rows; r++) {
          const a = v + r * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        u += d;
        v += (rows + 1) * 2;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aOut', new THREE.Float32BufferAttribute(out, 2));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    this.scene.add(m);
    // posts
    const posts = [];
    for (const [za, zb] of runs) for (const s of [-1, 1]) for (let z = za; z < zb; z += 6) {
      const x = centerX(z) + s * (halfWidth(z) + 2.8);
      posts.push([x, z]);
    }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, H + 0.3, 5).translate(0, (H + 0.3) / 2 - 0.15, 0), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6 }), posts.length);
    posts.forEach((p, i) => { tmpM.makeTranslation(p[0], heightAt(p[0], p[1]), p[1]); im.setMatrixAt(i, tmpM); });
    im.castShadow = true;
    this.scene.add(im);
    this.netRuns = runs;
  }

  // a rider pushing pen metres into the net on side s at z
  netHit(s, z, pen) {
    let slot = this.netHits.find((h) => h.s === s && Math.abs(h.z - z) < 4);
    if (!slot) slot = this.netHits.reduce((a, b) => (Math.abs(b.a) + Math.abs(b.v) * 0.1 < Math.abs(a.a) + Math.abs(a.v) * 0.1 ? b : a));
    if (slot.s !== s || Math.abs(slot.z - z) >= 4) { slot.s = s; slot.z = z; slot.a = 0; slot.v = 0; }
    slot.z += (z - slot.z) * 0.3;
    slot.push = Math.max(slot.push, pen);
  }

  updateNets(dt) {
    if (!this.netHits) return;
    this.netHits.forEach((h, i) => {
      // a damped spring toward however far it's being pushed (then back to flat, wobbling)
      const k = 120, c = 6;
      const n = Math.max(1, Math.ceil(dt / 0.01)), st = dt / n;
      for (let j = 0; j < n; j++) { h.v += (k * (h.push - h.a) - c * h.v) * st; h.a += h.v * st; }
      h.push = 0;
      this.netU.value[i].set(h.z, h.a, h.s, 0);
    });
  }

  // ---------------- rocks ----------------
  buildRocks() {
    const noise = makeSimplex(31);
    const ico = new THREE.IcosahedronGeometry(1, 4);
    ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
    const base = mergeVertices(ico); // shared vertices: smooth normals, not facets
    const p = base.attributes.position;
    for (let i = 0; i < p.count; i++) {
      tmpP.fromBufferAttribute(p, i);
      // craggy: broad lumps, then facets
      let n = 1 + noise(tmpP.x * 1.3, tmpP.z * 1.3 + tmpP.y) * 0.3 + noise(tmpP.x * 3, tmpP.y * 3 + tmpP.z) * 0.12;
      n += Math.abs(noise(tmpP.x * 6 + 5, tmpP.z * 6 - tmpP.y * 4)) * 0.06;
      tmpP.multiplyScalar(n); tmpP.y *= 0.68;
      p.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
    }
    base.computeVertexNormals();
    const list = [];
    for (let i = 0; i < 2600 && list.length < 900; i++) {
      const z = -200 + this.rnd() * (FINISH_Z + 180);
      const s = this.rnd() < 0.5 ? -1 : 1;
      const off = halfWidth(z) + 6 + Math.pow(this.rnd(), 2) * 320;
      const x = centerX(z) + s * off;
      const sl = slopeAt(x, z);
      if (sl < 0.35 && this.rnd() < 0.75) continue;
      const size = 0.6 + Math.pow(this.rnd(), 2.5) * 5;
      list.push([x, z, size]);
      if (off < halfWidth(z) + 150 && size > 0.7) this.forest.addCollider(x, z, size * 0.8, 'rock');
    }
    const im = new THREE.InstancedMesh(base, rockMaterial(), list.length);
    list.forEach((r, i) => {
      tmpM.compose(tmpP.set(r[0], heightAt(r[0], r[1]) - r[2] * 0.25, r[1]),
        tmpQ.setFromEuler(new THREE.Euler((this.rnd() - 0.5) * 0.5, this.rnd() * 6, (this.rnd() - 0.5) * 0.5)),
        tmpS.set(r[2] * (0.8 + this.rnd() * 0.5), r[2], r[2] * (0.8 + this.rnd() * 0.5)));
      im.setMatrixAt(i, tmpM);
    });
    im.castShadow = true; im.receiveShadow = true;
    this.scene.add(im);
  }

  // ---------------- terrain park dressing ----------------
  buildPark() {
    // blue dye lines on the lips + orange marker poles + an entry banner
    const lip = new THREE.MeshBasicMaterial({ color: 0x2a6fe0, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const poles = [];
    for (const k of KICKERS) {
      if (k.kind !== 'park') continue;
      const pos = [];
      for (let i = 0; i <= 10; i++) {
        const x = k.x - k.w / 2 + 0.5 + ((k.w - 1) * i) / 10;
        pos.push(x, heightAt(x, k.z - 0.3) + 0.04, k.z - 0.3, x, heightAt(x, k.z + 0.3) + 0.04, k.z + 0.3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const idx = [];
      for (let i = 0; i < 10; i++) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      g.setIndex(idx);
      this.scene.add(new THREE.Mesh(g, lip));
      for (const s of [-1, 1]) for (const dz of [-k.ramp, 0]) poles.push([k.x + s * (k.w / 2 + 0.8), k.z + dz]);
    }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: 0xf26a1b }), poles.length);
    poles.forEach((p, i) => { tmpM.makeTranslation(p[0], heightAt(p[0], p[1]), p[1]); im.setMatrixAt(i, tmpM); });
    im.castShadow = true;
    this.scene.add(im);
    poles.forEach((p, i) => this.smash?.add(p[0], p[1], 0.22, [{ im, i }], { h: 1.4, slow: 0.02 }));
  }

  setRaceMode(on) { this.gateGroup.visible = on; this.smash?.setOff('gate', !on); }
}
