// Use esm.sh so *all* dependencies are rewritten to absolute URLs.
// This avoids "Failed to resolve module specifier 'three'" on GitHub Pages without Node/Vite.
import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const $ = (s) => document.querySelector(s);
const debugBox = $('#debugBox');
function debug(msg) {
  console.log(msg);
  debugBox.textContent += (debugBox.textContent ? '\n' : '') + msg;
  debugBox.classList.add('show');
}

// Small helper that is safe on GitHub Pages (handles /repo/ base paths)
const u = (rel) => new URL(rel, import.meta.url).toString();

// ------- defaults (works even if config fetch fails)
const cfg = {
  removeCeiling: true,
  camera: { fov: 42, position: [2.3, 1.55, 2.85], target: [0.25, 0.9, 0.0] },
  lighting: { exposure: 1.05, hemiIntensity: 0.95, dirIntensity: 1.35 },
  hoverScale: 1.07,
  clickScale: 1.10,
  squish: 0.04,
  chairSway: { enabled: true, speed: 0.33, yaw: 0.075, x: 0.018 },
  monitor: { intervalMs: 3600, fadeMs: 850, images: [
    './assets/monitor/monitor1.png',
    './assets/monitor/monitor2.png',
    './assets/monitor/monitor3.png',
    './assets/monitor/monitor4.png',
    './assets/monitor/monitor5.png'
  ]}
};

