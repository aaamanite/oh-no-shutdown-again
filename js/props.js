// Detailed props built from real shapes: lattice towers, insulators, trees, oil palms, cars,
// and the rigged, animated ONSA field workers.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CDN, surface } from './look.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a straight structural member (angle iron approximated as a thin box) from a to b
function member(list, a, b, t) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  if (len < 1e-3) return;
  const g = new THREE.BoxGeometry(t, len, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  list.push(g);
}

// ---------- steel lattice: square tapered body with X-bracing, optional truss crossarms ----------
const latticeCache = new Map();
export function latticeGeometry(h, base, top, panels = 6, arms = []) {
  const key = [h, base, top, panels, JSON.stringify(arms)].join('|');
  if (latticeCache.has(key)) return latticeCache.get(key);
  const L = [];
  const half = y => base + (top - base) * (y / h);
  // panels get shorter towards the top, like real towers
  const ys = [];
  for (let i = 0; i <= panels; i++) ys.push(h * (1 - Math.pow(1 - i / panels, 1.35)));
  const corner = (y, k) => { const w = half(y); return V(k === 0 || k === 3 ? -w : w, y, k < 2 ? -w : w); };
  for (let i = 0; i < panels; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      member(L, corner(y0, k), corner(y1, k), 0.16);
      member(L, corner(y1, k), corner(y1, n), 0.07);
      member(L, corner(y0, k), corner(y1, n), 0.055);
      member(L, corner(y0, n), corner(y1, k), 0.055);
    }
  }
  // crossarms: triangular trusses either side of the body
  for (const { y, span } of arms) {
    const w = half(y);
    for (const s of [-1, 1]) {
      const tip = V(s * span / 2, y - 0.05, 0);
      for (const z of [-w, w]) member(L, V(s * w, y, z), tip, 0.1);
      member(L, V(s * w, y - 0.9, 0), tip, 0.09);
      const steps = Math.max(2, Math.round((span / 2 - w) / 0.9));
      for (let k = 1; k < steps; k++) {
        const t = k / steps, x = s * (w + (span / 2 - w) * t);
        const zz = w * (1 - t), yb = y - 0.9 * (1 - t);
        member(L, V(x, y, -zz), V(x, y, zz), 0.05);
        member(L, V(x, y, -zz), V(x, yb, 0), 0.05);
        member(L, V(x, y, zz), V(x, yb, 0), 0.05);
      }
    }
  }
  const geo = mergeGeometries(L);
  latticeCache.set(key, geo);
  return geo;
}

// glass cap-and-pin insulator string hanging from (x, y) down `len`
export function insulatorString(list, x, y, z, len) {
  const discs = Math.max(3, Math.round(len / 0.1));
  for (let i = 0; i < discs; i++) {
    const g = new THREE.CylinderGeometry(0.13, 0.15, 0.035, 14);
    g.translate(x, y - 0.08 - (i * (len - 0.12)) / discs, z);
    list.push(g);
  }
  const rod = new THREE.CylinderGeometry(0.025, 0.025, len, 6);
  rod.translate(x, y - len / 2, z);
  list.push(rod);
}

// porcelain post insulator with sheds (unit: radius 1, height 1, base at y=0)
export const SHEDS = (() => {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.62, 0)];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const y = 0.05 + (i / n) * 0.88;
    pts.push(new THREE.Vector2(0.55, y), new THREE.Vector2(1, y + 0.03), new THREE.Vector2(0.98, y + 0.06), new THREE.Vector2(0.55, y + 0.1));
  }
  pts.push(new THREE.Vector2(0.6, 0.97), new THREE.Vector2(0.75, 1), new THREE.Vector2(0, 1));
  return new THREE.LatheGeometry(pts, 18);
})();

