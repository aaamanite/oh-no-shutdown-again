// The realistic look: physical sky, image-based lighting, sun shadows that follow the camera,
// post-processing, generated surface textures and world-space (triplanar) material mapping.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// three.js r160 example assets, self-hosted (textures resized to 1024 px, model trimmed to the clips we play)
export const CDN = './assets/three-examples/';
const loader = new THREE.TextureLoader();

// ---------- generated textures ----------
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// tileable value noise: period must divide the lattice size
function valueNoise(seed) {
  const N = 256, r = seeded(seed), g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y, p) => g[(((y % p) + p) % p) * N + (((x % p) + p) % p)];
  return (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(xi, yi, p), b = at(xi + 1, yi, p), c = at(xi, yi + 1, p), d = at(xi + 1, yi + 1, p);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
}
function fbm(n, x, y, period, octaves) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < octaves; o++) { v += amp * n(x * f, y * f, period * f); f *= 2; amp *= 0.5; }
  return v;
}

function paint(size, fn, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n = valueNoise(seed), r = seeded(seed + 7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [R, G, B] = fn(x / size, y / size, n, r);
      const i = (y * size + x) * 4;
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, ctx };
}
function toTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const clamp255 = v => Math.max(0, Math.min(255, v));
const shade = (rgb, k) => rgb.map(v => clamp255(v + k));

const TEX = {};
export function texture(kind) {
  if (TEX[kind]) return TEX[kind];
  let out;
  if (kind === 'asphalt') {
    out = paint(256, (u, v, n, r) => {
      const k = (fbm(n, u * 8, v * 8, 8, 4) - 0.5) * 26 + (r() < 0.05 ? 22 : r() < 0.05 ? -14 : 0);
      return shade([62, 65, 69], k);
    }, 11).c;
  } else if (kind === 'concrete') {
    const p = paint(256, (u, v, n, r) => {
      const k = (fbm(n, u * 4, v * 4, 4, 5) - 0.5) * 30 + (r() - 0.5) * 8;
      return shade([196, 192, 184], k);
    }, 12);
    p.ctx.fillStyle = 'rgba(70,70,70,0.25)';
    p.ctx.fillRect(0, 0, 256, 2); p.ctx.fillRect(0, 0, 2, 256);
    out = p.c;
  } else if (kind === 'gravel') {
    const p = paint(256, (u, v, n) => shade([128, 123, 114], (fbm(n, u * 6, v * 6, 6, 3) - 0.5) * 30), 13);
    const r = seeded(99);
    for (let i = 0; i < 2600; i++) {
      const x = r() * 256, y = r() * 256, s = 1.2 + r() * 2.8, l = 120 + r() * 90;
      p.ctx.fillStyle = `rgba(0,0,0,0.35)`;
      p.ctx.beginPath(); p.ctx.ellipse(x + 0.8, y + 0.8, s, s * 0.8, 0, 0, Math.PI * 2); p.ctx.fill();
      p.ctx.fillStyle = `rgb(${l | 0},${(l * 0.97) | 0},${(l * 0.9) | 0})`;
      p.ctx.beginPath(); p.ctx.ellipse(x, y, s, s * 0.8, r() * 3, 0, Math.PI * 2); p.ctx.fill();
    }
    out = p.c;
  } else if (kind === 'sand') {
    out = paint(256, (u, v, n, r) => shade([214, 198, 160], (fbm(n, u * 6, v * 6, 6, 4) - 0.5) * 22 + (r() - 0.5) * 14), 14).c;
  } else if (kind === 'plaster') {
    out = paint(256, (u, v, n, r) => shade([236, 233, 226], (fbm(n, u * 5, v * 5, 5, 4) - 0.5) * 18 + (r() - 0.5) * 6), 15).c;
  } else if (kind === 'roof') {
    const p = paint(256, (u, v, n, r) => {
      const row = Math.floor(v * 16), tile = Math.floor(u * 16 + (row % 2) * 0.5);
      const k = (seeded(row * 31 + tile)() - 0.5) * 30 + (fbm(n, u * 8, v * 8, 8, 3) - 0.5) * 20;
      const edge = (v * 16) % 1 > 0.86 ? -45 : 0;
      return shade([182, 92, 64], k + edge);
    }, 16);
    out = p.c;
  } else if (kind === 'metal') {
    out = paint(256, (u, v, n, r) => shade([200, 204, 207], (n(u * 2, v * 32, 32) - 0.5) * 18 + (r() - 0.5) * 6), 17).c;
  } else if (kind === 'bark') {
    out = paint(128, (u, v, n) => shade([96, 74, 54], (n(u * 16, v * 2, 16) - 0.5) * 60), 18).c;
  } else if (kind === 'soil') {
    out = paint(256, (u, v, n, r) => shade([110, 86, 60], (fbm(n, u * 6, v * 6, 6, 4) - 0.5) * 34 + (r() - 0.5) * 10), 19).c;
  }
  return (TEX[kind] = toTexture(out));
}