async function tryLoadJSON(rel) {
  try {
    const r = await fetch(u(rel), { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${rel} HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    debug(`(info) config load skipped: ${rel} (${e?.message ?? e})`);
    return null;
  }
}

function mergeCfg(base, extra) {
  if (!extra) return base;
  // shallow + nested merges for known sections
  const out = structuredClone(base);
  Object.assign(out, extra);
  if (extra.camera) out.camera = { ...base.camera, ...extra.camera };
  if (extra.lighting) out.lighting = { ...base.lighting, ...extra.lighting };
  if (extra.chairSway) out.chairSway = { ...base.chairSway, ...extra.chairSway };
  if (extra.monitor) out.monitor = { ...base.monitor, ...extra.monitor };
  return out;
}

// ------- main
const loadingPill = $('#loadingPill');
const soundPill = $('#soundPill');
const panel = $('#panel');
const panelTitle = $('#panelTitle');
const panelBody = $('#panelBody');
$('#closePanel').addEventListener('click', () => panel.classList.remove('show'));
for (const btn of document.querySelectorAll('.menu button')) {
  btn.addEventListener('click', () => openPanel(btn.dataset.open.replace('#','').toUpperCase()));
}
function openPanel(key) {
  panelTitle.textContent = key;
  panelBody.textContent = `여기에 ${key} 내용을 넣으면 됩니다. (나중에 링크/내용 매핑 가능)`;
  panel.classList.add('show');
}

// Catch silent failures (helps when user says “console has no error”)
window.addEventListener('error', (e) => debug(`(error) ${e.message}`));
window.addEventListener('unhandledrejection', (e) => debug(`(promise) ${e.reason?.message ?? e.reason}`));

// Load optional configs
const sceneExtra = await tryLoadJSON('./config/scene.json');
const monitorExtra = await tryLoadJSON('./config/monitor.json');
const actionsExtra = await tryLoadJSON('./config/actions.json');
const actionsCfg = actionsExtra ?? { default: { type: 'none' }, byName: {} };
const c = mergeCfg(cfg, sceneExtra);
if (monitorExtra?.images?.length) c.monitor = { ...c.monitor, ...monitorExtra };

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = c.lighting.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Fog will be re-scaled after framing the model (prevents "white-out" when the GLB uses larger units)
scene.fog = new THREE.Fog(new THREE.Color('#efe7fb'), 8.0, 18.0);

// Background to match pastel UI.
scene.background = new THREE.Color('#f0ebfa');

const camera = new THREE.PerspectiveCamera(c.camera.fov, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(...c.camera.position);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(...c.camera.target);
controls.minDistance = 1.75;
controls.maxDistance = 4.9;
controls.minPolarAngle = Math.PI * 0.20;
controls.maxPolarAngle = Math.PI * 0.52;
controls.enablePan = false;
controls.update();

function focusCameraOn(object3d) {
  // Robust framing that ignores huge outlier meshes (e.g., Plane.002).
  // Some GLBs include massive helper/ground planes that blow up the bounds.

  const meshes = [];
  object3d.traverse((o) => {
    if (!o.isMesh) return;
    if (o.visible === false) return;
    meshes.push(o);
  });

  const items = [];
  for (const m of meshes) {
    const b = new THREE.Box3().setFromObject(m);
    if (!Number.isFinite(b.min.x) || !Number.isFinite(b.max.x)) continue;
    const s = new THREE.Vector3();
    b.getSize(s);
    const maxDim = Math.max(s.x, s.y, s.z);
    items.push({ m, b, s, maxDim });
  }
  if (!items.length) {
    debug('(warn) No mesh bounds found; using default camera.');
    return;
  }

  // thresholds tuned for this scene (room is ~1-4 units; outlier plane is ~100+)
  const maxDimsSorted = items.map(x => x.maxDim).sort((a, b) => a - b);
  const median = maxDimsSorted[Math.floor(maxDimsSorted.length * 0.5)] || maxDimsSorted[0];
  const secondLargest = maxDimsSorted.length > 1 ? maxDimsSorted[maxDimsSorted.length - 2] : maxDimsSorted[0];
  const largest = maxDimsSorted[maxDimsSorted.length - 1];
  const outlierDim = Math.max(12, median * 8);
  const extremeJump = (secondLargest > 0) ? (largest > secondLargest * 8) : false;

  const outliers = [];
  const kept = [];
  for (const it of items) {
    const isHuge = it.maxDim > outlierDim;
    const isHugePlane = (it.s.x > 30 && it.s.z > 30 && it.s.y < 2);
    const isOutlier = isHuge || isHugePlane || (extremeJump && it.maxDim === largest);
    if (isOutlier) outliers.push(it);
    else kept.push(it);
  }

  // Build core bounds from kept meshes; if we kept too little, fall back to all.
  const use = kept.length >= Math.max(6, Math.floor(items.length * 0.25)) ? kept : items;
  const box = new THREE.Box3();
  for (const it of use) box.union(it.b);

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const radius = Math.max(0.001, maxDim * 0.55);

  // Move shadow catcher slightly below model
  const minY = box.min.y;
  ground.position.y = minY - 0.01;

  // Camera distance based on fov
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = radius / Math.tan(fov / 2);

  // Place camera at a 'hero' angle similar to the reference (front-right, slightly above).
  const dir = new THREE.Vector3(1.0, 0.58, 1.25).normalize();
  camera.near = Math.max(0.01, dist / 100);
  camera.far = Math.max(50, dist * 10);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist * 1.15)));
  controls.minDistance = Math.max(1.2, dist * 0.45);
  controls.maxDistance = Math.max(3.8, dist * 1.8);
  controls.update();

  // Re-scale fog to the actual scene scale
  if (scene.fog) {
    const near = Math.max(2.5, dist * 0.35);
    const far  = Math.max(12.0, dist * 2.4);
    scene.fog.near = near;
    scene.fog.far  = far;
  }

  if (outliers.length) {
    const names = outliers.slice(0, 6).map(o => o.m.name || '(unnamed)').join(', ');
    debug(`(info) core frame used. outliers=${outliers.length} [${names}${outliers.length>6?'…':''}]`);
    // Hide only very huge planes by default
    for (const it of outliers) {
      if (it.s.x > 30 && it.s.z > 30 && it.s.y < 2) it.m.visible = false;
    }
  }

  debug(`(info) frame(core): size=(${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)}) dist=${dist.toFixed(2)} cam=(${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)})`);
}