// ---------- trees ----------
function leafTexture(seed, palette) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = seeded(seed);
  for (let i = 0; i < 110; i++) {
    const x = 10 + r() * 108, y = 10 + r() * 108, a = r() * Math.PI, s = 5 + r() * 7;
    g.fillStyle = palette[Math.floor(r() * palette.length)];
    g.beginPath();
    g.ellipse(x, y, s, s * 0.45, a, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hashNoise(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// broadleaf crown: a lumpy smooth core plus leaf cards for a leafy silhouette
export function broadleaf(seed) {
  const r = seeded(seed);
  const blobs = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(0.62 + r() * 0.35, 3);
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.4 + r() * 0.45;
    g.translate(Math.cos(a) * d, i === 0 ? 0.4 : 0.1 + r() * 0.8, Math.sin(a) * d);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    blobs.push(g);
  }
  let core = mergeVertices(mergeGeometries(blobs), 1e-3);
  const pos = core.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (hashNoise(x * 3, y * 3, z * 3) - 0.5) * 0.28;
    pos.setXYZ(i, x * k, y * k, z * k);
    const s = 0.7 + hashNoise(x, y, z) * 0.4 + (y + 0.5) * 0.08;
    colors.push(0.12 * s, 0.24 * s, 0.09 * s);
  }
  core.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  core.computeVertexNormals();
  // leaf cards on the surface
  const cards = [];
  for (let i = 0; i < 150; i++) {
    const p = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(1.25 + r() * 0.6);
    p.y = p.y * 0.85 + 0.5;
    const q = new THREE.PlaneGeometry(1.1, 1.1);
    q.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)));
    q.translate(p.x, p.y, p.z);
    cards.push(q);
  }
  return { core, cards: mergeGeometries(cards) };
}

export function treeMaterials() {
  return {
    core: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    cards: new THREE.MeshStandardMaterial({ map: leafTexture(5, ['#2c5220', '#36612a', '#3f6e2e', '#284a1c', '#4b7a34', '#5a8a3a']), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    bark: surface('bark', 0x9a8070),
  };
}

export function trunkGeometry(h, r0, r1, seed) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 9, 4);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position, rr = seeded(seed);
  const bend = (rr() - 0.5) * 0.25;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + bend * Math.pow(pos.getY(i) / h, 2));
  g.computeVertexNormals();
  return g;
}

// oil palm: a ringed trunk and a crown of drooping pinnate fronds
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#6b5a2e'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(512, 64); g.stroke();
  const r = seeded(21);
  for (let x = 20; x < 500; x += 7) {
    const len = 56 * (1 - Math.pow(x / 512 - 0.35, 2) * 1.6);
    for (const s of [-1, 1]) {
      g.strokeStyle = ['#3e6b26', '#4c7d2e', '#355f22', '#5a8a35'][Math.floor(r() * 4)];
      g.lineWidth = 3 + r() * 2;
      g.beginPath();
      g.moveTo(x, 64);
      g.quadraticCurveTo(x + 10, 64 + s * len * 0.5, x + 22, 64 + s * Math.max(8, len));
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function palmCrown(seed) {
  const r = seeded(seed);
  const fronds = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    const L = 3.8 + r() * 1.2;
    const g = new THREE.PlaneGeometry(L, 1.5, 10, 1);
    g.translate(L / 2, 0, 0);
    g.rotateX(-Math.PI / 2); // lie flat, length along +x
    const pos = g.attributes.position;
    const lift = 0.5 + r() * 0.5, droop = 0.11 + r() * 0.05;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      pos.setZ(k, z * (1 - (x / L) * 0.7));
      pos.setY(k, x * lift - droop * x * x);
    }
    g.computeVertexNormals();
    const tier = i / count;
    g.rotateZ(0); // keep
    g.rotateY((i / count) * Math.PI * 2 * 2.618 + r() * 0.3); // golden-angle spiral
    g.translate(0, -tier * 0.6, 0);
    fronds.push(g);
  }
  return mergeGeometries(fronds);
}

export function palmMaterials() {
  return {
    frond: new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }),
    trunk: surface('bark', 0x8a7a62),
  };
}

