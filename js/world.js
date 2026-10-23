// The 3D site: the substation, its IT/OT neighbours, generation and the town it feeds, rendered with
// physically based materials, a physical sky and post-processing (see look.js and props.js),
// plus the network overlay, attack rings and a camera rig you can pan, rotate and zoom.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Look, surface, grassTextures, makeOcean, chainLink, groundVariation } from './look.js';
import { buildSatellite, buildGroundDish } from './satellite.js';
import { latticeGeometry, insulatorString, SHEDS, broadleaf, treeMaterials, trunkGeometry, palmCrown, palmMaterials, car, loadWorkers, makeWorker } from './props.js';

const COL = {
  sand: 0xe6d8bb, gravel: 0xbab3a5, road: 0x5b6167, water: 0x5f9c95, shore: 0xd9c9a2,
  steel: 0x9aa5ab, steelDark: 0x6d777d, porcelain: 0x8b4a2b, concrete: 0xd6cfc1,
  tree: 0x6a9f57, trunk: 0x7a5b3c, grass: 0x9cc47a, xfmr: 0x7c8a90,
};

const NET_COLORS = { ok: 0x4fb6d8, weak: 0xf2b33d, attack: 0xff5a4e, exposed: 0xff8a4e };

// Where each asset lives. c = ground centre, r = attack-ring radius, hub = network attach point, label = label anchor.
const LAYOUT = {
  internet: { c: [-66, 40], r: 7, hub: [-63, 1.2, 36], label: [-66, 27, 40] },
  corp: { c: [-48, -32], r: 14, hub: [-44, 1.2, -16.5], label: [-48, 31, -32] },
  dmz: { c: [-24, -28], r: 8, hub: [-24, 1.2, -23.5], label: [-24, 8.5, -28] },
  scc: { c: [-34, 22], r: 9, hub: [-30, 1.2, 16.5], label: [-34, 12, 22] },
  ctrl: { c: [-14.5, 8.5], r: 6, hub: [-14.5, 1.2, 12], label: [-14.5, 8, 8.5] },
  yard: { c: [2, -1], r: 21, hub: [2, 1.2, -2], label: [6, 13, -1] },
  townA: { c: [68, -21], r: 23, hub: [46, 1.2, -19], label: [68, 7, -21] },
  townB: { c: [68, 20], r: 23, hub: [46, 1.2, 19], label: [68, 14, 15] },
  biogas: { c: [2, -46], r: 32, hub: [22.5, 1.2, -36.6], label: [-9, 13, -46] },
  wind: { c: [76, -78], r: 32, hub: [56, 1.2, -50.5], label: [76, 26, -78] },
  townC: { c: [74, 62], r: 24, hub: [52, 1.2, 50], label: [71, 13, 56] },
  townD: { c: [14, 75], r: 25, hub: [8, 1.2, 52], label: [8, 14, 70] },
  solar: { c: [-84, 70], r: 26, hub: [-62, 1.2, 56], label: [-84, 7, 70] },
  rnd: { c: [-45, 74], r: 16, hub: [-45, 1.2, 62], label: [-46, 20, 84] },
  // chapter 3: in the far west, not offset
  hydro: { c: [-248, 36], r: 30, hub: [-222, 1.2, 22], label: [-262, 31, 36] },
  factory: { c: [-194, -37], r: 38, hub: [-186, 1.2, -6], label: [-196, 20, -37] },
};

// Each area sits at its own offset so sites are spread apart — the town and hospital well clear of the grid.
const OFFSETS = {
  internet: [-20, 0], corp: [-20, 0], dmz: [-17, 0], scc: [-26, 0],
  townA: [45, 0], townB: [45, 0], townC: [45, 25], townD: [0, 25],
  biogas: [0, -20], wind: [0, -20], rnd: [-25, 30], solar: [-45, 20],
};
for (const [id, [dx, dz]] of Object.entries(OFFSETS)) {
  const L = LAYOUT[id];
  L.c = [L.c[0] + dx, L.c[1] + dz];
  L.hub = [L.hub[0] + dx, L.hub[1], L.hub[2] + dz];
  L.label = [L.label[0] + dx, L.label[1], L.label[2] + dz];
}

// colour codes used by the builders map to realistic surfaces (textured, world-scaled) or PBR presets
const SURFACE_OF = new Map([
  [COL.gravel, ['gravel']], [COL.road, ['asphalt']], [COL.concrete, ['concrete']], [COL.grass, ['grass']],
  [COL.sand, ['sand']], [COL.shore, ['sand']], [0xc9c3b6, ['concrete']], [0xc9bf9f, ['concrete', 0xe8e0cc]],
  [0xb59a6e, ['soil']], [0xa9a49a, ['concrete', 0xd8d4cc]], [0xd8cfbf, ['plaster', 0xe9e0d0]], [0xcfc8ba, ['plaster', 0xdcd4c4]],
  [0xd7d2c4, ['plaster', 0xe6e1d4]], [0x8a9096, ['asphalt', 0xd0d4d8]], [0x6f767c, ['asphalt', 0xc6cacd]], [0xb8b0a0, ['concrete', 0xd8d0c0]],
]);
const METAL = new Set([COL.steel, COL.steelDark, 0xb8c0c4, 0xa9b3b8, 0x9aa5ab, 0x8a9399, 0xbfc5c9, 0xb9c1c5, 0x9aa3a8, 0xa8b0b4, 0xb5bcc0, 0x8f9aa0, 0x50585e, 0x6f7c82, 0x8a979c, 0x9aa7b0, 0xe6e6e6]);
const _mats = new Map();
function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = _mats.get(key);
  if (!m) {
    if (!extra && SURFACE_OF.has(color)) {
      const [kind, tint] = SURFACE_OF.get(color);
      m = surface(kind, tint ?? 0xffffff);
    } else {
      const metal = METAL.has(color);
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: metal ? 0.4 : color === COL.porcelain ? 0.18 : color === COL.xfmr ? 0.48 : 0.62,
        metalness: metal ? 0.78 : color === COL.xfmr ? 0.35 : 0.03,
        ...extra,
      });
    }
    _mats.set(key, m);
  }
  return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 28);
const PACKET = new THREE.SphereGeometry(0.42, 10, 8);
const JOINT = new THREE.SphereGeometry(1, 10, 8);
const DOME = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
// earth embankment: a square frustum with sloped sides (unit footprint, unit height, centred)
const BUND = (() => { const g = new THREE.CylinderGeometry(0.62, 0.71, 1, 4, 1).rotateY(Math.PI / 4).toNonIndexed(); g.computeVertexNormals(); return g; })();

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function add(parent, geo, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const asMat = c => (typeof c === 'number' ? mat(c) : c);
// Boxes and cylinders sit on their base y.
// photovoltaic module: dark cells with silver busbars inside an aluminium frame
function panelTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#c9ced2'; g.fillRect(0, 0, 256, 160);
  if (kind === 'pv') {
    g.fillStyle = '#0f1c3a'; g.fillRect(3, 3, 250, 154);
    g.strokeStyle = 'rgba(190,200,215,0.55)'; g.lineWidth = 1;
    for (let x = 6; x <= 250; x += 244 / 10) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 154); g.stroke(); }
    for (let y = 6; y <= 154; y += 148 / 6) { g.beginPath(); g.moveTo(6, y); g.lineTo(250, y); g.stroke(); }
    g.strokeStyle = 'rgba(220,225,235,0.35)';
    for (let x = 6; x < 250; x += 244 / 30) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 154); g.stroke(); }
  } else {
    g.fillStyle = '#7d8a94'; g.fillRect(4, 4, 248, 152);
    g.strokeStyle = '#d6dde2'; g.lineWidth = 3;
    for (let x = 16; x < 250; x += 24) for (let y = 14; y < 150; y += 24) { g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// hip roof over a w×d footprint: two trapezoids and two triangles meeting at a ridge
function hipRoofGeometry(w, d, h) {
  const swap = d > w;
  const L = swap ? d : w, S = swap ? w : d, r = (L - S) / 2;
  const A = [-L / 2, 0, -S / 2], B = [L / 2, 0, -S / 2], C = [L / 2, 0, S / 2], D = [-L / 2, 0, S / 2], R1 = [-r, h, 0], R2 = [r, h, 0];
  const tri = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, C, B, R2, A, D, R1].flat();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  if (swap) geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

const _rounded = new Map();
function roundedBox(w, h, d) {
  const key = `${w.toFixed(2)},${h.toFixed(2)},${d.toFixed(2)}`;
  if (!_rounded.has(key)) _rounded.set(key, new RoundedBoxGeometry(w, h, d, 3, Math.min(0.12, Math.min(w, h, d) * 0.15)));
  return _rounded.get(key);
}
const box = (p, w, h, d, color, x, y, z) => (Math.min(w, h, d) >= 0.6
  ? add(p, roundedBox(w, h, d), asMat(color), x, y + h / 2, z)
  : add(p, BOX, asMat(color), x, y + h / 2, z, w, h, d));
const cyl = (p, r, h, color, x, y, z) => (color === COL.porcelain
  ? add(p, SHEDS, asMat(color), x, y, z, r * 1.3, h, r * 1.3)
  : add(p, CYL, asMat(color), x, y + h / 2, z, r, h, r));

// Canvas text for signs and uniform prints; redrawn once web fonts arrive.
function textTexture(lines, w, h, bg) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const L of lines) {
      let size = L.size;
      g.font = `${L.weight || 900} ${size}px Nunito, Arial, sans-serif`;
      const fit = (w * 0.92) / g.measureText(L.text).width;
      if (fit < 1) { size = Math.floor(size * fit); g.font = `${L.weight || 900} ${size}px Nunito, Arial, sans-serif`; }
      g.fillStyle = L.color;
      g.fillText(L.text, w / 2, L.y);
    }
    t.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return t;
}

// closest point on a 2D segment [ax, az, bx, bz] → [x, z, distance]
function nearestOnSeg(px, pz, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  const x = ax + dx * t, z = az + dz * t;
  return [x, z, Math.hypot(px - x, pz - z)];
}

const BRAND = { navy: '#1b2a4a', amber: '#f2b33d', panel: '#1d2928', white: '#f4f6f2' };

// ---------- the west: forested hills and the Sungai Mutiara valley (chapter 3 builds the dam in its gorge) ----------
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hillNoise = (x, z) => 0.5 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.05 + x * 0.01)
  + 0.3 * Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.13 - x * 0.05) + 0.2 * Math.sin(x * 0.23 - z * 0.19);
const DAM_X = -276;   // upstream face of the dam
const RES_Y = 17.5;   // reservoir level
const valleyZ = x => 36 + 5 * Math.sin((x - DAM_X) * 0.035);
// the Sungai Mutiara: down its valley, through the gorge, past the dam's powerhouse, then south to the sea
const RIVER = (() => {
  const ctrl = [];
  for (let x = -352; x <= -262; x += 10) ctrl.push(new THREE.Vector3(x, 0, valleyZ(x)));
  for (const [x, z] of [[-256, 36], [-249, 34.5], [-243.5, 30], [-240.5, 22], [-240, 8], [-240.5, -10], [-242, -30], [-244, -50], [-245.5, -66], [-246.5, -82]]) ctrl.push(new THREE.Vector3(x, 0, z));
  return new THREE.CatmullRomCurve3(ctrl).getSpacedPoints(200).map(p => [p.x, p.z]);
})();
function riverDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
// ground height in the west: hills rise from x = -236; the valley is carved around the river with a flat floor
// (reservoir basin upstream, a gorge at the dam, a wide basin below it for the powerhouse, then a river channel)
function westHeight(x, z) {
  const ridge = smoothstep(-236, -258, x);
  if (ridge <= 0) return 0;
  const reservoir = 18 + 14 * smoothstep(-280, -300, x) - 24 * smoothstep(-335, -360, x);
  let w = reservoir + (10 - reservoir) * smoothstep(-284, -276, x);
  w += (7 + 17 * smoothstep(12, 26, z) - w) * smoothstep(-262, -254, x);
  const valley = 1 - smoothstep(w, w + 12, riverDist(x, z));
  if (valley >= 1 && x > -262) return 0;
  const floor = x > -266 ? 0 : 4 * smoothstep(-266, -276, x) + 20 * smoothstep(-342, -372, x);
  const peak = 40 + 14 * hillNoise(x, z) + 12 * smoothstep(-300, -380, x);
  return ridge * (peak * (1 - valley) + floor * valley);
}