// lighting: pastel, soft
scene.add(new THREE.HemisphereLight(0xffeffa, 0xbcd9ff, c.lighting.hemiIntensity));
const dir = new THREE.DirectionalLight(0xffffff, c.lighting.dirIntensity);
dir.position.set(3.6, 5.2, 2.4);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.bias = -0.00025;
dir.shadow.camera.left = -4;
dir.shadow.camera.right = 4;
dir.shadow.camera.top = 4;
dir.shadow.camera.bottom = -4;
scene.add(dir);
const fill = new THREE.DirectionalLight(0xfff2e2, 0.70);
fill.position.set(-4.0, 3.2, 2.5);
scene.add(fill);

// shadow catcher
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// postprocessing (optional) — if it fails for any reason, fall back to plain renderer.
let composer = null;
try {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.85, 0.72);
  composer.addPass(bloom);
} catch (e) {
  debug(`(warn) postprocessing disabled: ${e?.message ?? e}`);
  composer = null;
}

// Loading manager (never get stuck forever)
const manager = new THREE.LoadingManager();
let loadingDone = false;
manager.onProgress = (_url, loaded, total) => {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  loadingPill.textContent = `Loading… ${pct}%`;
};
manager.onLoad = () => {
  loadingDone = true;
  loadingPill.style.display = 'none';
};
setTimeout(() => {
  if (!loadingDone) {
    loadingPill.style.display = 'none';
    debug('(warn) Loading is taking long. If 3D is missing, check that assets/ are in the repo root.');
  }
}, 15000);

// ------- Scene content (GLB or fallback)
const interactables = new Set();
const interactiveRoots = new Map();
const pianoKeys = new Map();
let chair = null;
let screenAnchor = null;

let root = null;

async function loadGLB() {
  const draco = new DRACOLoader(manager);
  // Force JS decoder first (avoids GitHub Pages wasm MIME edge cases)
  draco.setDecoderPath(u('./assets/draco/gltf/'));
  draco.setDecoderConfig({ type: 'js' });

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(draco);

  const url = u('./assets/models/Room_Portfolio.glb');
  return await gltfLoader.loadAsync(url);
}

function markInteractablesFromNames(obj) {
  obj.traverse((o) => {
    if (!o.name) return;
    const name = o.name.toLowerCase();

    if (!chair && (name.includes('chair') || name.includes('seat'))) chair = o;
    if (!screenAnchor && (name.includes('monitor') || name.includes('screen'))) screenAnchor = o;
    if (name.startsWith('key_') || name.includes('piano_key')) {
      const idx = parseInt(o.name.replace(/\D+/g, ''), 10);
      if (Number.isFinite(idx)) pianoKeys.set(o, idx);
    }

    if (/(work|about|contact|sign|poster|monitor|screen|piano|keyboard|desk|plant|clock|drawer)/i.test(o.name)) {
      interactables.add(o);
    }
  });
}

function applySoftMaterials(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (m && 'roughness' in m) {
      m.roughness = Math.min(1, (m.roughness ?? 0.6) + 0.06);
      m.metalness = Math.max(0, (m.metalness ?? 0.0) - 0.02);
    }
  });
}

function hideCeilingMeshes(obj) {
  const sceneBox = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  sceneBox.getSize(size);
  // Be conservative: only hide meshes that look like a roof/ceiling.
  // (Over-aggressive heuristics can hide everything and result in a blank scene.)
  const topY = sceneBox.min.y + size.y * 0.90;

  obj.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = new THREE.Vector3();
    b.getSize(s);
    const c = new THREE.Vector3();
    b.getCenter(c);

    const n = (o.name || '').toLowerCase();
    const namedRoof = /(roof|ceiling|lid|top|cover)/.test(n);
    const spansMost = (s.x > size.x * 0.72) && (s.z > size.z * 0.72);
    const isThin = s.y < size.y * 0.12;
    const isTop = c.y > topY;
    if (namedRoof || (spansMost && isThin && isTop)) o.visible = false;
  });
}