// ---------- cars ----------
const carGeo = (() => {
  const body = new THREE.BoxGeometry(1.8, 0.62, 4.1, 2, 1, 4);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    if (Math.abs(z) > 1.8 && y > 0) p.setY(i, y - 0.12); // sloped bonnet and boot
  }
  body.translate(0, 0.62, 0);
  body.computeVertexNormals();
  const cabin = new THREE.CylinderGeometry(0.72, 0.85, 2.2, 4, 1);
  cabin.rotateY(Math.PI / 4);
  cabin.scale(1.18, 0.55, 1);
  cabin.translate(0, 1.22, -0.15);
  return { body, cabin: cabin.toNonIndexed() };
})();
carGeo.cabin.computeVertexNormals();
const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18).rotateZ(Math.PI / 2);
const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.08, metalness: 0.6 });
const tyre = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 });
const paints = new Map();
export function car(color) {
  if (!paints.has(color)) paints.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const g = new THREE.Group();
  const body = new THREE.Mesh(carGeo.body, paints.get(color));
  const cab = new THREE.Mesh(carGeo.cabin, glass);
  g.add(body, cab);
  for (const [x, z] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(x, 0.34, z);
    g.add(w);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(0.85);
  return g;
}

// ---------- rigged, animated ONSA field workers ----------
function vestTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2d22e'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#f08a24';
  g.fillRect(0, 0, 40, 256); g.fillRect(984, 0, 40, 256); g.fillRect(0, 226, 1024, 30);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = 0; x < 1024; x += 6) g.fillRect(x, 0, 1, 256); // mesh weave
  g.fillStyle = '#1b2a4a';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 78px Nunito, Arial, sans-serif'; g.fillText('ONSA', 512, 92);
  g.font = '800 30px Nunito, Arial, sans-serif'; g.fillText('POWER & CO.', 512, 150);
  g.font = '900 30px Nunito, Arial, sans-serif'; g.fillText('ONSA', 118, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  document.fonts?.ready.then(() => {
    g.fillStyle = '#f2d22e'; g.fillRect(60, 40, 120, 60); g.fillRect(300, 40, 424, 140);
    g.fillStyle = '#1b2a4a';
    g.font = '900 78px Nunito, Arial, sans-serif'; g.fillText('ONSA', 512, 92);
    g.font = '800 30px Nunito, Arial, sans-serif'; g.fillText('POWER & CO.', 512, 150);
    g.font = '900 30px Nunito, Arial, sans-serif'; g.fillText('ONSA', 118, 70);
    t.needsUpdate = true;
  });
  return t;
}