// grass from the three.js example textures (real photo texture), with its normal map
export function grassTextures() {
  if (TEX.grass) return TEX.grass;
  const map = loader.load(CDN + 'textures/terrain/grasslight-big.jpg');
  const nrm = loader.load(CDN + 'textures/terrain/grasslight-big-nm.jpg');
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  return (TEX.grass = { map, nrm });
}

// ---------- world-space (triplanar) mapping so textures keep real-world scale on any mesh ----------
export function triplanar(material, scale) {
  material.onBeforeCompile = shader => {
    shader.uniforms.tpScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 tpw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          tpw = instanceMatrix * tpw;
        #endif
        vTpPos = (modelMatrix * tpw).xyz;
        vTpNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;\nuniform float tpScale;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec3 tpb = pow(abs(normalize(vTpNrm)), vec3(4.0));
          tpb /= (tpb.x + tpb.y + tpb.z);
          vec4 sampledDiffuseColor = texture2D(map, vTpPos.zy * tpScale) * tpb.x
            + texture2D(map, vTpPos.xz * tpScale) * tpb.y
            + texture2D(map, vTpPos.xy * tpScale) * tpb.z;
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  material.customProgramCacheKey = () => 'tp' + scale;
  return material;
}

const SURF = {};
// realistic surfaces: kind = asphalt | concrete | gravel | sand | plaster | roof | metal | soil | grass
export function surface(kind, color = 0xffffff, extra = {}) {
  const key = kind + color + JSON.stringify(extra);
  if (SURF[key]) return SURF[key];
  const props = {
    asphalt: { roughness: 0.92, scale: 0.25 }, concrete: { roughness: 0.85, scale: 0.16 }, gravel: { roughness: 0.95, scale: 0.33 },
    sand: { roughness: 0.95, scale: 0.2 }, plaster: { roughness: 0.82, scale: 0.3 }, roof: { roughness: 0.7, scale: 0.5 },
    metal: { roughness: 0.38, metalness: 0.75, scale: 0.5 }, soil: { roughness: 0.96, scale: 0.2 }, grass: { roughness: 0.95, scale: 0.08 },
    bark: { roughness: 0.95, scale: 0.9 },
  }[kind];
  const map = kind === 'grass' ? grassTextures().map : texture(kind);
  const m = new THREE.MeshStandardMaterial({ color, map, roughness: props.roughness, metalness: props.metalness || 0, ...extra });
  return (SURF[key] = triplanar(m, props.scale));
}

// chain-link fence mesh (alpha), mapped in world space so every panel keeps the same diamond size
export function chainLink() {
  if (TEX.chain) return TEX.chain;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#b9c0c4';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
  const t = toTexture(c);
  const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45 });
  return (TEX.chain = triplanar(m, 1 / 0.35));
}