function buildFallbackDiorama() {
  debug('(info) Using fallback diorama (model missing or failed).');
  const group = new THREE.Group();

  // base
  const baseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4f2f6'), roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d6b08d'), roughness: 0.65 });
  const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#fbf7ff'), roughness: 0.92 });
  const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e0bf9d'), roughness: 0.75 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 2.1), baseMat);
  plinth.position.set(0.15, 0.175, 0.05);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // room shell (no ceiling)
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.35, 0.06), wallMat);
  back.position.set(0.15, 0.85, -0.9);
  group.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 1.9), wallMat);
  left.position.set(-0.95, 0.85, 0.05);
  group.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 1.9), wallMat);
  right.position.set(1.25, 0.85, 0.05);
  group.add(right);

  // wood beam top edges (open top)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.18), woodMat);
  beam.position.set(0.15, 1.55, -0.82);
  group.add(beam);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.8), floorMat);
  floor.position.set(0.15, 0.39, 0.05);
  floor.receiveShadow = true;
  group.add(floor);

  // desk
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.55), woodMat);
  desk.position.set(-0.1, 0.72, -0.25);
  desk.castShadow = true;
  desk.receiveShadow = true;
  desk.name = 'desk';
  group.add(desk);
  interactables.add(desk);

  // monitor anchor
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.06), new THREE.MeshStandardMaterial({ color: '#dce3ff', roughness: 0.85 }));
  monitor.position.set(-0.15, 0.90, -0.52);
  monitor.name = 'monitor';
  group.add(monitor);
  interactables.add(monitor);
  screenAnchor = monitor;

  // chair
  chair = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#f2cbe2', roughness: 0.75 }));
  chair.position.set(0.2, 0.55, 0.05);
  chair.name = 'chair';
  chair.castShadow = true;
  chair.receiveShadow = true;
  group.add(chair);

  // piano
  const piano = new THREE.Group();
  piano.position.set(0.85, 0.68, -0.15);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.34), new THREE.MeshStandardMaterial({ color: '#f4f6ff', roughness: 0.7 }));
  body.castShadow = true;
  body.receiveShadow = true;
  piano.add(body);

  const keysG = new THREE.Group();
  keysG.position.set(-0.30, 0.085, 0.02);
  for (let i = 0; i < 7; i++) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.24), new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 }));
    k.position.set(i * 0.09, 0, 0);
    k.name = `key_${i+1}`;
    k.castShadow = true;
    keysG.add(k);
    pianoKeys.set(k, i+1);
    interactables.add(k);
  }
  piano.add(keysG);
  piano.name = 'piano';
  group.add(piano);
  interactables.add(piano);

  // signs (left)
  const signMat = new THREE.MeshStandardMaterial({ color: '#e7d2b9', roughness: 0.78 });
  for (const [txt, y] of [['work', 1.05], ['about', 0.88], ['contact', 0.71]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.06), signMat);
    s.position.set(-0.95, y, -0.65);
    s.name = `sign_${txt}`;
    s.castShadow = true;
    group.add(s);
    interactables.add(s);
  }

  scene.add(group);
  applySoftMaterials(group);
  return group;
}

try {
  const gltf = await loadGLB();
  root = gltf.scene;
  applySoftMaterials(root);
  scene.add(root);
  if (c.removeCeiling) hideCeilingMeshes(root);
  markInteractablesFromNames(root);
  focusCameraOn(root);
  debug('(ok) GLB loaded');
} catch (e) {
  debug(`(warn) GLB failed: ${e?.message ?? e}`);
  root = buildFallbackDiorama();
  focusCameraOn(root);
}

