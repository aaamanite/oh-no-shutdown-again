// The 3D site: a low-poly substation, its IT/OT neighbours, the town it feeds,
// plus the network overlay, attack rings and a camera rig you can pan, rotate and zoom.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

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

const _mats = new Map();
function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.04, flatShading: true, ...extra });
    _mats.set(key, m);
  }
  return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const PACKET = new THREE.SphereGeometry(0.42, 10, 8);
const JOINT = new THREE.SphereGeometry(1, 10, 8);
const DOME = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);

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
const box = (p, w, h, d, color, x, y, z) => add(p, BOX, asMat(color), x, y + h / 2, z, w, h, d);
const cyl = (p, r, h, color, x, y, z) => add(p, CYL, asMat(color), x, y + h / 2, z, r, h, r);

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

// Window-grid facade: day map plus an emissive map whose lit windows glow at night.
function facadeMaterials(w, h, d, base, glass, roof, seed) {
  const rand = rng(seed);
  const face = faceW => {
    const cols = Math.max(2, Math.round(faceW / 1.7)), rows = Math.max(1, Math.round(h / 2.1));
    const cw = 16, ch = 22;
    const c = document.createElement('canvas'), e = document.createElement('canvas');
    c.width = e.width = cols * cw;
    c.height = e.height = rows * ch;
    const g = c.getContext('2d'), ge = e.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, e.width, e.height);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = k * cw + 3, y = r * ch + 5;
        g.fillStyle = glass; g.fillRect(x, y, cw - 6, ch - 9);
        if (rand() < 0.6) { ge.fillStyle = rand() < 0.5 ? '#ffd889' : '#ffeec4'; ge.fillRect(x, y, cw - 6, ch - 9); }
      }
    }
    const map = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e);
    map.colorSpace = em.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8, metalness: 0.05 });
  };
  const sx = face(d), sz = face(w), top = mat(roof);
  return [sx, sx, top, top, sz, sz];
}

