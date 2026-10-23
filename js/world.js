// The 3D site: the substation, its IT/OT neighbours, generation and the town it feeds, rendered with
// physically based materials, a physical sky and post-processing (see look.js and props.js),
// plus the network overlay, attack rings and a camera rig you can pan, rotate and zoom.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Look, surface, grassTextures, makeWater, chainLink, groundVariation } from './look.js';
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
    this.feederOn = { A: true, B: true, C: true, D: true };
    this.feederMats = {
      A: new THREE.MeshStandardMaterial({ color: 0x2c3842, roughness: 0.08, metalness: 0.7, emissive: 0xffd27a, emissiveIntensity: 0 }),
      B: new THREE.MeshStandardMaterial({ color: 0x2c3842, roughness: 0.08, metalness: 0.7, emissive: 0xffd27a, emissiveIntensity: 0 }),
      C: new THREE.MeshStandardMaterial({ color: 0x2c3842, roughness: 0.08, metalness: 0.7, emissive: 0xffd27a, emissiveIntensity: 0 }),
      D: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xffc861, emissiveIntensity: 0 }),
    };
    this.feederFacades = { A: [], B: [], C: [], D: [] };
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
    this.buildSigns();
    this.buildWalkpaths();
    this.buildTrees();
    this.buildRings();
    this.buildNavGrid();
    this.buildPersona();

    this.buildStreetscape();
    this.buildSiteLights();
    this.initDamageFx();
    this.batchStatic();
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
    const radius = id.startsWith('town') ? 120 : id === 'yard' || id === 'biogas' ? 90 : 75;
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
      for (const hit of ray.intersectObjects(this.pickables, true)) {
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
      && !this.lineSegs.some(q => nearestOnSeg(x, z, q)[2] < 3) && !this.walkSegs.some(q => nearestOnSeg(x, z, q)[2] < 1.6)
      && !this.towerFeet.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 5.5);
    const wp = this.areas.wind.position;
    const sites = {
      yard: new THREE.Box3().setFromObject(this.areas.yard),
      ctrl: new THREE.Box3().setFromObject(this.areas.ctrl),
      biogas: new THREE.Box3().setFromObject(this.areas.biogas),
      solar: new THREE.Box3().setFromObject(this.areas.solar),
      wind: new THREE.Box3(new THREE.Vector3(wp.x + 50, 0, wp.z - 56), new THREE.Vector3(wp.x + 73, 6, wp.z - 47)), // shore station only
    };
    const spots = [];
    this.siteLights = [];
    for (const bb of Object.values(sites)) {
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
        spots.push({ x, z, ry: Math.atan2(-dz / L, dx / L) });
      }
      const light = new THREE.PointLight(0xffe2b0, 0, Math.max(w, d) * 1.2 + 30, 1);
      light.position.set(cx, 26, cz);
      this.scene.add(light);
      this.siteLights.push(light);
    }
    const n = spots.length;
    const steel = mat(0x8a9096, { metalness: 0.7, roughness: 0.4 });
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 10, 10).translate(0, 5, 0), steel, n);
    const bar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 1.6).translate(0.25, 9.8, 0), steel, n);
    const headGeo = mergeGeometries([-0.55, 0.55].map(oz => roundedBox(0.5, 0.36, 0.5).clone().rotateZ(-0.6).translate(0.55, 9.75, oz)));
    const head = new THREE.InstancedMesh(headGeo, this.lampHeadMat, n);
    const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(10, 32).rotateX(-Math.PI / 2).translate(7, 0.22, 0), this.lampPoolMat, n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    spots.forEach(({ x, z, ry }, i) => {
      M.compose(new THREE.Vector3(x, 0, z), Q.setFromAxisAngle(Y, ry), one);
      for (const m of [pole, bar, head, pool]) m.setMatrixAt(i, M);
    });
    for (const m of [pole, bar, head]) { m.castShadow = true; this.scene.add(m); }
    this.scene.add(pool);
  }

  // street lights every ~24 m along the roads (heads glow at night), and kerbs along the road edges
  buildStreetscape() {
    const G = this.grid, free = (x, z) => {
      const i = Math.floor((x - G.x0) / G.cs), j = Math.floor((z - G.z0) / G.cs);
      return i >= 0 && j >= 0 && i < G.w && j < G.h && !G.block[j * G.w + i];
    };
    const spots = [];
    this.roadSegs.forEach(([ax, az, bx, bz], i) => {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, half = i < 2 ? 2.5 : 2;
      for (let t = 10, k = 0; t < len - 6; t += 24, k++) {
        const sd = k % 2 ? 1 : -1, x = ax + ux * t - uz * (half + 0.9) * sd, z = az + uz * t + ux * (half + 0.9) * sd;
        if (!free(x, z) || this.walkSegs.some(q => nearestOnSeg(x, z, q)[2] < 2.2) || this.lineSegs.some(q => nearestOnSeg(x, z, q)[2] < 3)) continue;
        if (this.roadSegs.some((q, j) => nearestOnSeg(x, z, q)[2] < (j < 2 ? 2.5 : 2) + 0.4)) continue;
        spots.push({ x, z, ry: Math.atan2(uz * sd, -ux * sd) });
      }
    });
    const n = spots.length;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 7, 10).translate(0, 3.5, 0), mat(0x8a9096, { metalness: 0.7, roughness: 0.4 }), n);
    const arm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 8).rotateZ(Math.PI / 2).translate(0.8, 6.9, 0), mat(0x8a9096, { metalness: 0.7, roughness: 0.4 }), n);
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.3 });
    this.nightMats.push(this.lampHeadMat);
    const head = new THREE.InstancedMesh(roundedBox(0.75, 0.16, 0.34).clone().translate(1.6, 6.86, 0), this.lampHeadMat, n);
    const pc = document.createElement('canvas');
    pc.width = pc.height = 128;
    const pg = pc.getContext('2d'), grad = pg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = grad; pg.fillRect(0, 0, 128, 128);
    this.lampPoolMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, map: new THREE.CanvasTexture(pc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(4.2, 28).rotateX(-Math.PI / 2).translate(1.6, 0.2, 0), this.lampPoolMat, n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    spots.forEach(({ x, z, ry }, i) => {
      M.compose(new THREE.Vector3(x, 0, z), Q.setFromAxisAngle(Y, ry), one);
      for (const m of [pole, arm, head, pool]) m.setMatrixAt(i, M);
    });
    for (const m of [pole, arm, head]) { m.castShadow = true; this.scene.add(m); }
    this.scene.add(pool);

    // kerbs: concrete edge strips, broken where roads meet and where walkpaths reach the road
    const kerbGeos = [];
    this.roadSegs.forEach(([ax, az, bx, bz], i) => {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, half = i < 2 ? 2.5 : 2;
      for (const sd of [-1, 1]) {
        const ox = -uz * (half + 0.15) * sd, oz = ux * (half + 0.15) * sd;
        const gaps = [];
        this.roadSegs.forEach((q, j) => {
          if (j === i) return;
          for (const [px, pz] of [[q[0], q[1]], [q[2], q[3]]]) {
            const t = (px - ax) * ux + (pz - az) * uz, off = Math.abs((px - ax) * -uz + (pz - az) * ux);
            if (off < half + 3 && t > -3 && t < len + 3) gaps.push([t - 3.2, t + 3.2]);
          }
          const hit = (() => { const rx = bx - ax, rz = bz - az, sx = q[2] - q[0], sz = q[3] - q[1], den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return null; const t = ((q[0] - ax) * sz - (q[1] - az) * sx) / den, u = ((q[0] - ax) * rz - (q[1] - az) * rx) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t * len : null; })();
          if (hit !== null) gaps.push([hit - 3.2, hit + 3.2]);
        });
        for (const q of this.walkSegs) for (const [px, pz] of [[q[0], q[1]], [q[2], q[3]]]) {
          const t = (px - ax) * ux + (pz - az) * uz, off = Math.abs((px - ax) * -uz + (pz - az) * ux);
          if (off < half + 1.5 && t > 0 && t < len) gaps.push([t - 1.4, t + 1.4]);
        }
        gaps.sort((p, q) => p[0] - q[0]);
        let t0 = 0;
        const piece = (a, b) => {
          if (b - a < 0.6) return;
          const geo = new THREE.BoxGeometry(b - a, 0.16, 0.25);
          geo.rotateY(-Math.atan2(uz, ux));
          geo.translate(ax + ux * (a + b) / 2 + ox, 0.08, az + uz * (a + b) / 2 + oz);
          kerbGeos.push(geo);
        };
        for (const [a, b] of gaps) { piece(t0, Math.min(a, len)); t0 = Math.max(t0, b); }
        piece(t0, len);
      }
    });
    if (kerbGeos.length) {
      const kerbs = new THREE.Mesh(mergeGeometries(kerbGeos), surface('concrete', 0xd4d0c8));
      kerbs.receiveShadow = true;
      this.scene.add(kerbs);
    }
  }

  // merge static meshes per material inside each area (and the parked cars) to cut draw calls
  batchStatic() {
    const dynamic = new Set();
    const keep = o => { if (o) o.traverse(c => dynamic.add(c)); };
    for (const sp of this.spinners) keep(sp.obj);
    [this.modem, this.honeypot, this.flame, this.pilot, this.dish, this.rectGlow, ...Object.values(this.lamps)].forEach(keep);
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
    this.water.hi.visible = q === 'high';
    this.water.lo.visible = q !== 'high';
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
    grass.map.repeat.set(70, 70);
    grass.nrm.repeat.set(70, 70);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundVariation(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.nrm, normalScale: new THREE.Vector2(1, 1), color: 0x93a275, roughness: 0.97 })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    this.water = makeWater(1000, 340, this.look.sunDir);
    for (const w of [this.water.hi, this.water.lo]) { w.position.set(0, 0.03, -75 - 170); s.add(w); }
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
      [-16, 66, -16, 112], [-14, 109, -8, 109],     // mall access + car park entrance
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
    for (let x = -122; x < 148; x += 6) if (x < -22 || x > 22) flat(2.2, 0.25, 0xf1ead8, x, 0, 0.09);

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
    this.beam.scale.set(1.6, len, 1.6);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const flicker = 0.13 + 0.05 * Math.sin(this._t * 5);
    this.beam.material.opacity = flicker;
    this.rectGlow.material.opacity = 0.08 + flicker * 0.5;
    this.dish.lookAt(sp);
    const dp = this.dish.getWorldPosition(new THREE.Vector3());
    const elev = Math.asin(THREE.MathUtils.clamp((sp.y - dp.y) / sp.distanceTo(dp), 0, 1));
    this.rndOutput = Math.round((110 * Math.sin(elev)) / 5) * 5;

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
    for (const r of routes) {
      this.chain(r.pts, r.h);
      const [mx, mz] = r.pts[Math.floor(r.pts.length / 2)];
      this.lineTags.push({ text: r.tag, pos: new THREE.Vector3(mx, r.h + 3, mz) });
      for (let i = 0; i < r.pts.length - 1; i++) this.lineSegs.push([...r.pts[i], ...r.pts[i + 1]]);
    }
    const wires = new THREE.Mesh(mergeGeometries(this.wireGeos), new THREE.MeshStandardMaterial({ color: 0x8d9296, metalness: 0.75, roughness: 0.42 }));
    this.scene.add(wires);
    // every tower drawn as one instanced lattice + insulators + concrete footings per height
    const footing = roundedBox(0.9, 0.5, 0.9), feet = [];
    for (const [h, list] of Object.entries(this._towerAt)) {
      const hh = +h;
      const ins = [];
      for (const [lx, ly] of [[-3.2, hh - 0.6], [3.2, hh - 0.6], [-2.2, hh - 3.2], [2.2, hh - 3.2]]) insulatorString(ins, lx, ly, 0, 0.7);
      for (const [geo, material] of [[latticeGeometry(hh, 1.6, 0.4, 7, [{ y: hh - 0.6, span: 7 }, { y: hh - 3.2, span: 5 }]), this.galv], [mergeGeometries(ins), this.glassIns]]) {
        const m = new THREE.InstancedMesh(geo, material, list.length);
        list.forEach((M, i) => m.setMatrixAt(i, M));
        m.castShadow = true;
        this.scene.add(m);
      }
      for (const M of list) for (const sx of [-1, 1]) for (const sz of [-1, 1]) feet.push(new THREE.Matrix4().makeTranslation(sx * 1.6, -0.05, sz * 1.6).premultiply(M));
    }
    const fm = new THREE.InstancedMesh(footing, mat(COL.concrete), feet.length);
    feet.forEach((M, i) => fm.setMatrixAt(i, M));
    fm.receiveShadow = true;
    this.scene.add(fm);
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
    const G = (this.grid = { x0: -172, z0: -76, cs: 1, w: 340, h: 210 });
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
      if (near(x, z, this.roadSegs, 5) || near(x, z, this.walkSegs, 3) || near(x, z, this.lineSegs, 4)) continue;
      if (Math.abs(x) < 26 && Math.abs(z) < 20) continue; // substation yard
      if (spots.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 3.5 * 3.5)) continue; // no trunks growing into each other
      spots.push([x, z, 0.7 + rand() * 0.7]);
    }
    // an oil palm plantation in the west, rows 8 m apart
    for (let z = -66; z <= -22; z += 7) {
      for (let x = -160 + ((z / 7) % 2 ? 4 : 0); x <= -98; x += 8) {
        if (near(x, z, this.roadSegs, 5) || near(x, z, this.lineSegs, 4)) continue;
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
    for (const [x, z, sc, isPalm] of spots) {
      const palm = isPalm || rand() < 0.28;
      (palm ? byPalm : byLeaf)[Math.floor(rand() * (palm ? palms.length : leaf.length))].push([x, z, sc, rand() * Math.PI * 2]);
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const inst = (geo, material, list, lift) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach(([x, z, sc, rot], i) => {
        M.compose(new THREE.Vector3(x, lift * sc, z), Q.setFromAxisAngle(Y, rot), S3.set(sc, sc, sc));
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
  buildNetwork(conduits) {
    this.net = new THREE.Group();
    this.scene.add(this.net);
    for (const c of conduits) {
      const a = this.hubs[c.a].clone(), b = this.hubs[c.b].clone();
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += 3 + a.distanceTo(b) * 0.16;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const material = new THREE.MeshBasicMaterial({ color: NET_COLORS.ok, transparent: true, opacity: 0.85 });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.17, 6), material);
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
    this.sun.intensity = elev > 1 ? 3.4 * THREE.MathUtils.smoothstep(elev, 1, 14) : 1.5;
    this.sun.color.setHex(elev > 1 ? (elev < 14 ? 0xffc98f : 0xfff2df) : 0x9fb4ff);
    this.hemi.intensity = 0.55 - 0.05 * n;
    this.hemi.color.setHex(0xdbe8ff).lerp(new THREE.Color(0x6f86c4), 1 - n);
    if (this.water.hi.visible) this.water.hi.material.uniforms.sunDirection.value.copy(dir);
    if (Math.abs(n - this._n) < 0.003) return;
    this._n = n;
    this.scene.fog.color.copy(this.fogDay).lerp(this.fogNight, 1 - n);
    const night = 1 - n;
    for (const m of this.nightMats) m.emissiveIntensity = night * 1.4;
    if (this.lampPoolMat) this.lampPoolMat.opacity = night * 0.3;
    for (const l of this.siteLights || []) l.intensity = night * 70;
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
    if (this.water.hi.visible) this.water.hi.material.uniforms.time.value += dt * 0.5;
    else this.water.lowNormals.offset.x += dt * 0.01;
    if (this.honeypot.visible) this.hpLight.material.color.setHex(this.hpAlarm ? (Math.sin(this._t * 12) > 0 ? 0xff3b30 : 0x5a1410) : (Math.sin(this._t * 2) > 0.6 ? 0xf2b33d : 0x6b5216));
    this.updateSouth(dt);
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
    const cx = THREE.MathUtils.clamp(t.x, -170, 165), cz = THREE.MathUtils.clamp(t.z, -110, 130);
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