// large-scale colour variation on the ground so grass doesn't look tiled
export function groundVariation(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGw;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vGw;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float gv = gn(vGw * 0.018) * 0.6 + gn(vGw * 0.07) * 0.4;
        diffuseColor.rgb *= mix(vec3(0.78, 0.8, 0.7), vec3(1.08, 1.02, 0.86), gv);`);
  };
  material.customProgramCacheKey = () => 'groundvar';
  return material;
}

// ---------- rendering pipeline ----------
export class Look {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // physical sky + environment lighting generated from it
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.6;
    u.rayleigh.value = 2.1;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);
    this.skyScene = new THREE.Scene();
    this.skyForEnv = new Sky();
    this.skyForEnv.scale.setScalar(1000);
    Object.assign(this.skyForEnv.material.uniforms, THREE.UniformsUtils.clone(u));
    this.skyScene.add(this.skyForEnv);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this._envElev = 999;

    this.setQuality(quality);
  }

  setQuality(q) {
    this.quality = q;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.5 : 1));
    const w = r.domElement.clientWidth || window.innerWidth, h = r.domElement.clientHeight || window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (q === 'high') {
      this.ao = new GTAOPass(this.scene, this.camera, w, h);
      this.ao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.4, thickness: 6, scale: 1, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.ao.blendIntensity = 0.85;
      this.composer.addPass(this.ao);
    } else this.ao = null;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    if (this.ao) this.ao.setSize(w, h);
  }

  // sun position from the game hour; regenerate image-based lighting when the sun has moved enough
  setTime(hour, daylight) {
    const elev = Math.sin(((hour - 6) / 12) * Math.PI) * 62; // degrees above the horizon
    const azim = 110 + ((hour - 6) / 12) * 140;
    const phi = THREE.MathUtils.degToRad(90 - Math.max(elev, -12));
    const theta = THREE.MathUtils.degToRad(azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    // monsoon weather (0…1) turns the sky to grey overcast and dims the exposure
    const w = this.weather || 0, u = this.sky.material.uniforms;
    u.turbidity.value = 2.6 + 12 * w;
    u.rayleigh.value = 2.1 - 1.7 * w;
    u.mieCoefficient.value = 0.003 + 0.01 * w;
    this.renderer.toneMappingExposure = (0.34 + 0.12 * daylight) * (1 - 0.15 * w);
    this.bloom.strength = 0.18 + 0.7 * (1 - daylight);
    if (Math.abs(elev - this._envElev) > 2.5 || Math.abs(w - (this._envW || 0)) > 0.12) {
      this._envElev = elev;
      this._envW = w;
      const e = this.skyForEnv.material.uniforms;
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient']) e[k].value = u[k].value;
      e.sunPosition.value.copy(this.sunDir);
      if (this.env) this.env.dispose();
      this.env = this.pmrem.fromScene(this.skyScene, 0, 1, 2000).texture;
      this.scene.environment = this.env;
    }
    return elev;
  }

  render() { this.composer.render(); }
}

// the sea: rolling Gerstner swell moved on the GPU, two layers of drifting ripples, sky reflection and sun glint
// from the standard material, shallow turquoise water near the beach, surf at the shoreline and whitecaps on
// the crests. shoreZ is the world z of the waterline; storm (0…1) raises the sea.
export function makeOcean(width, depth, shoreZ) {
  const normals = loader.load(CDN + 'textures/waternormals.jpg');
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  const geo = new THREE.PlaneGeometry(width, depth, 400, 140).rotateX(-Math.PI / 2);
  const uniforms = { uTime: { value: 0 }, uShoreZ: { value: shoreZ }, uStorm: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.07, metalness: 0,
    normalMap: normals, normalScale: new THREE.Vector2(0.32, 0.32), envMapIntensity: 0.95,
  });
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    const common = `#include <common>
      uniform float uTime; uniform float uShoreZ; uniform float uStorm;
      varying vec3 vSea; varying float vWave;`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `${common}
        // one Gerstner wave: adds its displacement and the surface tangents it bends
        vec3 gerstner(vec2 p, vec2 dir, float steep, float wl, inout vec3 tg, inout vec3 bn) {
          float k = 6.28318 / wl, c = sqrt(9.8 / k), a = steep / k;
          vec2 d = normalize(dir);
          float f = k * (dot(d, p) - c * uTime), s = sin(f), co = cos(f);
          tg += vec3(-d.x * d.x * steep * s, d.x * steep * co, -d.x * d.y * steep * s);
          bn += vec3(-d.x * d.y * steep * s, d.y * steep * co, -d.y * d.y * steep * s);
          return vec3(d.x * a * co, a * s, d.y * a * co);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec3 sea0 = (modelMatrix * vec4(position, 1.0)).xyz;
        float amp = smoothstep(0.0, 28.0, uShoreZ - sea0.z) * (1.0 + 1.3 * uStorm);   // calm right at the beach
        vec3 tg = vec3(1.0, 0.0, 0.0), bn = vec3(0.0, 0.0, 1.0), disp = vec3(0.0);
        disp += gerstner(sea0.xz, vec2(0.25, 1.0), 0.08 * amp, 22.0, tg, bn);
        disp += gerstner(sea0.xz, vec2(-0.55, 0.85), 0.07 * amp, 13.0, tg, bn);
        disp += gerstner(sea0.xz, vec2(0.8, 0.6), 0.05 * amp, 9.0, tg, bn);
        vec3 objectNormal = normalize(cross(bn, tg));`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position) + disp;
        vSea = sea0 + disp;
        vWave = disp.y / (0.5 * max(amp, 0.05));                          // -1 trough … 1 crest`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', common)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dS = uShoreZ - vSea.z;                                       // metres out from the waterline
        vec3 shallow = vec3(0.07, 0.27, 0.27), deep = vec3(0.012, 0.075, 0.11), stormy = vec3(0.04, 0.07, 0.08);
        diffuseColor.rgb = mix(mix(shallow, deep, smoothstep(2.0, 90.0, dS)), stormy, uStorm * 0.6);
        diffuseColor.rgb += vec3(0.006, 0.025, 0.022) * smoothstep(0.3, 1.0, vWave);   // light through the crests
        vec3 nz = texture2D(normalMap, vSea.xz * 0.06 + vec2(0.0, uTime * 0.015)).xyz;
        float surf = (1.0 - smoothstep(0.0, 6.0, dS)) * smoothstep(0.42, 0.72, nz.x * 0.55 + 0.45 * (0.5 + 0.5 * sin(dS * 1.9 + uTime * 1.7)));
        float caps = smoothstep(0.75, 1.0, vWave) * smoothstep(0.58, 0.8, nz.y) * (0.2 + 0.9 * uStorm);
        float foam = clamp(surf + caps, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.9), foam);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor + 0.12 * uStorm, 0.75, foam);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nA = texture2D(normalMap, vSea.xz * 0.04 + vec2(uTime * 0.011, -uTime * 0.019)).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(normalMap, vSea.xz * 0.13 + vec2(-uTime * 0.017, -uTime * 0.012)).xyz * 2.0 - 1.0;
        vec2 rip = (nA.xy + nB.xy) * normalScale * (1.0 + 0.8 * uStorm) * (1.0 - 0.7 * foam);
        vec3 tx = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz), tz = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        normal = normalize(normal + tx * rip.x + tz * rip.y);`);
  };
  material.customProgramCacheKey = () => 'ocean-1';
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return { mesh, normals, uniforms };
}
