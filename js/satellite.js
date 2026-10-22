// ONSA SBSP-1: a space-based solar power satellite built from real spacecraft parts. An octagonal bus
// wrapped in gold multi-layer insulation, square truss booms and solar-array drives carrying two wings
// of hinged PV panels (cells to the sun, white backsheet below), white radiators, a hexagonal
// phased-array microwave transmitter facing Earth, a comms dish, star trackers and thruster pods.
// Metres; +y faces the sun, −y faces Earth, wings along ±x. The transmitter face sits at y ≈ −3.1.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// crinkled gold MLI foil: soft light/dark creases over a warm gold base
function foilTexture() {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#c9963a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 10 + rnd() * 50;
      g.strokeStyle = rnd() > 0.5 ? `rgba(255,226,150,${0.15 + rnd() * 0.3})` : `rgba(90,55,10,${0.12 + rnd() * 0.25})`;
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.strokeStyle = 'rgba(60,40,10,0.5)'; g.lineWidth = 2;                 // taped blanket seams
    for (let x = 0; x <= w; x += w / 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  });
}

// monocrystalline PV panel: 8 × 12 chamfered cells with busbars on a pale backsheet, in a frame
function pvTexture() {
  return canvas(512, 768, (g, w, h) => {
    g.fillStyle = '#b9c0c6'; g.fillRect(0, 0, w, h);
    const cols = 8, rows = 12, m = 10, gap = 4;
    const cw = (w - 2 * m) / cols, ch = (h - 2 * m) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = m + c * cw + gap / 2, y = m + r * ch + gap / 2, a = cw - gap, b = ch - gap, k = 7;
      const grd = g.createLinearGradient(x, y, x + a, y + b);
      grd.addColorStop(0, '#1b2f5c'); grd.addColorStop(1, '#0d1a38');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x + k, y); g.lineTo(x + a - k, y); g.lineTo(x + a, y + k); g.lineTo(x + a, y + b - k);
      g.lineTo(x + a - k, y + b); g.lineTo(x + k, y + b); g.lineTo(x, y + b - k); g.lineTo(x, y + k);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(205,212,222,0.55)';
      g.fillRect(x + a * 0.3, y, 1.5, b); g.fillRect(x + a * 0.7, y, 1.5, b);
      g.fillStyle = 'rgba(120,140,190,0.12)';
      for (let yy = y + 4; yy < y + b; yy += 4) g.fillRect(x, yy, a, 0.6);
    }
    g.strokeStyle = '#8d959c'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  });
}

// panel back: white backsheet with the frame and stiffener grid
function backTexture() {
  return canvas(256, 384, (g, w, h) => {
    g.fillStyle = '#e4e7e9'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a9b0b6'; g.lineWidth = 3;
    for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  });
}

// phased-array face: hex-packed patch antennas on a dark ground plane, grouped into tiles
function arrayTexture() {
  return canvas(1024, 1024, (g, w, h) => {
    g.fillStyle = '#1d2328'; g.fillRect(0, 0, w, h);
    const r = 11, dx = r * 2.3, dy = dx * 0.866;
    for (let row = 0, y = 0; y < h + dy; row++, y += dy) {
      for (let x = (row % 2) * dx / 2; x < w + dx; x += dx) {
        g.fillStyle = '#b8823e'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#6e4a1f'; g.beginPath(); g.arc(x, y, r * 0.35, 0, Math.PI * 2); g.fill();
      }
    }
    g.strokeStyle = 'rgba(10,12,14,0.85)'; g.lineWidth = 5;
    for (let x = 0; x <= w; x += w / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += h / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
}

// radiator: white optical solar reflector tiles with heat-pipe lines and the ONSA mission decal
function radiatorTexture() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#f1f3f4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,160,168,0.6)'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#c8ced2';
    for (let x = 40; x < w; x += 72) g.fillRect(x, 0, 6, h);
    g.fillStyle = '#1b2a4a'; g.fillRect(56, 196, 400, 120);
    g.fillStyle = '#f4b41a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 64px Nunito, Arial, sans-serif'; g.fillText('ONSA', 256, 238);
    g.fillStyle = '#ffffff'; g.font = '800 28px Nunito, Arial, sans-serif'; g.fillText('SBSP-1 · POWER & CO.', 256, 288);
  });
}