// ------- Monitor slideshow (always attach if possible)
async function createMonitorSlideshow(anchor, images) {
  if (!anchor) return null;
  const box = new THREE.Box3().setFromObject(anchor);
  const size = new THREE.Vector3();
  box.getSize(size);

  const w = Math.max(size.x, size.z) * 0.95;
  const h = Math.max(size.y, Math.min(size.x, size.z)) * 0.72;

  const geom = new THREE.PlaneGeometry(Math.max(0.2, w), Math.max(0.14, h));
  const loader = new THREE.TextureLoader(manager);
  const textures = [];

  for (const rel of images) {
    try {
      const tex = await loader.loadAsync(u(rel));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      textures.push(tex);
    } catch (e) {
      debug(`(warn) monitor image failed: ${rel}`);
    }
  }
  if (!textures.length) return null;

  const matA = new THREE.MeshBasicMaterial({ map: textures[0], transparent: true, opacity: 1 });
  const matB = new THREE.MeshBasicMaterial({ map: textures[1] ?? textures[0], transparent: true, opacity: 0 });
  const a = new THREE.Mesh(geom, matA);
  const b = new THREE.Mesh(geom, matB);

  a.position.set(0, 0, 0.012);
  b.position.set(0, 0, 0.013);
  anchor.add(a);
  anchor.add(b);

  return { textures, matA, matB };
}

const monitor = await createMonitorSlideshow(screenAnchor, c.monitor.images);

// ------- Audio: simple synth piano (no asset dependency)
class SynthPiano {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.delay = null;
  }
  async arm() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;

    // small room-y delay
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.012;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.18;
    this.delay.connect(fb);
    fb.connect(this.delay);

    this.master.connect(this.ctx.destination);
    this.master.connect(this.delay);
    this.delay.connect(this.ctx.destination);
  }
  noteFreq(i) {
    // map 1..n keys to a cute scale around middle C
    const midi = 60 + (i - 1);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  async play(i) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const f = this.noteFreq(i);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0, t0);
    env.gain.linearRampToValueAtTime(0.9, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.35, t0 + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, t0);
    lp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.9);

    // two oscillators (body + brightness)
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(f, t0);
    const o2 = this.ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f * 2, t0);

    // quick hammer noise
    const noise = this.ctx.createBufferSource();
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.02), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25));
    noise.buffer = buf;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);

    o1.connect(env);
    o2.connect(env);
    env.connect(lp);
    lp.connect(this.master);

    noise.connect(noiseGain);
    noiseGain.connect(this.master);

    o1.start(t0);
    o2.start(t0);
    noise.start(t0);

    o1.stop(t0 + 1.0);
    o2.stop(t0 + 1.0);
    noise.stop(t0 + 0.03);
  }
}

const piano = new SynthPiano();
let audioArmed = false;
soundPill.style.display = 'block';
window.addEventListener('pointerdown', async () => {
  if (audioArmed) return;
  await piano.arm();
  audioArmed = true;
  soundPill.style.display = 'none';
}, { once: true });

// ------- Interactions (hover squish, click)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredRoot = null;

renderer.domElement.addEventListener('pointermove', (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
});

renderer.domElement.addEventListener('click', async () => {
  const hit = pick();
  if (!hit) return;

  const key = findPianoKey(hit.object);
  if (key) {
    const idx = pianoKeys.get(key) ?? 1;
    // 클릭으로 바로 소리 나게: 첫 제스처에서 오디오 컨텍스트 활성화
    if (!audioArmed) {
      await piano.arm();
      audioArmed = true;
      soundPill.style.display = 'none';
    }
    await piano.play(idx);
    popClick(key);
    return;
  }

  const node = findNamedNode(hit.object) ?? hit.object;
  popClick(node);

  const action = (node?.name && actionsCfg.byName?.[node.name]) || actionsCfg.default || { type: 'none' };

  if (action.type === 'url' && action.value) {
    window.open(action.value, '_blank', 'noopener,noreferrer');
    return;
  }
  if (action.type === 'modal' && action.value) {
    openPanel(String(action.value).toUpperCase());
    return;
  }
  if (action.type === 'hash' && action.value) {
    openPanel(String(action.value).replace('#','').toUpperCase());
    return;
  }

  // 토대: 매핑이 없으면 오브젝트 이름만 보여줌
  openPanel((node.name || 'OBJECT').toUpperCase());
});

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const list = Array.from(interactables);
  const hits = raycaster.intersectObjects(list, true);
  return hits[0] ?? null;
}

