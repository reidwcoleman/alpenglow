// What a rider does at a sharp edge in the snow: the sides of a built form are walls you can run
// into, and the rim of one is a place you ride off into the air. All of it reads nothing but a
// height function h(x, z), so the rider, the crash body and the tests share it.
const STEP = 0.16; // how finely a move is walked along the snow
const WALL = 2.75; // a slope this steep (70 degrees) is a wall, not snow you can ride
const FALLS = -0.5; // falling away this fast along the move: an edge

function gradient(h, x, z) {
  const dx = (h(x + 0.12, z) - h(x - 0.12, z)) / 0.24, dz = (h(x, z + 0.12) - h(x, z - 0.12)) / 0.24;
  return { dx, dz, length: Math.hypot(dx, dz) };
}

// the first wall the move a -> b runs into, walking it: how far along, and the way out of it
function firstWall(h, a, b) {
  const mx = b.x - a.x, mz = b.z - a.z, len = Math.hypot(mx, mz);
  if (len < 1e-7) return null;
  const n = Math.max(1, Math.ceil(len / STEP));
  let last = h(a.x, a.z);
  for (let i = 1; i <= n; i++) {
    const k = i / n, x = a.x + mx * k, z = a.z + mz * k, y = h(x, z), rising = y > last + 0.001;
    last = y;
    if (!rising || y < a.y + (b.y - a.y) * k - 0.1) continue;
    const g = gradient(h, x, z);
    if (g.length >= WALL && mx * g.dx + mz * g.dz > 0) return { t: (i - 1) / n, nx: -g.dx / g.length, nz: -g.dz / g.length };
  }
  return null;
}

// run into a wall on the move a -> b? Where to stand clear of it (margin off its foot) and its
// outward normal, or null
export function wallHit(h, a, b, margin = 0.55) {
  const w = firstWall(h, a, b), g = gradient(h, b.x, b.z);
  const into = (b.x - a.x) * g.dx + (b.z - a.z) * g.dz;
  if (!w && (h(b.x, b.z) < b.y - 0.1 || g.length < WALL || b.y > a.y + 1e-6 || into < -1e-6)) return null;
  const nx = w?.nx ?? -g.dx / g.length, nz = w?.nz ?? -g.dz / g.length;
  let x = w ? a.x + (b.x - a.x) * w.t : b.x, z = w ? a.z + (b.z - a.z) * w.t : b.z;
  // (backed out until it's off the wall's face)
  for (let s = 0; s < 4 && !(gradient(h, x, z).length < WALL && h(x, z) <= b.y + 0.1); s += 0.12) { x += nx * 0.12; z += nz * 0.12; }
  return { x: x + nx * margin, z: z + nz * margin, nx, nz };
}

// does the move a -> b run off an edge? The snow's own grade at a (the flatter of the two sides, so
// the drop itself doesn't count) along the move, split by axis, or null
export function snowEdge(h, a, b) {
  const mx = b.x - a.x, mz = b.z - a.z, len = Math.hypot(mx, mz);
  if (len < 1e-7) return null;
  const ux = mx / len, uz = mz / len, n = Math.max(1, Math.ceil(len / STEP)), step = len / n;
  let last = h(a.x, a.z);
  for (let i = 1; i <= n; i++) {
    const x = a.x + ux * step * i, z = a.z + uz * step * i, y = h(x, z), falling = (y - last) / step < FALLS;
    last = y;
    if (!falling) continue;
    const g = gradient(h, x, z);
    if (g.length < WALL || ux * g.dx + uz * g.dz >= -0.3) continue;
    const y0 = h(a.x, a.z), flatter = (p, q) => (Math.abs(p) < Math.abs(q) ? p : q);
    const dx = flatter((h(a.x + 0.4, a.z) - y0) / 0.4, (y0 - h(a.x - 0.4, a.z)) / 0.4);
    const dz = flatter((h(a.x, a.z + 0.4) - y0) / 0.4, (y0 - h(a.x, a.z - 0.4)) / 0.4);
    const grade = dx * ux + dz * uz;
    return { grade: Math.abs(grade) < 1 ? grade : 0, dx, dz };
  }
  return null;
}

// flying through a kicker's lip line below the snow: where the move a -> b first met it, or null
export function kickerSweep(h, kickers, a, b) {
  if (b.z <= a.z) return null;
  for (const J of kickers) {
    if (a.z >= J.z || b.z < J.z) continue;
    const t = (J.z - a.z) / (b.z - a.z), x = a.x + (b.x - a.x) * t;
    if (a.y + (b.y - a.y) * t > h(x, J.z)) continue;
    let lo = 0, hi = t;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2, mx = a.x + (b.x - a.x) * m, mz = a.z + (b.z - a.z) * m;
      if (a.y + (b.y - a.y) * m > h(mx, mz)) lo = m; else hi = m;
    }
    const cx = a.x + (b.x - a.x) * hi, cz = a.z + (b.z - a.z) * hi;
    return { x: cx, y: h(cx, cz), z: cz };
  }
  return null;
}