export class World {
  constructor(el) {
    this.el = el;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setSize(el.clientWidth, el.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.fogDay = new THREE.Color(0xc4d4de);
    this.fogNight = new THREE.Color(0x0c141d);
    this.fogStorm = new THREE.Color(0x77838c);
    this.scene.fog = new THREE.Fog(this.fogDay.clone(), 450, 1300);

    this.camera = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 1, 5000);
    const c = (this.controls = new MapControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.minDistance = 14;
    c.maxDistance = 430;
    c.maxPolarAngle = 1.32;
    c.screenSpacePanning = false;
    this.home = { target: new THREE.Vector3(5, 0, 8), radius: 300, phi: 0.9, theta: 0.78 };
    this.setView(this.home.target, this.home);

    let quality = null;
    try { quality = localStorage.getItem('onsa.quality'); } catch { quality = null; }
    if (!quality) {
      const gl = r.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      const weak = /Intel|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(gpu) || window.matchMedia('(pointer: coarse)').matches;
      quality = weak ? 'low' : 'high';
    }
    this.quality = quality;
    this.look = new Look(r, this.scene, this.camera, this.quality);
    this.moonDir = new THREE.Vector3(0.4, 0.8, 0.45).normalize();

    this.hemi = new THREE.HemisphereLight(0xdbe8ff, 0x6b5a3c, 0.5);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 3));
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.quality === 'high' ? 4096 : 2048, this.quality === 'high' ? 4096 : 2048);
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 900 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05;
    this.scene.add(this.hemi, sun, sun.target);
    this.galv = new THREE.MeshStandardMaterial({ color: 0xaab2b7, metalness: 0.85, roughness: 0.42 });
    this.glassIns = new THREE.MeshPhysicalMaterial({ color: 0x5f8f86, roughness: 0.1, metalness: 0.05, clearcoat: 1 });
    this._insGeo = {};

    this.anchors = {};
    this.centers = {};
    this.hubs = {};
    for (const [id, L] of Object.entries(LAYOUT)) {
      this.anchors[id] = new THREE.Vector3(...L.label);
      this.centers[id] = new THREE.Vector3(L.c[0], 0, L.c[1]);
      this.hubs[id] = new THREE.Vector3(...L.hub);
    }
    this.pickables = [];
    this.spinners = [];
    this.nightMats = [];
    this.feederOn = { A: true, B: true, C: true, D: true, E: true };
    this.feederMats = {
      A: new THREE.MeshStandardMaterial({ color: 0x2c3842, roughness: 0.08, metalness: 0.7, emissive: 0xffd27a, emissiveIntensity: 0 }),
      B: new THREE.MeshStandardMaterial({ color: 0x2c3842, roughness: 0.08, metalness: 0.7, emissive: 0xffd27a, emissiveIntensity: 0 }),
      C: new THREE.MeshStandardMaterial({ color: 0x2c3842, roughness: 0.08, metalness: 0.7, emissive: 0xffd27a, emissiveIntensity: 0 }),
      D: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xffc861, emissiveIntensity: 0 }),
      E: new THREE.MeshStandardMaterial({ color: 0x3a4f5c, roughness: 0.1, metalness: 0.7, emissive: 0xfff1d2, emissiveIntensity: 0 }), // factory roof glazing
    };
    this.feederFacades = { A: [], B: [], C: [], D: [], E: [] };
    const glazing = () => new THREE.MeshStandardMaterial({ color: 0x3d5a6c, roughness: 0.05, metalness: 0.85, emissive: 0xffd889, emissiveIntensity: 0 });
    this.winGlass = glazing();
    this.nightMats.push(this.winGlass);
    this.feederGlass = { B: glazing(), C: glazing(), D: glazing() };
    this.feederFacades.B.push(this.feederGlass.B);
    this.feederFacades.C.push(this.feederGlass.C);
    this.feederFacades.D.push(this.feederGlass.D);
    this.conduits = {};
    this.rings = {};
    this._n = -1;
    this._t = 0;
    this.areas = {};
    this.blockers = [];
    this.towerFeet = [];

    this.buildGround();
    this.buildYard();
    this.buildControlHouse();
    this.buildHoneypot();
    this.buildCorporate();
    this.buildDMZ();
    this.buildControlCenter();
    this.buildInternet();
    this.buildTown();
    this.buildBiogas();
    this.buildWind();
    this.buildCollege();
    this.buildSolar();
    this.buildMall();
    this.buildRnD();
    this.buildLines();
    this.buildHills();
    this.buildHydro();
    this.buildFactory();
    this.buildLine4();
    this.buildSigns();
    this.buildWalkpaths();
    this.buildTrees();
    this.buildRings();
    this.buildNavGrid();
    this.buildPersona();

    this.buildStreetscape();
    this.buildSiteLights();
    this.initDamageFx();
    this.buildRain();
    this.buildHeightMap();
    this.settleHubs();
    this.batchStatic();
    this.setUnlocked(false);
    this.setQuality(this.quality);
    // sky lighting fills shadows; keep it below the sun so shading has contrast
    this.scene.traverse(o => { for (const m of [].concat(o.material || [])) if (m.isMeshStandardMaterial && m.envMapIntensity === 1) m.envMapIntensity = 0.6; });
    this.loadCharacters();
    new ResizeObserver(() => this.resize()).observe(el);
    this.bindPicking();
  }

  // ---------- camera rig ----------
  setView(target, sph) {
    this.camera.position.setFromSpherical(new THREE.Spherical(sph.radius, sph.phi, sph.theta)).add(target);
    this.controls.target.copy(target);
    this.controls.update();
  }
  spherical() {
    return new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
  }
  animateTo(target, sph, dur = 0.7) {
    const from = this.spherical();
    let dTheta = sph.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    this.tween = {
      t: 0, dur,
      fromT: this.controls.target.clone(), toT: target.clone(),
      from: { radius: from.radius, phi: from.phi, theta: from.theta },
      to: { radius: sph.radius, phi: sph.phi, theta: from.theta + dTheta },
    };
  }
  rotate(deg) {
    const s = this.spherical();
    this.animateTo(this.controls.target, { radius: s.radius, phi: s.phi, theta: s.theta + THREE.MathUtils.degToRad(deg) }, 0.5);
  }
  zoom(f) {
    const s = this.spherical();
    const radius = THREE.MathUtils.clamp(s.radius * f, this.controls.minDistance, this.controls.maxDistance);
    this.animateTo(this.controls.target, { radius, phi: s.phi, theta: s.theta }, 0.35);
  }
  setSpin(on) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = 1.6; }
  resetView() { this.animateTo(this.home.target, this.home, 0.8); }
  toggleTop() {
    const s = this.spherical();
    this.animateTo(this.controls.target, { radius: s.radius, phi: s.phi > 0.3 ? 0.02 : 0.92, theta: s.theta }, 0.6);
  }
  focus(id) {
    const c = this.centers[id];
    if (!c) return;
    const s = this.spherical();
    const radius = id.startsWith('town') || id === 'hydro' || id === 'factory' ? 120 : id === 'yard' || id === 'biogas' ? 90 : 75;
    this.animateTo(c, { radius, phi: Math.min(s.phi, 0.95), theta: s.theta }, 0.8);
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.look.resize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return {
      x: ((p.x + 1) / 2) * this.el.clientWidth,
      y: ((1 - p.y) / 2) * this.el.clientHeight,
      vis: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2,
    };
  }

  bindPicking() {
    const dom = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    let down = null;
    dom.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    dom.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || e.button !== 0) return;
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
      for (const hit of ray.intersectObjects(this.pickables, true)) {
        if (!shown(hit.object)) continue;
        for (let o = hit.object; o; o = o.parent) {
          if (o.userData.asset) { this.onPick?.(o.userData.asset); return; }
        }
      }
      const ground = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) {
        this.walkTo(ground.x, ground.z);
        this.onGround?.();
      }
    });
  }

  // ---------- ONSA Power & Co. signage ----------
  sign(x, y, z, w, h, rotY, lines, posts = true, parent = this.scene) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const face = new THREE.MeshStandardMaterial({ map: textTexture(lines, 1024, Math.round((1024 * h) / w), BRAND.panel), roughness: 0.7 });
    const edge = mat(0x2d3f3d);
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), [edge, edge, edge, edge, face, face]);
    board.position.y = y + h / 2;
    board.castShadow = true;
    g.add(board);
    if (posts) for (const px of [-w / 2 + 0.4, w / 2 - 0.4]) box(g, 0.25, y, 0.25, COL.steelDark, px, 0, 0);
    parent.add(g);
    if (parent === this.scene) this.blockers.push(g);
    this.nightMats.push(face);
    face.emissive = new THREE.Color(0xffffff);
    face.emissiveMap = face.map;
    face.emissiveIntensity = 0;
  }

  buildSigns() {
    const title = (big, sub, k = 1) => [
      { text: big, size: 150 * k, y: 120 * k, color: BRAND.amber },
      { text: sub, size: 54 * k, y: 232 * k, color: BRAND.white, weight: 800 },
    ];
    this.sign(-24.2, 1.6, -5.8, 7, 2.2, 0, title('ONSA Power & Co.', 'PMU BUKIT MUTIARA · 132/33 kV'));
    this.sign(-48, 27.2, -26.6, 10, 2.8, 0, title('ONSA', 'POWER & CO. · HEADQUARTERS'), false, this.areas.corp);
    this.sign(-35.5, 1.6, -37.2, 7, 2.2, 0, title('ONSA Power & Co.', 'Biogas Plant'), true, this.areas.biogas);
    this.sign(70.6, 9.95, 20.25, 8.4, 1.4, 0, [
      { text: 'HOSPITAL BUKIT MUTIARA', size: 90, y: 82, color: BRAND.white },
    ], false, this.areas.townB);
  }

  // ---------- persona: the player, in hi-vis coverall and white helmet ----------
  // ONSA field worker figure (shared by the player persona and the researcher)
  worker({ woman = false } = {}) {
    const p = new THREE.Group();
    const body = new THREE.Group();
    body.userData.procedural = true;
    p.add(body);
    const NAVY = 0x26417a, POCKET = 0x203766, SILVER = 0xd8dee2, VEST = 0xf2d22e, TRIM = 0xf08a24;
    const SKIN = 0xd6a47a, BOOT = 0x222222, HELMET = 0xf7f7f2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const limb = (w, h, d) => { const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, -h / 2, 0); return geo; };
    const part = (parent, geo, color, x, y, z) => add(parent, geo, mat(color), x, y, z);
    const slab = (parent, color, x, y, z, w, h, d) => { const m = part(parent, BOX, color, x, y, z); m.scale.set(w, h, d); return m; };

    // navy work trousers: reflective bands below the knee, cargo pockets, black safety boots
    const legs = [-0.17, 0.17].map(x => {
      const leg = new THREE.Group();
      leg.position.set(x, 0.95, 0);
      part(leg, limb(0.3, 0.82, 0.32), NAVY, 0, 0, 0);
      for (const y of [-0.6, -0.68]) slab(leg, SILVER, 0, y, 0, 0.32, 0.04, 0.34);
      slab(leg, POCKET, Math.sign(x) * 0.16, -0.36, 0, 0.04, 0.18, 0.2);
      slab(leg, BOOT, 0, -0.87, 0.04, 0.32, 0.17, 0.42);
      body.add(leg);
      return leg;
    });

    // navy long-sleeve coverall top under an open-front hi-vis vest with orange trim
    slab(body, NAVY, 0, 1.36, 0, 0.7, 0.84, 0.38);
    slab(body, NAVY, 0, 1.79, 0, 0.3, 0.06, 0.3);
    for (const s of [-1, 1]) {
      slab(body, VEST, s * 0.215, 1.34, 0.2, 0.27, 0.8, 0.03);
      slab(body, VEST, s * 0.358, 1.34, 0, 0.03, 0.8, 0.4);
      slab(body, TRIM, s * 0.095, 1.34, 0.218, 0.05, 0.8, 0.012);
      slab(body, TRIM, s * 0.33, 1.34, 0.218, 0.04, 0.8, 0.012);
    }
    slab(body, VEST, 0, 1.34, -0.2, 0.72, 0.8, 0.03);
    slab(body, TRIM, 0, 0.97, 0, 0.74, 0.07, 0.44);

    // two-segment arms: navy sleeves with reflective bands, skin hands
    const arms = [-0.45, 0.45].map(x => {
      const sh = new THREE.Group();
      sh.position.set(x, 1.72, 0);
      part(sh, limb(0.2, 0.36, 0.22), NAVY, 0, 0, 0);
      for (const y of [-0.12, -0.2]) slab(sh, SILVER, 0, y, 0, 0.215, 0.035, 0.235);
      const el = new THREE.Group();
      el.position.y = -0.36;
      part(el, limb(0.18, 0.32, 0.2), NAVY, 0, 0, 0);
      slab(el, SKIN, 0, -0.39, 0, 0.15, 0.15, 0.15);
      sh.add(el);
      body.add(sh);
      return { sh, el };
    });

    // head, clear safety glasses, white helmet
    slab(body, SKIN, 0, 1.86, 0, 0.16, 0.08, 0.16);
    part(body, new THREE.SphereGeometry(0.25, 16, 12), SKIN, 0, 2.08, 0);
    for (const s of [-1, 1]) part(body, new THREE.SphereGeometry(0.06, 8, 6), SKIN, s * 0.25, 2.06, -0.01);
    const lens = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.35, roughness: 0.1 }));
    lens.scale.set(0.38, 0.09, 0.03);
    lens.position.set(0, 2.11, 0.235);
    body.add(lens);
    slab(body, 0x9aa3a8, 0, 2.16, 0.236, 0.4, 0.015, 0.035);
    part(body, DOME, HELMET, 0, 2.17, 0).scale.set(0.29, 0.26, 0.31);
    part(body, new THREE.CylinderGeometry(0.33, 0.33, 0.03, 20), HELMET, 0, 2.17, 0.02);
    slab(body, HELMET, 0, 2.17, 0.3, 0.28, 0.03, 0.14);
    slab(body, HELMET, 0, 2.38, 0, 0.06, 0.06, 0.5); // crown ridge

    if (woman) {
      // long hair tied back in a ponytail below the helmet
      const HAIR = 0x3a2418;
      slab(body, HAIR, 0, 2.04, -0.17, 0.46, 0.3, 0.16);
      for (const s of [-1, 1]) slab(body, HAIR, s * 0.22, 2.06, -0.04, 0.06, 0.24, 0.26);
      slab(body, HAIR, 0, 1.97, 0.2, 0.36, 0.05, 0.05);
      const tail = slab(body, HAIR, 0, 1.8, -0.31, 0.13, 0.36, 0.12);
      tail.rotation.x = 0.35;
      part(body, new THREE.SphereGeometry(0.07, 8, 6), 0x2f6fb5, 0, 1.98, -0.27); // hair tie
    }

    // ONSA Power & Co. prints: vest chest, vest back, helmet sticker
    const print = (lines, w, h, pw, ph, x, y, z, ry = 0, rx = 0, bg = null) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: textTexture(lines, w, h, bg), transparent: !bg, alphaTest: bg ? 0 : 0.2, roughness: 0.8 }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      body.add(m);
    };
    const ONSA = c => [{ text: 'ONSA', size: 118, y: 72, color: c }, { text: 'POWER & CO.', size: 44, y: 158, color: c, weight: 800 }];
    print(ONSA(BRAND.navy), 512, 200, 0.2, 0.08, 0.215, 1.56, 0.217);
    print(ONSA(BRAND.navy), 512, 200, 0.6, 0.23, 0, 1.42, -0.217, Math.PI);
    print([{ text: 'ONSA', size: 96, y: 64, color: BRAND.white }], 384, 128, 0.17, 0.055, 0, 2.27, 0.27, 0, -0.5, '#2f6fb5');
    // coverall tags: sleeve patch on each arm, label on the front of the left trouser leg
    const tagTex = textTexture([{ text: 'ONSA', size: 104, y: 70, color: BRAND.white }, { text: 'POWER & CO.', size: 40, y: 150, color: BRAND.white, weight: 800 }], 384, 200, BRAND.navy);
    const tagMat = new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.8 });
    arms.forEach(({ sh }, i) => {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.08), tagMat);
      const s = i ? 1 : -1;
      patch.position.set(s * 0.102, -0.28, 0);
      patch.rotation.y = s * Math.PI / 2;
      sh.add(patch);
    });
    const legTag = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.09), tagMat);
    legTag.position.set(0, -0.22, 0.162);
    legs[1].add(legTag);
    body.scale.setScalar(1.8);
    return { p, body, legs, arms };
  }

  buildPersona() {
    const { p, body, legs, arms } = this.worker();
    this.persona = p;
    this.legs = legs;
    this.arms = arms;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.body = body;

    // poses as joint quaternions: idle "thinking" (hand to chin, other arm across) vs walking
    const qDir = d => new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), d.normalize());
    const pose = (upper, fore) => { const sh = qDir(upper); return { sh, el: sh.clone().invert().multiply(qDir(fore)) }; };
    this.thinkPose = [pose(V(0.15, -0.29, 0.2), V(0.27, 0.36, 0.05)), pose(V(-0.07, -0.32, 0.18), V(-0.62, 0.02, 0.05))];
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.2;
    p.add(shadow);
    p.position.set(-26, 0, 0);
    p.rotation.y = Math.PI / 2;
    this.scene.add(p);

    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0x7ad9a6, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.walk = null;
    this.walkPhase = 0;
  }

  // walk anywhere, but around buildings, equipment and fences — never through them
  walkTo(x, z) {
    const p = this.persona.position;
    const path = this.findPath(p.x, p.z, x, z);
    if (!path.length) return;
    let len = 0;
    for (let i = 0; i < path.length; i++) len += (i ? path[i - 1] : p).distanceTo(path[i]);
    this.walk = { path, i: 0, run: len > 22 };
    const end = path[path.length - 1];
    this.marker.position.set(end.x, 0.2, end.z);
    this.marker.visible = true;
  }
  loadCharacters() {
    loadWorkers().then(gltf => {
      this.personaRig = makeWorker(gltf, this.persona);
      this.body.visible = false;
      this.researcherRig = makeWorker(gltf, this.researcher, { woman: true, tablet: true });
      this.researcherBody.visible = false;
    }).catch(() => { /* keep the simple figures if the model can't load */ });
  }

  // floodlight masts around the work sites: twin heads aimed at the site glow at night, light pools on the
  // ground, and one warm site light per site so equipment can be seen (and worked on) after dark
  buildSiteLights() {
    const G = this.grid, free = (x, z) => {
      const i = Math.floor((x - G.x0) / G.cs), j = Math.floor((z - G.z0) / G.cs);
      return i >= 0 && j >= 0 && i < G.w && j < G.h && !G.block[j * G.w + i];
    };
    const clearOf = (x, z) => free(x, z) && !this.roadSegs.some(q => nearestOnSeg(x, z, q)[2] < 3.2)
      && !this.lineSegs.some(q => nearestOnSeg(x, z, q)[2] < 5.5) && !this.walkSegs.some(q => nearestOnSeg(x, z, q)[2] < 1.6)
      && !this.towerFeet.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 5.5);
    const wp = this.areas.wind.position;
    const sites = {
      yard: new THREE.Box3().setFromObject(this.areas.yard),
      ctrl: new THREE.Box3().setFromObject(this.areas.ctrl),
      biogas: new THREE.Box3().setFromObject(this.areas.biogas),
      solar: new THREE.Box3().setFromObject(this.areas.solar),
      wind: new THREE.Box3(new THREE.Vector3(wp.x + 50, 0, wp.z - 56), new THREE.Vector3(wp.x + 73, 6, wp.z - 47)), // shore station only
      hydro: new THREE.Box3(new THREE.Vector3(-255, 0, 24), new THREE.Vector3(-212, 6, 58)),   // powerhouse and switchyard
      factory: new THREE.Box3(new THREE.Vector3(-232, 0, -65), new THREE.Vector3(-157, 6, -8)),
    };
    const spots = [];
    this.siteLights = [];
    for (const [id, bb] of Object.entries(sites)) {
      const west = id === 'hydro' || id === 'factory', parent = west ? this.areas[id] : this.scene;
      bb.expandByScalar(1.5);
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
      // corners, plus side midpoints on large sites
      const pts = [[bb.min.x, bb.min.z], [bb.max.x, bb.min.z], [bb.max.x, bb.max.z], [bb.min.x, bb.max.z]];
      if (w > 30) pts.push([cx, bb.min.z], [cx, bb.max.z]);
      if (d > 30) pts.push([bb.min.x, cz], [bb.max.x, cz]);
      for (const [px, pz] of pts) {
        // nudge onto clear ground nearby (never on a road, line, path or inside equipment)
        let found = null;
        for (let r = 0; r <= 5 && !found; r += 1) for (let a = 0; a < 8 && !found; a++) {
          const x = px + Math.cos(a * Math.PI / 4) * r, z = pz + Math.sin(a * Math.PI / 4) * r;
          if (clearOf(x, z)) found = [x, z];
        }
        if (!found) continue;
        const [x, z] = found, dx = cx - x, dz = cz - z, L = Math.hypot(dx, dz) || 1;
        spots.push({ x, z, ry: Math.atan2(-dz / L, dx / L), parent });
      }
      const light = new THREE.PointLight(0xffe2b0, 0, Math.max(w, d) * 1.2 + 30, 1);
      light.position.set(cx, 26, cz);
      light.userData.west = west;
      this.scene.add(light);
      this.siteLights.push(light);
    }
    const steel = mat(0x8a9096, { metalness: 0.7, roughness: 0.4 });
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 10, 10).translate(0, 5, 0), barGeo = new THREE.BoxGeometry(0.12, 0.12, 1.6).translate(0.25, 9.8, 0);
    const headGeo = mergeGeometries([-0.55, 0.55].map(oz => roundedBox(0.5, 0.36, 0.5).clone().rotateZ(-0.6).translate(0.55, 9.75, oz)));
    const poolGeo = new THREE.CircleGeometry(10, 32).rotateX(-Math.PI / 2).translate(7, 0.22, 0);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const parent of new Set(spots.map(sp => sp.parent))) {
      const list = spots.filter(sp => sp.parent === parent), n = list.length;
      const pole = new THREE.InstancedMesh(poleGeo, steel, n), bar = new THREE.InstancedMesh(barGeo, steel, n);
      const head = new THREE.InstancedMesh(headGeo, this.lampHeadMat, n), pool = new THREE.InstancedMesh(poolGeo, this.lampPoolMat, n);
      list.forEach(({ x, z, ry }, i) => {
        M.compose(new THREE.Vector3(x, 0, z), Q.setFromAxisAngle(Y, ry), one);
        for (const m of [pole, bar, head, pool]) m.setMatrixAt(i, M);
      });
      for (const m of [pole, bar, head]) { m.castShadow = true; parent.add(m); }
      parent.add(pool);
    }
  }

  // street lights every ~24 m along the roads (heads glow at night), and kerbs along the road edges
  buildStreetscape() {
    const G = this.grid, free = (x, z) => {
      const i = Math.floor((x - G.x0) / G.cs), j = Math.floor((z - G.z0) / G.cs);
      return i >= 0 && j >= 0 && i < G.w && j < G.h && !G.block[j * G.w + i];
    };
    // the west roads (shown from chapter 3) get their own set, kept with Line 4
    const along = (segs, all) => {
      const spots = [];
      segs.forEach(([ax, az, bx, bz], i) => {
        const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, half = i < 2 ? 2.5 : 2;
        for (let t = 10, k = 0; t < len - 6; t += 24, k++) {
          const sd = k % 2 ? 1 : -1, x = ax + ux * t - uz * (half + 0.9) * sd, z = az + uz * t + ux * (half + 0.9) * sd;
          if (!free(x, z) || this.walkSegs.some(q => nearestOnSeg(x, z, q)[2] < 2.2) || this.lineSegs.some(q => nearestOnSeg(x, z, q)[2] < 5.5)) continue;
          if (all.some((q, j) => nearestOnSeg(x, z, q)[2] < (j < 2 || q === this.westRoads[0] ? 2.5 : 2) + 0.4)) continue;
          spots.push({ x, z, ry: Math.atan2(uz * sd, -ux * sd) });
        }
      });
      return spots;
    };
    const allRoads = [...this.roadSegs, ...this.westRoads];
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 7, 10).translate(0, 3.5, 0), steel = mat(0x8a9096, { metalness: 0.7, roughness: 0.4 });
    const armGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.7, 8).rotateZ(Math.PI / 2).translate(0.8, 6.9, 0);
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.3 });
    this.nightMats.push(this.lampHeadMat);
    const headGeo = roundedBox(0.75, 0.16, 0.34).clone().translate(1.6, 6.86, 0);
    const pc = document.createElement('canvas');
    pc.width = pc.height = 128;
    const pg = pc.getContext('2d'), grad = pg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = grad; pg.fillRect(0, 0, 128, 128);
    this.lampPoolMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, map: new THREE.CanvasTexture(pc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const poolGeo = new THREE.CircleGeometry(4.2, 28).rotateX(-Math.PI / 2).translate(1.6, 0.2, 0);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const [spots, parent] of [[along(this.roadSegs, allRoads), this.scene], [along(this.westRoads, allRoads), this.line4]]) {
      const n = spots.length;
      const pole = new THREE.InstancedMesh(poleGeo, steel, n), arm = new THREE.InstancedMesh(armGeo, steel, n);
      const head = new THREE.InstancedMesh(headGeo, this.lampHeadMat, n), pool = new THREE.InstancedMesh(poolGeo, this.lampPoolMat, n);
      spots.forEach(({ x, z, ry }, i) => {
        M.compose(new THREE.Vector3(x, 0, z), Q.setFromAxisAngle(Y, ry), one);
        for (const m of [pole, arm, head, pool]) m.setMatrixAt(i, M);
      });
      for (const m of [pole, arm, head]) { m.castShadow = true; parent.add(m); }
      parent.add(pool);
    }

    // kerbs: concrete edge strips along both edges of every road. Each kerb stops exactly at the edge of any road
    // that crosses or joins it, so corners close into clean L's; free ends run on to cover the corner square.
    // Walkpaths reaching a road open a gap in the kerb on their side only.
    this.buildKerbs(this.roadSegs, this.roadSegs.map((_, j) => (j < 2 ? 2.5 : 2)), this.scene);
    // the west roads (chapter 3): trunk extension, switchyard access, factory gate lane
    this.buildKerbs([...this.westRoads, [-186, -2.5, -186, -8]], [2.5, 2, 3], this.line4);
  }

  buildKerbs(segs, halves, parent) {
    const kerbGeos = [], KO = 0.15, KW = 0.25;
    const halfOf = j => halves[j];
    const frame = ([ax, az, bx, bz]) => { const len = Math.hypot(bx - ax, bz - az); return { ax, az, len, ux: (bx - ax) / len, uz: (bz - az) / len }; };
    const F = segs.map(frame);
    // t-range where the line P(t) = (px, pz) + (dx, dz)·t lies on road j's surface
    const onRoad = (j, px, pz, dx, dz) => {
      const { ax, az, len, ux, uz } = F[j], h = halfOf(j);
      let lo = -Infinity, hi = Infinity;
      for (const [c0, c1, mn, mx] of [
        [(px - ax) * ux + (pz - az) * uz, dx * ux + dz * uz, 0, len],
        [(px - ax) * -uz + (pz - az) * ux, dx * -uz + dz * ux, -h, h],
      ]) {
        if (Math.abs(c1) < 1e-9) { if (c0 <= mn || c0 >= mx) return null; continue; }
        let a = (mn - c0) / c1, b = (mx - c0) / c1;
        if (a > b) [a, b] = [b, a];
        lo = Math.max(lo, a);
        hi = Math.min(hi, b);
      }
      return hi > lo ? [lo, hi] : null;
    };
    F.forEach(({ ax, az, len, ux, uz }, i) => {
      const half = halfOf(i);
      for (const sd of [-1, 1]) {
        const off = half + KO, ox = -uz * off * sd, oz = ux * off * sd, px = ax + ox, pz = az + oz;
        const gaps = [];
        F.forEach((_, j) => { if (j !== i) { const r = onRoad(j, px, pz, ux, uz); if (r) gaps.push(r); } });
        for (const q of this.walkSegs) for (const [wx, wz] of [[q[0], q[1]], [q[2], q[3]]]) {
          const t = (wx - ax) * ux + (wz - az) * uz, o = ((wx - ax) * -uz + (wz - az) * ux) * sd;
          if (o > half - 0.5 && o < half + 1.5 && t > 0 && t < len) gaps.push([t - 1.2, t + 1.2]);
        }
        gaps.sort((p, q) => p[0] - q[0]);
        const on = (j, x, z) => { const f = F[j], s2 = (x - f.ax) * f.ux + (z - f.az) * f.uz, d = (x - f.ax) * -f.uz + (z - f.az) * f.ux; return s2 > 0 && s2 < f.len && Math.abs(d) < halfOf(j); };
        const free = t => !F.some((_, j) => j !== i && on(j, px + ux * t, pz + uz * t));
        const piece = (a, b) => {
          const ext = KO + KW / 2;
          if (a <= 0 && free(-ext - 0.05)) a = -ext;
          if (b >= len && free(len + ext + 0.05)) b = len + ext;
          if (b - a < 0.4) return;
          const geo = new THREE.BoxGeometry(b - a, 0.16, KW);
          geo.rotateY(-Math.atan2(uz, ux));
          geo.translate(px + ux * (a + b) / 2, 0.08, pz + uz * (a + b) / 2);
          kerbGeos.push(geo);
        };
        let t0 = 0;
        for (const [a, b] of gaps) { if (a > t0) piece(t0, Math.min(a, len)); t0 = Math.max(t0, b); }
        if (t0 < len) piece(t0, len);
      }
    });
    if (kerbGeos.length) {
      const kerbs = new THREE.Mesh(mergeGeometries(kerbGeos), surface('concrete', 0xd4d0c8));
      kerbs.receiveShadow = true;
      parent.add(kerbs);
    }
  }

  // merge static meshes per material inside each area (and the parked cars) to cut draw calls
  batchStatic() {
    const dynamic = new Set();
    const keep = o => { if (o) o.traverse(c => dynamic.add(c)); };
    for (const sp of this.spinners) keep(sp.obj);
    [this.modem, this.honeypot, this.flame, this.pilot, this.dish, this.rectGlow, ...Object.values(this.lamps), ...this.gates, ...this.movers.map(m => m.obj), ...this.robots.map(r => r.root)].forEach(keep);
    for (const root of [...Object.values(this.areas), ...this.blockers]) {
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const buckets = new Map(), merged = [];
      root.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || dynamic.has(o) || o.children.length) return;
        if (Array.isArray(o.material) || !o.material.isMeshStandardMaterial || o.material.transparent) return;
        const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        const key = o.material.uuid + (o.castShadow ? 's' : '');
        if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, geos: [] });
        buckets.get(key).geos.push(geo);
        merged.push(o);
      });
      for (const o of merged) o.parent.remove(o);
      for (const b of buckets.values()) {
        const m = new THREE.Mesh(mergeGeometries(b.geos), b.material);
        m.castShadow = b.cast;
        m.receiveShadow = true;
        root.add(m);
      }
    }
  }

  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('onsa.quality', q); } catch { /* storage unavailable */ }
    this.look.setQuality(q);
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  walkToAsset(id) {
    const h = this.hubs[id];
    if (h) this.walkTo(h.x, h.z);
  }
  personaAnchor() { return this.persona.position.clone().setY(5.8); }

  updatePersona(dt) {
    const p = this.persona;
    let moving = false;
    if (this.walk) {
      const d = this.walk.path[this.walk.i].clone().sub(p.position);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.05) {
        if (++this.walk.i >= this.walk.path.length) {
          this.walk = null;
          this.marker.visible = false;
        }
      } else {
        moving = true;
        const step = Math.min(dist, (this.personaRig ? (this.walk.run ? 8 : 3.2) : 13) * dt);
        d.normalize();
        p.position.addScaledVector(d, step);
        const want = Math.atan2(d.x, d.z);
        let diff = want - p.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.rotation.y += diff * Math.min(1, dt * 12);
      }
    }
    if (this.personaRig) {
      this.personaRig.play(moving ? (this.walk && this.walk.run ? 'run' : 'walk') : 'idle');
      this.personaRig.mixer.update(dt);
    }
    this.walkPhase += dt * (moving ? 11 : 0);
    const swing = moving ? Math.sin(this.walkPhase) * 0.7 : 0;
    const k = Math.min(1, dt * 10);
    this.legs[0].rotation.x += (swing - this.legs[0].rotation.x) * k;
    this.legs[1].rotation.x += (-swing - this.legs[1].rotation.x) * k;
    this.arms.forEach((arm, i) => {
      const target = moving
        ? { sh: this._q.clone().setFromEuler(this._e.set((i ? swing : -swing) * 0.8, 0, i ? -0.06 : 0.06)), el: new THREE.Quaternion().setFromEuler(this._e.set(-0.35, 0, 0)) }
        : this.thinkPose[i];
      arm.sh.quaternion.slerp(target.sh, k);
      arm.el.quaternion.slerp(target.el, k);
    });
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.18 : 0;
    if (this.marker.visible) this.marker.scale.setScalar(1 + 0.15 * Math.sin(this._t * 6));
  }

  group(id) {
    const g = new THREE.Group();
    g.userData.asset = id;
    const off = OFFSETS[id];
    if (off) g.position.set(off[0], 0, off[1]);
    this.areas[id] = g;
    this.scene.add(g);
    this.pickables.push(g);
    return g;
  }

  // ---------- scenery ----------
  buildGround() {
    const s = this.scene;
    const grass = grassTextures();
    // land ends just under the beach; the sea has its own surface (its wave troughs dip below y = 0)
    grass.map.repeat.set(70, 70 * 525.5 / 900);
    grass.nrm.repeat.copy(grass.map.repeat);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 525.5).translate(0, -187.25, 0), groundVariation(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.nrm, normalScale: new THREE.Vector2(1, 1), color: 0x93a275, roughness: 0.97 })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    this.water = makeOcean(1000, 340, -75.6);
    this.water.mesh.position.set(0, 0.03, -75 - 170);
    s.add(this.water.mesh);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(1000, 9), surface('sand'));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.045, -71);
    beach.receiveShadow = true;
    s.add(beach);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(1000, 2.5), surface('sand', 0xa89878, { roughness: 0.4 }));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(0, 0.05, -74.6);
    s.add(wet);

    const flat = (w, d, color, x, z, y = 0.04) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    flat(24, 14, COL.grass, 114, 32);   // hospital park
    flat(18, 14, COL.grass, -60, 34);   // control-center lawn
    flat(30, 10, 0x8a9096, -68, -12, 0.05); // HQ parking
    for (let i = 0; i <= 9; i++) flat(0.12, 4.8, 0xf1ead8, -82.6 + i * 3.2, -12, 0.06);

    // roads: trunk road through the substation gates, the IT spine road, town streets (Feeders A/B,
    // continuing to the college on Feeder C), the southern road to Mutiara Avenue Mall (Feeder D),
    // and the R&D centre access road
    this.roadSegs = [
      [-125, 0, -20, 0], [20, 0, 150, 0],          // trunk
      [-50, -57.2, -50, 125],                       // IT spine, down to the biogas plant
      [105, -41, 105, 91], [123, -41, 123, 41],     // town streets · Feeders A, B, C
      [-48, 64, 103, 64],                           // southern road · Feeder D
      [-16, 66, -16, 111], [-18, 109, -8, 109],     // mall access + car park entrance (meeting in an L)
      [-48, 87.5, -84, 87.5],                       // R&D centre access
    ];
    const road = (ax, az, bx, bz, w) => {
      const len = Math.hypot(bx - ax, bz - az);
      const m = flat(ax === bx ? w : len, ax === bx ? len : w, COL.road, (ax + bx) / 2, (az + bz) / 2, 0.07);
      return m;
    };
    road(-125, 0, -20, 0, 5);
    road(20, 0, 150, 0, 5);
    for (const q of this.roadSegs.slice(2)) road(...q, 4);
    const junction = x => this.roadSegs.slice(2).some(([ax, az, bx, bz]) => Math.abs(ax - bx) < 0.01 && Math.min(az, bz) <= 0 && Math.max(az, bz) >= 0 && Math.abs(ax - x) < 3.9);
    for (let x = -122; x < 148; x += 6) if ((x < -22 || x > 22) && !junction(x)) flat(2.2, 0.25, 0xf1ead8, x, 0, 0.09);

    // parked cars at HQ
    const rand = rng(7);
    const carCols = [0xb3261e, 0x1f4e8c, 0xe8e8e8, 0x1d1f22, 0xc9a227, 0x51705a, 0x8a8f94];
    for (let i = 0; i < 9; i++) {
      const c = car(carCols[i % carCols.length]);
      c.position.set(-81 + i * 3.2, 0, -12 + (rand() - 0.5));
      c.rotation.y = rand() < 0.5 ? 0 : Math.PI;
      s.add(c);
      this.blockers.push(c);
    }
  }

  buildYard() {
    const g = this.group('yard');
    box(g, 40, 0.15, 28, COL.gravel, 0, 0, 0);

    // fence: translucent mesh panels + posts, west gate open at the road
    const fenceMat = chainLink();
    const panel = (w, x, z, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), fenceMat);
      m.position.set(x, 1.25, z);
      m.rotation.y = rot;
      g.add(m);
    };
    panel(40, 0, -14, 0); panel(18, -11, 14, 0); panel(18, 11, 14, 0);
    panel(11.5, 20, -8.25, Math.PI / 2); panel(11.5, 20, 8.25, Math.PI / 2);
    panel(11, -20, -8.5, Math.PI / 2); panel(11, -20, 8.5, Math.PI / 2);
    for (let x = -20; x <= 20; x += 4) { cyl(g, 0.08, 2.4, COL.steelDark, x, 0, -14); if (Math.abs(x) > 3) cyl(g, 0.08, 2.4, COL.steelDark, x, 0, 14); }
    for (let z = -14; z <= 14; z += 4) if (Math.abs(z) > 3) { cyl(g, 0.08, 2.4, COL.steelDark, 20, 0, z); cyl(g, 0.08, 2.4, COL.steelDark, -20, 0, z); }

    // power transformers
    const finGeo = new THREE.BoxGeometry(0.04, 2.5, 1.0);
    for (const x of [-4, 4, 12]) {
      box(g, 4.4, 0.5, 3.4, COL.concrete, x, 0.15, 5);               // plinth
      box(g, 3.6, 3.1, 2.4, COL.xfmr, x, 0.65, 5);                   // main tank
      box(g, 3.8, 0.12, 2.6, COL.xfmr, x, 3.75, 5);                  // lid flange
      for (const sz of [-1, 1]) {                                     // radiator banks, both sides
        for (let k = -1.5; k <= 1.5; k += 0.22) add(g, finGeo, mat(0x6f7c82), x + k, 2.3, 5 + sz * 1.85);
        for (const yy of [1.1, 3.5]) { const hdr = add(g, CYL, mat(0x6f7c82), x, yy, 5 + sz * 1.85, 0.07, 3.3, 0.07); hdr.rotation.z = Math.PI / 2; }
        for (const fx of [-0.9, 0.9]) { const fan = add(g, CYL, mat(0x3c444a), x + fx, 0.75, 5 + sz * 1.85, 0.42, 0.12, 0.42); fan.rotation.x = Math.PI / 2; }
      }
      const tank = add(g, CYL, mat(0x8a979c), x + 0.3, 4.75, 3.9, 0.42, 2.6, 0.42);  // conservator
      tank.rotation.z = Math.PI / 2;
      for (const ex of [-1, 1]) add(g, new THREE.SphereGeometry(0.42, 20, 12), mat(0x8a979c), x + 0.3 + ex * 1.3, 4.75, 3.9, 0.35, 1, 1);
      for (const px of [-0.8, 1.4]) cyl(g, 0.06, 0.95, COL.steelDark, x + px, 3.8, 3.9);
      box(g, 0.7, 1.1, 0.5, 0x9aa3a8, x + 2.2, 0.65, 3.6);           // control cabinet
      for (const bx of [-1, 0, 1]) {                                  // HV bushings
        cyl(g, 0.17, 1.9, COL.porcelain, x + bx, 3.85, 5.5);
        add(g, CYL, mat(0xc9cdd0), x + bx, 5.85, 5.5, 0.12, 0.2, 0.12);
      }
      for (const bx of [-0.7, 0, 0.7]) cyl(g, 0.11, 0.9, COL.porcelain, x + bx, 3.85, 4.45); // LV bushings
    }

    // circuit breakers
    this.breakers = [];
    for (let x = -12; x <= 12; x += 4) {
      for (const lx of [-0.55, 0.55]) this.lattice(g, x + lx, -3, 1.9, 0.14, 0.12).position.y = 0.15;
      box(g, 1.6, 0.14, 0.5, COL.steel, x, 2.05, -3);                 // cross beam
      const cab = box(g, 0.7, 0.9, 0.6, 0xb9c1c5, x, 0.9, -3.55);     // operating mechanism
      this.breakers.push(cab);
      for (const bz of [-0.55, 0, 0.55]) {
        cyl(g, 0.16, 1.6, COL.porcelain, x + bz, 2.19, -3);            // support insulator
        add(g, CYL, mat(0xc9cdd0), x + bz, 3.95, -3, 0.2, 0.32, 0.2);  // interrupter head
        cyl(g, 0.13, 0.9, COL.porcelain, x + bz, 4.11, -3);            // interrupter chamber
      }
    }

    // busbar gantry (north) and outgoing gantry (east)
    for (const x of [-14, 0.5, 15]) this.lattice(g, x, -9, 9.2, 0.4, 0.3).position.y = 0.15;
    this.girder(g, new THREE.Vector3(-14.3, 9.2, -9), new THREE.Vector3(15.3, 9.2, -9), 0.32);
    for (const z of [-9.6, -9, -8.4]) {
      const bus = add(g, CYL, mat(0xb8c0c4), 0.5, 6.4, z, 0.09, 29, 0.09);
      bus.rotation.z = Math.PI / 2;
    }
    for (const z of [-7, 7]) this.lattice(g, 18.5, z, 10.2, 0.4, 0.3).position.y = 0.15;
    this.girder(g, new THREE.Vector3(18.5, 10.2, -7.3), new THREE.Vector3(18.5, 10.2, 7.3), 0.32);

    // breaker status lamps per feeder
    this.lamps = {};
    for (const [f, z] of [['A', -5.4], ['C', -1.8], ['B', 1.8], ['D', 5.4]]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0x5ee08f }));
      lamp.position.set(18.5, 11.1, z);
      g.add(lamp);
      this.lamps[f] = lamp;
    }
    // lightning masts
    for (const [x, z] of [[-19.7, -13.7], [19.7, 13.7], [-19.7, 13.7]]) cyl(g, 0.12, 15, COL.steelDark, x, 0, z);
  }

  buildControlHouse() {
    const g = this.group('ctrl');
    const top = this.structure(g, {
      x: -14.5, z: 8.5, w: 7, d: 5, h: 3.5, wall: 0xe6dccb,
      windows: [{ side: 's', y: 1.2, at: [1.2, 2.6], ww: 1.0, wh: 0.9 }, { side: 'e', y: 1.2, at: [0], ww: 1.0, wh: 0.9 }],
      doors: [{ side: 's', at: -1.6 }],
      louvres: [{ side: 'w', at: -1.2, y: 0.4, w: 0.8, h: 0.6 }, { side: 'w', at: 1.2, y: 0.4, w: 0.8, h: 0.6 }, { side: 'n', at: 2, y: 2.3, w: 0.7, h: 0.5 }],
    });
    this.roofUnit(g, -12.4, top + 0.05, 7.6, 1.3, 1.0);
    box(g, 0.9, 0.6, 0.32, 0xe4e6e6, -15.8, 2.5, 5.75); // split AC on the north wall
    cyl(g, 0.05, 2.8, COL.steelDark, -17.2, top, 6.8);  // comms mast
    for (const y of [1.6, 2.4]) box(g, 0.6, 0.05, 0.05, COL.steelDark, -17.2, top + y, 6.8);
    cyl(g, 0.15, 0.16, 0xf1f1f1, -16.6, top + 0.05, 9.8); // GPS antenna
    box(g, 0.5, 0.12, 4.5, 0x8d9296, -10.8, 2.8, 8.5);  // cable tray out to the yard
    // the forgotten cellular modem bolted to the wall (removed by the attack-surface review)
    this.modem = new THREE.Group();
    box(this.modem, 0.6, 0.8, 0.3, 0xe0e0e0, 0, 0, 0);
    cyl(this.modem, 0.05, 1.6, 0x222222, 0.2, 0.8, 0);
    const modemLed = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a3d }));
    modemLed.position.set(-0.15, 0.6, 0.17);
    this.modem.add(modemLed);
    this.modem.position.set(-10.6, 2.2, 11.15);
    g.add(this.modem);
  }

  // OT honeypot: a decoy RTU cabinet in the switchyard (shown once bought)
  buildHoneypot() {
    const g = (this.honeypot = new THREE.Group());
    this.cabinet(g, 0, 0, 0, 1.3, 1.9, 0.8, 0xc9cfd2);
    box(g, 0.5, 0.3, 0.04, 0x2f3438, -0.3, 1.25, 0.42);
    cyl(g, 0.05, 1.2, 0x222222, 0.45, 1.96, 0);
    this.hpLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf2b33d }));
    this.hpLight.position.set(-0.35, 2.05, 0);
    g.add(this.hpLight);
    g.position.set(-7.2, 0.15, 10.6);
    g.visible = false;
    this.areas.yard.add(g);
    this.hpAlarm = false;
  }
  setHoneypot(on) { this.honeypot.visible = on; }
  setHoneypotAlarm(on) { this.hpAlarm = on; }
  honeypotAnchor() { return new THREE.Vector3(-7.2, 3.4, 10.6); }

  // ---------- building kit: realistic low-rise construction ----------
  // plinth, plaster walls or ribbed steel cladding, parapet with coping over a membrane roof (or a tiled
  // hip roof), framed glazing with sills, steel doors with canopies and steps, louvres, downpipes.
  // Faces: s = +z, n = −z, e = +x, w = −x. Returns the roof height.
  structure(g, o) {
    const { x, z, w, d, h } = o;
    const glass = o.glass || this.winGlass;
    const base = 0.3;
    box(g, w + 0.5, base, d + 0.5, COL.concrete, x, 0, z);
    const wallMat = o.cladding ? surface('metal', o.cladding, { metalness: 0.45, roughness: 0.5 }) : surface('plaster', o.wall || 0xe9e0d0);
    box(g, w, h, d, wallMat, x, base, z);
    const top = base + h;
    // place something on a face: along = offset along the face (left→right seen from outside), out = local +z
    const onFace = (side, along, fn) => {
      const f = new THREE.Group();
      const ow = 0.001;
      if (side === 's') { f.position.set(x + along, 0, z + d / 2 + ow); }
      else if (side === 'n') { f.position.set(x - along, 0, z - d / 2 - ow); f.rotation.y = Math.PI; }
      else if (side === 'e') { f.position.set(x + w / 2 + ow, 0, z - along); f.rotation.y = Math.PI / 2; }
      else { f.position.set(x - w / 2 - ow, 0, z + along); f.rotation.y = -Math.PI / 2; }
      fn(f);
      g.add(f);
    };
    const faceLen = side => (side === 's' || side === 'n' ? w : d);
    if (o.cladding) {
      for (const side of ['s', 'n', 'e', 'w']) {
        const L = faceLen(side);
        for (let a = -L / 2 + 0.3; a < L / 2 - 0.2; a += 0.55) onFace(side, a, f => box(f, 0.06, h - 0.1, 0.07, wallMat, 0, base + 0.05, 0.03));
      }
    }
    if (o.roof === 'hip') {
      const roof = new THREE.Mesh(hipRoofGeometry(w + 1.0, d + 1.0, o.roofH || Math.min(w, d) * 0.32), surface('roof', o.roofTint || 0xffffff));
      roof.position.set(x, top, z);
      roof.castShadow = roof.receiveShadow = true;
      g.add(roof);
      box(g, w + 1.0, 0.14, d + 1.0, 0xe8e4dc, x, top - 0.14, z); // fascia
    } else {
      const t = 0.22, ph = 0.6;
      box(g, w, ph, t, wallMat, x, top, z + d / 2 - t / 2);
      box(g, w, ph, t, wallMat, x, top, z - d / 2 + t / 2);
      box(g, t, ph, d - 2 * t, wallMat, x + w / 2 - t / 2, top, z);
      box(g, t, ph, d - 2 * t, wallMat, x - w / 2 + t / 2, top, z);
      for (const [cw, cd, cx, cz] of [[w + 0.1, 0.32, x, z + d / 2 - 0.11], [w + 0.1, 0.32, x, z - d / 2 + 0.11], [0.32, d, x + w / 2 - 0.11, z], [0.32, d, x - w / 2 + 0.11, z]]) box(g, cw, 0.07, cd, 0x8d9296, cx, top + ph, cz);
      box(g, w - 0.44, 0.05, d - 0.44, 0x5b6166, x, top, z);
    }
    for (const row of o.windows || []) {
      const L = faceLen(row.side), n = row.count || Math.max(1, Math.floor((L - 1) / ((row.ww || 1.2) + 1.1)));
      const at = row.at || Array.from({ length: n }, (_, i) => -L / 2 + (L / n) * (i + 0.5));
      for (const ys of [].concat(row.y)) for (const a of at) onFace(row.side, a, f => {
        const ww = row.ww || 1.2, wh = row.wh || 1.1, y = base + ys;
        box(f, ww + 0.16, wh + 0.16, 0.09, 0x2e3338, 0, y - 0.08, 0.02);
        box(f, ww, wh, 0.05, glass, 0, y, 0.06);
        if (ww > 1.4) box(f, 0.05, wh, 0.07, 0x2e3338, 0, y, 0.07);
        box(f, ww + 0.3, 0.07, 0.22, COL.concrete, 0, y - 0.15, 0.1);
      });
    }
    for (const dr of o.doors || []) onFace(dr.side, dr.at, f => {
      const dw = dr.w || 1.1, dh = dr.h || 2.2;
      box(f, dw + 0.18, dh + 0.1, 0.08, 0x2e3338, 0, base, 0.02);
      box(f, dw, dh, 0.06, dr.glass ? glass : dr.color || 0x5d666d, 0, base, 0.06);
      if (!dr.glass) cyl(f, 0.03, 0.2, 0xc9cdd0, dw * 0.35, base + 1.0, 0.12);
      if (dr.canopy !== false) box(f, dw + 0.8, 0.12, 1.1, 0x8d9296, 0, base + dh + 0.25, 0.55);
      box(f, dw + 0.6, 0.15, 0.7, COL.concrete, 0, 0.15, 0.4);
    });
    for (const lv of o.louvres || []) onFace(lv.side, lv.at, f => {
      const lw = lv.w || 0.9, lh = lv.h || 0.7, y = base + lv.y;
      box(f, lw + 0.1, lh + 0.1, 0.06, 0x8d9296, 0, y - 0.05, 0.02);
      for (let k = 0; k < 5; k++) { const sl = box(f, lw, 0.05, 0.12, 0x6d757b, 0, y + (k + 0.5) * (lh / 5) - 0.025, 0.07); sl.rotation.x = -0.5; }
    });
    for (const [px, pz] of [[x - w / 2 + 0.12, z + d / 2 + 0.06], [x + w / 2 - 0.12, z + d / 2 + 0.06], [x - w / 2 + 0.12, z - d / 2 - 0.06], [x + w / 2 - 0.12, z - d / 2 - 0.06]]) cyl(g, 0.06, h, 0x8a8f93, px, base, pz);
    return top;
  }

  // glass curtain-wall tower: concrete core, glazed faces (offices light up at random at night),
  // aluminium spandrels per floor, mullions, corner columns, parapet, roof plant room and mast
  curtainTower(g, { x, z, w, d, h, floor = 3.25, seed = 1 }) {
    const rand = rng(seed);
    box(g, w + 1.2, 0.4, d + 1.2, COL.concrete, x, 0, z);
    box(g, w - 0.5, h, d - 0.5, surface('concrete', 0x7d848a), x, 0.4, z);
    const floors = Math.max(1, Math.round(h / floor)), alu = mat(0xa9b1b6, { metalness: 0.8, roughness: 0.35 });
    for (const [side, faceW, px, pz, ry] of [['s', w, x, z + d / 2, 0], ['n', w, x, z - d / 2, Math.PI], ['e', d, x + w / 2, z, Math.PI / 2], ['w', d, x - w / 2, z, -Math.PI / 2]]) {
      const cols = Math.max(2, Math.round(faceW / 1.5));
      const c = document.createElement('canvas');
      c.width = cols * 8; c.height = floors * 8;
      const cg = c.getContext('2d');
      cg.fillStyle = '#000'; cg.fillRect(0, 0, c.width, c.height);
      for (let r = 0; r < floors; r++) for (let k = 0; k < cols; k++) if (rand() < 0.55) { cg.fillStyle = rand() < 0.5 ? '#ffe2a8' : '#fff1d0'; cg.fillRect(k * 8 + 1, r * 8 + 2, 6, 5); }
      const em = new THREE.CanvasTexture(c);
      em.colorSpace = THREE.SRGBColorSpace;
      const glass = new THREE.MeshStandardMaterial({ color: 0x35546a, metalness: 0.9, roughness: 0.05, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0 });
      this.nightMats.push(glass);
      const f = new THREE.Group();
      f.position.set(px, 0.4, pz);
      f.rotation.y = ry;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(faceW, h), glass);
      pane.position.set(0, h / 2, 0.02);
      pane.receiveShadow = true;
      f.add(pane);
      for (let k = 0; k <= cols; k++) box(f, 0.07, h, 0.14, alu, -faceW / 2 + (faceW / cols) * k, 0, 0.06);
      for (let r = 0; r <= floors; r++) box(f, faceW, 0.42, 0.16, alu, 0, (h / floors) * r - 0.21, 0.07);
      g.add(f);
    }
    for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(g, 0.5, h + 0.5, 0.5, alu, x + cx * (w / 2), 0.4, z + cz * (d / 2));
    const top = 0.4 + h;
    for (const [cw, cd, cx, cz] of [[w, 0.3, x, z + d / 2 - 0.15], [w, 0.3, x, z - d / 2 + 0.15], [0.3, d, x + w / 2 - 0.15, z], [0.3, d, x - w / 2 + 0.15, z]]) box(g, cw, 0.8, cd, alu, cx, top, cz);
    box(g, w - 0.6, 0.06, d - 0.6, 0x5b6166, x, top, z);
    box(g, w * 0.42, 2.6, d * 0.36, surface('concrete', 0xb8b4ac), x + w * 0.12, top, z - d * 0.18);  // plant room
    this.roofUnit(g, x - w * 0.25, top + 0.05, z + d * 0.2, 1.8, 1.4, true);
    this.roofUnit(g, x + w * 0.25, top + 0.05, z + d * 0.25, 1.8, 1.4, true);
    cyl(g, 0.08, 5, COL.steelDark, x - w * 0.3, top, z - d * 0.3);
    return top;
  }

  // weatherproof equipment cabinet: body, door seam, handle, vent slats, rain hood
  cabinet(g, x, y, z, w, h, d, color = 0xd7d2c4, ry = 0) {
    const c = new THREE.Group();
    c.position.set(x, y, z);
    c.rotation.y = ry;
    box(c, w, h, d, color, 0, 0, 0);
    box(c, w + 0.12, 0.06, d + 0.16, 0x8d9296, 0, h, 0.02);
    box(c, 0.015, h * 0.86, 0.02, 0x5d666d, 0, h * 0.07, d / 2 + 0.005);
    cyl(c, 0.025, 0.18, 0xc9cdd0, w * 0.18, h * 0.5, d / 2 + 0.03);
    for (let k = 0; k < 4; k++) box(c, w * 0.32, 0.03, 0.03, 0x5d666d, -w * 0.25, h * 0.15 + k * 0.08, d / 2 + 0.01);
    g.add(c);
    return c;
  }

  // rooftop condensing unit / chiller with a fan grille
  roofUnit(g, x, y, z, w = 1.6, d = 1.2, spin = false) {
    box(g, w, 0.9, d, 0xb5bcc0, x, y, z);
    const fan = cyl(g, Math.min(w, d) * 0.36, 0.06, 0x2e3338, x, y + 0.9, z);
    if (spin) this.spinners.push({ obj: fan, axis: 'y', speed: 4 });
    for (const sx of [-1, 1]) box(g, 0.08, 0.25, d, 0x8d9296, x + sx * (w / 2 - 0.1), y - 0.25, z);
  }

  // containerised gas-engine genset: corrugated enclosure, doors, intake louvres, roof radiator, silencer and stack
  genset(g, x, z) {
    const L = 7, H = 2.9, D = 2.5, y0 = 0.37;
    const body = surface('metal', 0x3f6e58, { metalness: 0.4, roughness: 0.5 });
    box(g, L + 0.4, 0.25, D + 0.4, COL.concrete, x, 0.12, z);
    box(g, L, H, D, body, x, y0, z);
    for (let a = -L / 2 + 0.25; a < L / 2; a += 0.35) for (const sd of [-1, 1]) box(g, 0.08, H - 0.2, 0.05, body, x + a, y0 + 0.1, z + sd * (D / 2 + 0.02));
    for (const dx of [-2.3, -1.0]) {
      box(g, 1.1, 2.2, 0.06, 0x2f4a3d, x + dx, y0 + 0.15, z + D / 2 + 0.07);
      cyl(g, 0.03, 0.25, 0xc9cdd0, x + dx + 0.4, y0 + 1.1, z + D / 2 + 0.12);
    }
    for (const dx of [1.1, 2.5]) {
      box(g, 1.1, 1.2, 0.06, 0x2e3338, x + dx, y0 + 1.1, z + D / 2 + 0.07);
      for (let k = 0; k < 6; k++) box(g, 1.0, 0.05, 0.1, 0x55606a, x + dx, y0 + 1.15 + k * 0.19, z + D / 2 + 0.11);
    }
    box(g, 2.4, 0.7, 2.2, 0x9aa3a8, x + 2.1, y0 + H, z);
    for (const fx of [1.5, 2.7]) cyl(g, 0.48, 0.06, 0x2e3338, x + fx, y0 + H + 0.7, z);
    const sil = add(g, CYL, mat(0x8a9399), x - 1.1, y0 + H + 0.55, z, 0.42, 2.8, 0.42);
    sil.rotation.z = Math.PI / 2;
    for (const sx of [-2.1, -0.1]) box(g, 0.12, 0.45, 0.7, COL.steelDark, x + sx, y0 + H, z);
    cyl(g, 0.22, 1.9, 0x8a9399, x - 2.5, y0 + H + 0.55, z);
    cyl(g, 0.32, 0.08, 0x50585e, x - 2.5, y0 + H + 2.45, z);
  }

  // pad-mounted step-up transformer with radiator fins and HV bushings
  padTransformer(g, x, z, small = false) {
    const w = small ? 1.8 : 2.2, d = small ? 1.3 : 1.5;
    box(g, w + 0.4, 0.3, d + 0.5, COL.concrete, x, 0.12, z);
    box(g, w, 1.9, d, COL.xfmr, x, 0.42, z);
    box(g, w + 0.2, 0.1, d + 0.2, COL.xfmr, x, 2.32, z);
    for (let k = -w / 2 + 0.15; k <= w / 2 - 0.15; k += 0.18) for (const sd of [-1, 1]) box(g, 0.035, 1.4, 0.42, 0x6f7c82, x + k, 0.6, z + sd * (d / 2 + 0.21));
    for (const bx of [-0.55, 0, 0.55]) cyl(g, 0.12, 1, COL.porcelain, x + bx * (small ? 0.8 : 1), 2.42, z);
    box(g, 0.5, 0.7, 0.3, 0x9aa3a8, x + w / 2 + 0.05, 0.6, z);
  }

  buildCorporate() {
    const g = this.group('corp');
    this.curtainTower(g, { x: -48, z: -32, w: 12, d: 12, h: 26, seed: 11 });
    // two-storey annex: glazed ground-floor lobby, ribbon windows, entrance canopy
    const at = this.structure(g, {
      x: -48, z: -21.5, w: 18, d: 7, h: 5, wall: 0xd9d3c6,
      windows: [{ side: 's', y: [0.5, 2.9], count: 7, ww: 1.8, wh: 1.5 }, { side: 'e', y: [0.5, 2.9], count: 2, ww: 1.6, wh: 1.5 }, { side: 'w', y: [0.5, 2.9], count: 2, ww: 1.6, wh: 1.5 }],
      doors: [{ side: 's', at: 0, w: 2.6, h: 2.5, glass: true }],
    });
    box(g, 7, 0.22, 3, 0xd9dcdf, -48, 3.1, -16.6);
    for (const cx of [-3.2, 3.2]) cyl(g, 0.16, 3.1, 0xd9dcdf, -48 + cx, 0, -15.4);
    this.roofUnit(g, -53, at + 0.05, -22, 1.8, 1.4, true);
    this.roofUnit(g, -43, at + 0.05, -22, 1.8, 1.4, true);
    // flag poles at the entrance
    for (const fx of [-6.5, -5.5]) cyl(g, 0.05, 7, 0xd9dcdf, -48 + fx, 0, -14.8);
  }

  buildDMZ() {
    const g = this.group('dmz');
    // data hall: ribbed steel cladding, glazed entrance and office window, intake louvres, rooftop chillers
    const top = this.structure(g, {
      x: -24, z: -28, w: 10, d: 7, h: 4.2, cladding: 0x7d8a92,
      windows: [{ side: 's', y: 1.4, at: [3.3], ww: 1.6, wh: 1.0 }],
      doors: [{ side: 's', at: 1.2, w: 1.6, h: 2.3, glass: true }, { side: 'e', at: 0, w: 1.4, h: 2.3 }],
      louvres: [-2.3, -0.8, 0.7, 2.2].map(at => ({ side: 'w', at, y: 0.7, w: 1.0, h: 1.2 })),
    });
    for (const x of [-27, -24, -21]) this.roofUnit(g, x, top + 0.05, -29.2, 2, 2, true);
    box(g, 8.5, 0.1, 0.5, 0x8d9296, -24, top + 0.7, -26.4); // cable tray
    // standby generator: canopy set with exhaust and day tank
    const gen = surface('metal', 0x6d7a72, { metalness: 0.4, roughness: 0.5 });
    box(g, 4.4, 0.25, 3, COL.concrete, -17, 0.15, -30);
    box(g, 3.8, 2.1, 2.2, gen, -17, 0.4, -30);
    for (let a = -1.6; a <= 1.6; a += 0.4) box(g, 0.08, 1.6, 0.05, 0x2e3338, -17 + a, 0.7, -28.86);
    cyl(g, 0.12, 1.3, 0x50585e, -18.4, 2.5, -30.6);
    const tank = add(g, CYL, mat(0x9aa3a8), -17, 0.75, -31.8, 0.45, 2.6, 0.45);
    tank.rotation.z = Math.PI / 2;
    // CCTV on the corner
    box(g, 0.12, 0.12, 0.5, 0xe4e6e6, -19.2, top - 0.4, -24.3);
  }

  buildControlCenter() {
    const g = this.group('scc');
    // two-storey operations building: wide control-room glazing upstairs, glazed entrance, roof plant
    const top = this.structure(g, {
      x: -34, z: 22, w: 12, d: 9, h: 6, wall: 0xd8d0c0,
      windows: [{ side: 's', y: 0.8, count: 4, ww: 1.4, wh: 1.4 }, { side: 's', y: 3.4, count: 3, ww: 3.0, wh: 1.8 },
        { side: 'n', y: [0.8, 3.4], count: 4, ww: 1.4, wh: 1.4 }, { side: 'e', y: [0.8, 3.4], count: 3, ww: 1.4, wh: 1.4 }, { side: 'w', y: [0.8, 3.4], count: 3, ww: 1.4, wh: 1.4 }],
      doors: [{ side: 'e', at: 2.4, w: 1.8, h: 2.4, glass: true }],
    });
    this.roofUnit(g, -31, top + 0.05, 19.5, 1.8, 1.4, true);
    box(g, 0.9, 0.6, 0.32, 0xe4e6e6, -38.5, 2.4, 17.33);
    box(g, 0.4, 2, 0.4, COL.steelDark, -37, 6, 24);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0xf0f0ea, { side: THREE.DoubleSide }));
    dish.position.set(-37, 8.6, 24);
    dish.rotation.set(Math.PI * 0.8, 0.4, 0);
    dish.castShadow = true;
    g.add(dish);
    cyl(g, 0.09, 8, COL.steelDark, -30, 6, 25);
  }

  buildInternet() {
    const g = this.group('internet');
    this.structure(g, {
      x: -63, z: 40, w: 3.4, d: 3, h: 2.6, cladding: 0xd8d4cc,
      doors: [{ side: 'e', at: 0, w: 1.0, h: 2.1 }], louvres: [{ side: 's', at: 0.6, y: 0.5, w: 0.8, h: 0.6 }],
    });
    box(g, 0.9, 0.6, 0.32, 0xe4e6e6, -64, 1.6, 41.66);
    this.lattice(g, -67, 40, 20, 1.3, 0.25);
    const white = mat(0xf2f2ee, { roughness: 0.5 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2, ax = -67 + Math.cos(a) * 0.65, az = 40 + Math.sin(a) * 0.65;
      box(g, 0.32, 1.5, 0.14, white, ax, 17.8, az).rotation.y = -a;
    }
    for (const [y, ry] of [[14.5, 0.6], [12.2, 2.4]]) {
      const d = new THREE.Group();
      d.position.set(-67, y, 40);
      d.rotation.y = ry;
      const dish = add(d, new THREE.CylinderGeometry(0.55, 0.55, 0.35, 28), white, 0, 0, 0.7);
      dish.rotation.x = Math.PI / 2;
      add(d, DOME, white, 0, 0, 0.88, 0.55, 0.15, 0.55).rotation.x = Math.PI / 2;
      g.add(d);
    }
    cyl(g, 0.05, 1.6, COL.steelDark, -67, 20, 40);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    beacon.position.set(-67, 21.7, 40);
    g.add(beacon);
    box(g, 0.4, 0.12, 4.0, 0x8d9296, -65, 2.6, 40); // feeder cable bridge to the mast
  }

  buildTown() {
    const s = this.scene;
    const rand = rng(42);
    const wallCols = [0xf2e6d0, 0xe8d3b5, 0xd9e1e3, 0xf0d9c8, 0xcfd8c4, 0xe6c9a8];
    const roofTints = [0xffffff, 0xe6c6b6, 0xb9c0c6, 0xd8a890];
    const gA = this.group('townA'), gB = this.group('townB');
    const xs = [48.5, 54.5, 66, 72, 84.5, 90.5];
    const house = (g, f, x, z) => {
      const h = Math.round((2.6 + rand() * 0.6) * 10) / 10;
      this.structure(g, {
        x, z, w: 4.2, d: 4, h, wall: wallCols[Math.floor(rand() * wallCols.length)], glass: this.feederMats[f],
        roof: 'hip', roofH: 1.6, roofTint: roofTints[Math.floor(rand() * roofTints.length)],
        windows: [{ side: 's', y: 0.85, at: [-1.25, 1.25], ww: 0.8, wh: 0.9 }, { side: 'e', y: 0.85, at: [0], ww: 0.8, wh: 0.9 }, { side: 'w', y: 0.85, at: [0], ww: 0.8, wh: 0.9 }, { side: 'n', y: 0.85, at: [-0.8], ww: 0.8, wh: 0.9 }],
        doors: [{ side: 's', at: 0, w: 0.9, h: 2.0, color: 0x5b3d2a, canopy: false }],
      });
      box(g, 1.6, 0.06, 0.9, 0x8d9296, x, 2.45, z + 2.45); // porch hood
    };
    for (const x of xs) for (const z of [-36, -29, -22, -15, -8]) if (rand() > 0.12) house(gA, 'A', x, z);
    for (const x of xs) for (const z of [8, 15, 22, 29, 36]) {
      if (x > 61 && x < 76 && z < 27) continue; // hospital footprint
      if (x > 82 && z > 26) continue; // water tower
      if (rand() > 0.15) house(gB, 'B', x, z);
    }

    // Hospital Bukit Mutiara (Feeder B)
    const hg = this.feederGlass.B;
    const htop = this.structure(gB, {
      x: 69, z: 15, w: 13, d: 11, h: 9, wall: 0xf4f2ec, glass: hg,
      windows: [{ side: 's', y: [3.9, 6.9], count: 5, ww: 1.5, wh: 1.4 }, { side: 's', y: 0.9, at: [-4.6, -2.6, 2.6, 4.6], ww: 1.5, wh: 1.4 },
        { side: 'n', y: [0.9, 3.9, 6.9], count: 5, ww: 1.5, wh: 1.4 }, { side: 'e', y: [0.9, 3.9, 6.9], count: 4, ww: 1.5, wh: 1.4 }, { side: 'w', y: [0.9, 3.9, 6.9], count: 4, ww: 1.5, wh: 1.4 }],
      doors: [{ side: 's', at: 0, w: 2.8, h: 2.6, glass: true, canopy: false }],
    });
    // ambulance canopy over the entrance
    box(gB, 6.5, 0.3, 4.2, 0xe8eaec, 69, 3.4, 22.6);
    for (const cx of [-3, 3]) cyl(gB, 0.16, 3.4, 0xe8eaec, 69 + cx, 0, 24.4);
    box(gB, 6.6, 0.5, 0.12, 0xd9443a, 69, 3.4, 24.72);
    // rooftop red cross, helipad with H, plant
    box(gB, 0.7, 2.4, 0.3, 0xd9443a, 63.9, htop + 0.6, 20.25);
    box(gB, 2.4, 0.7, 0.3, 0xd9443a, 63.9, htop + 1.45, 20.25);
    const pad = cyl(gB, 2.6, 0.18, 0x4b545a, 72.5, htop, 12.8);
    pad.castShadow = false;
    for (const [w, d, x, z] of [[0.3, 2.0, 71.85, 12.8], [0.3, 2.0, 73.15, 12.8], [1.0, 0.3, 72.5, 12.8]]) box(gB, w, 0.02, d, 0xf4f4f0, x, htop + 0.18, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 6, 48), mat(0xf2c230));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(72.5, htop + 0.2, 12.8);
    gB.add(ring);
    this.roofUnit(gB, 65.5, htop + 0.05, 11.5, 2, 1.6, true);

    // water tower (Feeder B)
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) box(gB, 0.9, 0.4, 0.9, COL.concrete, 88 + dx, 0, 32 + dz);
    this.lattice(gB, 88, 32, 9.2, 1.5, 1.2);
    const tankM = mat(0xdfe5e8, { metalness: 0.5, roughness: 0.4 });
    add(gB, CYL, tankM, 88, 9.2 + 1.9, 32, 2.6, 3.8, 2.6);
    add(gB, new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), tankM, 88, 9.2, 32, 2.6, 0.9, 2.6);
    add(gB, new THREE.ConeGeometry(2.75, 1.2, 32), tankM, 88, 9.2 + 3.8 + 0.6, 32);
    const walk = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.06, 6, 48), mat(0x8d9296));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(88, 10.2, 32);
    gB.add(walk);
    for (const lx of [-0.2, 0.2]) cyl(gB, 0.03, 13, 0x8d9296, 88 + lx, 0, 34.65);
    for (let y = 0.4; y < 13; y += 0.4) box(gB, 0.4, 0.03, 0.03, 0x8d9296, 88, y, 34.65);
    s.add(gA, gB);
  }

  // Biogas plant, laid out along the process: raw POME pond → mixing pit → AD tank + covered lagoon
  // → scrubber → genset, with a flare branch. Instruments and motorized valves sit on the pipelines;
  // their tag anchors go into this.instruments for the HUD.
  buildBiogas() {
    const g = this.group('biogas');
    this.instruments = [];
    const Z = -46, LY = 0.8, GY = 3.2, HZ = -39.5; // process line, liquid/gas pipe heights, gas header z
    const LIQ = 0x7d6a55, GAS = 0xd9b44a, RL = 0.28, RG = 0.3;
    box(g, 89, 0.12, 18, 0xc9c3b6, 4.5, 0, Z);

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    const tag = (t, x, y, z) => this.instruments.push({ tag: t, pos: V(x, y, z) });
    const pipe = (a, b, r, color) => {
      const d = b.clone().sub(a), len = d.length();
      const m = add(g, CYL, mat(color), 0, 0, 0, r, len, r);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(UP, d.normalize());
    };
    const run = (pts, r, color) => {
      for (let i = 0; i < pts.length - 1; i++) pipe(pts[i], pts[i + 1], r, color);
      for (const p of pts.slice(1, -1)) add(g, JOINT, mat(color), p.x, p.y, p.z, r * 1.15, r * 1.15, r * 1.15);
    };
    const horiz = (r, len, color, x, y, z, axis) => {
      const m = add(g, CYL, mat(color), x, y, z, r, len, r);
      if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
      return m;
    };
    const stem = (x, y, z, h) => add(g, CYL, mat(0x9aa5ab), x, y + h / 2, z, 0.06, h, 0.06);

    // instruments (sizes exaggerated so they read at map scale)
    const mov = (t, x, y, z, axis, r) => {
      horiz(Math.max(r * 1.7, 0.3), 0.7, 0x4b555c, x, y, z, axis);
      stem(x, y, z, 0.9);
      box(g, 0.75, 0.6, 0.6, 0xe6b422, x, y + 0.75, z);
      if (axis === 'x') horiz(0.28, 0.06, 0xc0392b, x, y + 1.05, z + 0.34, 'z');
      else horiz(0.28, 0.06, 0xc0392b, x + 0.42, y + 1.05, z, 'x');
      tag(t, x, y + 1.7, z);
    };
    const emf = (t, x, y, z, axis, r) => {
      horiz(r * 1.9, 1.1, 0x2f5f9e, x, y, z, axis);
      stem(x, y, z, 0.6 + r);
      box(g, 0.5, 0.45, 0.5, 0x2f5f9e, x, y + r + 0.6, z);
      tag(t, x, y + 1.7, z);
    };
    const usfm = (t, x, y, z, axis, r) => {
      for (const s of [-1, 1]) {
        const dx = axis === 'x' ? s * 0.45 : 0, dz = axis === 'z' ? s * 0.45 : 0;
        add(g, CYL, mat(0x2f9e72), x + dx, y + r + 0.12, z + dz, 0.12, 0.3, 0.12);
      }
      stem(x, y, z, 1.0);
      box(g, 0.55, 0.6, 0.3, 0x2f9e72, x, y + 1.0, z);
      tag(t, x, y + 1.9, z);
    };
    const pt = (t, x, y, z) => { stem(x, y, z, 0.8); horiz(0.28, 0.22, 0x3d7cc9, x, y + 1.05, z, 'z'); tag(t, x, y + 1.7, z); };
    const tt = (t, x, y, z) => { stem(x, y, z, 0.8); box(g, 0.34, 0.4, 0.34, 0xc9523d, x, y + 0.8, z); tag(t, x, y + 1.7, z); };

    // 1 · raw POME pond + feed pump
    add(g, BUND, mat(0xb59a6e), -33, 0.35, Z, 11, 0.7, 11);
    const pond = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 9.6), mat(0x5e4329, { roughness: 0.4 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-33, 0.73, Z);
    g.add(pond);
    box(g, 1.4, 0.2, 2.6, 0x8a9096, -26.4, 0, Z + 0.6);
    horiz(0.45, 0.45, 0x2f7fbf, -26.4, LY, Z, 'z');
    horiz(0.33, 1.2, 0x24639a, -26.4, LY, Z + 1.1, 'z');
    tag('P-101', -26.4, 2.1, Z + 0.6);
    run([V(-28.2, LY, Z), V(-21.5, LY, Z)], RL, LIQ);
    mov('MOV-101', -24.9, LY, Z, 'x', RL);
    emf('FIT-101', -23.1, LY, Z, 'x', RL);

    // 2 · mixing pit: mixer on a bridge + radar level transmitter
    box(g, 5, 1.5, 5, 0xa9a49a, -19, 0, Z);
    const slurry = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 4.3), mat(0x5e4329, { roughness: 0.4 }));
    slurry.rotation.x = -Math.PI / 2;
    slurry.position.set(-19, 1.52, Z);
    g.add(slurry);
    box(g, 5.4, 0.25, 0.7, COL.steel, -19, 1.5, Z);
    box(g, 0.7, 0.4, 0.7, 0x24639a, -19, 1.75, Z);
    cyl(g, 0.38, 0.9, 0x2f7fbf, -19, 2.15, Z);
    tag('M-201', -19, 3.6, Z);
    box(g, 0.15, 1.3, 0.15, COL.steelDark, -16.8, 1.5, Z + 2.2);
    box(g, 0.9, 0.12, 0.12, COL.steelDark, -17.2, 2.7, Z + 2.2);
    const horn = add(g, new THREE.ConeGeometry(0.22, 0.45, 10), mat(0x9aa5ab), -17.6, 2.35, Z + 2.2);
    horn.rotation.x = Math.PI;
    box(g, 0.36, 0.36, 0.36, 0xe0902f, -17.6, 2.6, Z + 2.2);
    tag('LIT-201', -17.6, 3.6, Z + 2.2);
    run([V(-16.5, LY, Z), V(-13.5, LY, Z)], RL, LIQ);
    mov('MOV-201', -15, LY, Z, 'x', RL);

    // 3 · anaerobic digester tank + covered lagoon
    add(g, new THREE.CylinderGeometry(4.5, 4.5, 7, 24), mat(0x7f9a8a), -9, 3.62, Z);
    cyl(g, 4.65, 0.35, 0x5f7468, -9, 6.95, Z);
    add(g, DOME, mat(0xe9e4d6), -9, 7.2, Z, 4.4, 1.8, 4.4);
    box(g, 0.25, 7, 0.25, COL.steelDark, -13.6, 0.12, Z - 1.5);
    add(g, BUND, mat(0xb59a6e), 5, 0.25, Z, 13.5, 0.5, 10.5);
    add(g, DOME, mat(0x26292b, { roughness: 0.5 }), 5, 0.5, Z, 6.4, 2.0, 4.8);
    run([V(-4.5, LY, Z), V(-1.6, LY, Z)], RL, LIQ);
    mov('MOV-301', -3, LY, Z, 'x', RL);

    // biogas header from tank + lagoon
    run([V(-9, GY, -41.4), V(-9, GY, HZ)], RG, GAS);
    run([V(3, 0.9, -41.4), V(3, GY, -41.4), V(3, GY, HZ)], RG, GAS);
    run([V(-9, GY, HZ), V(13.2, GY, HZ), V(17, GY, HZ), V(17, GY, -41.6)], RG, GAS);
    for (const x of [-5, 1, 7]) box(g, 0.18, GY - 0.3, 0.18, COL.steelDark, x, 0.12, HZ);
    usfm('FIT-301', 5.6, GY, HZ, 'x', RG);
    pt('PIT-301', 7.8, GY, HZ);
    tt('TIT-301', 9.6, GY, HZ);
    mov('MOV-302', 15.2, GY, HZ, 'x', RG);

    // flare branch with ultrasonic flowmeter and pilot system
    run([V(13.2, GY, HZ), V(13.2, GY, -53.5), V(13.2, 0.9, -53.5)], RG, GAS);
    mov('MOV-601', 13.2, GY, -42.6, 'z', RG);
    usfm('FIT-601', 13.2, GY, -45.6, 'z', RG);
    cyl(g, 0.32, 10, COL.steelDark, 13.2, 0.12, -53.5);
    cyl(g, 0.5, 0.3, 0x50585e, 13.2, 10.1, -53.5);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 8), new THREE.MeshBasicMaterial({ color: 0xffa23d }));
    this.flame.position.set(13.2, 11.3, -53.5);
    g.add(this.flame);
    run([V(13.2, GY, -48.2), V(14.6, GY, -48.2), V(14.6, GY, -53.5), V(14.6, 10.2, -53.5), V(13.6, 10.2, -53.5)], 0.1, GAS);
    mov('MOV-602', 14.6, GY, -50.6, 'z', 0.1);
    this.pilot = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8), new THREE.MeshBasicMaterial({ color: 0x7fc8ff }));
    this.pilot.position.set(13.65, 10.55, -53.5);
    g.add(this.pilot);
    this.cabinet(g, 16.2, 0.12, -53.6, 1.0, 1.4, 0.5);
    box(g, 0.36, 0.26, 0.04, 0x2f3438, 16.2, 0.95, -53.33);
    tag('BMS-601', 16.2, 2.5, -53.6);

    // 4 · H2S scrubber
    add(g, new THREE.CylinderGeometry(1.4, 1.4, 9, 18), mat(0xa9b3b8), 17, 4.62, -43);
    add(g, DOME, mat(0xa9b3b8), 17, 9.12, -43, 1.4, 0.7, 1.4);
    cyl(g, 0.8, 2, 0x6f8f9a, 19.4, 0.12, -45.8);
    run([V(18.4, GY, -43), V(32, GY, -43)], RG, GAS);
    for (const x of [22.2, 28.8]) box(g, 0.18, GY - 0.3, 0.18, COL.steelDark, x, 0.12, -43);
    mov('MOV-401', 19.8, GY, -43, 'x', RG);
    usfm('FIT-401', 21.3, GY, -43, 'x', RG);
    pt('PIT-401', 23, GY, -43);
    tt('TIT-401', 24.4, GY, -43);

    // 5 · genset inlet train, gas analyzer, genset, step-up transformer
    // gas analyzer: one shelter beside the MCC, two sample points — scrubber inlet and outlet
    const TUBE = 0x9aa5ab;
    const probe = (t, x, z) => { stem(x, GY, z, 0.6); box(g, 0.3, 0.3, 0.3, 0x8e5bb5, x, GY + 0.55, z); tag(t, x, GY + 1.5, z); };
    probe('AIT-301', 16.2, HZ);
    run([V(16.2, GY + 0.7, HZ), V(16.2, GY + 0.7, -37.2), V(19, GY + 0.7, -37.2), V(19, 1.5, -37.2)], 0.07, TUBE);
    probe('AIT-401', 25.2, -43);
    run([V(25.2, GY + 0.7, -43), V(25.2, GY + 0.7, -40.2), V(19.8, GY + 0.7, -40.2), V(19.8, GY + 0.7, -37.6), V(19.8, 1.5, -37.6)], 0.07, TUBE);
    this.cabinet(g, 19.6, 0.12, -37.2, 1.3, 1.9, 0.8);
    box(g, 1.6, 0.1, 1.1, 0x6b7378, 19.6, 2.05, -37.2);
    box(g, 0.5, 0.35, 0.05, 0x2f3438, 19.6, 1.2, -36.78);

    mov('MOV-501', 26, GY, -43, 'x', RG);
    usfm('FIT-501', 27.5, GY, -43, 'x', RG);
    pt('PIT-501', 29.4, GY, -43);
    tt('TIT-501', 30.8, GY, -43);
    this.genset(g, 35.5, -43);
    tag('G-501', 35.5, 5.6, -43);

    this.padTransformer(g, 35.5, -39.4);

    // PLC / MCC room — every transmitter and valve above is wired back here
    const mtop = this.structure(g, {
      x: 22.5, z: -38.4, w: 4, d: 2.6, h: 2.7, cladding: 0xd8d4cc,
      doors: [{ side: 's', at: -0.8, w: 1.0, h: 2.1 }],
      windows: [{ side: 's', y: 1.2, at: [0.9], ww: 0.8, wh: 0.7 }],
      louvres: [{ side: 'e', at: 0, y: 0.5, w: 0.8, h: 0.6 }],
    });
    box(g, 0.8, 0.55, 0.3, 0xe4e6e6, 21.6, 1.9, -39.85);   // wall AC
    box(g, 0.4, 0.1, 3.2, 0x8d9296, 23.6, mtop + 0.5, -40.4); // cable tray to the pipe rack
    cyl(g, 0.05, 2, COL.steelDark, 23.9, mtop, -38.9);
    tag('PLC-01', 22.5, 4.4, -38.4);
    for (const it of this.instruments) it.pos.add(g.position);
  }

  buildWind() {
    const g = this.group('wind');
    const blade = new THREE.CylinderGeometry(0.05, 0.36, 7.6, 14, 8);
    blade.translate(0, 4.0, 0);
    blade.scale(1, 1, 0.26);
    const bp = blade.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i), a = (y / 7.6) * 0.55, bx = bp.getX(i) + Math.sin(Math.min(1, y / 1.2) * Math.PI) * 0.12, bz = bp.getZ(i);
      bp.setXYZ(i, bx * Math.cos(a) - bz * Math.sin(a), y, bx * Math.sin(a) + bz * Math.cos(a));
    }
    blade.computeVertexNormals();
    const nacelle = new THREE.CapsuleGeometry(0.55, 1.7, 8, 20).rotateX(Math.PI / 2);
    const spinner = new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.6);
    for (const [x, z] of [[52, -74], [68, -82], [84, -74], [100, -82]]) {
      cyl(g, 1.3, 1.2, 0xf2c94c, x, 0, z);
      add(g, new THREE.CylinderGeometry(0.35, 0.65, 18, 28), mat(0xf4f4f0), x, 1.2 + 9, z);
      add(g, nacelle, mat(0xf4f4f0), x, 19.75, z - 0.3);
      const rotor = new THREE.Group();
      rotor.position.set(x, 19.75, z + 1.15);
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(blade, mat(0xfafaf6));
        b.rotation.z = (i * Math.PI * 2) / 3;
        b.castShadow = true;
        rotor.add(b);
      }
      add(rotor, spinner, mat(0xf0f0ec), 0, 0, 0.05);
      rotor.rotation.z = Math.random() * 6;
      g.add(rotor);
      this.spinners.push({ obj: rotor, axis: 'z', speed: 1.1 + Math.random() * 0.3 });
    }
    // export-cable landing station on the shore, tied into grid Line 2
    this.structure(g, {
      x: 57, z: -51.5, w: 5, d: 3.6, h: 2.9, wall: 0xdcd4c4,
      doors: [{ side: 's', at: -1.2, w: 1.4, h: 2.3 }],
      louvres: [{ side: 'e', at: 0, y: 0.5, w: 1.0, h: 0.8 }, { side: 'w', at: 0, y: 0.5, w: 1.0, h: 0.8 }, { side: 's', at: 1.2, y: 0.6, w: 1.2, h: 0.9 }],
    });
    this.sign(57, 2.45, -49.62, 3.4, 0.55, 0, [{ text: 'ONSA · OFFSHORE WIND LANDING', size: 70, y: 82, color: BRAND.white }], false, g);
    this.padTransformer(g, 53.2, -52.6, true);
    // cable sealing-end structure where the subsea export cable comes ashore
    for (const lx of [-0.9, 0.9]) this.lattice(g, 60.9 + lx, -52.6, 3, 0.14, 0.12);
    box(g, 2.2, 0.16, 0.4, COL.steel, 60.9, 3, -52.6);
    for (const bx of [-0.7, 0, 0.7]) cyl(g, 0.14, 1.2, COL.porcelain, 60.9 + bx, 3.16, -52.6);
    const duct = add(g, CYL, mat(0x2e3338), 60.9, 0.2, -54.2, 0.25, 3.2, 0.25);
    duct.rotation.x = Math.PI / 2;
    // wind farm genset G-502 at the shore station, exporting on grid Line 2 with the turbines
    this.genset(g, 67, -51.2);
    this.sign(65.4, 2.75, -49.86, 2.6, 0.45, 0, [{ text: 'WIND FARM GENSET G-502', size: 64, y: 70, color: BRAND.white }], false, g);
  }

  buildCollege() {
    const g = this.group('townC');
    const cg = this.feederGlass.C;
    // academic block: two storeys, tiled hip roof, glazed entrance
    this.structure(g, {
      x: 71, z: 56, w: 18, d: 10, h: 7.4, wall: 0xe2d3b6, glass: cg, roof: 'hip', roofH: 2.6, roofTint: 0xe6c6b6,
      windows: [{ side: 's', y: [1.0, 4.6], count: 7, ww: 1.4, wh: 1.6 }, { side: 'n', y: [1.0, 4.6], count: 7, ww: 1.4, wh: 1.6 },
        { side: 'e', y: [1.0, 4.6], count: 3, ww: 1.4, wh: 1.6 }, { side: 'w', y: [1.0, 4.6], count: 3, ww: 1.4, wh: 1.6 }],
      doors: [{ side: 's', at: 0, w: 2.4, h: 2.6, glass: true }],
    });
    // clock tower
    const tt = this.structure(g, {
      x: 71, z: 50.2, w: 4, d: 4, h: 13.5, wall: 0xd8c6a4, glass: cg, roof: 'hip', roofH: 2.8, roofTint: 0xd8a890,
      windows: [{ side: 'n', y: [3, 6.5], count: 1, ww: 0.9, wh: 1.4 }, { side: 'e', y: [3, 6.5], count: 1, ww: 0.9, wh: 1.4 }, { side: 'w', y: [3, 6.5], count: 1, ww: 0.9, wh: 1.4 }],
    });
    for (const [cx, cz, ry] of [[71, 52.24, 0], [71, 48.16, Math.PI], [73.04, 50.2, Math.PI / 2], [68.96, 50.2, -Math.PI / 2]]) {
      const face = new THREE.Group();
      face.position.set(cx, tt - 1.6, cz);
      face.rotation.y = ry;
      const dial = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.4 }));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 40), mat(0x2e3338));
      const hourH = new THREE.Mesh(BOX, mat(0x1d1f22)); hourH.scale.set(0.07, 0.6, 0.02); hourH.position.set(0.12, 0.24, 0.03); hourH.rotation.z = -0.5;
      const minH = new THREE.Mesh(BOX, mat(0x1d1f22)); minH.scale.set(0.05, 0.85, 0.02); minH.position.set(-0.2, 0.37, 0.04); minH.rotation.z = 0.5;
      face.add(dial, rim, hourH, minH);
      g.add(face);
    }
    // two hostel blocks: three storeys with balconies
    for (const hz of [52, 63]) {
      this.structure(g, {
        x: 89, z: hz, w: 8, d: 7, h: 9.6, wall: 0xd5dde0, glass: cg,
        windows: [{ side: 's', y: [0.9, 4.1, 7.3], count: 3, ww: 1.3, wh: 1.4 }, { side: 'n', y: [0.9, 4.1, 7.3], count: 3, ww: 1.3, wh: 1.4 }, { side: 'e', y: [0.9, 4.1, 7.3], count: 2, ww: 1.1, wh: 1.2 }],
        doors: [{ side: 'w', at: 0 }],
      });
      for (const fy of [3.4, 6.6]) {
        box(g, 7.6, 0.15, 1.1, COL.concrete, 89, fy, hz + 4.05);
        box(g, 7.6, 0.9, 0.05, mat(0x9aa3a8, { metalness: 0.6, roughness: 0.4 }), 89, fy + 0.15, hz + 4.58);
      }
    }
    // library: tall glazing
    this.structure(g, {
      x: 52, z: 60, w: 9, d: 7, h: 4.8, wall: 0xece4d4, glass: cg,
      windows: [{ side: 's', y: 0.6, count: 3, ww: 2.2, wh: 3.2 }, { side: 'e', y: 0.6, count: 2, ww: 2.2, wh: 3.2 }],
      doors: [{ side: 'w', at: 0, w: 1.6, h: 2.4, glass: true }],
    });
    // grandstand by the field
    for (let k = 0; k < 3; k++) box(g, 16, 0.45, 1.1, COL.concrete, 72, k * 0.45, 81.8 + k * 1.0);
    box(g, 16.4, 0.15, 3.6, 0x8d9296, 72, 3.4, 82.8);
    for (const sx of [-7.8, 7.8]) cyl(g, 0.1, 3.4, 0x8d9296, 72 + sx, 0, 84.4);

    // sports field with track
    const flatM = (w, d, material, x, z, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); };
    flatM(28, 15, surface('soil', 0xd07a5c, { roughness: 0.9 }), 72, 73, 0.05);   // running track
    flatM(24, 11, surface('grass', 0xb8d49a), 72, 73, 0.06);                      // pitch
    for (const [w, d, x, z] of [[0.15, 11, 72, 73], [24, 0.12, 72, 67.6], [24, 0.12, 72, 78.4], [0.12, 11, 60.1, 73], [0.12, 11, 83.9, 73]]) flatM(w, d, mat(0xf1ead8), x, z, 0.07);
    const postM = mat(0xf4f4f0, { roughness: 0.4 });
    for (const gx of [60.6, 83.4]) {                                                // goalposts
      for (const pz of [71.6, 74.4]) cyl(g, 0.07, 2.2, postM, gx, 0, pz);
      add(g, CYL, postM, gx, 2.2, 73, 0.07, 2.94, 0.07).rotation.x = Math.PI / 2;
    }
    // college sign
    this.sign(54.5, 1.4, 46.5, 6, 1.8, 0, [
      { text: 'KOLEJ KOMUNITI', size: 112, y: 120, color: BRAND.amber },
      { text: 'BUKIT MUTIARA', size: 76, y: 230, color: BRAND.white, weight: 800 },
    ], true, g);
  }

  // ONSA Power & Co. solar farm: tilted PV rows, string inverters and a step-up station on grid Line 3
  buildSolar() {
    const g = this.group('solar');
    box(g, 50, 0.1, 38, 0xc9bf9f, -82, 0, 70);
    const rows = 11, per = 12;
    const panels = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ map: panelTexture('pv'), roughness: 0.14, metalness: 0.0, envMapIntensity: 0.35 }), rows * per);
    const posts = new THREE.InstancedMesh(BOX, mat(COL.steelDark), rows * per);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0)), q0 = new THREE.Quaternion();
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < per; k++) {
        const x = -104 + k * 3.4 + 1.7, z = 54 + r * 3.1;
        m.compose(new THREE.Vector3(x, 1.25, z), q, new THREE.Vector3(3.2, 0.08, 2));
        panels.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x, 0.6, z), q0, new THREE.Vector3(0.12, 1.2, 0.12));
        posts.setMatrixAt(i, m);
        i++;
      }
    }
    panels.castShadow = posts.castShadow = true;
    panels.receiveShadow = true;
    g.add(panels, posts);
    for (let r = 0; r < rows; r++) { const tube = add(g, CYL, mat(0x9aa3a8), -84, 1.15, 54 + r * 3.1, 0.07, 41, 0.07); tube.rotation.z = Math.PI / 2; } // torque tubes
    // inverter skids and the step-up transformer stand in the gravel strip between the last panel row
    // (edge x = -63.3) and the perimeter walkway (inner edge x = -60.2)
    const IX = -61.75;
    for (const z of [57, 66, 75, 84]) {                                                   // inverter skids
      box(g, 2.2, 0.2, 1.6, COL.concrete, IX, 0, z);
      this.cabinet(g, IX - 0.4, 0.2, z, 0.8, 1.5, 0.7, 0xe4e1d8, Math.PI / 2);
      this.cabinet(g, IX + 0.4, 0.2, z, 0.8, 1.5, 0.7, 0xe4e1d8, Math.PI / 2);
      box(g, 2.0, 0.08, 1.4, 0x8d9296, IX, 1.85, z);
    }
    this.padTransformer(g, IX, 61.5, true);
    this.sign(-84, 1.4, 90.5, 8, 2.2, 0, [
      { text: 'ONSA Power & Co.', size: 130, y: 110, color: BRAND.amber },
      { text: 'SOLAR FARM · GRID LINE 3', size: 58, y: 220, color: BRAND.white, weight: 800 },
    ], true, g);
  }

  // Feeder D: Mutiara Avenue Mall — mall, cinema, big wheel, parking
  buildMall() {
    const g = this.group('townD');
    const mg = this.feederGlass.D;
    // mall: plaster block with a glass curtain-wall frontage, entrance canopy, skylight, rooftop plant
    const top = this.structure(g, {
      x: 8, z: 70, w: 30, d: 16, h: 7, wall: 0xece6da, glass: mg,
      windows: [{ side: 'e', y: [1.0, 4.2], count: 5, ww: 1.8, wh: 1.6 }, { side: 'w', y: [1.0, 4.2], count: 5, ww: 1.8, wh: 1.6 }],
      doors: [{ side: 'n', at: -8, w: 2.4, h: 2.6 }, { side: 'n', at: 8, w: 2.4, h: 2.6 }],
    });
    box(g, 28.6, 5.6, 0.08, mg, 8, 0.6, 78.06);
    for (let xx = -6.3; xx <= 22.31; xx += 2.2) box(g, 0.08, 5.6, 0.16, 0x2e3338, xx, 0.6, 78.1);
    for (const yy of [0.6, 3.35, 6.16]) box(g, 28.6, 0.08, 0.16, 0x2e3338, 8, yy, 78.1);
    box(g, 10, 0.25, 4, 0xd9dcdf, 8, 4.6, 80);
    for (const cx of [3.6, 12.4]) cyl(g, 0.18, 4.6, 0xd9dcdf, cx, 0, 81.6);
    const sky = add(g, new THREE.ConeGeometry(4, 1.8, 4, 1).rotateY(Math.PI / 4).toNonIndexed(), mg, 8, top + 0.9, 70);
    sky.geometry.computeVertexNormals();
    for (const [rx, rz] of [[-3, 66], [0, 74], [17, 66], [20, 74]]) this.roofUnit(g, rx, top + 0.05, rz, 1.8, 1.4, true);
    const shopCols = [0xd9534f, 0x2fa39a, 0xf2b33d, 0x6a5acd, 0x3d8fd1, 0xe07b39];
    for (let k = 0; k < 6; k++) box(g, 3.8, 0.8, 0.2, shopCols[k], -4.5 + k * 5 + (k > 2 ? 1 : -1) * 0.6, 6.35, 78.2); // shop signs over the storefronts
    box(g, 6, 1.2, 0.25, 0x1d2928, 8, 7.25, 78.2);
    // cinema: dark block, glazed lobby, marquee, lit poster frames, vertical blade sign
    this.structure(g, { x: 31, z: 66, w: 12, d: 10, h: 9, wall: 0x4a3b5e, glass: mg, doors: [{ side: 's', at: 0, w: 3, h: 2.6, glass: true }] });
    box(g, 9, 1.6, 0.4, 0xf2b33d, 31, 3.4, 71.3);
    for (const px of [-3.8, 3.8]) { box(g, 1.6, 2.4, 0.08, 0x2e3338, 31 + px, 5.4, 71.06); box(g, 1.4, 2.2, 0.06, mg, 31 + px, 5.5, 71.1); }
    box(g, 0.3, 5, 1.2, 0xc0392b, 36.8, 3.2, 71.4);
    // big wheel (lights follow Feeder D)
    const wheel = new THREE.Group();
    wheel.position.set(31, 10, 84);
    const ringMat = this.feederMats.D;
    const white = mat(0xeceff1, { metalness: 0.5, roughness: 0.35 });
    for (const zz of [-0.45, 0.45]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.14, 10, 72), ringMat);
      ring.position.z = zz;
      wheel.add(ring);
    }
    add(wheel, CYL, white, 0, 0, 0, 0.45, 1.4, 0.45).rotation.x = Math.PI / 2;
    const gondola = new THREE.CapsuleGeometry(0.62, 0.55, 6, 16);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const zz of [-0.45, 0.45]) {
        const spoke = add(wheel, CYL, white, Math.cos(a) * 3.5, Math.sin(a) * 3.5, zz, 0.04, 7, 0.04);
        spoke.rotation.z = a - Math.PI / 2;
      }
      if (k % 2) continue;
      const cab = add(wheel, gondola, mat(shopCols[(k / 2) % shopCols.length], { metalness: 0.3, roughness: 0.4 }), Math.cos(a) * 7, Math.sin(a) * 7 - 0.75, 0);
      cab.rotation.x = Math.PI / 2;
    }
    g.add(wheel);
    this.spinners.push({ obj: wheel, axis: 'z', speed: 0.25 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = add(g, CYL, mat(0xbfc5c9, { metalness: 0.6, roughness: 0.4 }), 31 + sx * 2.4, 5, 84 + sz * 1.1, 0.16, 10.6, 0.16);
      leg.rotation.z = sx * 0.24;
      leg.rotation.x = -sz * 0.1;
    }
    box(g, 6.5, 0.4, 3.4, COL.concrete, 31, 0, 84); // boarding platform
    // parking
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(28, 9), mat(0x6f767c));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(6, 0.05, 84);
    g.add(lot);
    for (let k = 0; k <= 11; k++) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.6), mat(0xf1ead8)); ln.rotation.x = -Math.PI / 2; ln.position.set(-7.2 + k * 2.4, 0.06, 84); g.add(ln); }
    const rand = rng(17);
    const carCols = [0xd9534f, 0x3d6fb6, 0xf0f0f0, 0x2f3438, 0xf2b33d, 0x6aa86a];
    for (let k = 0; k < 11; k++) {
      if (rand() < 0.25) continue;
      const c = car(carCols[k % carCols.length]);
      c.position.set(-6 + k * 2.4, 0.06, 84);
      c.rotation.y = rand() < 0.5 ? 0 : Math.PI;
      g.add(c);
    }
    this.sign(-9, 1.4, 88.5, 7, 2, 0, [
      { text: 'MUTIARA AVENUE', size: 112, y: 110, color: BRAND.amber },
      { text: 'MALL · SHOPS · CINEMA · BIG WHEEL', size: 52, y: 220, color: BRAND.white, weight: 800 },
    ], true, g);
  }

  // ONSA R&D Centre: Space-Based Solar Power (SBSP). A satellite captures solar power in space and
  // beams it down wirelessly as microwaves to a rectenna field, which turns it back into electricity.
  buildRnD() {
    const g = this.group('rnd');
    box(g, 26, 0.1, 26, 0xc9c3b6, -45, 0, 74);
    const labTop = this.structure(g, {
      x: -46, z: 82.5, w: 14, d: 9, h: 6.4, wall: 0xeef0ee,
      windows: [{ side: 'n', y: [0.8, 3.8], count: 5, ww: 1.8, wh: 1.6 }, { side: 's', y: [0.8, 3.8], count: 5, ww: 1.8, wh: 1.6 }, { side: 'e', y: [0.8, 3.8], count: 3, ww: 1.6, wh: 1.6 }],
      doors: [{ side: 'w', at: 0, w: 1.8, h: 2.4, glass: true }],
    });
    add(g, DOME, mat(0xe9ecee, { metalness: 0.4, roughness: 0.3 }), -50, labTop, 82.5, 2.4, 2.2, 2.4); // observatory dome
    add(g, CYL, mat(0xd5d9dc), -50, labTop - 0.2, 82.5, 2.5, 0.4, 2.5);
    box(g, 0.5, 2.4, 0.06, 0x2e3338, -50, labTop + 0.6, 84.95);  // dome slit
    this.roofUnit(g, -42, labTop + 0.05, 81, 1.8, 1.4, true);
    cyl(g, 0.07, 4, COL.steelDark, -40.5, labTop, 85);

    // rectenna field: rows of receiving antenna panels
    const rect = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ map: panelTexture('rectenna'), roughness: 0.4, metalness: 0.5 }), 42);
    const m = new THREE.Matrix4(), tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0));
    let i = 0;
    for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) {
      m.compose(new THREE.Vector3(-55 + k * 2.2, 0.9, 63 + r * 1.9), tilt, new THREE.Vector3(1.9, 0.06, 1.5));
      rect.setMatrixAt(i++, m);
    }
    rect.castShadow = rect.receiveShadow = true;
    g.add(rect);
    this.rectenna = new THREE.Vector3(-48.4, 1, 67.8).add(g.position);
    this.satCenter = new THREE.Vector3(-46, 0, 70).add(g.position);
    this.rectGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.12, depthWrite: false }));
    this.rectGlow.rotation.x = -Math.PI / 2;
    this.rectGlow.position.set(-48.4, 1.2, 67.8);
    g.add(this.rectGlow);

    // ground station dish that tracks the satellite
    const ground = buildGroundDish();
    ground.base.position.set(-37.5, 0, 70);
    g.add(ground.base);
    this.dish = ground.head;
    this.dish.position.set(-37.5, 3.6, 70);
    g.add(this.dish);

    // the satellite: ONSA SBSP-1 (bus, truss booms, PV wings, radiators, phased-array transmitter)
    const sat = (this.satellite = buildSatellite());
    sat.userData.asset = 'rnd';
    this.scene.add(sat);
    this.pickables.push(sat);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.scene.add(this.beam);
    // chapter 5: energy pulses run down the beam once SBSP-1 goes to full power
    this.pulses = [0, 0.25, 0.5, 0.75].map(t => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.userData.t = t;
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.satAngle = 0.6;
    this.rndOutput = 0;

    this.sign(-58, 1.4, 88.5, 7.5, 2.2, 0, [
      { text: 'ONSA Power & Co.', size: 124, y: 105, color: BRAND.amber },
      { text: 'R&D CENTRE · SBSP RESEARCH', size: 54, y: 215, color: BRAND.white, weight: 800 },
    ], true, g);
    this.buildResearcher();
  }

  // The researcher: white lab coat, safety glasses, ONSA R&D badge, tablet in hand.
  // The researcher: same ONSA field figure as the player, as a woman, carrying a tablet.
  buildResearcher() {
    const { p: r, body: rBody, legs, arms } = this.worker({ woman: true });
    this.researcher = r;
    this.researcherBody = rBody;
    r.userData.asset = 'researcher';
    this.rLegs = legs;
    this.rArms = arms;
    const tablet = add(arms[1].el, BOX, mat(0x1f2a33), 0, -0.4, 0.12);
    tablet.scale.set(0.3, 0.4, 0.03);
    tablet.rotation.x = 0.3;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), new THREE.MeshBasicMaterial({ color: 0x7fe3ff }));
    screen.position.set(0, -0.4, 0.14);
    screen.rotation.x = 0.3;
    arms[1].el.add(screen);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const qDir = d => new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), d.normalize());
    const pose = (upper, fore) => { const sh = qDir(upper); return { sh, el: sh.clone().invert().multiply(qDir(fore)) }; };
    this.tabletPose = [pose(V(-0.08, -1, 0.05), V(0.02, -1, 0.12)), pose(V(-0.05, -1, 0.3), V(-0.25, 0.15, 1))];
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.14;
    r.add(shadow);
    r.position.set(-47, 0, 75.5).add(this.areas.rnd.position);
    this.scene.add(r);
    this.pickables.push(r);
    // makes rounds of the rectenna field, the ground-station dish and the lab door, on open ground,
    // routed around everything solid the same way as the player
    this.rStops = [[-47, 75.5], [-34, 70], [-48, 59.5], [-59, 70], [-56, 82.5]].map(([x, z]) => new THREE.Vector3(x, 0, z).add(this.areas.rnd.position));
    this.rStop = 1;
    this.rPath = null;
    this.rWait = 3;
    this.rPhase = 0;
  }
  researcherAnchor() { return this.researcher.position.clone().setY(5.8); }

  updateSouth(dt) {
    // satellite on a slow orbit above the R&D centre; beam and dish follow it
    this.satAngle += dt * 0.06;
    const sp = new THREE.Vector3(this.satCenter.x + Math.cos(this.satAngle) * 34, 56 + Math.sin(this.satAngle * 0.7) * 5, this.satCenter.z + Math.sin(this.satAngle) * 22);
    this.satellite.position.copy(sp);
    this.satellite.rotation.y = -this.satAngle;
    const tx = sp.clone().add(new THREE.Vector3(0, -3.2, 0));
    const d = this.rectenna.clone().sub(tx);
    const len = d.length();
    this.beam.position.copy(tx).addScaledVector(d, 0.5);
    const full = this.beamFull ? 1 : 0, rad = 1.6 + 1.3 * full;
    this.beam.scale.set(rad, len, rad);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const flicker = 0.13 + 0.12 * full + 0.05 * Math.sin(this._t * 5);
    this.beam.material.opacity = flicker;
    this.rectGlow.material.opacity = 0.08 + flicker * (0.5 + full);
    for (const pu of this.pulses) {
      pu.visible = !!full;
      if (!full) continue;
      pu.userData.t = (pu.userData.t + dt * 0.45) % 1;
      pu.position.copy(tx).addScaledVector(d, len * pu.userData.t);
      pu.quaternion.copy(this.beam.quaternion);
      pu.scale.setScalar(rad * 1.15);
      pu.material.opacity = 0.7 * Math.sin(Math.PI * pu.userData.t);
    }
    this.dish.lookAt(sp);
    const dp = this.dish.getWorldPosition(new THREE.Vector3());
    const elev = Math.asin(THREE.MathUtils.clamp((sp.y - dp.y) / sp.distanceTo(dp), 0, 1));
    this.rndOutput = Math.round(((this.beamFull ? 4200 : 110) * Math.sin(elev)) / 5) * 5;

    // researcher: walk to the next stop, pause and check the tablet
    const r = this.researcher;
    let moving = false;
    if (this.rWait > 0) this.rWait -= dt;
    else if (this.grid) {
      if (!this.rPath) {
        const to = this.rStops[this.rStop];
        this.rPath = this.findPath(r.position.x, r.position.z, to.x, to.z);
        this.rPi = 0;
      }
      const to = this.rPath[this.rPi];
      const v = to ? to.clone().sub(r.position).setY(0) : new THREE.Vector3();
      const dist = v.length();
      if (dist < 0.05 && to && ++this.rPi < this.rPath.length) moving = true;
      else if (dist < 0.05) { this.rStop = (this.rStop + 1) % this.rStops.length; this.rPath = null; this.rWait = 3 + Math.random() * 3; }
      else {
        moving = true;
        v.normalize();
        r.position.addScaledVector(v, Math.min(dist, (this.researcherRig ? 3 : 4.5) * dt));
        let diff = Math.atan2(v.x, v.z) - r.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        r.rotation.y += diff * Math.min(1, dt * 8);
      }
    }
    if (this.researcherRig) {
      this.researcherRig.play(moving ? 'walk' : 'idle');
      this.researcherRig.mixer.update(dt);
    }
    this.rPhase += dt * (moving ? 9 : 0);
    const swing = moving ? Math.sin(this.rPhase) * 0.55 : 0;
    const k = Math.min(1, dt * 8);
    this.rLegs[0].rotation.x += (swing - this.rLegs[0].rotation.x) * k;
    this.rLegs[1].rotation.x += (-swing - this.rLegs[1].rotation.x) * k;
    this.rArms.forEach((arm, i) => {
      const target = moving
        ? { sh: new THREE.Quaternion().setFromEuler(this._e.set((i ? swing : -swing) * 0.8, 0, i ? -0.06 : 0.06)), el: new THREE.Quaternion().setFromEuler(this._e.set(-0.35, 0, 0)) }
        : this.tabletPose[i];
      arm.sh.quaternion.slerp(target.sh, k);
      arm.el.quaternion.slerp(target.el, k);
    });
  }

  lattice(parent, x, z, h, base, top) {
    const mesh = new THREE.Mesh(latticeGeometry(h, base, top, Math.max(4, Math.round(h / 3))), this.galv);
    mesh.position.set(x, 0, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // horizontal lattice girder between two points
  girder(parent, a, b, size) {
    const d = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(latticeGeometry(d.length(), size, size, Math.max(3, Math.round(d.length() / 1.1))), this.galv);
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Transmission tower: galvanised lattice with truss crossarms and glass insulator strings.
  // Returns conductor attach points (bottom of each insulator string) in world space.
  tower(x, z, rotY, h) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.towerFeet.push([x, z]);
    g.updateMatrixWorld(true);
    (this._towerAt[h] = this._towerAt[h] || []).push(g.matrixWorld.clone());
    return [[-3.2, h - 1.3], [3.2, h - 1.3], [-2.2, h - 3.9], [2.2, h - 3.9]].map(([lx, ly]) => g.localToWorld(new THREE.Vector3(lx, ly, 0)));
  }

  chain(points, h) {
    const attach = points.map(([x, z], i) => {
      const [nx, nz] = points[Math.min(i + 1, points.length - 1)];
      const [px, pz] = points[Math.max(i - 1, 0)];
      return this.tower(x, z, Math.atan2(nx - px, nz - pz), h);
    });
    for (let i = 0; i < attach.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const a = attach[i][k], b = attach[i + 1][k];
        const pts = [];
        for (let st = 0; st <= 24; st++) {
          const t = st / 24;
          const pt = a.clone().lerp(b, t);
          pt.y -= 1.4 * 4 * t * (1 - t);
          pts.push(pt);
        }
        this.wireGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.032, 5, false));
      }
    }
    return attach;
  }
  // one conductor per phase from attachment points a[k] to b[k], sagging between them
  span(a, b, sag = 1.4) {
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      const pts = [];
      for (let st = 0; st <= 24; st++) {
        const t = st / 24;
        const pt = a[k].clone().lerp(b[k], t);
        pt.y -= sag * 4 * t * (1 - t);
        pts.push(pt);
      }
      this.wireGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.032, 5, false));
    }
  }
  route(r) {
    const attach = this.chain(r.pts, r.h);
    const [mx, mz] = r.pts[Math.floor(r.pts.length / 2)];
    this.lineTags.push({ text: r.tag, pos: new THREE.Vector3(mx, r.h + 3, mz), ch: r.ch });
    for (let i = 0; i < r.pts.length - 1; i++) this.lineSegs.push([...r.pts[i], ...r.pts[i + 1]]);
    return attach;
  }

  buildLines() {
    const routes = [
      { pts: [[24, -5], [40, -9], [56, -13], [72, -17], [88, -20]], h: 13, tag: '33 kV Feeder A · Homes' },
      { pts: [[24, 5], [40, 9], [56, 13], [72, 17], [88, 20]], h: 13, tag: '33 kV Feeder B · Hospital' },
      { pts: [[16, 17], [30, 32], [46, 46], [62, 57], [78, 70], [91, 74]], h: 13, tag: '33 kV Feeder C · College' },
      { pts: [[6, 17], [7, 34], [7, 51], [8, 74]], h: 13, tag: '33 kV Feeder D · Mutiara Avenue Mall' },
      { pts: [[-6, 17], [-18, 34], [-36, 48], [-60, 58], [-84, 71], [-100, 74]], h: 15, tag: '132 kV Line 3 · Solar farm PV inverters' },
      { pts: [[0, -16], [0, -28], [8, -40], [20, -49], [32, -51.5]], h: 15, tag: '132 kV Line 1 · Biogas genset G-501' },
      { pts: [[22, -17], [34, -28], [44, -40], [54, -51], [56, -65]], h: 15, tag: '132 kV Line 2 · Wind turbines WTG-1–4 + Wind farm genset G-502' },
    ];
    this.lineTags = [];
    this.lineSegs = [];
    this.wireGeos = [];
    this._towerAt = {};
    for (const r of routes) this.route(r);
    this.finishLines(this.scene);
  }

  // the wires so far as one mesh, and every tower as one instanced lattice + insulators + concrete footings per height
  finishLines(parent) {
    this.wireMat = this.wireMat || new THREE.MeshStandardMaterial({ color: 0x8d9296, metalness: 0.75, roughness: 0.42 });
    parent.add(new THREE.Mesh(mergeGeometries(this.wireGeos), this.wireMat));
    this.wireGeos = [];
    const footing = roundedBox(0.9, 0.5, 0.9), feet = [];
    for (const [h, list] of Object.entries(this._towerAt)) {
      const hh = +h;
      const ins = [];
      for (const [lx, ly] of [[-3.2, hh - 0.6], [3.2, hh - 0.6], [-2.2, hh - 3.2], [2.2, hh - 3.2]]) insulatorString(ins, lx, ly, 0, 0.7);
      for (const [geo, material] of [[latticeGeometry(hh, 1.6, 0.4, 7, [{ y: hh - 0.6, span: 7 }, { y: hh - 3.2, span: 5 }]), this.galv], [mergeGeometries(ins), this.glassIns]]) {
        const m = new THREE.InstancedMesh(geo, material, list.length);
        list.forEach((M, i) => m.setMatrixAt(i, M));
        m.castShadow = true;
        parent.add(m);
      }
      for (const M of list) for (const sx of [-1, 1]) for (const sz of [-1, 1]) feet.push(new THREE.Matrix4().makeTranslation(sx * 1.6, -0.05, sz * 1.6).premultiply(M));
    }
    this._towerAt = {};
    const fm = new THREE.InstancedMesh(footing, mat(COL.concrete), feet.length);
    feet.forEach((M, i) => fm.setMatrixAt(i, M));
    fm.receiveShadow = true;
    parent.add(fm);
  }

  // ---------- chapter 3: the west — hills and river, Sungai Mutiara hydro, Line 4 and Mutiara Motor Works ----------
  // water surface that follows a centreline: per-point width and height, UVs running along the flow
  strip(pts, width, yAt, material) {
    const pos = [], uv = [], nrm = [], idx = [];
    let run = 0;
    pts.forEach(([x, z], i) => {
      const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
      const L = Math.hypot(nx - px, nz - pz) || 1, ux = (nx - px) / L, uz = (nz - pz) / L;
      if (i) run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const w = typeof width === 'function' ? width(i / (pts.length - 1)) : width, y = yAt(x, z);
      for (const sd of [-1, 1]) { pos.push(x + uz * (w / 2) * sd, y, z - ux * (w / 2) * sd); uv.push((sd + 1) / 2, run / 10); nrm.push(0, 1, 0); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
  }

  // a straight pipe (or strut) between two points
  pipe(g, a, b, r, color) {
    const d = b.clone().sub(a), m = add(g, CYL, asMat(color), 0, 0, 0, r, d.length(), r);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  }

  buildHills() {
    const W = 218, D = 300, geo = new THREE.PlaneGeometry(W, D, 145, 200);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-236 - W / 2, 0, 25);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), meadow = new THREE.Color(0xa6b97c), forest = new THREE.Color(0x5b7d44), rock = new THREE.Color(0x9d968a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = westHeight(x, z);
      pos.setY(i, y - 0.06);
      const slope = Math.hypot(westHeight(x + 1, z) - y, westHeight(x, z + 1) - y);
      c.copy(meadow).lerp(forest, smoothstep(1.5, 9, y)).lerp(rock, smoothstep(0.8, 1.6, slope) * 0.8);
      c.toArray(col, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const hills = new THREE.Mesh(geo, surface('grass', 0xffffff, { vertexColors: true }));
    hills.receiveShadow = hills.castShadow = true;
    this.scene.add(hills);

    // the Sungai Mutiara: down the valley, through the gorge, past the factory and out to sea
    this.riverNormals = this.water.normals.clone();
    this.riverNormals.repeat.set(1, 1);
    this.riverMat = new THREE.MeshStandardMaterial({ color: 0x356f73, roughness: 0.1, metalness: 0.15, normalMap: this.riverNormals, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.DoubleSide });
    const river = RIVER;
    this.riverPts = river;
    const wAt = t => (t < 0.55 ? 5 : 5 + 4 * smoothstep(0.55, 0.62, t));
    const bank = this.strip(river, t => wAt(t) + 3, (x, z) => westHeight(x, z) + 0.09, surface('sand', 0xcbb894, { side: THREE.DoubleSide }));
    const water = this.strip(river, wAt, (x, z) => westHeight(x, z) + 0.16, this.riverMat);
    this.scene.add(bank, water);

    // rainforest on the slopes, kept off the dam site and below-water ground
    const rand = rng(4242);
    this.hillTrees = [];
    for (let i = 0; i < 5000 && this.hillTrees.length < 280; i++) {
      const x = -240 - rand() * 190, z = -70 + rand() * 235, y = westHeight(x, z);
      if (y < 2.5) continue;
      if (x < DAM_X + 2 && x > -372 && y < RES_Y + 1.5) continue;
      if (x > -290 && Math.abs(z - 36) < 34) continue;
      if (riverDist(x, z) < 9) continue;
      if (Math.hypot(westHeight(x + 1, z) - y, westHeight(x, z + 1) - y) > 1.2) continue;
      if (this.hillTrees.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 16)) continue;
      this.hillTrees.push([x, z, 1 + rand() * 0.6, false, y - 0.25]);
    }
  }

  buildHydro() {
    const g = this.group('hydro');
    const conc = surface('concrete', 0xd7d2c6), dark = mat(0x4b5359), steel = mat(0x7e8a90, { metalness: 0.75, roughness: 0.4 });
    // reservoir, held in by the valley sides; rises with the dam
    this.lake = new THREE.Mesh(new THREE.PlaneGeometry(92, 130).rotateX(-Math.PI / 2), this.riverMat);
    this.lake.position.set(DAM_X - 46, RES_Y, 36);
    this.lake.receiveShadow = true;
    g.add(this.lake);

    // concrete gravity dam across the gorge: vertical upstream face, 6 m crest at 21.5 m, 0.7:1 downstream slope
    const section = (pts, z0, z1) => {
      const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false }).translate(0, 0, z0);
      const m = new THREE.Mesh(geo, conc);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    const body = [[DAM_X, -2], [DAM_X, 21.5], [-270, 21.5], [-256, 0.6], [-256, -2]];
    section(body, 8, 30);
    section(body, 42, 64);
    // ogee spillway between, its crest 4 m lower, ending in a flip bucket
    section([[DAM_X, -2], [DAM_X, 17.4], [-274.6, 18], [-272.8, 17.7], [-270.8, 16.3], [-257.2, 1.2], [-255.4, 0.9], [-254, 2.3], [-254, -2]], 30, 42);
    // piers, radial gates and the road bridge over them
    for (const z of [30, 34, 38, 42]) box(g, 7.2, 4.6, 0.9, conc, -272.8, 17.2, z);
    this.gates = [];
    const arc = (r, a0, a1, w) => {   // gate skin: arc of radius r around the trunnion, w wide along z
      const p = [], ix = [], N = 10;
      for (let i = 0; i <= N; i++) { const a = a0 + ((a1 - a0) * i) / N; for (const zz of [-w / 2, w / 2]) p.push(-r * Math.cos(a), r * Math.sin(a), zz); }
      for (let i = 0; i < N; i++) { const k = i * 2; ix.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      geo.setIndex(ix);
      geo.computeVertexNormals();
      return geo;
    };
    const skin = arc(6.4, -0.5, 0.33, 3.1);
    for (const z of [32, 36, 40]) {
      const gate = new THREE.Group();
      gate.position.set(-269.6, 20.6, z);
      const plate = new THREE.Mesh(skin, mat(0x2f6b8f, { metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide }));
      plate.castShadow = true;
      gate.add(plate);
      for (const zz of [-1.2, 1.2]) for (const a of [-0.42, 0.25]) this.pipe(gate, new THREE.Vector3(0, 0, zz), new THREE.Vector3(-6.3 * Math.cos(a), 6.3 * Math.sin(a), zz), 0.12, 0x2f6b8f);
      g.add(gate);
      this.gates.push(gate);
      box(g, 2.2, 2.2, 2.6, 0xe9e0d0, -273, 26.4, z);                             // hoist house, on the hoist bridge
    }
    box(g, 6, 0.5, 13, conc, -273, 21.5, 36);                                         // crest road bridge over the gates
    box(g, 5.6, 0.4, 13.4, conc, -273, 26, 36);                                       // hoist bridge, 4 m above the road
    for (const z of [30, 34, 38, 42]) for (const x of [-275.6, -270.4]) cyl(g, 0.22, 4, conc, x, 22, z);
    // crest road (ending at the control room), parapets and lamps
    box(g, 5.2, 0.08, 48, 0x6f767c, -273, 21.5, 34);
    for (const x of [-275.85, -270.15]) box(g, 0.3, 1.1, 56, conc, x, 21.5, 36);
    for (const z of [12, 24, 48]) { cyl(g, 0.08, 5, COL.steelDark, -270.4, 22.6, z); box(g, 0.9, 0.12, 0.3, 0xdfe3e6, -270.8, 27.5, z); }
    // spillway chute: training walls, stilling basin; white water when the gates are open
    for (const z of [29.6, 42.4]) box(g, 18, 2.2, 0.6, conc, -263, 0, z);
    box(g, 10, 0.4, 13.4, conc, -251, -0.3, 36);
    const fc = document.createElement('canvas');
    fc.width = 64; fc.height = 256;
    const fg = fc.getContext('2d');
    fg.fillStyle = '#cfe2e6'; fg.fillRect(0, 0, 64, 256);
    const fr = rng(55);
    for (let i = 0; i < 260; i++) { fg.fillStyle = `rgba(255,255,255,${0.4 + fr() * 0.6})`; fg.fillRect(fr() * 64, fr() * 256, 1 + fr() * 3, 6 + fr() * 30); }
    const ft = new THREE.CanvasTexture(fc);
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    ft.repeat.set(3, 2);
    this.foamMat = new THREE.MeshStandardMaterial({ map: ft, transparent: true, opacity: 0, roughness: 0.3, depthWrite: false });
    const a = new THREE.Vector3(-270.8, 16.4, 36), b = new THREE.Vector3(-256, 1.4, 36);
    const chute = new THREE.Mesh(new THREE.PlaneGeometry(11.8, a.distanceTo(b)), this.foamMat);
    chute.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0.45, 0.35, 0));
    chute.lookAt(chute.position.clone().add(new THREE.Vector3(0.71, 0.7, 0)));
    chute.rotateZ(Math.PI / 2);
    g.add(chute);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 11.8).rotateX(-Math.PI / 2), this.foamMat);
    pool.position.set(-249, 0.3, 36);
    g.add(pool);
    // name on the downstream face
    const nameMat = new THREE.MeshBasicMaterial({ map: textTexture([{ text: 'EMPANGAN SUNGAI MUTIARA', size: 120, y: 80, color: '#f4f1e8' }], 2048, 160), transparent: true, depthWrite: false });
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(19, 1.5), nameMat);
    const on = new THREE.Vector3(-264.5, 8.6, 19), nrm = new THREE.Vector3(20.9, 14, 0).normalize();
    nm.position.copy(on).addScaledVector(nrm, 0.06);
    nm.lookAt(on.clone().add(nrm));
    g.add(nm);

    // intake hoists on the crest and three penstocks down the face into the powerhouse
    for (const z of [46, 50, 54]) {
      box(g, 3.2, 22, 3.2, conc, -277.6, 0, z);                                     // intake tower against the upstream face
      box(g, 2.8, 2.6, 2.8, 0xe9e0d0, -277.6, 22, z);                               // intake gate hoist
      const top = new THREE.Vector3(-268.6, 18.7, z), toe = new THREE.Vector3(-257.6, 3.4, z), inlet = new THREE.Vector3(-254.6, 3.4, z);
      this.pipe(g, top, toe, 1.05, 0x5a6a73);
      this.pipe(g, toe, inlet, 1.05, 0x5a6a73);
      add(g, JOINT, mat(0x5a6a73), toe.x, toe.y, toe.z, 1.05, 1.05, 1.05);
      for (let t = 0.15; t < 1; t += 0.28) { const p = top.clone().lerp(toe, t); box(g, 1.4, 1.2, 2.6, conc, p.x - 0.4, p.y - 2.3, z); }   // anchor saddles
    }
    // powerhouse at the toe: three 20 MW Francis units, gantry crane rails on the roof, tailrace to the river
    const phTop = this.structure(g, {
      x: -250, z: 50, w: 10, d: 14, h: 11, cladding: 0xbfc6ca,
      windows: [{ side: 'e', y: [2.6, 6.6], count: 4, ww: 1.6, wh: 2.4 }, { side: 'n', y: [6.6], count: 3, ww: 1.6, wh: 2 }],
      doors: [{ side: 's', at: 2.2, w: 3.6, h: 4.4, canopy: false }],
    });
    for (const x of [-253.5, -246.5]) box(g, 0.4, 0.5, 14, steel, x, phTop + 0.6, 50);
    box(g, 7.6, 0.8, 1.2, 0xf2b33d, -250, phTop + 1.1, 47);                            // crane bridge
    for (const z of [45.5, 50, 54.5]) box(g, 0.2, 1.6, 2.6, dark, -244.9, 0.2, z);    // draft-tube outlets
    const tail = this.strip([[-248, 42.9], [-248.2, 40], [-248.8, 37]], 6, () => 0.17, this.riverMat);
    g.add(tail);
    for (const x of [-251.4, -244.9]) box(g, 0.5, 1, 4.8, conc, x, 0, 40.4);

    // dam control room on the north abutment
    const cr = new THREE.Group();
    cr.position.y = 21.5;
    g.add(cr);
    this.structure(cr, { x: -273, z: 61, w: 5, d: 3.4, h: 3, wall: 0xeef0ee, windows: [{ side: 'e', y: 1.1, count: 2, ww: 1.2, wh: 0.9 }], doors: [{ side: 's', at: 1.4 }] });

    // switchyard on the east bank: three 11/132 kV step-up transformers, breakers, the Line 4 gantry
    box(g, 20, 0.15, 18, COL.gravel, -222, 0, 37);
    const fence = chainLink();
    for (const [w, x, z, rot] of [[8, -228, 28, 0], [8, -216, 28, 0], [20, -222, 46, 0], [18, -232, 37, Math.PI / 2], [18, -212, 37, Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), fence);
      m.position.set(x, 1.25, z);
      m.rotation.y = rot;
      g.add(m);
    }
    for (let x = -232; x <= -212; x += 4) for (const z of [28, 46]) cyl(g, 0.08, 2.4, COL.steelDark, x, 0, z);
    for (let z = 32; z <= 44; z += 4) for (const x of [-232, -212]) cyl(g, 0.08, 2.4, COL.steelDark, x, 0, z);
    const finGeo = new THREE.BoxGeometry(0.04, 2, 0.8);
    for (const x of [-227, -221, -215]) {
      box(g, 3.6, 0.4, 3, COL.concrete, x, 0.15, 33);
      box(g, 2.8, 2.6, 2, COL.xfmr, x, 0.55, 33);
      for (const sd of [-1, 1]) for (let k = -1.1; k <= 1.1; k += 0.22) add(g, finGeo, mat(0x6f7c82), x + k, 1.9, 33 + sd * 1.45);
      for (const bx of [-0.7, 0, 0.7]) cyl(g, 0.14, 1.5, COL.porcelain, x + bx, 3.15, 33.4);
      this.cabinet(g, x + 1.9, 0.15, 31.2, 0.6, 1, 0.45, 0x9aa3a8);
    }
    for (const x of [-227, -221, -215]) {
      this.lattice(g, x, 39.5, 1.9, 0.14, 0.12).position.y = 0.15;
      for (const bz of [-0.55, 0, 0.55]) { cyl(g, 0.15, 1.5, COL.porcelain, x + bz, 2.1, 39.5); cyl(g, 0.12, 0.9, COL.porcelain, x + bz, 3.8, 39.5); }
    }
    for (const z of [31, 43]) this.lattice(g, -213.5, z, 9.6, 0.4, 0.3).position.y = 0.15;
    this.girder(g, new THREE.Vector3(-213.5, 9.6, 30.7), new THREE.Vector3(-213.5, 9.6, 43.3), 0.3);
    this.hydroGantry = [[-213.5, 8.9, 39.6], [-213.5, 8.9, 34.4], [-213.5, 8.2, 38.1], [-213.5, 8.2, 35.9]].map(p => new THREE.Vector3(...p));
    // generator cables cross the tailrace on a cable bridge from the powerhouse
    for (const x of [-242, -235]) this.lattice(g, x, 44, 6.2, 0.3, 0.25).position.y = 0.15;
    box(g, 11, 0.7, 1.1, steel, -239.6, 6.3, 44);
    box(g, 20, 0.12, 3, 0x6f767c, -222, 0.15, 25.5);                               // apron at the gate
    this.sign(-216, 1.4, 26.4, 7, 2.2, 0, [
      { text: 'ONSA Power & Co.', size: 124, y: 105, color: BRAND.amber },
      { text: 'SUNGAI MUTIARA HYDRO · 3 × 20 MW', size: 52, y: 215, color: BRAND.white, weight: 800 },
    ], true, g);
  }

  buildFactory() {
    const g = this.group('factory');
    this.movers = [];
    box(g, 76, 0.12, 58, 0x8a9096, -194, 0, -37);                                     // paved yard
    for (const [w, d, x, z] of [[76, 0.25, -194, -24], [76, 0.25, -194, -46.5], [0.25, 58, -186, -37]]) box(g, w, 0.02, d, 0xf1ead8, x, 0.12, z); // lane markings
    const glazing = this.feederMats.E;
    this.feederFacades.E.push(glazing);

    // offices with the plant name on the roof
    const offTop = this.curtainTower(g, { x: -210, z: -15, w: 18, d: 9, h: 9.75, seed: 31 });
    this.sign(-210, offTop + 0.5, -10.7, 14, 2.5, 0, [
      { text: 'MUTIARA MOTOR WORKS', size: 150, y: 110, color: '#ffffff' },
      { text: 'VEHICLE ASSEMBLY PLANT', size: 56, y: 222, color: BRAND.amber, weight: 800 },
    ], false, g);
    // high-bay automated warehouse (AS/RS): parts in from the road side, out to the shops on the yard side
    this.structure(g, {
      x: -226.5, z: -16.5, w: 9, d: 12, h: 18, cladding: 0xb7c4cc,
      doors: [{ side: 's', at: 0, w: 3.6, h: 4.2, canopy: false }, { side: 'n', at: 0, w: 2.4, h: 2.6, canopy: false }],
    });
    // gatehouse and barrier
    this.structure(g, { x: -180.5, z: -12, w: 3, d: 3, h: 2.8, wall: 0xe9e0d0, windows: [{ side: 'w', y: 1.1, at: [0], ww: 1.4, wh: 0.9 }, { side: 'n', y: 1.1, at: [0], ww: 1.4, wh: 0.9 }] });
    box(g, 0.4, 1.1, 0.4, 0xd8d0c0, -182.6, 0.1, -9);
    box(g, 5.2, 0.12, 0.12, 0xe8e8e8, -185.4, 1.05, -9);
    for (let k = 0; k < 4; k++) box(g, 0.6, 0.13, 0.13, 0xc62828, -187.3 + k * 1.3, 1.05, -9);

    // press shop · body shop (sawtooth north-light roof) · paint shop · final assembly
    this.structure(g, {
      x: -222.5, z: -36, w: 17, d: 16, h: 13, cladding: 0x8fa3b0,
      windows: [{ side: 'n', y: [9.5], count: 5, ww: 2, wh: 1.6 }, { side: 's', y: [9.5], count: 5, ww: 2, wh: 1.6 }],
      doors: [{ side: 'e', at: 0, w: 4, h: 5, canopy: false }],
    });
    // body shop: glazed along the yard side so the robot welding line inside can be seen
    const clad = surface('metal', 0xd5dade, { metalness: 0.45, roughness: 0.5 }), bsTop = 7.95;
    box(g, 20.5, 0.3, 16.5, COL.concrete, -201, 0, -36);
    box(g, 20, 8, 0.3, clad, -201, 0.3, -43.85);
    for (const x of [-210.85, -191.15]) box(g, 0.3, 8, 16, clad, x, 0.3, -36);
    box(g, 20, 0.9, 0.3, clad, -201, 0.3, -28.15);
    box(g, 20, 1.9, 0.3, clad, -201, 6.4, -28.15);
    for (let x = -208.5; x <= -193.4; x += 2.5) box(g, 0.16, 5.2, 0.34, 0x2e3338, x, 1.2, -28.15);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(19.4, 5.2), new THREE.MeshStandardMaterial({ color: 0xa9cddb, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, depthWrite: false }));
    pane.position.set(-201, 3.8, -28.08);
    g.add(pane);
    box(g, 20, 0.25, 16, 0x5b6166, -201, 8.3, -36);
    box(g, 19.4, 0.04, 15.4, 0xa3a9ad, -201, 0.3, -36);                                // epoxy floor
    for (const x of [-208, -201, -194]) box(g, 1.2, 0.12, 15, 0xf2c230, x, 8.05, -36);  // high-bay lights
    // welding line: car bodies ride the conveyor between two rows of six-axis robots
    box(g, 18.6, 0.6, 1.6, 0x4b5359, -201, 0.3, -34.5);
    const line = new THREE.LineCurve3(new THREE.Vector3(-209.5, 0, -34.5), new THREE.Vector3(-192.5, 0, -34.5));
    for (let i = 0; i < 3; i++) {
      const b = car(0xc9cdd0);
      b.rotation.y = Math.PI / 2;
      g.add(b);
      this.movers.push({ obj: b, curve: line, t: i / 3, speed: 0.45 / 17, level: () => 0.9, fixed: true });
    }
    this.robots = [];
    const orange = mat(0xf28c28, { roughness: 0.45 }), dark = mat(0x2e3338);
    const spark = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [x, z, face] of [[-206, -31.6, 1], [-201, -31.6, 1], [-196, -31.6, 1], [-206, -37.4, -1], [-201, -37.4, -1], [-196, -37.4, -1]]) {
      const root = new THREE.Group();
      root.position.set(x, 0.3, z);
      cyl(root, 0.36, 0.45, dark, 0, 0, 0);
      const turret = new THREE.Group();
      turret.position.y = 0.45;
      turret.rotation.y = (face * Math.PI) / 2;
      box(turret, 0.62, 0.42, 0.62, orange, 0, 0, 0);
      const shoulder = new THREE.Group();
      shoulder.position.y = 0.4;
      box(shoulder, 0.3, 1.35, 0.32, orange, 0, 0, 0);
      const elbow = new THREE.Group();
      elbow.position.y = 1.3;
      add(elbow, BOX, orange, 0.55, 0, 0, 1.15, 0.26, 0.26);
      box(elbow, 0.22, 0.42, 0.22, dark, 1.15, -0.4, 0);                               // weld gun
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), spark);
      tip.position.set(1.15, -0.5, 0);
      elbow.add(tip);
      shoulder.add(elbow);
      turret.add(shoulder);
      root.add(turret);
      g.add(root);
      this.robots.push({ root, turret, shoulder, elbow, face, phase: x * 0.7 + z });
    }
    this.sparkMat = spark;
    const roofSheet = surface('metal', 0xb9c1c5, { metalness: 0.5, roughness: 0.5 });
    for (let k = 0; k < 4; k++) {
      const z0 = -44 + k * 4;
      const plate = add(g, BOX, roofSheet, -201, bsTop + 0.6 + 1.25, z0 + 2, 19.6, 0.14, Math.hypot(4, 2.5));
      plate.rotation.x = -Math.atan2(2.5, 4);
      add(g, BOX, glazing, -201, bsTop + 0.6 + 1.25, z0 + 4 - 0.06, 19.6, 2.5, 0.08);
    }
    this.structure(g, {
      x: -172, z: -36, w: 18, d: 16, h: 15, cladding: 0xe9ecee,
      windows: [{ side: 'e', y: [4, 10], count: 4, ww: 1.6, wh: 1.4 }],
      doors: [{ side: 'w', at: 4, w: 3, h: 4, canopy: false }],
    });
    for (const x of [-177, -172, -167]) { cyl(g, 0.65, 9, 0xc9cdd0, x, 15.9, -32); cyl(g, 0.72, 0.5, 0x8a9399, x, 24.5, -32); }
    box(g, 8, 2.6, 4, 0xb5bcc0, -172, 15.9, -40);                                     // oven exhaust treatment
    box(g, 10, 2.6, 3, roofSheet, -186, 6, -34);                                        // conveyor bridge to the paint shop
    const faTop = this.structure(g, {
      x: -211, z: -56.5, w: 40, d: 15, h: 11, cladding: 0xf1f3f4,
      windows: [{ side: 'n', y: [3], count: 10, ww: 1.8, wh: 1.4 }],
      doors: [{ side: 'e', at: -1, w: 5, h: 4.6, canopy: false }, { side: 'n', at: 12, w: 4.6, h: 4.6, canopy: false }],
    });
    box(g, 40.12, 1.3, 15.12, 0x1f4e8c, -211, 8.3, -56.5);                           // brand stripe
    for (let x = -227; x <= -195; x += 8) add(g, BOX, glazing, x, faTop + 0.12, -56.5, 5, 0.25, 9);   // roof lights
    for (const x of [-225, -219, -213]) this.roofUnit(g, x, faTop + 0.05, -51.4, 2.4, 1.6, true);   // utility chillers

    // the 132/33 kV intake substation, fed by the Line 4 tap
    box(g, 14, 0.15, 12, COL.gravel, -165, 0, -16);
    const fence = chainLink();
    for (const [w, x, z, rot] of [[14, -165, -22, 0], [5, -169.5, -10, 0], [5, -160.5, -10, 0], [12, -172, -16, Math.PI / 2], [12, -158, -16, Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), fence);
      m.position.set(x, 1.25, z);
      m.rotation.y = rot;
      g.add(m);
    }
    for (const x of [-168.5, -161.5]) {
      box(g, 4, 0.4, 3.4, COL.concrete, x, 0.15, -18.5);
      box(g, 3, 2.8, 2.2, COL.xfmr, x, 0.55, -18.5);
      for (const bx of [-0.7, 0, 0.7]) cyl(g, 0.14, 1.5, COL.porcelain, x + bx, 3.35, -18);
    }
    for (const x of [-169.5, -160.5]) this.lattice(g, x, -12, 9, 0.35, 0.28).position.y = 0.15;
    this.girder(g, new THREE.Vector3(-169.8, 9, -12), new THREE.Vector3(-160.2, 9, -12), 0.28);
    this.intakeGantry = [[-162, 8.3, -12], [-168, 8.3, -12], [-163.5, 7.6, -12], [-166.5, 7.6, -12]].map(p => new THREE.Vector3(...p));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: 0x5ee08f }));
    lamp.position.set(-165, 9.7, -12);
    g.add(lamp);
    this.lamps.E = lamp;

    // finished cars waiting for the ship
    const paints = [0xe8e8e8, 0x1d1f22, 0xb3261e, 0x8a8f94, 0x1f4e8c, 0xf4f4f4, 0x51705a];
    for (let r = 0; r < 4; r++) {
      box(g, 22, 0.02, 0.12, 0xf1ead8, -169, 0.12, -50.5 - r * 4);
      for (let k = 0; k < 9; k++) {
        const c = car(paints[(r * 3 + k) % paints.length]);
        c.position.set(-179 + k * 2.5, 0.12, -52.5 - r * 4);
        c.rotation.y = Math.PI / 2;
        g.add(c);
      }
    }
    // ro-ro jetty and the car carrier alongside it
    const JY = 1.2;                                                                     // jetty deck level
    box(g, 7, 0.6, 24, COL.concrete, -186, JY - 0.6, -84);
    const ramp = add(g, BOX, surface('concrete', 0xc9c3b6), -186, (0.12 + JY) / 2 - 0.15, -68, 7, 0.3, Math.hypot(8, JY - 0.12));
    ramp.rotation.x = Math.atan2(JY - 0.12, 8);
    for (const x of [-189.4, -182.6]) box(g, 0.25, 0.3, 24, 0xd4d0c8, x, JY, -84);           // deck kerbs
    for (let z = -94; z <= -76; z += 4) for (const x of [-189, -183]) cyl(g, 0.35, 2.4, 0x8a8f93, x, -1.2, z);
    for (let z = -94; z <= -76; z += 6) cyl(g, 0.22, 0.5, 0x2e3338, -182.9, JY, z);
    box(g, 10, 13, 44, 0x1d3b5c, -197, -2, -102);
    box(g, 10.08, 1.2, 44.08, 0x9e2a2a, -197, -2, -102);
    box(g, 10.1, 0.4, 44.1, 0xf2f2f2, -197, 10.6, -102);
    const bridge = new THREE.Group();
    bridge.position.y = 11;
    g.add(bridge);
    this.structure(bridge, { x: -197, z: -119.5, w: 9.6, d: 4, h: 3, wall: 0xf2f2f2, windows: [{ side: 'n', y: 1.4, count: 6, ww: 1, wh: 0.8 }] });
    box(g, 3, 4.2, 3, 0xf2f2f2, -197, 11, -86);
    box(g, 3.05, 1, 3.05, 0x1f4e8c, -197, 13.6, -86);
    const board = add(g, BOX, mat(0x6d757b), -190.85, (JY + 2.1) / 2 - 0.15, -92, Math.hypot(2.9, 2.1 - JY) + 0.3, 0.3, 5);
    board.rotation.z = -Math.atan2(2.1 - JY, 2.9);
    box(g, 0.1, 3.6, 5.4, 0x1b2228, -191.98, 1.9, -92);                                // vehicle door in the hull
    const hullName = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshBasicMaterial({ map: textTexture([{ text: 'MUTIARA SPIRIT', size: 120, y: 80, color: '#ffffff' }], 1024, 160), transparent: true, depthWrite: false }));
    hullName.position.set(-191.94, 7.6, -110);
    hullName.rotation.y = Math.PI / 2;
    g.add(hullName);

    // new cars shuttling from final assembly down the jetty and onto the ship
    const level = (x, z) => (z > -64 ? 0.12 : z > -72 ? 0.12 + (JY - 0.12) * (-64 - z) / 8 : x > -189.5 ? JY : JY + (2.1 - JY) * Math.min(1, (-189.5 - x) / 2.9));
    const drive = new THREE.CatmullRomCurve3([[-191.6, -55.5], [-187.4, -55.8], [-185.6, -58.5], [-185.6, -88], [-186.4, -91.4], [-188.6, -92], [-194, -92]].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const len = drive.getLength();
    for (let i = 0; i < 4; i++) {
      const c = car(paints[i + 1]);
      c.rotation.order = 'YXZ';
      g.add(c);
      this.movers.push({ obj: c, curve: drive, t: i / 4, speed: 3 / len, level });
    }
    // an AGV shuttling parts from the warehouse to the press shop and back
    const agv = new THREE.Group();
    box(agv, 1.2, 0.45, 2, 0xf28c28, 0, 0, 0);
    box(agv, 1, 0.5, 1.2, 0x8a9096, 0, 0.45, 0);
    for (const sx of [-1, 1]) cyl(agv, 0.1, 0.12, 0x2e3338, sx * 0.4, 0.9, 0.7);
    g.add(agv);
    const agvPath = new THREE.CatmullRomCurve3([[-226.5, -23.6], [-226, -26], [-219, -26.2], [-212.6, -27.5], [-212.6, -35], [-213.7, -36]].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.movers.push({ obj: agv, curve: agvPath, t: 0, speed: 1.4 / agvPath.getLength(), level: () => 0.12, pingpong: true });

    // control systems on the factory floor, tagged in the 3D view (they show up in detections)
    for (const [t, x, y, z] of [['ASRS-01', -226.5, 20, -16.5], ['MES-01', -213.5, 12.5, -15], ['OLP-01', -205.5, 12.5, -15], ['PLC-PR1', -222.5, 15, -36],
      ['RC-BS1', -201, 11, -30], ['DCS-PS1', -168, 17.5, -32], ['RC-PS1', -176, 17.5, -41], ['AGV-FM', -219, 3.2, -26],
      ['COBOT-FA', -205, 13.5, -59], ['EMS-E1', -165, 11, -16], ['UT-01', -219, 14.2, -51.4]]) this.instruments.push({ tag: t, pos: new THREE.Vector3(x, y, z), site: 'factory' });
  }

  buildLine4() {
    const g = (this.line4 = new THREE.Group());
    this.scene.add(g);
    const pts = [[-208, 33], [-192, 24], [-176, 16], [-158, 10], [-140, 8], [-122, 8], [-104, 8], [-86, 8], [-70, 8], [-56, 8], [-41, 8], [-26, 9]];
    const attach = this.route({ pts, h: 15, tag: '132 kV Line 4 · Sungai Mutiara hydro · tap to Mutiara Motor Works', ch: 2 });
    this.span(this.hydroGantry, attach[0], 0.8);
    // tap: one tower south of the road, then down to the factory's intake gantry
    const tap = this.tower(-165, -5.6, Math.atan2(-165 + 158, -5.6 - 10), 15);
    this.span(attach[3], tap);
    this.span(tap, this.intakeGantry, 0.6);
    this.lineSegs.push([-158, 10, -165, -5.6]);
    this.finishLines(g);

    // the trunk road continues west to the factory gate and up to the hydro switchyard
    this.westRoads = [[-232, 0, -125, 0], [-222, 2.5, -222, 25.5]];
    const flat = (w, d, color, x, z, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      g.add(m);
    };
    flat(107, 5, COL.road, -178.5, 0, 0.07);
    flat(4, 23, COL.road, -222, 14, 0.07);
    flat(6, 5.6, COL.road, -186, -5.2, 0.075);
    for (let x = -230; x < -126; x += 6) flat(2.2, 0.25, 0xf1ead8, x, 0, 0.09);
  }

  setUnlocked(on) {
    this.westOn = on;
    for (const o of [this.areas.hydro, this.areas.factory, this.line4]) o.visible = on;
    this.minX = on ? -258 : -170;
    this._n = -1;
  }
  // chapter 3 reveal: the new sites rise out of the ground and the reservoir fills
  reveal() {
    this.setUnlocked(true);
    this.revealT = 0;
  }

  setBeamFull(on) { this.beamFull = on; }

  // ---------- weather: monsoon rain and lightning ----------
  buildRain() {
    const n = 5000;
    this.drops = new Float32Array(n * 3);
    const r = rng(77);
    for (let i = 0; i < n; i++) { this.drops[i * 3] = r() - 0.5; this.drops[i * 3 + 1] = r(); this.drops[i * 3 + 2] = r() - 0.5; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb4c2cf, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    this.storm = 0;
    this.stormTarget = 0;
    this.flash = 0;
    this.nextFlash = 3;
    this.spill = 0;
  }
  setStorm(on) { this.stormTarget = on ? 1 : 0; }

  updateWeather(dt) {
    this.storm += (this.stormTarget - this.storm) * Math.min(1, dt * 0.35);
    const vis = this.storm > 0.02;
    this.rain.visible = vis;
    if (vis) {
      const t = this.controls.target, spread = THREE.MathUtils.clamp(this.camera.position.distanceTo(t) * 0.9, 70, 300), H = spread * 0.45;
      const p = this.rain.geometry.attributes.position.array, d = this.drops, n = d.length / 3, fall = dt * 1.1;
      const lx = spread * 0.004, ly = spread * 0.012;
      for (let i = 0; i < n; i++) {
        let y = d[i * 3 + 1] - fall;
        if (y < 0) y += 1;
        d[i * 3 + 1] = y;
        const x = t.x + d[i * 3] * spread, yy = y * H, z = t.z + d[i * 3 + 2] * spread, o = i * 6;
        p[o] = x; p[o + 1] = yy; p[o + 2] = z; p[o + 3] = x + lx; p[o + 4] = yy + ly; p[o + 5] = z + lx * 0.4;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.38 * this.storm;
    }
    this.flash = Math.max(0, this.flash - dt * 4.5);
    if (this.storm > 0.75 && (this.nextFlash -= dt) <= 0) {
      this.flash = 1;
      this.nextFlash = 5 + Math.random() * 10;
      this.onThunder?.();
    }
  }

  updateWest(dt) {
    this.riverNormals.offset.y -= dt * 0.05;
    if (!this.westOn) return;
    if (this.revealT !== null && this.revealT !== undefined) {
      this.revealT += dt;
      const k = smoothstep(0, 3.2, this.revealT);
      for (const o of [this.areas.hydro, this.areas.factory, this.line4]) o.scale.y = Math.max(0.001, k);
      if (k >= 1) this.revealT = null;
    }
    for (const m of this.movers) {
      if (m.pingpong) { m.dir = m.dir || 1; m.t += dt * m.speed * m.dir; if (m.t > 1 || m.t < 0) { m.dir *= -1; m.t = THREE.MathUtils.clamp(m.t, 0, 1); } }
      else m.t = (m.t + dt * m.speed) % 1;
      const p = m.curve.getPointAt(m.t, m.obj.position), q = m.curve.getPointAt(Math.min(1, m.t + 0.004)), back = m.t + 0.004 > 1;
      p.y = m.level(p.x, p.z);
      const qy = m.level(q.x, q.z), dx = q.x - p.x, dz = q.z - p.z, dh = Math.hypot(dx, dz);
      if (dh > 1e-4 && !back) {
        m.obj.rotation.y = Math.atan2(dx, dz) + (m.pingpong && m.dir < 0 ? Math.PI : 0);
        m.obj.rotation.x = m.pingpong ? 0 : -Math.atan2(qy - p.y, dh);
      }
      if (!m.pingpong) m.obj.visible = m.t < 0.985;
      if (m.fixed) m.obj.rotation.set(0, Math.PI / 2, 0);
    }
    const t = this._t;
    for (const r of this.robots) {
      r.turret.rotation.y = (r.face * Math.PI) / 2 + 0.45 * Math.sin(t * 1.1 + r.phase);
      r.shoulder.rotation.z = -0.25 - 0.22 * Math.sin(t * 1.6 + r.phase);
      r.elbow.rotation.z = -0.55 + 0.3 * Math.sin(t * 2.0 + r.phase * 1.3);
    }
    this.sparkMat.opacity = Math.max(0, Math.sin(t * 9)) * (Math.sin(t * 2.3) > 0 ? 0.9 : 0.15);
    // spillway gates open in a storm and the chute turns white
    this.spill += ((this.storm > 0.5 ? 1 : 0) - this.spill) * Math.min(1, dt * 0.4);
    for (const gt of this.gates) gt.rotation.z = -this.spill * 0.55;
    this.foamMat.opacity = this.spill * 0.92;
    this.foamMat.map.offset.y -= dt * 1.6;
  }

  // ---------- green safety walkpaths with yellow edges around the equipment ----------
  // Laid by hand: 2 m wide, mitred corners, ≥0.8 m clear of equipment, and ending flush at road edges.
  // Side paths start at the outer edge of the path they join, so edge lines stay unbroken.
  buildWalkpaths() {
    this.walkSegs = [];
    this.walkGreen = surface('concrete', 0x4f9a63, { side: THREE.DoubleSide, roughness: 0.75 });
    this.walkYellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.55, side: THREE.DoubleSide });
    const P = (pts, closed = false) => this.walkpath(pts, closed);

    // substation: round the yard inside the fence, past the control house door; stub out through the east gate
    // (kept inside the fence posts at x = -20 and clear of the line gantry columns at x = 18.5; the west side
    // stops short of the control house, whose wall leaves only a 2 m alley to the fence)
    P([[-18.7, 4.6], [-18.7, -11.6], [16.9, -11.6], [16.9, 12.6], [-18.7, 12.6]]);
    P([[17.9, 0], [20, 0]]);
    // OT DMZ and SCADA control center: U-shaped, both ends meet the IT spine road
    P([[-48, -33.3], [-30.2, -33.3], [-30.2, -22.7], [-48, -22.7]]);
    P([[-52, 15.7], [-67.8, 15.7], [-67.8, 28.3], [-52, 28.3]]);
    // internet node: loop, with a path east to the spine road
    P([[-90.1, 36.7], [-79.5, 36.7], [-79.5, 43.3], [-90.1, 43.3]], true);
    P([[-78.5, 42.2], [-52, 42.2]]);
    // Biogas plant: along the inland side and both ends, open to the shore; landing-station path
    P([[-48, -55.2], [50.8, -55.2], [50.8, -73.6]]);
    P([[-41.8, -56.2], [-41.8, -73.6]]);
    P([[51.8, -68.4], [61.5, -68.4]]);
    // solar farm: loop, with a path out to the southern road junction
    P([[-153.8, 69.2], [-104.2, 69.2], [-104.2, 112.3], [-153.8, 112.3]], true);
    P([[-110, 68.2], [-110, 64], [-52, 64]]);
  }

  walkpath(pts, closed) {
    const W = 2;
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) this.walkSegs.push([...pts[i], ...pts[(i + 1) % n]]);
    this.scene.add(this.ribbon(pts, closed, W, 0, this.walkGreen, 0.17));
    for (const sd of [-1, 1]) this.scene.add(this.ribbon(pts, closed, 0.16, sd * (W / 2 - 0.08), this.walkYellow, 0.18));
  }

  // a flat strip of the given width following a polyline, offset sideways, with mitred joins
  ribbon(pts, closed, width, offset, material, y) {
    const n = pts.length;
    const dir = i => {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      const l = Math.hypot(bx - ax, bz - az);
      return [(bx - ax) / l, (bz - az) / l];
    };
    const shift = (i, o) => {
      const ds = [];
      if (closed || i > 0) ds.push(dir((i - 1 + n) % n));
      if (closed || i < n - 1) ds.push(dir(i));
      let nx = 0, nz = 0;
      for (const [dx, dz] of ds) { nx += -dz; nz += dx; }
      const k = ds.length === 2 ? 1 + ds[0][0] * ds[1][0] + ds[0][1] * ds[1][1] : 1;
      return [pts[i][0] + (nx / k) * o, pts[i][1] + (nz / k) * o];
    };
    const L = pts.map((_, i) => shift(i, offset + width / 2));
    const R = pts.map((_, i) => shift(i, offset - width / 2));
    const pos = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      pos.push(L[i][0], y, L[i][1], R[i][0], y, R[i][1], L[j][0], y, L[j][1]);
      pos.push(R[i][0], y, R[i][1], R[j][0], y, R[j][1], L[j][0], y, L[j][1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------- walking: a grid of everything solid, and A* around it ----------
  buildNavGrid() {
    const G = (this.grid = { x0: -262, z0: -76, cs: 1, w: 430, h: 210 });
    G.block = new Uint8Array(G.w * G.h);
    const R = 0.7; // half the persona's width
    const mark = (x1, z1, x2, z2) => {
      const i1 = Math.max(0, Math.floor((x1 - G.x0) / G.cs)), i2 = Math.min(G.w - 1, Math.floor((x2 - G.x0) / G.cs));
      const j1 = Math.max(0, Math.floor((z1 - G.z0) / G.cs)), j2 = Math.min(G.h - 1, Math.floor((z2 - G.z0) / G.cs));
      for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) G.block[j * G.w + i] = 1;
    };
    this.scene.updateMatrixWorld(true);
    const bb = new THREE.Box3(), m4 = new THREE.Matrix4();
    // solid = reaches from the ground into walking height (pads, paths and overhead pipes don't count)
    const solid = () => bb.max.y > 0.5 && bb.min.y < 2.6;
    const scan = root => root.traverse(o => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.isInstancedMesh) {
        for (let k = 0; k < o.count; k++) {
          o.getMatrixAt(k, m4);
          bb.copy(o.geometry.boundingBox).applyMatrix4(m4.premultiply(o.matrixWorld));
          if (solid()) mark(bb.min.x - R, bb.min.z - R, bb.max.x + R, bb.max.z + R);
        }
        return;
      }
      bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (solid()) mark(bb.min.x - R, bb.min.z - R, bb.max.x + R, bb.max.z + R);
    });
    for (const g of Object.values(this.areas)) scan(g);
    for (const g of this.blockers) scan(g);
    for (const [x, z] of this.towerFeet) mark(x - 1.6 - R, z - 1.6 - R, x + 1.6 + R, z + 1.6 + R);
    mark(G.x0, G.z0, G.x0 + G.w * G.cs, -74); // the sea
    for (let j = 0; j < G.h; j++) for (let i = 0; i < Math.min(G.w, 26); i++) if (westHeight(G.x0 + i + 0.5, G.z0 + j + 0.5) > 0.8) G.block[j * G.w + i] = 1; // hill slopes
    for (const [x, z] of this.riverPts) mark(x - 5, z - 5, x + 5, z + 5);
    const N = G.w * G.h;
    this._nav = { g: new Float32Array(N), came: new Int32Array(N), seen: new Uint32Array(N), shut: new Uint32Array(N), run: 0 };
  }

  findPath(sx, sz, tx, tz) {
    const G = this.grid, W = G.w, H = G.h, B = G.block, S = this._nav;
    const cellOf = (x, z) => [Math.floor((x - G.x0) / G.cs), Math.floor((z - G.z0) / G.cs)];
    const open = (i, j) => i >= 0 && j >= 0 && i < W && j < H && !B[j * W + i];
    const nearestOpen = (i, j) => {
      if (open(i, j)) return [i, j];
      for (let r = 1; r < 60; r++) {
        let best = null;
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !open(i + di, j + dj)) continue;
          const d = di * di + dj * dj;
          if (!best || d < best[2]) best = [i + di, j + dj, d];
        }
        if (best) return [best[0], best[1]];
      }
      return null;
    };
    const s = nearestOpen(...cellOf(sx, sz)), t = nearestOpen(...cellOf(tx, tz));
    if (!s || !t) return [];
    const run = ++S.run;
    const sI = s[1] * W + s[0], tI = t[1] * W + t[0];
    const hx = i => { const di = Math.abs((i % W) - t[0]), dj = Math.abs(((i / W) | 0) - t[1]); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    // binary heap of [f, index]
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      for (let k = heap.length - 1; k > 0;) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    S.g[sI] = 0; S.seen[sI] = run; S.came[sI] = -1;
    push(hx(sI), sI);
    let found = false;
    while (heap.length) {
      const [, u] = pop();
      if (S.shut[u] === run) continue;
      S.shut[u] = run;
      if (u === tI) { found = true; break; }
      const ui = u % W, uj = (u / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const vi = ui + di, vj = uj + dj;
        if (!open(vi, vj)) continue;
        if (di && dj && (!open(ui + di, uj) || !open(ui, uj + dj))) continue; // no corner cutting
        const v = vj * W + vi;
        if (S.shut[v] === run) continue;
        const ng = S.g[u] + (di && dj ? 1.414 : 1);
        if (S.seen[v] !== run || ng < S.g[v]) {
          S.seen[v] = run; S.g[v] = ng; S.came[v] = u;
          push(ng + hx(v), v);
        }
      }
    }
    if (!found) return [];
    const centre = i => new THREE.Vector3(G.x0 + ((i % W) + 0.5) * G.cs, 0, G.z0 + (((i / W) | 0) + 0.5) * G.cs);
    const cells = [];
    for (let i = tI; i >= 0; i = S.came[i]) cells.unshift(centre(i));
    const [ti, tj] = cellOf(tx, tz);
    if (open(ti, tj)) cells[cells.length - 1] = new THREE.Vector3(tx, 0, tz);
    // straighten the zig-zag: skip ahead while the way is clear
    const clear = (a, b) => {
      const n = Math.ceil(a.distanceTo(b) / 0.35);
      for (let k = 1; k < n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
        if (!open(...cellOf(x, z))) return false;
      }
      return true;
    };
    const from = new THREE.Vector3(sx, 0, sz);
    const pts = [open(...cellOf(sx, sz)) ? from : cells[0], ...cells.slice(1)];
    const out = [];
    let a = 0;
    while (a < pts.length - 1) {
      let b = a + 1;
      while (b + 1 < pts.length && clear(pts[a], pts[b + 1])) b++;
      out.push(pts[b]);
      a = b;
    }
    if (pts[0] !== from) out.unshift(pts[0]);
    return out;
  }

  buildTrees() {
    const rand = rng(99);
    this.scene.updateMatrixWorld(true);
    const boxes = Object.values(this.areas).filter(g => g.userData.asset !== 'wind').map(g => new THREE.Box3().setFromObject(g).expandByScalar(3));
    // the wind area is skipped (its turbines stand in the sea), so keep its shore station and genset clear by hand
    const wp = this.areas.wind.position;
    boxes.push(new THREE.Box3(new THREE.Vector3(wp.x + 49, -1, wp.z - 57), new THREE.Vector3(wp.x + 74, 10, wp.z - 46)));
    const near = (x, z, list, r) => list.some(q => nearestOnSeg(x, z, q)[2] < r);
    const spots = [];
    for (let i = 0; i < 3000 && spots.length < 240; i++) {
      const x = -165 + rand() * 325, z = -71 + rand() * 200;
      if (boxes.some(bx => x > bx.min.x && x < bx.max.x && z > bx.min.z && z < bx.max.z)) continue;
      if (near(x, z, this.roadSegs, 5) || near(x, z, this.westRoads, 5) || near(x, z, this.walkSegs, 3) || near(x, z, this.lineSegs, 7)) continue;
      if (Math.abs(x) < 26 && Math.abs(z) < 20) continue; // substation yard
      if (spots.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 3.5 * 3.5)) continue; // no trunks growing into each other
      spots.push([x, z, 0.7 + rand() * 0.7]);
    }
    // an oil palm plantation in the west, rows 8 m apart
    for (let z = -66; z <= -22; z += 7) {
      for (let x = -160 + ((z / 7) % 2 ? 4 : 0); x <= -98; x += 8) {
        if (near(x, z, this.roadSegs, 5) || near(x, z, this.lineSegs, 7)) continue;
        if (boxes.some(bx => x > bx.min.x && x < bx.max.x && z > bx.min.z && z < bx.max.z)) continue;
        spots.push([x, z, 0.9 + rand() * 0.25, true]);
      }
    }
    const tm = treeMaterials(), pm = palmMaterials();
    const leaf = [broadleaf(3), broadleaf(8), broadleaf(13)];
    const palms = [palmCrown(4), palmCrown(9)];
    const trunkB = trunkGeometry(3.0, 0.3, 0.18, 1);
    const trunkP = trunkGeometry(5.5, 0.42, 0.3, 2);
    const byLeaf = leaf.map(() => []), byPalm = palms.map(() => []);
    spots.push(...this.hillTrees);
    // crown half-widths, so no crown reaches the power-line conductors (outermost 3.2 m from the line)
    const spread = g => { g.computeBoundingBox(); const bx = g.boundingBox; return Math.max(bx.max.x - bx.min.x, bx.max.z - bx.min.z) / 2; };
    const leafR = leaf.map(v => spread(v.cards)), palmR = palms.map(spread);
    for (const [x, z, sc, isPalm, y0 = 0] of spots) {
      const palm = isPalm || rand() < 0.28, kind = Math.floor(rand() * (palm ? palms.length : leaf.length)), rot = rand() * Math.PI * 2;
      if (near(x, z, this.lineSegs, 3.6 + (palm ? palmR : leafR)[kind] * sc)) continue;
      (palm ? byPalm : byLeaf)[kind].push([x, z, sc, rot, y0]);
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const inst = (geo, material, list, lift) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach(([x, z, sc, rot, y0], i) => {
        M.compose(new THREE.Vector3(x, y0 + lift * sc, z), Q.setFromAxisAngle(Y, rot), S3.set(sc, sc, sc));
        m.setMatrixAt(i, M);
      });
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    leaf.forEach((v, i) => { inst(trunkB, tm.bark, byLeaf[i], 0); inst(v.core, tm.core, byLeaf[i], 3.6); inst(v.cards, tm.cards, byLeaf[i], 3.6); });
    palms.forEach((v, i) => { inst(trunkP, pm.trunk, byPalm[i], 0); inst(v, pm.frond, byPalm[i], 5.5); });
  }

  buildRings() {
    for (const [id, L] of Object.entries(LAYOUT)) {
      const g = new THREE.Group();
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a4e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xff5a4e, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(L.r * 0.93, L.r, 72), ringMat);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(L.r * 0.93, 72), fillMat);
      g.add(ring, fill);
      g.rotation.x = -Math.PI / 2;
      g.position.set(L.c[0], 0.3, L.c[1]);
      g.visible = false;
      this.scene.add(g);
      this.rings[id] = { g, ringMat, fillMat };
    }
  }

  // ---------- network overlay ----------
  // highest solid point in every 1 m cell: buildings, equipment, towers, trees, lamps, power conductors and the hills.
  // Network conduits are routed over it (taken before static batching, while every mesh still has its own bounds).
  buildHeightMap() {
    const H = (this.hmap = { x0: -270, z0: -130, w: 440, h: 270 });
    H.y = new Float32Array(H.w * H.h);
    const raise = (x1, z1, x2, z2, y) => {
      const i1 = Math.max(0, Math.floor(x1 - H.x0)), i2 = Math.min(H.w - 1, Math.floor(x2 - H.x0));
      const j1 = Math.max(0, Math.floor(z1 - H.z0)), j2 = Math.min(H.h - 1, Math.floor(z2 - H.z0));
      for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) { const k = j * H.w + i; if (y > H.y[k]) H.y[k] = y; }
    };
    this.scene.updateMatrixWorld(true);
    const skip = new Set([this.water.mesh, this.beam, ...this.pulses]);
    for (const who of [this.persona, this.researcher, this.satellite]) who?.traverse(o => skip.add(o));
    const bb = new THREE.Box3(), m4 = new THREE.Matrix4();
    const mark = () => {
      if (bb.max.y < 0.4 || bb.min.y > 30 || bb.max.x - bb.min.x > 70 || bb.max.z - bb.min.z > 70) return;
      raise(bb.min.x, bb.min.z, bb.max.x, bb.max.z, bb.max.y);
    };
    this.scene.traverse(o => {
      if (!o.isMesh || skip.has(o)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.isInstancedMesh) {
        for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, m4); bb.copy(o.geometry.boundingBox).applyMatrix4(m4.premultiply(o.matrixWorld)); mark(); }
      } else { bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); mark(); }
    });
    for (const [ax, az, bx, bz] of this.lineSegs) {          // conductors hang between tower tops
      const n = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let k = 0; k <= n; k++) { const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n; raise(x - 3.5, z - 3.5, x + 3.5, z + 3.5, 15.6); }
    }
    for (let j = 0; j < H.h; j++) for (let i = 0; i < 40; i++) {     // hills
      const k = j * H.w + i, y = westHeight(H.x0 + i + 0.5, H.z0 + j + 0.5);
      if (y > H.y[k]) H.y[k] = y;
    }
  }
  // a conduit rises straight up from its hub, so every hub must stand on open ground: nudge any hub that sits
  // under a canopy, inside equipment or beside a wall to the nearest clear spot off roads and walkways
  settleHubs() {
    const roads = [...this.roadSegs.map((q, j) => [q, j < 2 ? 2.5 : 2]), ...this.westRoads.map((q, j) => [q, j ? 2 : 2.5])];
    const ok = (x, z) => this.heightAt(x, z, 0.9) <= 0.45
      && !roads.some(([q, h]) => nearestOnSeg(x, z, q)[2] < h + 0.6) && !this.walkSegs.some(q => nearestOnSeg(x, z, q)[2] < 1.4);
    for (const h of Object.values(this.hubs)) {
      if (ok(h.x, h.z)) continue;
      search: for (let r = 0.5; r <= 12; r += 0.5) for (let a = 0; a < 24; a++) {
        const x = h.x + Math.cos((a / 24) * Math.PI * 2) * r, z = h.z + Math.sin((a / 24) * Math.PI * 2) * r;
        if (ok(x, z)) { h.x = x; h.z = z; break search; }
      }
    }
  }
  heightAt(x, z, r = 0) {
    const H = this.hmap;
    let m = 0;
    for (let j = Math.floor(z - r - H.z0); j <= Math.floor(z + r - H.z0); j++) for (let i = Math.floor(x - r - H.x0); i <= Math.floor(x + r - H.x0); i++) {
      if (i >= 0 && j >= 0 && i < H.w && j < H.h) m = Math.max(m, H.y[j * H.w + i]);
    }
    return m;
  }

  // a conduit's path: straight up from each hub, then an arch that stays at least 2 m above anything it crosses
  conduitCurve(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(12, Math.ceil(d / 1.5)), step = d / n;
    const arch = 3 + d * 0.16, need = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      need.push(Math.min(t, 1 - t) * d < 0.6 ? 0 : this.heightAt(x, z, 1.2) + 2);
    }
    // spread each obstacle a few metres either way, then soften, so the cable eases over rather than steps
    const W = Math.max(1, Math.round(5 / step));
    const wide = need.map((_, k) => Math.max(...need.slice(Math.max(0, k - W), k + W + 1)));
    const soft = wide.map((_, k) => { const w = wide.slice(Math.max(0, k - W), k + W + 1); return w.reduce((p, q) => p + q, 0) / w.length; });
    const pts = [a.clone()];
    for (let k = 0; k <= n; k++) {
      const t = k / n, base = a.y + (b.y - a.y) * t + arch * 4 * t * (1 - t);
      const y = Math.max(base, soft[k], need[k]);
      if (k === 0) pts.push(new THREE.Vector3(a.x, Math.max(y, soft[1], need[1]), a.z));
      else if (k === n) pts.push(new THREE.Vector3(b.x, Math.max(y, soft[n - 1], need[n - 1]), b.z));
      else pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t));
    }
    pts.push(b.clone());
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }

  buildNetwork(conduits) {
    this.net = new THREE.Group();
    this.scene.add(this.net);
    for (const c of conduits) {
      const a = this.hubs[c.a].clone(), b = this.hubs[c.b].clone();
      const curve = this.conduitCurve(a, b);
      const material = new THREE.MeshBasicMaterial({ color: NET_COLORS.ok, transparent: true, opacity: 0.85 });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(64, Math.round(curve.getLength() / 1.5)), 0.17, 6), material);
      const pm = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const packets = [];
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(PACKET, pm);
        this.net.add(mesh);
        packets.push({ mesh, t: i / 4, dir: i % 2 ? -1 : 1 });
      }
      this.net.add(tube);
      this.conduits[c.id] = { curve, tube, material, pm, packets, state: 'ok', len: curve.getLength() };
    }
  }
  setConduit(id, state) {
    const c = this.conduits[id];
    if (!c) return;
    c.state = state;
    const vis = state !== 'hidden';
    c.tube.visible = vis;
    c.packets.forEach(p => { p.mesh.visible = vis; });
    if (vis) c.material.color.setHex(NET_COLORS[state]);
    c.pm.color.setHex(state === 'attack' ? 0xffd2cc : 0xffffff);
  }
  setNetworkVisible(v) { if (this.net) this.net.visible = v; }

  setAttacked(ids) {
    for (const [id, r] of Object.entries(this.rings)) r.g.visible = ids.includes(id);
  }

  setFeeder(f, on) {
    this.feederOn[f] = on;
    this.lamps[f].material.color.setHex(on ? 0x5ee08f : 0xff4a3d);
    this._n = -1;
  }
  setModem(present) { this.modem.visible = present; }

  // damaged equipment: a flickering fire glow and a column of smoke over the asset until it is repaired.
  // The effects and their lights are built once at load and reused: adding a light mid-game changes the
  // light count, which makes every material recompile and freezes the game for a moment.
  initDamageFx() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cg = c.getContext('2d'), grd = cg.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = grd; cg.fillRect(0, 0, 64, 64);
    this._smokeTex = new THREE.CanvasTexture(c);
    this.damageFx = {};
    this.fxPool = [this.makeFireFx(true), this.makeFireFx(true)];
  }

  makeFireFx(withLight) {
    const g = new THREE.Group();
    const puffs = [], flames = [];
    for (let k = 0; k < 14; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._smokeTex, color: 0x3a3a3a, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData.t = k / 14;
      g.add(sp);
      puffs.push(sp);
    }
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._smokeTex, color: 0xff7a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      sp.position.set((k - 2) * 1.2, 2, (k % 2) * 1.5 - 0.7);
      sp.scale.setScalar(4);
      g.add(sp);
      flames.push(sp);
    }
    let light = null;
    if (withLight) {
      light = new THREE.PointLight(0xff6a1a, 0, 45, 2);
      light.position.y = 4;
      g.add(light);
    }
    this.scene.add(g);   // stays in the scene (invisible while idle) so nothing is compiled or relit at runtime
    return { g, puffs, flames, light, active: false };
  }

  setDamaged(id, on) {
    const fx = this.damageFx[id];
    if (!on) {
      if (!fx) return;
      fx.active = false;
      for (const sp of [...fx.puffs, ...fx.flames]) sp.material.opacity = 0;
      if (fx.light) fx.light.intensity = 0;
      delete this.damageFx[id];
      this.fxPool.push(fx);
      return;
    }
    if (fx || !this.centers[id]) return;
    const slot = this.fxPool.pop() || this.makeFireFx(false);   // a third damaged site gets smoke and flames without a light
    slot.g.position.copy(this.centers[id]);
    slot.active = true;
    this.damageFx[id] = slot;
  }

  updateDamage(dt) {
    for (const fx of Object.values(this.damageFx)) {
      for (const sp of fx.puffs) {
        sp.userData.t = (sp.userData.t + dt * 0.12) % 1;
        const t = sp.userData.t;
        sp.position.set(Math.sin(t * 9 + sp.id) * 2 * t, 3 + t * 26, Math.cos(t * 7 + sp.id) * 2 * t);
        sp.scale.setScalar(3 + t * 12);
        sp.material.opacity = 0.55 * Math.sin(Math.PI * t);
      }
      const f = 0.75 + 0.25 * Math.sin(this._t * 23) * Math.sin(this._t * 7);
      for (const sp of fx.flames) sp.material.opacity = 0.55 + 0.35 * f;
      if (fx.light) fx.light.intensity = 30 + 25 * f;
    }
  }

  applyLight(n, hour) {
    const elev = this.look.setTime(hour, n);
    const t = this.controls.target;
    const ext = THREE.MathUtils.clamp(this.camera.position.distanceTo(t) * 0.75, 55, 240);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - ext) > 3) {
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
      sc.updateProjectionMatrix();
    }
    const dir = elev > 1 ? this.look.sunDir : this.moonDir;
    this.sun.position.copy(t).addScaledVector(dir, 450);
    this.sun.target.position.copy(t);
    this.sun.target.updateMatrixWorld();
    const st = this.storm, fl = this.flash;
    this.look.weather = st;
    this.sun.intensity = (elev > 1 ? 3.4 * THREE.MathUtils.smoothstep(elev, 1, 14) : 1.5) * (1 - 0.72 * st);
    this.sun.color.setHex(elev > 1 ? (elev < 14 ? 0xffc98f : 0xfff2df) : 0x9fb4ff);
    this.hemi.intensity = (0.55 - 0.05 * n) * (1 - 0.2 * st) + fl * 3;
    this.hemi.color.setHex(0xdbe8ff).lerp(new THREE.Color(0x6f86c4), 1 - n);
    if (Math.abs(n - this._n) < 0.003 && Math.abs(st - this._st) < 0.01) return;
    this._n = n;
    this._st = st;
    this.scene.fog.color.copy(this.fogDay).lerp(this.fogStorm, st * 0.85).lerp(this.fogNight, 1 - n);
    this.scene.fog.near = 450 - 340 * st;
    this.scene.fog.far = 1300 - 700 * st;
    const night = 1 - n;
    for (const m of this.nightMats) m.emissiveIntensity = night * 1.4;
    if (this.lampPoolMat) this.lampPoolMat.opacity = night * 0.3;
    for (const l of this.siteLights || []) l.intensity = l.userData.west && !this.westOn ? 0 : night * 70;
    for (const f of Object.keys(this.feederOn)) {
      const k = this.feederOn[f] ? night * 2 : 0;
      this.feederMats[f].emissiveIntensity = k;
      for (const m of this.feederFacades[f]) m.emissiveIntensity = this.feederOn[f] ? night * 1.4 : 0;
    }
  }

  update(dt, daylight, hour) {
    this._t += dt;
    for (const s of this.spinners) s.obj.rotation[s.axis] += s.speed * dt;
    this.updateDamage(dt);
    for (const c of Object.values(this.conduits)) {
      if (c.state === 'hidden') continue;
      const speed = (c.state === 'attack' ? 16 : 6) / c.len;
      for (const p of c.packets) {
        const dir = c.state === 'attack' ? 1 : p.dir;
        p.t = (p.t + dt * speed * dir + 1) % 1;
        c.curve.getPointAt(p.t, p.mesh.position);
      }
    }
    this.updatePersona(dt);
    this.water.uniforms.uTime.value += dt;
    this.water.uniforms.uStorm.value = this.storm;
    if (this.honeypot.visible) this.hpLight.material.color.setHex(this.hpAlarm ? (Math.sin(this._t * 12) > 0 ? 0xff3b30 : 0x5a1410) : (Math.sin(this._t * 2) > 0.6 ? 0xf2b33d : 0x6b5216));
    this.updateSouth(dt);
    this.updateWeather(dt);
    this.updateWest(dt);
    const flick = 1 + 0.22 * Math.sin(this._t * 13) + 0.12 * Math.sin(this._t * 29);
    this.flame.scale.set(1, flick, 1);
    this.pilot.scale.set(1, 1 + 0.3 * Math.sin(this._t * 21), 1);
    const pulse = 1 + 0.06 * Math.sin(this._t * 4);
    for (const r of Object.values(this.rings)) {
      if (!r.g.visible) continue;
      r.g.scale.set(pulse, pulse, 1);
      r.fillMat.opacity = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(this._t * 4));
    }

    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const target = tw.fromT.clone().lerp(tw.toT, e);
      const sph = new THREE.Spherical(
        THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, e),
        THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, e),
        THREE.MathUtils.lerp(tw.from.theta, tw.to.theta, e),
      );
      this.controls.target.copy(target);
      this.camera.position.setFromSpherical(sph).add(target);
      if (k >= 1) this.tween = null;
    }
    this.controls.update();

    // keep the map in bounds
    const t = this.controls.target;
    const cx = THREE.MathUtils.clamp(t.x, this.minX, 165), cz = THREE.MathUtils.clamp(t.z, -110, 130);
    const cy = THREE.MathUtils.clamp(t.y, 0, 4);
    if (cx !== t.x || cz !== t.z || cy !== t.y) {
      const d = new THREE.Vector3(cx - t.x, cy - t.y, cz - t.z);
      t.add(d);
      this.camera.position.add(d);
    }

    this.applyLight(daylight, hour);
    this.look.render();
  }
}