// square truss from a to b: four longerons, battens and diagonals (merged)
function truss(a, b, width, t) {
  const list = [];
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), d.clone().normalize());
  const bay = width * 1.2, n = Math.max(1, Math.round(len / bay));
  const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([y, z]) => V(0, (y * width) / 2, (z * width) / 2));
  const P = (k, c) => corner[c].clone().add(V((len * k) / n, 0, 0));
  const rod = (p0, p1) => {
    const dd = new THREE.Vector3().subVectors(p1, p0), l = dd.length();
    const g = new THREE.CylinderGeometry(t, t, l, 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dd.normalize()));
    g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    list.push(g);
  };
  for (let c = 0; c < 4; c++) rod(P(0, c), P(n, c));
  for (let k = 0; k <= n; k++) for (let c = 0; c < 4; c++) rod(P(k, c), P(k, (c + 1) % 4));
  for (let k = 0; k < n; k++) for (let c = 0; c < 4; c++) rod(P(k, c), P(k + 1, (c + 1) % 4));
  const geo = mergeGeometries(list);
  geo.applyQuaternion(q);
  geo.translate(a.x, a.y, a.z);
  return geo;
}

// ground-station antenna: the head (reflector, ribs, quadripod, subreflector) opens along its +z, so
// head.lookAt(target) points it. Pedestal and yoke stay put; the head sits at y = 3.6 above the base.
export function buildGroundDish() {
  const base = new THREE.Group(), head = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9ebec, roughness: 0.5, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.7, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.6 });
  const put = (g, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  put(base, new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 2.6), new THREE.MeshStandardMaterial({ color: 0xb9b5ac, roughness: 0.9 })), 0, 0.2, 0);
  put(base, new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.4, 20), paint), 0, 1.6, 0);
  put(base, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.18), dark), 0, 1.3, 0.72);                      // access door
  put(base, new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.35, 24), steel), 0, 2.95, 0);          // azimuth bearing
  for (const s of [-1, 1]) put(base, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.7), paint), s * 0.62, 3.5, 0); // yoke arms
  put(base, new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.45, 12).rotateZ(Math.PI / 2), steel), 0, 3.6, 0); // elevation axle

  // parabolic reflector z = r²/(4f), opening toward +z
  const Rd = 2.5, f = 1.5, pts = [];
  for (let k = 0; k <= 16; k++) { const r = (Rd * k) / 16; pts.push(new THREE.Vector2(r, (r * r) / (4 * f))); }
  const dishGeo = new THREE.LatheGeometry(pts, 48).rotateX(Math.PI / 2);
  put(head, new THREE.Mesh(dishGeo, new THREE.MeshStandardMaterial({ color: 0xf4f5f3, roughness: 0.45, side: THREE.DoubleSide })), 0, 0, 0.25);
  const rimZ = 0.25 + (Rd * Rd) / (4 * f);
  put(head, new THREE.Mesh(new THREE.TorusGeometry(Rd, 0.04, 6, 48), steel), 0, 0, rimZ);
  for (let k = 0; k < 8; k++) {                                                                             // back ribs
    const a = (k / 8) * Math.PI * 2, rm = Rd * 0.45;
    const rib = put(head, new THREE.Mesh(new THREE.BoxGeometry(Rd * 0.8, 0.06, 0.2), steel), Math.cos(a) * rm, Math.sin(a) * rm, 0.25 + (rm * rm) / (4 * f) - 0.13);
    rib.rotation.set(0, -Math.atan(rm / (2 * f)), a, 'ZYX');
  }
  put(head, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.5, 16).rotateX(Math.PI / 2), paint), 0, 0, 0);   // hub
  // quadripod to the subreflector at the focus, and the feed horn at the vertex
  const focus = V(0, 0, 0.25 + f);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, p0 = V(Math.cos(a) * Rd * 0.92, Math.sin(a) * Rd * 0.92, rimZ - 0.05);
    const d = new THREE.Vector3().subVectors(focus, p0);
    const leg = put(head, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, d.length(), 6), steel));
    leg.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    leg.position.copy(p0).addScaledVector(d, 0.5);
  }
  put(head, new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 8, 0, Math.PI * 2, 0, 1.1).rotateX(-Math.PI / 2), paint), focus.x, focus.y, focus.z + 0.12);
  put(head, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.6, 14).rotateX(Math.PI / 2), dark), 0, 0, 0.55);
  head.position.y = 3.6;
  return { base, head };
}

