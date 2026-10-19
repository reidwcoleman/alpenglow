// The terrain park's visible side: a fine snow surface over every feature (the coarse
// terrain sits just under it, see meshHeightAt), the rails and boxes, dye lines on the
// lips and knuckles, and the signs.
import * as THREE from 'three';
import { heightAt, centerX, halfWidth, PARK_FEET, RAILS, railAt, JUMPS, PIPE, ROLLERS, PARK, MAP, surfaceAt } from './course.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// a grid laid along the course (columns across the piste, rows down it), heights from heightAt
function surface(f, ddx, dz) {
  const nx = Math.ceil((f.dx1 - f.dx0) / ddx) + 1, nz = Math.ceil((f.z1 - f.z0) / dz) + 1;
  // one extra ring of samples for the normals
  const gx = nx + 2, gz = nz + 2;
  const H = new Float32Array(gx * gz), X = new Float32Array(gx * gz);
  for (let j = 0; j < gz; j++) {
    const z = f.z0 + (j - 1) * dz, c = centerX(z);
    for (let i = 0; i < gx; i++) {
      const x = c + f.dx0 + (i - 1) * ddx;
      X[j * gx + i] = x;
      H[j * gx + i] = heightAt(x, z);
    }
  }
  const pos = new Float32Array(nx * nz * 3), nrm = new Float32Array(nx * nz * 3);
  const pst = new Float32Array(nx * nz).fill(1), ice = new Float32Array(nx * nz);
  const surf = { powder: 0, ice: 0 };
  let v = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j + 1) * gx + (i + 1);
    const z = f.z0 + j * dz;
    pos[v * 3] = X[k]; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = z;
    pst[v] = 1 - surfaceAt(X[k], z, surf).powder;
    const hx = (H[k + 1] - H[k - 1]) / (2 * ddx), hz = (H[k + gx] - H[k - gx]) / (2 * dz);
    const l = Math.hypot(hx, 1, hz);
    nrm[v * 3] = -hx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -hz / l;
    v++;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aPiste', new THREE.BufferAttribute(pst, 1));
  g.setAttribute('aIce', new THREE.BufferAttribute(ice, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// a flat ribbon draped on the snow along a list of [x, z] points
function ribbon(pts, width, lift = 0.035) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [x0, z0] = pts[Math.max(0, i - 1)], [x1, z1] = pts[Math.min(pts.length - 1, i + 1)];
    let sx = -(z1 - z0), sz = x1 - x0;
    const l = Math.hypot(sx, sz) || 1; sx /= l; sz /= l;
    for (const s of [-1, 1]) {
      const px = x + sx * s * width / 2, pz = z + sz * s * width / 2;
      pos.push(px, heightAt(px, pz) + lift, pz);
    }
    if (i > 0) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function signTexture(lines, bg = '#11161f', fg = '#ffffff', accent = '#ff8a3d') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = accent; g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg;
  g.font = 'italic 800 96px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText(lines[0], 256, lines[1] ? 108 : 128);
  if (lines[1]) { g.font = '600 38px Inter, Arial, sans-serif'; g.fillStyle = accent; g.fillText(lines[1], 256, 190); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Park {
  constructor(scene, terrainMaterial, smash) {
    this.scene = scene;
    this.smash = smash;
    this.group = new THREE.Group();
    this.group.name = 'park';
    scene.add(this.group);
    this.snowMat = terrainMaterial;
    this.steel = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.75, roughness: 0.38 });
    this.dye = new THREE.MeshStandardMaterial({ color: 0x1d5fe0, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }

  async build() {
    // the snow first: it's most of the work, so give the loading screen a breath now and then
    let t = performance.now();
    for (const f of PARK_FEET) {
      const isPipe = f.dx0 < PIPE.dx && f.dx1 > PIPE.dx;
      const isRoll = f.dx0 < ROLLERS.dx && f.dx1 > ROLLERS.dx;
      const g = surface(f, isPipe ? 0.25 : isRoll ? 0.5 : 0.3, isPipe ? 0.6 : isRoll ? 0.6 : 0.3);
      const m = new THREE.Mesh(g, this.snowMat);
      m.receiveShadow = true;
      this.group.add(m);
      if (performance.now() - t > 45) { await nextFrame(); t = performance.now(); }
    }
    this.buildRails();
    this.buildLines();
    this.buildSigns();
    this.buildFlags();
  }

  buildRails() {
    const r = { s: 0, lat: 0, y: 0, slope: 0 };
    for (const R of RAILS) {
      const n = R.ys.length;
      const pt = (i) => {
        const s = (i / (n - 1)) * R.L;
        return new THREE.Vector3(R.a.x + R.dir.x * s, R.ys[i], R.a.z + R.dir.z * s);
      };
      if (R.kind === 'log') {
        // a fallen pine: bark cylinder with snow on its back
        const a = pt(0), b = pt(n - 1);
        const len = a.distanceTo(b);
        const bark = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.95 });
        const log = new THREE.Mesh(new THREE.CylinderGeometry(R.hw, R.hw * 1.15, len + 0.6, 12, 1), bark);
        log.position.copy(a).lerp(b, 0.5); log.position.y -= R.hw;
        log.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        log.castShadow = true; log.receiveShadow = true;
        this.group.add(log);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(R.hw * 1.02, R.hw * 1.02, len + 0.4, 12, 1, false, -Math.PI / 2.6, Math.PI / 1.3), new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.6 }));
        cap.position.copy(log.position); cap.position.y += 0.025; cap.quaternion.copy(log.quaternion);
        cap.rotateY(Math.PI / 2);
        this.group.add(cap);
        for (const t of [0.15, 0.85]) {
          const p = a.clone().lerp(b, t);
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, p.y - heightAt(p.x, p.z) + 0.3, 8), bark);
          st.position.set(p.x, (p.y - 2 * R.hw + heightAt(p.x, p.z) - 0.3) / 2 + R.hw * 0.0, p.z);
          this.group.add(st);
        }
        continue;
      }
      if (R.kind === 'box') {
        // a plastic-topped box: dark slick top, coloured steel sides
        const pos = [], col = [], idx = [];
        const top = new THREE.Color(0x1c1f24), side = new THREE.Color(R.color);
        const sx = R.dir.z, sz = -R.dir.x;
        for (let i = 0; i < n; i++) {
          const p = pt(i);
          const b = pos.length / 3;
          const corners = [[-1, 0], [1, 0], [1, -0.24], [-1, -0.24]];
          for (const [s, dy] of corners) {
            pos.push(p.x + sx * s * R.hw, p.y + dy, p.z + sz * s * R.hw);
            const c = dy === 0 ? top : side;
            col.push(c.r, c.g, c.b);
          }
          if (i > 0) {
            const a = b - 4;
            // top, right side, left side
            idx.push(a, b, a + 1, a + 1, b, b + 1);
            idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
            idx.push(a + 3, b + 3, a, a, b + 3, b);
          }
        }
        // duplicate the top edge with its own colour for crisp shading between top and sides
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.42, side: THREE.DoubleSide }));
        m.castShadow = true; m.receiveShadow = true;
        this.group.add(m);
        // end plates
        for (const i of [0, n - 1]) {
          const p = pt(i);
          const e = new THREE.Mesh(new THREE.BoxGeometry(R.hw * 2, 0.24, 0.04), this.steel);
          e.position.set(p.x, p.y - 0.12, p.z); e.rotation.y = R.yaw;
          this.group.add(e);
        }
      } else {
        const curve = new THREE.CurvePath();
        const step = R.shape === 'down' || R.shape === 'flat' ? n - 1 : 4;
        let prev = pt(0);
        for (let i = step; i < n; i += step) { const p = pt(Math.min(i, n - 1)); curve.add(new THREE.LineCurve3(prev, p)); prev = p; }
        if (prev.distanceTo(pt(n - 1)) > 0.01) curve.add(new THREE.LineCurve3(prev, pt(n - 1)));
        const tube = new THREE.TubeGeometry(curve, Math.max(8, n), 0.05, 10, false);
        tube.translate(0, -0.05, 0);
        const m = new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: R.color, metalness: 0.55, roughness: 0.3 }));
        m.castShadow = true;
        this.group.add(m);
      }
      // supports down to the snow (and a little into it)
      const legs = Math.max(2, Math.round(R.L / 2.6) + 1);
      for (let k = 0; k < legs; k++) {
        const s = 0.25 + (k / (legs - 1)) * (R.L - 0.5);
        const x = R.a.x + R.dir.x * s, z = R.a.z + R.dir.z * s;
        railAt(R, x, z, r);
        const gy = heightAt(x, z) - 0.3;
        const top = r.y - (R.kind === 'box' ? 0.24 : 0.09);
        const h = top - gy;
        if (h < 0.05) continue;
        const legW = R.kind === 'box' ? R.hw * 1.6 : 0.07;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, h, 0.07), this.steel);
        leg.position.set(x, gy + h / 2, z); leg.rotation.y = R.yaw;
        leg.castShadow = true;
        this.group.add(leg);
      }
    }
  }

  buildLines() {
    const add = (g) => { const m = new THREE.Mesh(g, this.dye); m.receiveShadow = true; this.group.add(m); };
    const across = (dx, z, w) => {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const d = dx - w / 2 + (k / 16) * w; pts.push([centerX(z) + d, z]); }
      return pts;
    };
    for (const J of JUMPS) {
      add(ribbon(across(J.dx, J.lip - 0.25, J.w - 1.2), 0.3, 0.05)); // the lip
      add(ribbon(across(J.dx, J.lip + J.table, J.w - 1.4), 0.35)); // the knuckle
      add(ribbon(across(J.dx, J.lip + J.table + J.land * 0.42, J.w - 2), 0.25)); // the sweet spot
    }
    // pipe lips, both walls
    if (MAP.park) for (const s of [-1, 1]) {
      const pts = [];
      for (let z = PIPE.z0 + 24; z <= PIPE.z1 - 16; z += 1.5) pts.push([centerX(z) + PIPE.dx + s * (PIPE.flat + PIPE.lip + 0.25), z]);
      add(ribbon(pts, 0.35, 0.04));
    }
  }

  // pennants on the jump lips and knuckles, banner fences on the pipe decks
  buildFlags() {
    const COLS = [0xff6a2b, 0x2a7de1, 0xf2b705, 0xff4f8b, 0x18a868];
    const poleG = new THREE.CylinderGeometry(0.025, 0.03, 2.4, 6).translate(0, 1.2, 0);
    const flagG = new THREE.BufferGeometry();
    flagG.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.35, 0, 0, 1.75, 0, 0.75, 2.08, 0.04], 3));
    flagG.computeVertexNormals();
    const poleM = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5 });
    const flagMs = COLS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
    // every pole one instanced mesh, the flags one per colour; each a slot the smash can tip
    const spots = [];
    for (const J of JUMPS) for (const s of [-1, 1]) {
      spots.push([centerX(J.lip) + J.dx + s * (J.w / 2 + 1.6), J.lip - 0.5, s]);
      spots.push([centerX(J.lip + J.table) + J.dx + s * (J.w / 2 + 2.2), J.lip + J.table, s]);
    }
    for (const R of RAILS) for (const s of [-1, 1]) spots.push([R.a.x + s * 1.6, R.a.z - 3.5, s]);
    if (spots.length) {
      const poles = new THREE.InstancedMesh(poleG, poleM, spots.length);
      const flags = flagMs.map((m, c) => new THREE.InstancedMesh(flagG, m, Math.ceil((spots.length - c) / flagMs.length)));
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
      spots.forEach(([x, z, out], k) => {
        p.set(x, heightAt(x, z) - 0.1, z);
        poles.setMatrixAt(k, m4.compose(p, q.identity(), one));
        const f = flags[k % flagMs.length], fi = Math.floor(k / flagMs.length);
        f.setMatrixAt(fi, m4.compose(p, q.setFromAxisAngle(Y, out > 0 ? 0.4 : Math.PI - 0.4), one));
        this.smash?.add(x, z, 0.2, [{ im: poles, i: k }, { im: f, i: fi }], { h: 2.3, slow: 0.015 });
      });
      for (const im of [poles, ...flags]) { im.castShadow = true; im.computeBoundingSphere(); this.group.add(im); }
    }
    // banner fences along both pipe decks
    const bannerT = signTexture(['SHREDLINE', 'PARK · PIPE'], '#0f1420', '#fff', '#ff8a3d');
    bannerT.wrapS = THREE.RepeatWrapping;
    const bm = new THREE.MeshStandardMaterial({ map: bannerT, roughness: 0.7, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      for (let z = PIPE.z0 + 30; z < PIPE.z1 - 24; z += 14) {
        const a = PIPE.flat + PIPE.lip + PIPE.deck - 0.6;
        const x0 = centerX(z) + PIPE.dx + s * a, x1 = centerX(z + 5) + PIPE.dx + s * a;
        const y0 = heightAt(x0, z), y1 = heightAt(x1, z + 5);
        // a quad strung between the two posts, following the deck's slope
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0 + 0.3, z, x1, y1 + 0.3, z + 5, x0, y0 + 1.3, z, x1, y1 + 1.3, z + 5], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
        g.setIndex([0, 1, 2, 2, 1, 3]);
        g.computeVertexNormals();
        this.group.add(new THREE.Mesh(g, bm));
        for (const zz of [z, z + 5]) {
          const xx = centerX(zz) + PIPE.dx + s * a;
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), poleM);
          p.position.set(xx, heightAt(xx, zz) + 0.65, zz);
          this.group.add(p);
        }
      }
    }
  }

  buildSigns() {
    const post = new THREE.MeshStandardMaterial({ color: 0x2a2f37, metalness: 0.5, roughness: 0.5 });
    const sign = (x, z, w, h, tex, yaw = 0, raise = 1.6) => {
      const y = heightAt(x, z);
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
      board.position.y = raise + h / 2;
      g.add(board);
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, raise + h + 0.4, 6), post);
        p.position.set(s * (w / 2 - 0.1), (raise + h) / 2 - 0.2, -0.03);
        p.castShadow = true;
        g.add(p);
      }
      g.position.set(x, y, z);
      g.rotation.y = Math.PI + yaw;
      this.group.add(g);
      // on two posts: ride into it and it goes over
      this.smash?.add(x, z, Math.max(0.4, w / 2), [g], { h: raise + h, slow: w > 2 ? 0.1 : 0.05, kind: 'sign' });
      return g;
    };
    const zTop = PARK.top + 6;
    if (MAP.park) {
    // (each beside the head of its line, never in it: riding straight down a line used to run
    // you into its own sign)
    sign(centerX(zTop) - 21, zTop, 4.2, 2.1, signTexture(['JUMP LINE', 'S · M · L · XL']));
    sign(centerX(zTop) + 18.5, zTop, 4.2, 2.1, signTexture(['RAILS', 'BOXES · DOWN · KINK']));
    sign(centerX(zTop) - 46.5, zTop, 4.2, 2.1, signTexture(['ROLLERS', 'PUMP IT']));
    sign(centerX(PIPE.z0 - 4) + PIPE.dx - 15, PIPE.z0 - 4, 4.6, 2.3, signTexture(['HALFPIPE', '4.5 M WALLS']));
    }
    // zone boards down the run, at the edge of the piste on the side of the first feature
    // (never out in the middle where people ride)
    const seen = new Set();
    const firsts = [...JUMPS, ...RAILS].filter((f) => !['Jump Line', 'Rail Garden'].includes(f.zone)).sort((a, b) => a.z - b.z);
    const SUBS = MAP.signs ?? {};
    for (const f of firsts) {
      if (seen.has(f.zone)) continue;
      seen.add(f.zone);
      const z = f.z - 26, side = Math.sign(f.dx) || 1;
      sign(centerX(z) + side * (halfWidth(z) + 1.6), z, 4.2, 2.1, signTexture([f.zone.toUpperCase(), SUBS[f.zone] ?? ''], '#11161f', '#fff', '#3d8bff'), side * 0.35, 1.4);
    }
    // size boards beside every takeoff, with the speed it wants
    for (const J of JUMPS) {
      if (J.drop) continue;
      const z = J.z - 2;
      const size = J.name === 'XL' ? 'XL' : J.h < 2 ? 'S' : J.h < 3 ? 'M' : J.h < 4 ? 'L' : J.h < 5 ? 'XL' : 'XXL';
      sign(centerX(z) + J.dx - J.w / 2 - 2.4, z, 1.6, 1.1, signTexture([size, Math.round(J.speed * 3.6) + ' KM/H'], '#11161f', '#fff', '#3d8bff'), 0, 1.0);
    }
  }
}
