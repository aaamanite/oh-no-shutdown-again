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
};

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
      g.font = `${L.weight || 900} ${L.size}px Nunito, Arial, sans-serif`;
      g.fillStyle = L.color;
      g.fillText(L.text, w / 2, L.y);
    }
    t.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return t;
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
    this.scene.fog = new THREE.Fog(this.bgDay.clone(), 280, 560);

    this.camera = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 1, 1400);
    const c = (this.controls = new MapControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.minDistance = 14;
    c.maxDistance = 330;
    c.maxPolarAngle = 1.32;
    c.screenSpacePanning = false;
    this.home = { target: new THREE.Vector3(0, 0, -4), radius: 225, phi: 0.9, theta: 0.78 };
    this.setView(this.home.target, this.home);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb6a27e, 1.15);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 1.7));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 520 });
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
    this.feederOn = { A: true, B: true, C: true };
    this.feederMats = {
      A: new THREE.MeshStandardMaterial({ color: 0x4d5a63, emissive: 0xffd27a, emissiveIntensity: 0 }),
      B: new THREE.MeshStandardMaterial({ color: 0x4d5a63, emissive: 0xffd27a, emissiveIntensity: 0 }),
      C: new THREE.MeshStandardMaterial({ color: 0x4d5a63, emissive: 0xffd27a, emissiveIntensity: 0 }),
    };
    this.feederFacades = { A: [], B: [], C: [] };
    this.conduits = {};
    this.rings = {};
    this._n = -1;
    this._t = 0;

    this.buildGround();
    this.buildYard();
    this.buildControlHouse();
    this.buildCorporate();
    this.buildDMZ();
    this.buildControlCenter();
    this.buildInternet();
    this.buildTown();
    this.buildBiogas();
    this.buildWind();
    this.buildCollege();
    this.buildLines();
    this.buildTrees();
    this.buildRings();
    this.buildPersona();
    this.buildSigns();

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
  sign(x, y, z, w, h, rotY, lines, posts = true) {
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
    this.scene.add(g);
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
    this.sign(-24.2, 1.6, -5.8, 7, 2.2, 0, title('ONSA Power & Co.', 'Kestrel Point 132/33 kV Substation'));
    this.sign(-48, 26, -26.3, 10, 2.8, 0, title('ONSA', 'POWER & CO. · HEADQUARTERS'), false);
    this.sign(-35.5, 1.6, -37.2, 7, 2.2, 0, title('ONSA Power & Co.', 'POME Biogas Plant'));
  }

  // ---------- persona: the player, in hi-vis coverall and white helmet ----------
  buildPersona() {
    const p = (this.persona = new THREE.Group());
    const body = new THREE.Group();
    p.add(body);
    const NAVY = 0x26417a, POCKET = 0x203766, SILVER = 0xd8dee2, VEST = 0xf2d22e, TRIM = 0xf08a24;
    const SKIN = 0xd6a47a, BOOT = 0x222222, HELMET = 0xf7f7f2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const limb = (w, h, d) => { const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, -h / 2, 0); return geo; };
    const part = (parent, geo, color, x, y, z) => add(parent, geo, mat(color), x, y, z);
    const slab = (parent, color, x, y, z, w, h, d) => { const m = part(parent, BOX, color, x, y, z); m.scale.set(w, h, d); return m; };

    // navy work trousers: reflective bands below the knee, cargo pockets, black safety boots
    this.legs = [-0.17, 0.17].map(x => {
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
    this.arms = [-0.45, 0.45].map(x => {
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
    this.arms.forEach(({ sh }, i) => {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.08), tagMat);
      const s = i ? 1 : -1;
      patch.position.set(s * 0.102, -0.28, 0);
      patch.rotation.y = s * Math.PI / 2;
      sh.add(patch);
    });
    const legTag = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.09), tagMat);
    legTag.position.set(0, -0.22, 0.162);
    this.legs[1].add(legTag);
    body.scale.setScalar(1.8);
    this.body = body;

    // poses as joint quaternions: idle "thinking" (hand to chin, other arm across) vs walking
    const qDir = d => new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), d.normalize());
    const pose = (upper, fore) => { const sh = qDir(upper); return { sh, el: sh.clone().invert().multiply(qDir(fore)) }; };
    this.thinkPose = [pose(V(0.15, -0.29, 0.2), V(0.27, 0.36, 0.05)), pose(V(-0.07, -0.32, 0.18), V(-0.62, 0.02, 0.05))];
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.14;
    p.add(shadow);
    p.position.set(-24, 0, 3);
    p.rotation.y = Math.PI / 2;
    this.scene.add(p);

    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0x7ad9a6, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.walk = null;
    this.walkPhase = 0;
  }

  walkTo(x, z) {
    x = THREE.MathUtils.clamp(x, -115, 115);
    z = THREE.MathUtils.clamp(z, -54, 100);
    this.walk = { to: new THREE.Vector3(x, 0, z) };
    this.marker.position.set(x, 0.16, z);
    this.marker.visible = true;
  }
  walkToAsset(id) {
    const h = this.hubs[id];
    if (h) this.walkTo(h.x, h.z + 1.5);
  }
  personaAnchor() { return this.persona.position.clone().setY(5.8); }

  updatePersona(dt) {
    const p = this.persona;
    let moving = false;
    if (this.walk) {
      const d = this.walk.to.clone().sub(p.position);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.05) {
        this.walk = null;
        this.marker.visible = false;
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
    const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 300), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.06, -56 - 150);
    water.receiveShadow = true;
    s.add(water);
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(700, 3), mat(COL.shore));
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(0, 0.05, -55);
    s.add(shore);

    const flat = (w, d, color, x, z, y = 0.04) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    flat(26, 18, COL.grass, 68, 34);   // hospital park
    flat(18, 14, COL.grass, -34, 34);  // control-center lawn
    flat(30, 10, 0x8a9096, -48, -12, 0.05); // HQ parking

    // roads
    flat(70, 5, COL.road, -55, 0, 0.07);
    flat(78, 5, COL.road, 57, 0, 0.07);
    flat(4, 78, COL.road, -30, 4, 0.08);
    flat(4, 82, COL.road, 60, 0, 0.08);
    flat(4, 26, COL.road, 60, 53, 0.08);
    flat(4, 82, COL.road, 78, 0, 0.08);
    for (let x = -88; x < 95; x += 6) if (x < -22 || x > 22) flat(2.2, 0.25, 0xf1ead8, x, 0, 0.09);

    // parked cars
    const rand = rng(7);
    const carCols = [0xd9534f, 0x3d6fb6, 0xf0f0f0, 0x2f3438, 0xf2b33d, 0x6aa86a];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      box(g, 1.6, 0.8, 3, carCols[i % carCols.length], 0, 0.2, 0);
      box(g, 1.4, 0.6, 1.6, 0x34404a, 0, 1.0, -0.2);
      g.position.set(-61 + i * 3.2, 0, -12 + (rand() - 0.5));
      s.add(g);
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
    panel(40, 0, -14, 0); panel(40, 0, 14, 0);
    panel(28, 20, 0, Math.PI / 2);
    panel(11, -20, -8.5, Math.PI / 2); panel(11, -20, 8.5, Math.PI / 2);
    for (let x = -20; x <= 20; x += 4) { cyl(g, 0.08, 2.4, COL.steelDark, x, 0, -14); cyl(g, 0.08, 2.4, COL.steelDark, x, 0, 14); }
    for (let z = -14; z <= 14; z += 4) { cyl(g, 0.08, 2.4, COL.steelDark, 20, 0, z); if (Math.abs(z) > 3) cyl(g, 0.08, 2.4, COL.steelDark, -20, 0, z); }

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
    for (const [f, z] of [['A', -4.5], ['C', 0], ['B', 4.5]]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: 0x5ee08f }));
      lamp.position.set(18.5, 11.1, z);
      g.add(lamp);
      this.lamps[f] = lamp;
    }
    // lightning masts
    for (const [x, z] of [[-18, -12], [18, 12], [-18, 12]]) cyl(g, 0.12, 15, COL.steelDark, x, 0, z);
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

    // St. Brigid Hospital (Feeder B)
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
      { text: 'KESTREL POINT', size: 120, y: 120, color: BRAND.amber },
      { text: 'COLLEGE', size: 80, y: 230, color: BRAND.white, weight: 800 },
    ]);
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
    this.chain([[24, -5], [32, -10], [40, -15], [46, -19]], 13);  // Feeder A
    this.chain([[24, 5], [32, 10], [40, 15], [46, 19]], 13);      // Feeder B
    this.chain([[16, 17], [28, 30], [40, 40], [50, 47]], 13);     // Feeder C
    this.chain([[0, -16], [0, -26], [16, -33], [31, -36]], 15);   // grid Line 1 · G-501
    this.chain([[22, -17], [31, -22], [40, -29], [45, -41], [53, -50]], 15); // grid Line 2 · G-502 + wind
    this.lineTags = [
      { text: '132 kV Line 1 · Genset G-501', pos: new THREE.Vector3(8, 17, -30) },
      { text: '132 kV Line 2 · Genset G-502 + wind', pos: new THREE.Vector3(36, 17, -25.5) },
      { text: '33 kV Feeder C · College', pos: new THREE.Vector3(34, 15, 35) },
    ];
  }

  buildTrees() {
    const rand = rng(99);
    const blocked = [
      [-24, -18, 24, 18], [-58, -42, -36, -14], [-31, -34, -16, -21], [-42, 13, -25, 30], [-71, 34, -58, 46],
      [42, -42, 96, 42], [44, 42, 100, 84], [40, -58, 60, -34], [12, -36, 50, -14], [12, 14, 52, 50], [-95, -4, 96, 4], [-33, -48, -27, 43], [-5, -56, 5, -12], [-42, -58, 42, -35], [20, -24, 48, 24], [-66, -16, -30, -8],
    ];
    const spots = [];
    for (let i = 0; i < 900 && spots.length < 170; i++) {
      const x = -120 + rand() * 240, z = -52 + rand() * 160;
      if (blocked.some(([x1, z1, x2, z2]) => x > x1 && x < x2 && z > z1 && z < z2)) continue;
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
    for (const f of ['A', 'B', 'C']) {
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
    const cx = THREE.MathUtils.clamp(t.x, -110, 110), cz = THREE.MathUtils.clamp(t.z, -100, 90);
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      const d = new THREE.Vector3(cx - t.x, -t.y, cz - t.z);
      t.add(d);
      this.camera.position.add(d);
    }

    this.applyLight(daylight, hour);
    this.renderer.render(this.scene, this.camera);
  }
}