export class World {
  constructor(el) {
    this.el = el;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(el.clientWidth, el.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.bgDay = new THREE.Color(0xcbe2dc);
    this.bgNight = new THREE.Color(0x111b25);
    this.scene.background = this.bgDay.clone();
    this.scene.fog = new THREE.Fog(this.bgDay.clone(), 380, 780);

    this.camera = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 1, 1400);
    const c = (this.controls = new MapControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.minDistance = 14;
    c.maxDistance = 430;
    c.maxPolarAngle = 1.32;
    c.screenSpacePanning = false;
    this.home = { target: new THREE.Vector3(5, 0, 8), radius: 300, phi: 0.9, theta: 0.78 };
    this.setView(this.home.target, this.home);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb6a27e, 1.15);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 1.7));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 10, far: 620 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.15;
    this.scene.add(this.hemi, sun, sun.target);

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
      A: new THREE.MeshStandardMaterial({ color: 0x4d5a63, emissive: 0xffd27a, emissiveIntensity: 0 }),
      B: new THREE.MeshStandardMaterial({ color: 0x4d5a63, emissive: 0xffd27a, emissiveIntensity: 0 }),
      C: new THREE.MeshStandardMaterial({ color: 0x4d5a63, emissive: 0xffd27a, emissiveIntensity: 0 }),
      D: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xffc861, emissiveIntensity: 0 }),
    };
    this.feederFacades = { A: [], B: [], C: [], D: [] };
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
    this.sign(-48, 26, -26.3, 10, 2.8, 0, title('ONSA', 'POWER & CO. · HEADQUARTERS'), false, this.areas.corp);
    this.sign(-35.5, 1.6, -37.2, 7, 2.2, 0, title('ONSA Power & Co.', 'POME Biogas Plant'), true, this.areas.biogas);
    this.sign(69, 5.4, 20.7, 10, 1.6, 0, [
      { text: 'HOSPITAL BUKIT MUTIARA', size: 90, y: 82, color: BRAND.white },
    ], false, this.areas.townB);
  }

  // ---------- persona: the player, in hi-vis coverall and white helmet ----------
  // ONSA field worker figure (shared by the player persona and the researcher)
  worker({ woman = false } = {}) {
    const p = new THREE.Group();
    const body = new THREE.Group();
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
    this.walk = { path, i: 0 };
    const end = path[path.length - 1];
    this.marker.position.set(end.x, 0.2, end.z);
    this.marker.visible = true;
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
        const step = Math.min(dist, 13 * dt);
        d.normalize();
        p.position.addScaledVector(d, step);
        const want = Math.atan2(d.x, d.z);
        let diff = want - p.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.rotation.y += diff * Math.min(1, dt * 12);
      }
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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat(COL.sand));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    this.waterMat = new THREE.MeshStandardMaterial({ color: COL.water, roughness: 0.35, metalness: 0.1 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(800, 300), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.06, -75 - 150);
    water.receiveShadow = true;
    s.add(water);
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(800, 3), mat(COL.shore));
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(0, 0.05, -74.5);
    s.add(shore);

    const flat = (w, d, color, x, z, y = 0.04) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    flat(26, 18, COL.grass, 113, 34);   // hospital park
    flat(18, 14, COL.grass, -60, 34);   // control-center lawn
    flat(30, 10, 0x8a9096, -68, -12, 0.05); // HQ parking

    // roads
    this.roadSegs = [[-125, 0, -20, 0], [20, 0, 150, 0], [-50, -50, -50, 125], [105, -41, 105, 91], [123, -41, 123, 41]];
    flat(105, 5, COL.road, -72.5, 0, 0.07);
    flat(130, 5, COL.road, 85, 0, 0.07);
    flat(4, 175, COL.road, -50, 37.5, 0.08);
    flat(4, 132, COL.road, 105, 25, 0.08);
    flat(4, 82, COL.road, 123, 0, 0.08);
    for (let x = -122; x < 148; x += 6) if (x < -22 || x > 22) flat(2.2, 0.25, 0xf1ead8, x, 0, 0.09);

    // parked cars at HQ
    const rand = rng(7);
    const carCols = [0xd9534f, 0x3d6fb6, 0xf0f0f0, 0x2f3438, 0xf2b33d, 0x6aa86a];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      box(g, 1.6, 0.8, 3, carCols[i % carCols.length], 0, 0.2, 0);
      box(g, 1.4, 0.6, 1.6, 0x34404a, 0, 1.0, -0.2);
      g.position.set(-81 + i * 3.2, 0, -12 + (rand() - 0.5));
      s.add(g);
      this.blockers.push(g);
    }
  }

  buildYard() {
    const g = this.group('yard');
    box(g, 40, 0.15, 28, COL.gravel, 0, 0, 0);

    // fence: translucent mesh panels + posts, west gate open at the road
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x9ea6aa, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
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
    for (const x of [-4, 4, 12]) {
      box(g, 4, 3.4, 3, COL.xfmr, x, 0.15, 5);
      for (let k = -1.6; k <= 1.6; k += 0.8) box(g, 0.18, 2.6, 1.1, 0x6f7c82, x + k, 0.4, 7.1);
      cyl(g, 0.5, 0.15, 0x6f7c82, x - 1.4, 3.55, 4.4);
      const tank = add(g, CYL, mat(0x8a979c), x + 0.3, 4.7, 3.9, 0.45, 3, 0.45);
      tank.rotation.z = Math.PI / 2;
      box(g, 0.2, 1.1, 0.2, COL.steelDark, x - 0.8, 3.55, 3.9);
      box(g, 0.2, 1.1, 0.2, COL.steelDark, x + 1.4, 3.55, 3.9);
      for (const bx of [-1, 0, 1]) {
        cyl(g, 0.17, 1.7, COL.porcelain, x + bx, 3.55, 5.6);
        cyl(g, 0.22, 0.2, 0xdcdcdc, x + bx, 5.25, 5.6);
      }
    }

    // circuit breakers
    this.breakers = [];
    for (let x = -12; x <= 16; x += 4) {
      box(g, 0.35, 1.3, 0.35, COL.steel, x, 0.15, -3);
      const cab = box(g, 1.3, 1, 0.9, 0xb9c1c5, x, 1.4, -3);
      this.breakers.push(cab);
      for (const bz of [-0.3, 0, 0.3]) cyl(g, 0.13, 1.5, COL.porcelain, x + bz * 1.5, 2.4, -3);
    }

    // busbar gantry (north) and outgoing gantry (east)
    for (const x of [-14, 1, 16]) box(g, 0.5, 9, 0.5, COL.steel, x, 0.15, -9);
    box(g, 31, 0.5, 0.5, COL.steel, 1, 9, -9);
    for (const z of [-9.6, -9, -8.4]) {
      const bus = add(g, CYL, mat(0xb8c0c4), 1, 6.4, z, 0.09, 30, 0.09);
      bus.rotation.z = Math.PI / 2;
    }
    for (const z of [-7, 7]) box(g, 0.5, 10, 0.5, COL.steel, 18.5, 0.15, z);
    box(g, 0.5, 0.5, 14.5, COL.steel, 18.5, 10, 0);

    // breaker status lamps per feeder
    this.lamps = {};
    for (const [f, z] of [['A', -5.4], ['C', -1.8], ['B', 1.8], ['D', 5.4]]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: 0x5ee08f }));
      lamp.position.set(18.5, 11.1, z);
      g.add(lamp);
      this.lamps[f] = lamp;
    }
    // lightning masts
    for (const [x, z] of [[-19.6, -13.6], [19.6, 13.6], [-19.6, 13.6]]) cyl(g, 0.12, 15, COL.steelDark, x, 0, z);
  }

  buildControlHouse() {
    const g = this.group('ctrl');
    box(g, 7, 4, 5, 0xd8cfbf, -14.5, 0.15, 8.5);
    box(g, 7.6, 0.4, 5.6, 0x6b7378, -14.5, 4.15, 8.5);
    box(g, 1.1, 2.2, 0.1, 0x55606a, -16, 0.15, 11.02);
    for (const x of [-13.5, -11.8]) box(g, 1.2, 0.8, 0.1, 0x3c4a55, x, 2, 11.02);
    box(g, 1.4, 0.9, 1.1, 0xa8b0b4, -12.2, 4.55, 7.5);
    cyl(g, 0.05, 2.5, COL.steelDark, -17.2, 4.55, 6.8);
    const gps = cyl(g, 0.3, 0.3, 0xf1f1f1, -16.6, 4.55, 9.8);
    gps.scale.y = 0.3;
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
    box(g, 1.3, 1.9, 0.8, 0xc9cfd2, 0, 0, 0);
    box(g, 0.9, 0.5, 0.04, 0x2f3438, 0, 1.05, 0.42);
    cyl(g, 0.05, 1.2, 0x222222, 0.45, 1.9, 0);
    this.hpLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf2b33d }));
    this.hpLight.position.set(-0.35, 2.05, 0);
    g.add(this.hpLight);
    g.position.set(-8.6, 0.15, 9.8);
    g.visible = false;
    this.areas.yard.add(g);
    this.hpAlarm = false;
  }
  setHoneypot(on) { this.honeypot.visible = on; }
  setHoneypotAlarm(on) { this.hpAlarm = on; }
  honeypotAnchor() { return new THREE.Vector3(-8.6, 3.4, 9.8); }

  buildCorporate() {
    const g = this.group('corp');
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 26, 12), facadeMaterials(12, 26, 12, '#8fa3ad', '#2f4352', 0x5d676d, 11));
    tower.position.set(-48, 13, -32);
    tower.castShadow = tower.receiveShadow = true;
    g.add(tower);
    this.nightMats.push(...new Set(tower.material.filter(m => m.emissiveMap)));
    const annex = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 7), facadeMaterials(18, 5, 7, '#c9c2b4', '#34495a', 0x6b7378, 12));
    annex.position.set(-48, 2.5, -21.5);
    annex.castShadow = annex.receiveShadow = true;
    g.add(annex);
    this.nightMats.push(...new Set(annex.material.filter(m => m.emissiveMap)));
    box(g, 3, 1.2, 3, 0x9aa3a8, -45, 26, -34);
    cyl(g, 0.08, 5, COL.steelDark, -51, 26, -29);
  }

  buildDMZ() {
    const g = this.group('dmz');
    const dc = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 7), facadeMaterials(10, 4.5, 7, '#7d8a92', '#2d3a44', 0x5b6369, 21));
    dc.position.set(-24, 2.25, -28);
    dc.castShadow = dc.receiveShadow = true;
    g.add(dc);
    this.nightMats.push(...new Set(dc.material.filter(m => m.emissiveMap)));
    for (const x of [-27, -24, -21]) {
      box(g, 2, 0.9, 2, 0xb5bcc0, x, 4.5, -29);
      const fan = cyl(g, 0.7, 0.1, 0x4b545a, x, 5.4, -29);
      this.spinners.push({ obj: fan, axis: 'y', speed: 3 });
    }
    box(g, 4, 2.4, 3, 0xa1aab0, -17, 0, -30); // generator
  }

  buildControlCenter() {
    const g = this.group('scc');
    const b = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 9), facadeMaterials(12, 6, 9, '#d4ccbd', '#304656', 0x67707a, 31));
    b.position.set(-34, 3, 22);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    this.nightMats.push(...new Set(b.material.filter(m => m.emissiveMap)));
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
    box(g, 3.4, 2.6, 3, 0xcfc8ba, -63, 0, 40);
    this.lattice(g, -67, 40, 20, 1.3, 0.25);
    const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), new THREE.MeshBasicMaterial({ color: 0x4fb6d8, wireframe: true }));
    globe.position.set(-66, 22.5, 40);
    g.add(globe);
    this.spinners.push({ obj: globe, axis: 'y', speed: 0.4 });
  }

  buildTown() {
    const s = this.scene;
    const rand = rng(42);
    const wallCols = [0xf2e6d0, 0xe8d3b5, 0xd9e1e3, 0xf0d9c8, 0xcfd8c4, 0xe6c9a8];
    const roofCols = [0xb4563f, 0x8c5a43, 0x6b7378, 0x9c4f3a];
    const roofGeo = new THREE.ConeGeometry(3.3, 1.9, 4);
    roofGeo.rotateY(Math.PI / 4);
    const gA = this.group('townA'), gB = this.group('townB');
    const xs = [48.5, 54.5, 66, 72, 84.5, 90.5];
    const house = (g, f, x, z) => {
      const h = 2.4 + rand() * 0.8;
      box(g, 4.2, h, 4, wallCols[Math.floor(rand() * wallCols.length)], x, 0, z);
      add(g, roofGeo, mat(roofCols[Math.floor(rand() * roofCols.length)]), x, h + 0.95, z);
      for (const wx of [-1, 1]) {
        const w = new THREE.Mesh(BOX, this.feederMats[f]);
        w.scale.set(0.9, 0.75, 0.06);
        w.position.set(x + wx, h * 0.55, z + 2.02);
        g.add(w);
      }
    };
    for (const x of xs) for (const z of [-36, -29, -22, -15, -8]) if (rand() > 0.12) house(gA, 'A', x, z);
    for (const x of xs) for (const z of [8, 15, 22, 29, 36]) {
      if (x > 61 && x < 76 && z < 27) continue; // hospital footprint
      if (x > 82 && z > 26) continue; // water tower
      if (rand() > 0.15) house(gB, 'B', x, z);
    }

    // Hospital Bukit Mutiara (Feeder B)
    const hosp = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 11), facadeMaterials(13, 8, 11, '#f4f2ec', '#5f88a8', 0xcfd3d4, 51));
    hosp.position.set(69, 4, 15);
    hosp.castShadow = hosp.receiveShadow = true;
    gB.add(hosp);
    this.feederFacades.B.push(...new Set(hosp.material.filter(m => m.emissiveMap)));
    box(gB, 0.8, 2.6, 0.3, 0xd9443a, 69, 8.2, 20.4);
    box(gB, 2.6, 0.8, 0.3, 0xd9443a, 69, 9.1, 20.4);
    const pad = cyl(gB, 2.4, 0.15, 0x56606a, 66, 8, 12);
    pad.castShadow = false;

    // water tower (Feeder B)
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) cyl(gB, 0.18, 9, COL.steel, 88 + dx, 0, 32 + dz);
    const tank = add(gB, new THREE.SphereGeometry(2.8, 14, 10), mat(0xdfe5e8), 88, 11.2, 32);
    tank.scale.y = 0.8;
    s.add(gA, gB);
  }

  // POME biogas plant, laid out along the process: raw POME pond → mixing pit → AD tank + covered lagoon
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
    box(g, 11, 0.7, 11, 0xb59a6e, -33, 0, Z);
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
    box(g, 13.5, 0.5, 10.5, 0xb59a6e, 5, 0, Z);
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
    box(g, 1.0, 1.4, 0.5, 0xd7d2c4, 16.2, 0.12, -53.6);
    box(g, 0.4, 0.3, 0.06, 0x2f3438, 16.2, 0.9, -53.33);
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
    box(g, 1.3, 1.9, 0.8, 0xd7d2c4, 19.6, 0.12, -37.2);
    box(g, 1.6, 0.1, 1.1, 0x6b7378, 19.6, 2.05, -37.2);
    box(g, 0.5, 0.35, 0.05, 0x2f3438, 19.6, 1.2, -36.78);

    mov('MOV-501', 26, GY, -43, 'x', RG);
    usfm('FIT-501', 27.5, GY, -43, 'x', RG);
    pt('PIT-501', 29.4, GY, -43);
    tt('TIT-501', 30.8, GY, -43);
    box(g, 7, 3.4, 2.6, 0x3f6e58, 35.5, 0.12, -43);
    box(g, 2.2, 0.6, 2.2, 0x9aa3a8, 37.6, 3.52, -43);
    cyl(g, 0.3, 3, 0x8a9399, 33.6, 3.52, -43.6);
    for (const x of [33.2, 35.5]) box(g, 1.2, 2.2, 0.06, 0x2f4a3d, x, 0.12, -41.68);
    tag('G-501', 35.5, 5.6, -43);

    // second genset G-502 on its own gas train, exporting on grid Line 2
    run([V(31.6, GY, -43), V(31.6, GY, -47), V(40, GY, -47)], RG, GAS);
    mov('MOV-502', 33.2, GY, -47, 'x', RG);
    usfm('FIT-502', 34.8, GY, -47, 'x', RG);
    pt('PIT-502', 36.6, GY, -47);
    tt('TIT-502', 38.1, GY, -47);
    box(g, 7, 3.4, 2.6, 0x3f6e58, 43.5, 0.12, -47);
    box(g, 2.2, 0.6, 2.2, 0x9aa3a8, 45.6, 3.52, -47);
    cyl(g, 0.3, 3, 0x8a9399, 41.6, 3.52, -47.6);
    for (const x of [41.2, 43.5]) box(g, 1.2, 2.2, 0.06, 0x2f4a3d, x, 0.12, -45.68);
    tag('G-502', 43.5, 5.6, -47);
    box(g, 2.4, 2.2, 1.8, COL.xfmr, 43.5, 0.12, -51.6);
    for (const x of [-0.6, 0, 0.6]) cyl(g, 0.12, 1, COL.porcelain, 43.5 + x, 2.32, -51.6);
    box(g, 2.4, 2.2, 1.8, COL.xfmr, 35.5, 0.12, -39.4);
    for (const x of [-0.6, 0, 0.6]) cyl(g, 0.12, 1, COL.porcelain, 35.5 + x, 2.32, -39.4);

    // PLC / MCC room — every transmitter and valve above is wired back here
    box(g, 4, 3, 2.6, 0xd8cfbf, 22.5, 0.12, -38.4);
    box(g, 4.3, 0.3, 2.9, 0x6b7378, 22.5, 3.12, -38.4);
    cyl(g, 0.05, 2, COL.steelDark, 23.9, 3.42, -38.9);
    tag('PLC-01', 22.5, 4.4, -38.4);
    for (const it of this.instruments) it.pos.add(g.position);
  }

  buildWind() {
    const g = this.group('wind');
    const blade = new THREE.BoxGeometry(0.5, 7.5, 0.15);
    blade.translate(0, 3.75, 0);
    for (const [x, z] of [[52, -74], [68, -82], [84, -74], [100, -82]]) {
      cyl(g, 1.3, 1.2, 0xf2c94c, x, 0, z);
      add(g, new THREE.CylinderGeometry(0.35, 0.65, 18, 10), mat(0xf4f4f0), x, 1.2 + 9, z);
      box(g, 1, 1, 2.4, 0xf4f4f0, x, 19.2, z - 0.4);
      const rotor = new THREE.Group();
      rotor.position.set(x, 19.7, z + 1);
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(blade, mat(0xfafaf6));
        b.rotation.z = (i * Math.PI * 2) / 3;
        b.castShadow = true;
        rotor.add(b);
      }
      add(rotor, new THREE.SphereGeometry(0.45, 10, 8), mat(0xe0e0dc), 0, 0, 0.1);
      rotor.rotation.z = Math.random() * 6;
      g.add(rotor);
      this.spinners.push({ obj: rotor, axis: 'z', speed: 1.1 + Math.random() * 0.3 });
    }
    // export-cable landing station on the shore, tied into grid Line 2
    box(g, 5, 3, 3.6, 0xcfc8ba, 57, 0, -51.5);
    box(g, 5.4, 0.3, 4, 0x6b7378, 57, 3, -51.5);
    box(g, 2.2, 2, 1.6, COL.xfmr, 53.2, 0, -52.6);
  }

  buildCollege() {
    const g = this.group('townC');
    const facade = (w, h, d, x, z, base, seed) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMaterials(w, h, d, base, '#33506b', 0x6b7378, seed));
      m.position.set(x, h / 2, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      this.feederFacades.C.push(...new Set(m.material.filter(q => q.emissiveMap)));
    };
    // academic block with a clock tower, two hostels, a library
    facade(18, 8, 10, 71, 56, '#d9c7a8', 61);
    facade(4, 15, 4, 71, 50.5, '#cdb894', 62);
    add(g, new THREE.ConeGeometry(3.1, 2.4, 4), mat(0x8c5a43), 71, 16.2, 50.5).rotation.y = Math.PI / 4;
    const clock = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0xf4f1e8 }));
    clock.position.set(71, 12.5, 52.52);
    g.add(clock);
    facade(8, 10, 7, 89, 52, '#c9d2d6', 63);
    facade(8, 10, 7, 89, 63, '#c9d2d6', 64);
    facade(9, 5, 7, 52, 60, '#e2d6c2', 65);
    // sports field with track
    const flatG = (w, d, color, x, z, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      g.add(m);
    };
    flatG(28, 15, 0xb8664a, 72, 73, 0.05);
    flatG(24, 11, 0x7fb069, 72, 73, 0.06);
    flatG(0.25, 11, 0xf1ead8, 72, 73, 0.07);
    for (const x of [60.8, 83.2]) box(g, 0.15, 2.2, 3.2, 0xf1ead8, x, 0, 73);
    // college sign
    this.sign(54.5, 1.4, 46.5, 6, 1.8, 0, [
      { text: 'KOLEJ KOMUNITI', size: 112, y: 120, color: BRAND.amber },
      { text: 'BUKIT MUTIARA', size: 76, y: 230, color: BRAND.white, weight: 800 },
    ], true, g);
  }

  // ONSA Power & Co. solar farm: tilted PV rows, string inverters and a step-up station on grid Line 3
  buildSolar() {
    const g = this.group('solar');
    box(g, 46, 0.1, 38, 0xc9bf9f, -84, 0, 70);
    const rows = 11, per = 12;
    const panels = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ color: 0x1e3c6e, roughness: 0.35, metalness: 0.3 }), rows * per);
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
    for (const z of [57, 66, 75, 84]) box(g, 1.4, 1.6, 1, 0xd7d2c4, -62.5, 0, z); // string inverters
    box(g, 3, 2.4, 2.2, COL.xfmr, -62.5, 0, 59.5);
    for (const x of [-0.7, 0, 0.7]) cyl(g, 0.12, 1, COL.porcelain, -62.5 + x, 2.4, 59.5);
    this.sign(-84, 1.4, 90.5, 8, 2.2, 0, [
      { text: 'ONSA Power & Co.', size: 130, y: 110, color: BRAND.amber },
      { text: 'SOLAR FARM · GRID LINE 3', size: 58, y: 220, color: BRAND.white, weight: 800 },
    ], true, g);
  }

  // Feeder D: Harbour Point shopping complex — mall, cinema, big wheel, parking
  buildMall() {
    const g = this.group('townD');
    const facade = (w, h, d, x, z, base, glass, seed) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMaterials(w, h, d, base, glass, 0x6b7378, seed));
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      this.feederFacades.D.push(...new Set(mesh.material.filter(q => q.emissiveMap)));
    };
    facade(30, 7, 16, 8, 70, '#e8e1d4', '#5a8db0', 71);
    const shopCols = [0xd9534f, 0x2fa39a, 0xf2b33d, 0x6a5acd, 0x3d8fd1, 0xe07b39];
    for (let k = 0; k < 6; k++) box(g, 4.2, 0.9, 0.2, shopCols[k], -9.5 + k * 7, 5.4, 78.12); // shop signs on the frontage
    box(g, 6, 1.2, 0.25, 0x1d2928, 8, 7.2, 78.2);
    facade(12, 9, 10, 31, 66, '#4a3b5e', '#2c2540', 73); // cinema
    box(g, 9, 1.6, 0.4, 0xf2b33d, 31, 6.4, 71.2);
    // big wheel (lights follow Feeder D)
    const wheel = new THREE.Group();
    wheel.position.set(31, 10, 84);
    const ringMat = this.feederMats.D;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.22, 8, 40), ringMat);
    wheel.add(ring);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const spoke = new THREE.Mesh(BOX, mat(0xe6e6e6));
      spoke.scale.set(0.12, 7, 0.12);
      spoke.position.set(Math.cos(a) * 3.5, Math.sin(a) * 3.5, 0);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
      const cab = new THREE.Mesh(BOX, mat(shopCols[k % shopCols.length]));
      cab.scale.set(1, 1, 1);
      cab.position.set(Math.cos(a) * 7, Math.sin(a) * 7 - 0.6, 0);
      wheel.add(cab);
    }
    g.add(wheel);
    this.spinners.push({ obj: wheel, axis: 'z', speed: 0.25 });
    for (const s of [-1, 1]) {
      const leg = add(g, BOX, mat(0xbfc5c9), 31 + s * 2.4, 5, 84 - 0.8 * s, 0.3, 10.6, 0.3);
      leg.rotation.z = s * 0.24;
    }
    // parking
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(28, 9), mat(0x6f767c));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(6, 0.05, 84);
    g.add(lot);
    const rand = rng(17);
    const carCols = [0xd9534f, 0x3d6fb6, 0xf0f0f0, 0x2f3438, 0xf2b33d, 0x6aa86a];
    for (let k = 0; k < 11; k++) {
      if (rand() < 0.25) continue;
      box(g, 1.6, 0.8, 3, carCols[k % carCols.length], -6 + k * 2.4, 0.1, 84);
    }
    this.sign(-9, 1.4, 88.5, 7, 2, 0, [
      { text: 'HARBOUR POINT', size: 120, y: 110, color: BRAND.amber },
      { text: 'SHOPS · CINEMA · BIG WHEEL', size: 56, y: 220, color: BRAND.white, weight: 800 },
    ], true, g);
  }

  // ONSA R&D Centre: Space-Based Solar Power (SBSP). A satellite captures solar power in space and
  // beams it down wirelessly as microwaves to a rectenna field, which turns it back into electricity.
  buildRnD() {
    const g = this.group('rnd');
    box(g, 26, 0.1, 26, 0xc9c3b6, -45, 0, 74);
    const lab = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 9), facadeMaterials(14, 7, 9, '#eef0ee', '#4f7fa8', 0x9aa3a8, 81));
    lab.position.set(-46, 3.5, 82.5);
    lab.castShadow = lab.receiveShadow = true;
    g.add(lab);
    this.nightMats.push(...new Set(lab.material.filter(q => q.emissiveMap)));
    add(g, DOME, mat(0xe9ecee), -50, 7, 82.5, 2.4, 2.2, 2.4); // observatory dome

    // rectenna field: rows of receiving antenna panels
    const rect = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ color: 0x9aa7b0, roughness: 0.4, metalness: 0.5 }), 42);
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
    cyl(g, 0.6, 3, 0x9aa3a8, -37.5, 0, 70);
    this.dish = new THREE.Group();
    this.dish.position.set(-37.5, 3.6, 70);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), mat(0xf2f2ee, { side: THREE.DoubleSide }));
    bowl.rotation.x = Math.PI / 2;
    this.dish.add(bowl);
    const feed = new THREE.Mesh(CYL, mat(0x6d777d));
    feed.scale.set(0.06, 2.2, 0.06);
    feed.rotation.x = Math.PI / 2;
    feed.position.z = 1.1;
    this.dish.add(feed);
    g.add(this.dish);

    // the satellite: gold-foil bus, two long solar wings, a downward transmitter
    const sat = (this.satellite = new THREE.Group());
    box(sat, 2.4, 2.4, 3.2, 0xd4a73a, 0, -1.2, 0);
    for (const s of [-1, 1]) {
      box(sat, 0.15, 0.15, 3, 0xbfc5c9, s * 2.2, -0.07, 0);
      const wing = box(sat, 13, 0.12, 4.2, 0x1e3c6e, s * 9.2, -0.06, 0);
      wing.material = new THREE.MeshStandardMaterial({ color: 0x24508f, roughness: 0.3, metalness: 0.4, emissive: 0x0a1630 });
    }
    const tx = add(sat, new THREE.ConeGeometry(1.4, 1.2, 16, 1, true), mat(0xe6e6e6, { side: THREE.DoubleSide }), 0, -2, 0);
    tx.rotation.x = Math.PI;
    sat.scale.setScalar(1.4);
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
    const { p: r, legs, arms } = this.worker({ woman: true });
    this.researcher = r;
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
    r.position.set(-47, 0, 73).add(this.areas.rnd.position);
    this.scene.add(r);
    this.pickables.push(r);
    // wanders between the rectenna, the ground-station dish and the lab door
    this.rStops = [new THREE.Vector3(-47, 0, 73), new THREE.Vector3(-40.5, 0, 66.5), new THREE.Vector3(-44, 0, 77), new THREE.Vector3(-52, 0, 73)].map(v => v.add(this.areas.rnd.position));
    this.rStop = 0;
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
    else {
      const to = this.rStops[this.rStop];
      const v = to.clone().sub(r.position);
      const dist = v.length();
      if (dist < 0.05) { this.rStop = (this.rStop + 1) % this.rStops.length; this.rWait = 3 + Math.random() * 3; }
      else {
        moving = true;
        v.normalize();
        r.position.addScaledVector(v, Math.min(dist, 4.5 * dt));
        let diff = Math.atan2(v.x, v.z) - r.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        r.rotation.y += diff * Math.min(1, dt * 8);
      }
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
    const pts = [];
    const seg = 5;
    const half = y => base + (top - base) * (y / h);
    const corners = y => { const w = half(y); return [[-w, -w], [w, -w], [w, w], [-w, w]]; };
    for (let i = 0; i < seg; i++) {
      const y0 = (h * i) / seg, y1 = (h * (i + 1)) / seg;
      const c0 = corners(y0), c1 = corners(y1);
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4;
        pts.push(c0[k][0], y0, c0[k][1], c1[k][0], y1, c1[k][1]);
        pts.push(c0[k][0], y0, c0[k][1], c1[n][0], y1, c1[n][1]);
        pts.push(c0[n][0], y0, c0[n][1], c1[k][0], y1, c1[k][1]);
        pts.push(c1[k][0], y1, c1[k][1], c1[n][0], y1, c1[n][1]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x6d777d }));
    lines.position.set(x, 0, z);
    parent.add(lines);
    return lines;
  }

  // Transmission tower: lattice body + crossarms. Returns conductor attach points in world space.
  tower(x, z, rotY, h) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.scene.add(g);
    this.towerFeet.push([x, z]);
    this.lattice(g, 0, 0, h, 1.5, 0.35);
    box(g, 7, 0.3, 0.3, COL.steelDark, 0, h - 0.6, 0);
    box(g, 5, 0.3, 0.3, COL.steelDark, 0, h - 3.2, 0);
    g.updateMatrixWorld(true);
    return [[-3.2, h - 1.3], [3.2, h - 1.3], [-2.2, h - 3.9], [2.2, h - 3.9]].map(([lx, ly]) => g.localToWorld(new THREE.Vector3(lx, ly, 0)));
  }

  chain(points, h) {
    const wireMat = new THREE.LineBasicMaterial({ color: 0x343a3f });
    const attach = points.map(([x, z], i) => {
      const [nx, nz] = points[Math.min(i + 1, points.length - 1)];
      const [px, pz] = points[Math.max(i - 1, 0)];
      return this.tower(x, z, Math.atan2(nx - px, nz - pz), h);
    });
    for (let i = 0; i < attach.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const a = attach[i][k], b = attach[i + 1][k];
        const pts = [];
        for (let s = 0; s <= 24; s++) {
          const t = s / 24;
          const p = a.clone().lerp(b, t);
          p.y -= 1.4 * 4 * t * (1 - t);
          pts.push(p);
        }
        this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }
  }

  buildLines() {
    const routes = [
      { pts: [[24, -5], [40, -9], [56, -13], [72, -17], [88, -20]], h: 13, tag: '33 kV Feeder A · Homes' },
      { pts: [[24, 5], [40, 9], [56, 13], [72, 17], [88, 20]], h: 13, tag: '33 kV Feeder B · Hospital' },
      { pts: [[16, 17], [30, 32], [46, 46], [62, 58], [78, 67], [91, 73]], h: 13, tag: '33 kV Feeder C · College' },
      { pts: [[6, 17], [7, 34], [7, 51], [7, 68], [8, 83]], h: 13, tag: '33 kV Feeder D · Shopping complex' },
      { pts: [[-6, 17], [-18, 34], [-36, 48], [-60, 60], [-84, 70], [-104, 77]], h: 15, tag: '132 kV Line 3 · Solar farm' },
      { pts: [[0, -16], [0, -28], [8, -40], [20, -50], [31, -55]], h: 15, tag: '132 kV Line 1 · Genset G-501' },
      { pts: [[22, -17], [34, -28], [44, -40], [50, -54], [53, -67]], h: 15, tag: '132 kV Line 2 · Genset G-502 + wind' },
    ];
    this.lineTags = [];
    this.lineSegs = [];
    for (const r of routes) {
      this.chain(r.pts, r.h);
      const [mx, mz] = r.pts[Math.floor(r.pts.length / 2)];
      this.lineTags.push({ text: r.tag, pos: new THREE.Vector3(mx, r.h + 3, mz) });
      for (let i = 0; i < r.pts.length - 1; i++) this.lineSegs.push([...r.pts[i], ...r.pts[i + 1]]);
    }
  }

  // ---------- green safety walkpaths with yellow edges around the equipment ----------
  buildWalkpaths() {
    const segs = this.roadSegs.map(r => [...r]);
    const walks = [];
    const loop = (x1, z1, x2, z2, sides = 'nesw') => {
      const out = [];
      if (sides.includes('n')) out.push([x1, z1, x2, z1]);
      if (sides.includes('e')) out.push([x2, z1, x2, z2]);
      if (sides.includes('s')) out.push([x2, z2, x1, z2]);
      if (sides.includes('w')) out.push([x1, z2, x1, z1]);
      return out;
    };
    const keep = own => { this.linkUp([...segs, ...walks], own, walks); walks.push(...own); };
    // substation: perimeter path inside the fence, aisle through the west/east gates, south gate
    walks.push(...loop(-18.6, -11.6, 17.2, 12.6), [-20, 0, 20, 0], [0, 12.6, 0, 16]);
    // a loop around every other area, linked to the nearest path or road
    this.scene.updateMatrixWorld(true);
    const b = new THREE.Box3();
    for (const id of ['corp', 'dmz', 'scc', 'internet', 'townA', 'townB', 'townC', 'townD', 'biogas', 'rnd', 'solar']) {
      b.setFromObject(this.areas[id]);
      const pad = 2.2;
      if (id === 'biogas') keep(loop(b.min.x - pad, -73.9, b.max.x + 1.6, b.max.z + pad, 'esw')); // open to the shore
      else keep(loop(b.min.x - pad, b.min.z - pad, b.max.x + pad, b.max.z + pad));
    }
    keep([[50.6, -67.5, 61.5, -67.5]]); // wind landing station
    keep([[0, 16, 0, 60]]);             // substation south gate towards the shopping complex
    this.walkSegs = walks;
    this.drawWalkpaths(walks);
  }

  // join a new run of path to the closest point of what already exists
  linkUp(existing, own, out) {
    let best = null;
    for (const [ax, az, bx, bz] of own) {
      for (let t = 0; t <= 1; t += 0.25) {
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        for (const q of existing) {
          const [qx, qz, d] = nearestOnSeg(px, pz, q);
          if (!best || d < best.d) best = { d, seg: [px, pz, qx, qz] };
        }
      }
    }
    if (best && best.d > 0.3) out.push(best.seg);
  }

  drawWalkpaths(walks) {
    const green = new THREE.MeshStandardMaterial({ color: 0x3f9a5a, roughness: 0.8 });
    const yellow = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
    const W = 2;
    for (const [ax, az, bx, bz] of walks) {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const g = new THREE.Group();
      g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
      g.rotation.y = Math.atan2(dx, dz);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(W, len + W), green);
      strip.rotation.x = -Math.PI / 2;
      strip.position.y = 0.17;
      strip.receiveShadow = true;
      g.add(strip);
      for (const s of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.16, len + W), yellow);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(s * (W / 2 - 0.08), 0.18, 0);
        g.add(edge);
      }
      this.scene.add(g);
    }
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
    const near = (x, z, list, r) => list.some(q => nearestOnSeg(x, z, q)[2] < r);
    const spots = [];
    for (let i = 0; i < 3000 && spots.length < 280; i++) {
      const x = -165 + rand() * 325, z = -71 + rand() * 200;
      if (boxes.some(bx => x > bx.min.x && x < bx.max.x && z > bx.min.z && z < bx.max.z)) continue;
      if (near(x, z, this.roadSegs, 5) || near(x, z, this.walkSegs, 3) || near(x, z, this.lineSegs, 4)) continue;
      if (Math.abs(x) < 26 && Math.abs(z) < 20) continue; // substation yard
      spots.push([x, z, 0.7 + rand() * 0.7]);
    }
    const cone = new THREE.ConeGeometry(1.6, 4, 7);
    const trunk = new THREE.CylinderGeometry(0.25, 0.3, 1.2, 6);
    const crowns = new THREE.InstancedMesh(cone, mat(COL.tree), spots.length);
    const trunks = new THREE.InstancedMesh(trunk, mat(COL.trunk), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    spots.forEach(([x, z, s], i) => {
      sc.set(s, s, s);
      m.compose(new THREE.Vector3(x, 1.2 * s + 2 * s, z), q, sc);
      crowns.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 0.6 * s, z), q, sc);
      trunks.setMatrixAt(i, m);
      crowns.setColorAt(i, new THREE.Color(COL.tree).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1));
    });
    crowns.castShadow = trunks.castShadow = true;
    crowns.receiveShadow = true;
    this.scene.add(crowns, trunks);
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

  applyLight(n, hour) {
    const a = ((hour - 6) / 12) * Math.PI;
    this.sun.position.set(-110 * Math.cos(a), 50 + 100 * Math.max(0.2, Math.sin(a)), 80);
    if (Math.abs(n - this._n) < 0.003) return;
    this._n = n;
    const bg = this.bgDay.clone().lerp(this.bgNight, 1 - n);
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    this.hemi.intensity = 0.32 + 0.85 * n;
    this.sun.intensity = 0.22 + 1.5 * n;
    this.sun.color.setHex(0xaec2ff).lerp(new THREE.Color(0xfff1d6), n);
    this.waterMat.color.setHex(COL.water).lerp(new THREE.Color(0x203a44), 1 - n);
    const night = 1 - n;
    for (const m of this.nightMats) m.emissiveIntensity = night * 0.95;
    for (const f of Object.keys(this.feederOn)) {
      const k = this.feederOn[f] ? night * 1.3 : 0;
      this.feederMats[f].emissiveIntensity = k;
      for (const m of this.feederFacades[f]) m.emissiveIntensity = this.feederOn[f] ? night * 0.95 : 0;
    }
  }

  update(dt, daylight, hour) {
    this._t += dt;
    for (const s of this.spinners) s.obj.rotation[s.axis] += s.speed * dt;
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
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      const d = new THREE.Vector3(cx - t.x, -t.y, cz - t.z);
      t.add(d);
      this.camera.position.add(d);
    }

    this.applyLight(daylight, hour);
    this.renderer.render(this.scene, this.camera);
  }
}
