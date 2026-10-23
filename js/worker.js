// A proper ONSA field worker: one continuous body modelled to fit the Xbot skeleton (so it uses the
// professional Mixamo idle / walk / run clips), skinned bone by bone so every part bends with its joint.
// Navy coverall with reflective bands and cargo pockets, an open-front hi-vis vest that is its own
// fitted layer on the same spine bones (it moves exactly with the chest, never through it), real
// hands, neck, face and safety boots. Measurements are in metres in the model's bind pose.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- skin weights along a chain of joints ----------
// s = position along the chain; joints = joint positions along it; bones[i] owns joints[i]→joints[i+1];
// `parent` owns everything before joints[0]. Near each joint the two bones blend smoothly over ±h.
function chainWeights(s, joints, bones, parent, h) {
  let k = 0, best = Infinity;
  joints.forEach((j, i) => { const d = Math.abs(s - j); if (d < best) { best = d; k = i; } });
  const before = k === 0 ? parent : bones[k - 1], after = bones[k];
  let t = THREE.MathUtils.clamp((s - joints[k] + h) / (2 * h), 0, 1);
  t = t * t * (3 - 2 * t);
  if (before === after) return [[after, 1]];
  return [[before, 1 - t], [after, t]];
}

function applySkin(geo, weightFn) {
  const pos = geo.attributes.position, n = pos.count;
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const w = weightFn(v).filter(([, x]) => x > 1e-4).slice(0, 4);
    const sum = w.reduce((a, [, x]) => a + x, 0) || 1;
    w.forEach(([b, x], k) => { idx[i * 4 + k] = b; wts[i * 4 + k] = x / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return geo;
}

// ---------- loft: a skin of elliptical rings ----------
// ring: { c: centre, e1, e2: unit axes, r1, r2: radii, v }; vertex = c + e1·r1·sinθ + e2·r2·cosθ (θ = 0 → +e2)
function loft(rings, seg = 28, theta0 = 0, theta1 = Math.PI * 2, capStart = false, capEnd = false) {
  const closed = Math.abs(theta1 - theta0 - Math.PI * 2) < 1e-6;
  const cols = closed ? seg : seg + 1;
  const pos = [], uv = [], index = [];
  rings.forEach(r => {
    for (let k = 0; k < cols; k++) {
      const th = theta0 + ((theta1 - theta0) * k) / seg;
      const p = r.c.clone().addScaledVector(r.e1, r.r1 * Math.sin(th)).addScaledVector(r.e2, r.r2 * Math.cos(th));
      pos.push(p.x, p.y, p.z);
      uv.push((th - theta0) / (theta1 - theta0), r.v ?? 0);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * cols + k, b = i * cols + ((k + 1) % cols), c = (i + 1) * cols + k, d = (i + 1) * cols + ((k + 1) % cols);
      index.push(a, c, b, b, c, d);
    }
  }
  // make the tube face outward: compare the first face normal with the outward radial direction
  const P = i => V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const faceN = (i0, i1, i2) => new THREE.Vector3().subVectors(P(i1), P(i0)).cross(new THREE.Vector3().subVectors(P(i2), P(i0)));
  if (index.length && faceN(index[0], index[1], index[2]).dot(P(index[0]).sub(rings[0].c)) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }
  const cap = (ri, away) => {
    const r = rings[ri], centre = pos.length / 3, first = index.length;
    pos.push(r.c.x, r.c.y, r.c.z);
    uv.push(0.5, r.v ?? 0);
    for (let k = 0; k < seg; k++) index.push(centre, ri * cols + k, ri * cols + ((k + 1) % cols));
    if (faceN(index[first], index[first + 1], index[first + 2]).dot(away) < 0) {
      for (let i = first; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    }
  };
  if (capStart && rings.length > 1) cap(0, new THREE.Vector3().subVectors(rings[0].c, rings[1].c));
  if (capEnd && rings.length > 1) cap(rings.length - 1, new THREE.Vector3().subVectors(rings[rings.length - 1].c, rings[rings.length - 2].c));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// piecewise-linear profile lookup: rows of [key, ...values]
function profile(rows, key) {
  if (key <= rows[0][0]) return rows[0].slice(1);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (key <= b[0]) { const t = (key - a[0]) / (b[0] - a[0]); return a.slice(1).map((v, k) => v + (b[k + 1] - v) * t); }
  }
  return rows[rows.length - 1].slice(1);
}

function ellipsoid(c, rx, ry, rz, ws = 32, hs = 24) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(c.x, c.y, c.z);
  return g;
}
function capsuleAlong(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(1e-3, len - 2 * r), 4, 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// vest artwork: u runs round the body from the left front edge (0) via the back (0.5) to the right front edge (1)
function vestTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const draw = () => {
    g.fillStyle = '#f4d321'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = 0; x < 1024; x += 5) g.fillRect(x, 0, 1, 256);
    g.fillStyle = '#f0821e';
    g.fillRect(0, 0, 34, 256); g.fillRect(990, 0, 34, 256); g.fillRect(0, 238, 1024, 18);    // front edges, hem
    for (const u of [0.129, 0.333, 0.667, 0.871]) g.fillRect(u * 1024 - 13, 0, 26, 74);         // armhole edges
    g.fillStyle = '#1b2a4a';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 72px Nunito, Arial, sans-serif'; g.fillText('ONSA', 512, 120);
    g.font = '800 27px Nunito, Arial, sans-serif'; g.fillText('POWER & CO.', 512, 172);
    g.font = '900 26px Nunito, Arial, sans-serif'; g.fillText('ONSA', 96, 96);
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  document.fonts?.ready.then(() => { draw(); t.needsUpdate = true; });
  return t;
}
let vestTex = null;

export function buildWorkerBody(ref, { woman = false } = {}) {
  const sk = ref.skeleton;
  const B = name => sk.bones.findIndex(b => b.name === 'mixamorig' + name);
  const bp = {};
  sk.bones.forEach((b, i) => { bp[b.name.replace('mixamorig', '')] = new THREE.Vector3().applyMatrix4(sk.boneInverses[i].clone().invert().premultiply(ref.bindMatrixInverse)); });

  const spine = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
  const spineJ = spine.map(n => bp[n].y), spineB = spine.map(B);
  const torsoW = v => chainWeights(v.y, spineJ, spineB, B('Hips'), 0.05);
  const armW = side => {
    const names = [side + 'Shoulder', side + 'Arm', side + 'ForeArm', side + 'Hand'];
    const J = names.map(n => Math.abs(bp[n].x)), Bs = names.map(B);
    return v => chainWeights(Math.abs(v.x), J, Bs, B('Spine2'), 0.045);
  };
  const legW = side => {
    const names = [side + 'UpLeg', side + 'Leg', side + 'Foot'];
    const J = names.map(n => -bp[n].y), Bs = names.map(B);
    return v => chainWeights(-v.y, J, Bs, B('Hips'), 0.06);
  };
  const footW = side => v => {
    const t = THREE.MathUtils.smoothstep(v.z, 0.03, 0.1);
    return [[B(side + 'Foot'), 1 - t], [B(side + 'ToeBase'), t]];
  };
  const one = name => () => [[B(name), 1]];
  const parts = { navy: [], skin: [], boots: [], vest: [], silver: [], pocket: [], dark: [] };
  const put = (kind, geo, fn) => parts[kind].push(applySkin(geo.index ? geo.toNonIndexed() : geo, fn));

  // ----- torso (hips → neck base): [y, half-width, half-depth, centre z]
  const T = woman
    ? [[0.92, 0.156, 0.118, 0.012], [0.98, 0.172, 0.122, 0.016], [1.05, 0.165, 0.118, 0.018], [1.12, 0.136, 0.104, 0.02], [1.2, 0.14, 0.108, 0.02], [1.28, 0.152, 0.122, 0.016], [1.36, 0.158, 0.118, 0.002], [1.42, 0.158, 0.106, -0.012], [1.47, 0.135, 0.092, -0.02], [1.51, 0.082, 0.072, -0.022], [1.53, 0.062, 0.062, -0.022]]
    : [[0.92, 0.15, 0.115, 0.01], [0.98, 0.165, 0.12, 0.015], [1.05, 0.162, 0.118, 0.018], [1.12, 0.15, 0.112, 0.02], [1.2, 0.152, 0.114, 0.018], [1.28, 0.16, 0.12, 0.012], [1.36, 0.168, 0.118, 0], [1.42, 0.165, 0.108, -0.012], [1.47, 0.14, 0.095, -0.02], [1.51, 0.085, 0.075, -0.022], [1.53, 0.065, 0.065, -0.022]];
  const torsoRing = (y, grow = 0) => { const [rx, rz, cz] = profile(T, y); return { c: V(0, y, cz), e1: V(1, 0, 0), e2: V(0, 0, 1), r1: rx + grow, r2: rz + grow, v: 0 }; };
  const ys = [];
  for (let y = 0.92; y <= 1.5301; y += 0.02) ys.push(Math.min(y, 1.53));
  put('navy', loft(ys.map(y => torsoRing(y)), 36, 0, Math.PI * 2, true, true), torsoW);
  // collar
  put('navy', loft([1.49, 1.51, 1.535].map((y, i) => ({ c: V(0, y, -0.02), e1: V(1, 0, 0), e2: V(0, 0, 1), r1: [0.08, 0.072, 0.062][i], r2: [0.074, 0.068, 0.06][i] })), 28), torsoW);

  // ----- hi-vis vest: lower band all round (open front), then front/back panels up over the shoulders
  const vestRing = y => { const r = torsoRing(y, 0.014); r.v = (y - 1.0) / 0.53; return r; };
  const lowY = [], highY = [];
  for (let y = 1.0; y <= 1.3401; y += 0.02) lowY.push(y);
  for (let y = 1.32; y <= 1.5301; y += 0.015) highY.push(Math.min(y, 1.53));
  const t0 = 0.32, t1 = Math.PI * 2 - 0.32;
  // drape the vest over the shoulder caps so the navy never pokes through it
  const capC = sx => V(sx * 0.125, bp.LeftArm.y + 0.016, bp.LeftArm.z + 0.012), capR = V(0.075 + 0.012, 0.064 + 0.012, 0.072 + 0.012);
  const drape = geo => {
    const p = geo.attributes.position, q = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) for (const sx of [1, -1]) {
      q.fromBufferAttribute(p, i).sub(capC(sx));
      const k = Math.hypot(q.x / capR.x, q.y / capR.y, q.z / capR.z);
      if (k < 1 && k > 1e-6) { q.multiplyScalar(1 / k).add(capC(sx)); p.setXYZ(i, q.x, q.y, q.z); }
    }
    geo.computeVertexNormals();
    return geo;
  };
  put('vest', drape(loft(lowY.map(vestRing), 44, t0, t1)), torsoW);
  for (const [a, b] of [[t0, 1.05], [2.2, 4.08], [5.23, t1]]) {
    const geo = drape(loft(highY.map(vestRing), 14, a, b));
    const uvA = geo.attributes.uv;                                    // keep the vest artwork continuous across panels
    for (let i = 0; i < uvA.count; i++) uvA.setX(i, (a + (b - a) * uvA.getX(i) - t0) / (t1 - t0));
    put('vest', geo, torsoW);
  }

  // ----- arms (sleeves) with reflective bands, shoulder caps, hands
  for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
    const w = armW(side), ay = bp[side + 'Arm'].y, az = bp[side + 'Arm'].z;
    const A = [[0.07, 0.07, 0.07], [0.15, 0.064, 0.062], [0.25, 0.057, 0.055], [0.4, 0.05, 0.048], [0.43, 0.048, 0.047], [0.55, 0.046, 0.044], [0.68, 0.042, 0.04], [0.705, 0.045, 0.043]];
    const xs = [];
    for (let x = 0.07; x <= 0.7051; x += 0.02) xs.push(Math.min(x, 0.705));
    const ring = (x, grow = 0) => { const [r1, r2] = profile(A, x); return { c: V(sx * x, ay, az), e1: V(0, 1, 0), e2: V(0, 0, 1), r1: r1 + grow, r2: r2 + grow }; };
    put('navy', loft(xs.map(x => ring(x)), 24, 0, Math.PI * 2, false, true), w);
    for (const bx of [0.29, 0.335]) put('silver', loft([ring(bx - 0.012, 0.004), ring(bx + 0.012, 0.004)], 24), w);
    // shoulder cap blending torso into sleeve
    put('navy', ellipsoid(V(sx * 0.125, ay + 0.016, az + 0.012), 0.075, 0.064, 0.072, 24, 16), v => {
      const t = THREE.MathUtils.smoothstep(Math.abs(v.x), 0.07, 0.17);
      return [[B('Spine2'), 1 - t], [B(side + 'Arm'), t]];
    });
    // hand: palm, four fingers, thumb (skin), wrist joins the cuff
    const hx = Math.abs(bp[side + 'Hand'].x), hw = one(side + 'Hand');
    put('skin', ellipsoid(V(sx * (hx + 0.045), ay - 0.006, az), 0.05, 0.019, 0.041, 20, 12), hw);
    // wrist: starts inside the cuff and runs into the palm, blending forearm → hand across the joint so the
    // hand bends with the arm instead of floating free of the sleeve
    const wristW = v => { const t = THREE.MathUtils.smoothstep(Math.abs(v.x), hx - 0.03, hx + 0.02); return [[B(side + 'ForeArm'), 1 - t], [B(side + 'Hand'), t]]; };
    const WR = [[-0.06, 0.027, 0.031], [-0.03, 0.026, 0.031], [0, 0.024, 0.033], [0.025, 0.021, 0.036], [0.045, 0.019, 0.038]];
    put('skin', loft(WR.map(([d, r1, r2]) => ({ c: V(sx * (hx + d), ay - 0.004, az), e1: V(0, 1, 0), e2: V(0, 0, 1), r1, r2 })), 18), wristW);
    [-0.027, -0.009, 0.009, 0.027].forEach((dz, i) => {
      const L = [0.05, 0.058, 0.055, 0.045][i];
      put('skin', capsuleAlong(V(sx * (hx + 0.085), ay - 0.006, az + dz), V(sx * (hx + 0.085 + L), ay - 0.012, az + dz * 1.1), 0.0095), hw);
    });
    put('skin', capsuleAlong(V(sx * (hx + 0.03), ay - 0.01, az + 0.035), V(sx * (hx + 0.07), ay - 0.02, az + 0.065), 0.011), hw);
  }

  // ----- legs (trousers) with reflective bands, cargo pockets, boots
  for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
    const w = legW(side), lx = Math.abs(bp[side + 'UpLeg'].x);
    const Lp = woman
      ? [[1.03, 0.104, 0.108], [0.95, 0.098, 0.104], [0.8, 0.086, 0.092], [0.62, 0.072, 0.078], [0.53, 0.066, 0.07], [0.4, 0.062, 0.064], [0.25, 0.054, 0.056], [0.14, 0.058, 0.062]]
      : [[1.03, 0.105, 0.11], [0.95, 0.098, 0.105], [0.8, 0.09, 0.095], [0.62, 0.075, 0.08], [0.53, 0.068, 0.072], [0.4, 0.064, 0.066], [0.25, 0.056, 0.058], [0.14, 0.058, 0.062]];
    const ys2 = [];
    for (let y = 1.03; y >= 0.1399; y -= 0.025) ys2.push(Math.max(y, 0.14));
    const ring = (y, grow = 0) => { const [r1, r2] = profile(Lp.slice().reverse(), y); return { c: V(sx * lx, y, 0.006), e1: V(1, 0, 0), e2: V(0, 0, 1), r1: r1 + grow, r2: r2 + grow }; };
    put('navy', loft(ys2.map(y => ring(y)), 26, 0, Math.PI * 2, false, true), w);
    for (const by of [0.33, 0.385]) put('silver', loft([ring(by + 0.012, 0.004), ring(by - 0.012, 0.004)], 26), w);
    const pocket = new RoundedBoxGeometry(0.026, 0.13, 0.11, 2, 0.008);
    pocket.translate(sx * (lx + 0.094), 0.72, 0.008);
    put('pocket', pocket, w);
    const flap = new RoundedBoxGeometry(0.03, 0.03, 0.115, 2, 0.006);
    flap.translate(sx * (lx + 0.097), 0.79, 0.008);
    put('pocket', flap, w);
    const fx = Math.abs(bp[side + 'Foot'].x);
    const boot = new RoundedBoxGeometry(0.11, 0.12, 0.275, 3, 0.04);
    boot.translate(sx * fx, 0.06, 0.045);
    put('boots', boot, footW(side));
    put('boots', loft([0.1, 0.19].map(y => ({ c: V(sx * fx, y, -0.012), e1: V(1, 0, 0), e2: V(0, 0, 1), r1: 0.06, r2: 0.066 })), 20, 0, Math.PI * 2, false, true), w);
    const sole = new RoundedBoxGeometry(0.116, 0.025, 0.285, 2, 0.01);
    sole.translate(sx * fx, 0.0125, 0.046);
    put('dark', sole, footW(side));
  }

  // ----- neck, head, ears, nose (skin); eyes, brows, mouth (dark)
  put('skin', loft([1.48, 1.56, 1.64].map(y => ({ c: V(0, y, -0.008), e1: V(1, 0, 0), e2: V(0, 0, 1), r1: 0.047, r2: 0.052 })), 22), torsoW);
  const hc = V(0, 1.695, 0.004);
  put('skin', ellipsoid(hc, 0.088, 0.112, 0.124, 40, 30), v => (v.y < 1.6 ? [[B('Neck'), 0.5], [B('Head'), 0.5]] : [[B('Head'), 1]]));
  const hw = one('Head');
  put('skin', ellipsoid(V(0, 1.637, 0.112), 0.013, 0.019, 0.017, 16, 12), hw);
  for (const s of [-1, 1]) {
    put('skin', ellipsoid(V(s * 0.089, 1.672, 0.004), 0.012, 0.029, 0.021, 16, 12), hw);
    put('dark', ellipsoid(V(s * 0.031, 1.661, 0.111), 0.0105, 0.0105, 0.007, 14, 10), hw);
    put('dark', capsuleAlong(V(s * 0.018, 1.684 + 0.001, 0.115), V(s * 0.046, 1.684 - 0.002, 0.108), 0.0035), hw);
  }
  put('dark', capsuleAlong(V(-0.014, 1.608, 0.091), V(0.014, 1.608, 0.091), 0.003), hw);

  vestTex = vestTex || vestTexture();
  const mats = {
    navy: new THREE.MeshStandardMaterial({ color: 0x1c2b52, roughness: 0.85 }),
    pocket: new THREE.MeshStandardMaterial({ color: 0x16244a, roughness: 0.85 }),
    skin: new THREE.MeshStandardMaterial({ color: woman ? 0xb07a5e : 0x9c6a4c, roughness: 0.62 }),
    boots: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.45, metalness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141012, roughness: 0.5 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.55 }),
    vest: new THREE.MeshStandardMaterial({ map: vestTex, roughness: 0.75, side: THREE.DoubleSide }),
  };
  const meshes = [];
  for (const [kind, geos] of Object.entries(parts)) {
    if (!geos.length) continue;
    for (const g of geos) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); }
    const geo = mergeGeometries(geos);
    const m = new THREE.SkinnedMesh(geo, mats[kind]);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    m.position.copy(ref.position);
    m.quaternion.copy(ref.quaternion);
    m.scale.copy(ref.scale);
    ref.parent.add(m);
    m.bind(sk, ref.bindMatrix);
    meshes.push(m);
  }
  return meshes;
}