// colours the mannequin by its bind-pose shape: navy coverall, reflective bands, boots, skin
function workwear(name, woman) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  if (name === 'Beta_Joints') { m.color.setHex(0x16233f); return m; }
  const skin = woman ? 'vec3(0.62, 0.42, 0.31)' : 'vec3(0.55, 0.37, 0.26)';
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec3 col = vec3(0.07, 0.12, 0.27);
        float ax = abs(vBind.x), yy = vBind.y;
        if (yy < 0.13) col = vec3(0.03);
        if (ax < 0.3 && ((yy > 0.29 && yy < 0.32) || (yy > 0.35 && yy < 0.38))) col = vec3(0.75, 0.77, 0.8);
        if (yy > 1.3 && ((ax > 0.28 && ax < 0.305) || (ax > 0.325 && ax < 0.35))) col = vec3(0.75, 0.77, 0.8);
        if (yy > 1.545 || ax > 0.69) col = ${skin};
        vec4 diffuseColor = vec4(col, opacity);`);
  };
  m.customProgramCacheKey = () => 'workwear' + (woman ? 'w' : 'm');
  return m;
}

function gearForHead(woman) {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf7f7f2, roughness: 0.3, clearcoat: 0.8 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
  dome.scale.set(1, 0.88, 1.12);
  dome.position.set(0, 0.095, 0.012);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.152, 0.01, 40), white);
  brim.scale.set(1, 1, 1.14);
  brim.position.set(0, 0.095, 0.016);
  const peak = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 8, 0, Math.PI * 2, 0, 0.35), white);
  peak.scale.set(0.95, 0.25, 1);
  peak.position.set(0, 0.07, 0.12);
  const ridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.2, 4, 8), white);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, 0.21, 0.01);
  const stickerC = document.createElement('canvas');
  stickerC.width = 256; stickerC.height = 80;
  const sg = stickerC.getContext('2d');
  sg.fillStyle = '#2f6fb5'; sg.fillRect(0, 0, 256, 80);
  sg.fillStyle = '#fff'; sg.font = '900 54px Nunito, Arial, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('ONSA', 128, 42);
  const st = new THREE.CanvasTexture(stickerC); st.colorSpace = THREE.SRGBColorSpace;
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.024), new THREE.MeshStandardMaterial({ map: st, roughness: 0.4 }));
  sticker.position.set(0, 0.155, 0.143);
  sticker.rotation.x = -0.55;
  const lens = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.13, 4, 12), new THREE.MeshPhysicalMaterial({ color: 0xd8ecff, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.55 }));
  lens.rotation.z = Math.PI / 2;
  lens.scale.set(1, 1, 0.3);
  lens.position.set(0, 0.075, 0.108);
  g.add(dome, brim, peak, ridge, sticker, lens);
  if (woman) {
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6 });
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 12, Math.PI, Math.PI, 0.5, 1.6), hair);
    back.position.set(0, 0.07, -0.005);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.17, 6, 10), hair);
    tail.position.set(0, -0.02, -0.13);
    tail.rotation.x = 0.35;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 16), new THREE.MeshStandardMaterial({ color: 0x2f6fb5 }));
    tie.position.set(0, 0.075, -0.12);
    tie.rotation.x = 1.2;
    g.add(back, tail, tie);
  }
  return g;
}

function gearForChest() {
  const vest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.168, 0.162, 0.44, 40, 1, true, 0.28, Math.PI * 2 - 0.56),
    new THREE.MeshStandardMaterial({ map: vestTexture(), roughness: 0.7, side: THREE.DoubleSide }),
  );
  vest.scale.set(1.1, 1, 0.82);
  vest.position.set(0, -0.03, 0.005);
  return vest;
}

let gltfPromise = null;
export function loadWorkers() {
  if (!gltfPromise) gltfPromise = new GLTFLoader().loadAsync(CDN + 'models/gltf/Xbot.glb');
  return gltfPromise;
}

// a rigged worker parented to `holder`; returns the animation controller
export function makeWorker(gltf, holder, { woman = false, scale = 2.3, tablet = false } = {}) {
  const model = SkeletonUtils.clone(gltf.scene);
  model.scale.setScalar(scale);
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = workwear(o.name, woman);
    }
  });
  const bone = n => model.getObjectByName('mixamorig' + n);
  const attach = (b, obj) => { obj.scale.multiplyScalar(100); b.add(obj); };
  attach(bone('Head'), gearForHead(woman));
  attach(bone('Spine2'), gearForChest());
  if (tablet) {
    const tab = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.24, 0.012), new THREE.MeshStandardMaterial({ color: 0x1f2a33, roughness: 0.3 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.21), new THREE.MeshBasicMaterial({ color: 0x7fe3ff }));
    screen.position.z = 0.007;
    tab.add(slab, screen);
    tab.position.set(0, 0.1, 0.05);
    tab.rotation.x = -0.4;
    attach(bone('RightHand'), tab);
  }
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  holder.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clip = name => gltf.animations.find(a => a.name === name);
  const actions = { idle: mixer.clipAction(clip('idle')), walk: mixer.clipAction(clip('walk')), run: mixer.clipAction(clip('run')) };
  actions.idle.play();
  const rig = { model, mixer, actions, current: 'idle' };
  rig.play = name => {
    if (rig.current === name) return;
    const from = actions[rig.current], to = actions[name];
    to.reset().setEffectiveWeight(1).play();
    from.crossFadeTo(to, 0.25, false);
    rig.current = name;
  };
  return rig;
}