function damp(a, b, lambda, dt) {
  return THREE.MathUtils.damp(a, b, lambda, dt);
}

function findInteractiveRoot(obj) {
  let o = obj;
  for (let i = 0; i < 6 && o; i++) {
    if (o.name && !/^key_/i.test(o.name)) break;
    o = o.parent;
  }
  const root = o ?? obj;
  if (!interactiveRoots.has(root)) interactiveRoots.set(root, { target: 1 });
  return root;
}

function setTargetScale(obj, target) {
  const root = findInteractiveRoot(obj);
  if (!root) return;
  if (!interactiveRoots.has(root)) interactiveRoots.set(root, { target: 1 });
  interactiveRoots.get(root).target = target;
}

function popClick(obj) {
  const root = findInteractiveRoot(obj);
  setTargetScale(root, c.clickScale);
  setTimeout(() => {
    setTargetScale(root, hoveredRoot === root ? c.hoverScale : 1.0);
  }, 120);
}

function findNamedNode(obj) {
  let o = obj;
  for (let i = 0; i < 10 && o; i++) {
    if (o.name) return o;
    o = o.parent;
  }
  return null;
}

function findPianoKey(obj) {
  let o = obj;
  for (let i = 0; i < 10 && o; i++) {
    if (pianoKeys.has(o)) return o;
    if (o.name && o.name.toLowerCase().startsWith('key_')) return o;
    o = o.parent;
  }
  return null;
}

// ------- animate
let last = performance.now();
let slideT = 0;
let slideIndex = 0;
let slideFade = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  try {
    controls.update();

    const hit = pick();
    const newHover = hit ? findInteractiveRoot(hit.object) : null;
    if (newHover !== hoveredRoot) {
      if (hoveredRoot) setTargetScale(hoveredRoot, 1.0);
      hoveredRoot = newHover;
      if (hoveredRoot) setTargetScale(hoveredRoot, c.hoverScale);
    }

    for (const [obj, st] of interactiveRoots.entries()) {
      const target = st.target;
      const curr = obj.scale.x;
      const next = damp(curr, target, 18, dt);
      const squish = (target > 1) ? c.squish : 0;
      obj.scale.set(next * (1 + squish), next * (1 - squish), next * (1 + squish));
    }

    if (chair && c.chairSway?.enabled) {
      const s = c.chairSway;
      const t = now * 0.001;
      chair.rotation.y = (chair.userData.__baseRotY ?? (chair.userData.__baseRotY = chair.rotation.y)) + Math.sin(t * s.speed) * s.yaw;
      chair.position.x = (chair.userData.__baseX ?? (chair.userData.__baseX = chair.position.x)) + Math.sin(t * (s.speed * 0.7)) * s.x;
    }

    if (monitor && monitor.textures.length > 0) {
      slideT += dt * 1000;
      if (slideFade > 0) {
        slideFade = Math.max(0, slideFade - dt * 1000);
        const a = 1 - (slideFade / c.monitor.fadeMs);
        monitor.matA.opacity = 1 - a;
        monitor.matB.opacity = a;
      }
      if (slideT > c.monitor.intervalMs) {
        slideT = 0;
        slideFade = c.monitor.fadeMs;
        slideIndex = (slideIndex + 1) % monitor.textures.length;
        monitor.matA.map = monitor.matB.map;
        monitor.matB.map = monitor.textures[slideIndex];
        monitor.matA.needsUpdate = true;
        monitor.matB.needsUpdate = true;
        monitor.matA.opacity = 1;
        monitor.matB.opacity = 0;
      }
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  } catch (e) {
    debug(`(error) render loop stopped: ${e?.message ?? e}`);
    // Render at least once without composer so something appears.
    try { renderer.render(scene, camera); } catch {}
  }
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
});

// If loading manager never fires (due to some resources outside it), hide pill after init
setTimeout(() => {
  loadingPill.style.display = 'none';
}, 2000);