export function buildSatellite() {
  const sat = new THREE.Group();
  const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; sat.add(o); return o; };

  const foilMap = foilTexture();
  const foil = new THREE.MeshStandardMaterial({ color: 0xffffff, map: foilMap, bumpMap: foilMap, bumpScale: 0.6, metalness: 0.95, roughness: 0.32 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9bfc4, metalness: 0.85, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f34, metalness: 0.5, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeef0f1, roughness: 0.55 });
  const strut = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.7, roughness: 0.4 });

  // bus: octagonal prism in gold foil with aluminium decks
  const R = 1.5, H = 3.2;
  mesh(new THREE.CylinderGeometry(R, R, H, 8, 1, true).rotateY(Math.PI / 8), foil);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.12, 8).rotateY(Math.PI / 8), alu, 0, s * (H / 2 + 0.06), 0);
  mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 8).rotateY(Math.PI / 8), foil, 0, H / 2 + 0.37, 0);   // equipment deck

  // thruster pods on four corners of the lower deck, nozzles angled out
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const px = Math.cos(a) * (R - 0.15), pz = Math.sin(a) * (R - 0.15);
    mesh(new THREE.BoxGeometry(0.34, 0.26, 0.34), alu, px, -H / 2 + 0.25, pz);
    const noz = mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.26, 12, 1, true), dark, px * 1.08, -H / 2 + 0.05, pz * 1.08);
    noz.material = new THREE.MeshStandardMaterial({ color: 0x3a3f44, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide });
  }

  // star trackers with sun baffles, and a whip antenna, on the upper deck
  for (const [x, z, tilt] of [[1.0, 0.7, 0.5], [-0.95, 0.75, -0.5]]) {
    const st = mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), dark, x, H / 2 + 0.3, z);
    const baffle = mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.36, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.8, side: THREE.DoubleSide }), x, H / 2 + 0.58, z);
    baffle.rotation.z = tilt; st.rotation.z = tilt * 0.4;
  }
  mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), alu, -0.9, H / 2 + 0.9, -0.6);

  // comms dish on a short mast, angled toward the ground station
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), alu, 0.3, H / 2 + 1.2, -0.5);
  const dish = new THREE.Group();
  dish.position.set(0.3, H / 2 + 1.85, -0.5);
  dish.rotation.set(-0.9, 0, 0.4);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 10, 0, Math.PI * 2, 0, 0.75), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4, side: THREE.DoubleSide }));
  bowl.rotation.x = Math.PI;
  bowl.position.y = 0.72;
  bowl.castShadow = true;
  dish.add(bowl);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const p0 = V(Math.cos(a) * 0.5, 0.02, Math.sin(a) * 0.5), p1 = V(0, 0.42, 0);
    const d = new THREE.Vector3().subVectors(p1, p0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, d.length(), 5), alu);
    leg.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    leg.position.copy(p0).addScaledVector(d, 0.5);
    dish.add(leg);
  }
  const feedHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.12, 10), dark);
  feedHorn.position.y = 0.45;
  dish.add(feedHorn);
  sat.add(dish);

  // radiators: two white panels standing out from the ±z faces on stand-offs
  const radMat = new THREE.MeshStandardMaterial({ map: radiatorTexture(), roughness: 0.45, metalness: 0.05 });
  for (const s of [-1, 1]) {
    const rad = mesh(new THREE.BoxGeometry(2.6, 2.4, 0.06), [white, white, white, white, s > 0 ? radMat : white, s > 0 ? white : radMat], 0, 0, s * 2.7);
    rad.rotation.y = 0;
    for (const x of [-0.9, 0.9]) for (const y of [-0.8, 0.8]) mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.25, 6).rotateX(Math.PI / 2), strut, x, y, s * 2.05);
  }

  // solar wings: truss boom, solar-array drive, yoke, then four hinged panels per side
  const pvMat = new THREE.MeshStandardMaterial({ map: pvTexture(), metalness: 0.35, roughness: 0.22, envMapIntensity: 1.2 });
  const backMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.6 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x8d959c, metalness: 0.7, roughness: 0.4 });
  const panelW = 3.3, panelD = 5.0, gap = 0.14, boomEnd = 5.4;
  const panelGeo = new THREE.BoxGeometry(panelW, 0.05, panelD);
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 20).rotateZ(Math.PI / 2), alu, s * (R + 0.2), 0, 0);       // array drive
    mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20).rotateZ(Math.PI / 2), dark, s * (R + 0.48), 0, 0);
    mesh(truss(V(s * (R + 0.5), 0, 0), V(s * boomEnd, 0, 0), 0.42, 0.025), strut);
    // yoke: a V from the boom tip out to the inner panel's corners
    const tip = V(s * boomEnd, 0, 0);
    for (const z of [-panelD / 2 + 0.3, panelD / 2 - 0.3]) {
      const end = V(s * (boomEnd + 0.6), 0, z), d = new THREE.Vector3().subVectors(end, tip);
      const y = mesh(new THREE.CylinderGeometry(0.04, 0.04, d.length(), 6), strut);
      y.quaternion.setFromUnitVectors(UP, d.clone().normalize());
      y.position.copy(tip).addScaledVector(d, 0.5);
    }
    for (let k = 0; k < 4; k++) {
      const x = s * (boomEnd + 0.6 + panelW / 2 + k * (panelW + gap));
      mesh(panelGeo, [edge, edge, pvMat, backMat, edge, edge], x, 0, 0);
      if (k < 3) for (const z of [-panelD / 3, panelD / 3]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).rotateX(Math.PI / 2), alu, x + s * (panelW / 2 + gap / 2), 0, z);  // hinges
    }
  }

  // microwave transmitter: a hexagonal phased array under the bus on four struts, facing Earth
  const arrayMap = arrayTexture();
  const face = new THREE.MeshStandardMaterial({ map: arrayMap, metalness: 0.6, roughness: 0.35, emissive: 0x2a6e7a, emissiveMap: arrayMap, emissiveIntensity: 0.35 });
  const back = new THREE.MeshStandardMaterial({ color: 0xc4cacf, metalness: 0.6, roughness: 0.45 });
  const arr = mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.22, 6), [back, back, face], 0, -3.0, 0);
  arr.rotation.y = Math.PI / 6;
  mesh(new THREE.CylinderGeometry(3.45, 3.45, 0.08, 6, 1, true).rotateY(Math.PI / 6), edge, 0, -2.86, 0);
  mesh(new THREE.CylinderGeometry(0.8, 1.2, 0.9, 8).rotateY(Math.PI / 8), foil, 0, -H / 2 - 0.45, 0);            // RF power module
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const p0 = V(Math.cos(a) * 1.0, -H / 2, Math.sin(a) * 1.0), p1 = V(Math.cos(a) * 2.6, -2.88, Math.sin(a) * 2.6);
    const d = new THREE.Vector3().subVectors(p1, p0);
    const st = mesh(new THREE.CylinderGeometry(0.05, 0.05, d.length(), 6), strut);
    st.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    st.position.copy(p0).addScaledVector(d, 0.5);
  }
  return sat;
}
