import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('c');
const assetStatusEl = document.getElementById('assetStatus');

// -------------------------
// Small utilities
// -------------------------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a * (1 - t) + b * t;

class Spring1D {
  constructor(x = 0) {
    this.x = x;
    this.v = 0;
    this.target = x;
    this.k = 240;      // stiffness (bouncier)
    this.damp = 22;    // damping (softer)
  }
  step(dt) {
    const a = -this.k * (this.x - this.target) - this.damp * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
}

function makeCanvasTextTexture(text, {
  font = '700 48px ui-rounded, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif',
  padding = 20,
  bg = 'rgba(255,255,255,0)',
  fg = '#3a2a22'
} = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + padding * 2);
  const h = Math.ceil(64 + padding * 2);
  c.width = w;
  c.height = h;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, padding, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.json();
}

// -------------------------
// Modal + navigation
// -------------------------
const modalEl = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalFooter = document.getElementById('modalFooter');
const modalClose = document.getElementById('modalClose');

function openModal({ title = '', body = '', url = '' } = {}) {
  modalTitle.textContent = title;
  modalBody.textContent = '';
  modalFooter.innerHTML = '';

  // body can contain \n
  for (const line of String(body).split('\n')) {
    const p = document.createElement('p');
    p.textContent = line;
    p.style.margin = '0 0 10px';
    modalBody.appendChild(p);
  }

  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '열기';
    modalFooter.appendChild(a);
  }

  modalEl.classList.remove('hidden');
}

function closeModal() {
  modalEl.classList.add('hidden');
}

modalClose.addEventListener('click', closeModal);
modalEl.querySelector('.modal__backdrop').addEventListener('click', closeModal);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  openModal({
    title: id.toUpperCase(),
    body: `섹션 이동 토대만 만들어뒀습니다.\n\n#sections 안의 내용을 채우거나, config/actions.json에서 menu_*를 URL로 바꾸면 외부 링크로도 연결할 수 있어요.`,
    url: ''
  });
}

// -------------------------
// Audio: soft piano-ish synth
// -------------------------
let audioCtx = null;
let master = null;
let convolver = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  master = audioCtx.createGain();
  master.gain.value = 0.6;

  // gentle compression
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 18;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  // pseudo room reverb impulse
  convolver = audioCtx.createConvolver();
  convolver.buffer = makeImpulseResponse(audioCtx, 1.6, 2.3);
  const wet = audioCtx.createGain();
  wet.gain.value = 0.22;

  const dry = audioCtx.createGain();
  dry.gain.value = 0.88;

  master.connect(dry);
  master.connect(wet);
  wet.connect(convolver);

  dry.connect(comp);
  convolver.connect(comp);
  comp.connect(audioCtx.destination);
}

function makeImpulseResponse(ctx, seconds = 1.4, decay = 2.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return impulse;
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function playNote(midi, velocity = 0.9) {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const f0 = midiToFreq(midi);
  const dur = clamp(2.35 - (midi - 48) * 0.018, 1.25, 2.55);

  // --- hammer / key noise (short, bright) ---
  const noise = audioCtx.createBufferSource();
  const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.05), audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
  }
  noise.buffer = buf;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1600;

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.0, now);
  noiseGain.gain.linearRampToValueAtTime(0.06 * velocity, now + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);

  // --- richer piano-ish tone (custom harmonic wave) ---
  const harmonics = 24;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    // faster falloff for high harmonics -> softer, less buzzy
    const amp = Math.exp(-n * 0.42) / (1.0 + (n * 0.10) * (n * 0.10));
    imag[n] = amp;
  }
  const wave = audioCtx.createPeriodicWave(real, imag, { disableNormalization: true });

  const o1 = audioCtx.createOscillator();
  const o2 = audioCtx.createOscillator();
  o1.setPeriodicWave(wave);
  o2.setPeriodicWave(wave);
  o1.frequency.value = f0;
  o2.frequency.value = f0;
  o1.detune.value = -3; // cents
  o2.detune.value = +3;

  // gentle brightness control
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 70;
  hp.Q.value = 0.5;

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = clamp(2900 + midi * 26, 2800, 11500);
  lp.Q.value = 0.75;

  // body resonances (a couple of broad peaks)
  const body1 = audioCtx.createBiquadFilter();
  body1.type = 'peaking';
  body1.frequency.value = 950;
  body1.Q.value = 1.15;
  body1.gain.value = 2.2;

  const body2 = audioCtx.createBiquadFilter();
  body2.type = 'peaking';
  body2.frequency.value = 2600;
  body2.Q.value = 1.35;
  body2.gain.value = 3.0;

  // subtle saturation (warmer, less sterile)
  const shaper = audioCtx.createWaveShaper();
  shaper.curve = (() => {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(x * 1.2);
    }
    return curve;
  })();
  shaper.oversample = '2x';

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.34 * velocity, now + 0.006);
  env.gain.exponentialRampToValueAtTime(0.16 * velocity, now + 0.085);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  // mild stereo + micro-delay to avoid a flat "beep"
  const pan = audioCtx.createStereoPanner();
  pan.pan.value = (Math.random() * 2 - 1) * 0.14;

  const send = audioCtx.createGain();
  send.gain.value = 0.14;

  const delay = audioCtx.createDelay(0.18);
  delay.delayTime.value = 0.048;
  const fb = audioCtx.createGain();
  fb.gain.value = 0.16;
  const dlp = audioCtx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 4200;
  delay.connect(dlp);
  dlp.connect(fb);
  fb.connect(delay);

  o1.connect(hp);
  o2.connect(hp);
  hp.connect(lp);
  lp.connect(body1);
  body1.connect(body2);
  body2.connect(shaper);
  shaper.connect(env);
  env.connect(pan);
  pan.connect(master);

  // parallel short echo
  env.connect(send);
  send.connect(delay);
  delay.connect(master);

  o1.start(now);
  o2.start(now);
  noise.start(now);

  const stopT = now + dur + 0.15;
  o1.stop(stopT);
  o2.stop(stopT);
  noise.stop(now + 0.055);
}

// Keyboard to MIDI mapping (a small scale)
const keyMap = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72,
  w: 61, e: 63, t: 66, y: 68, u: 70
};
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!keyMap[k]) return;
  if (e.repeat) return;
  playNote(keyMap[k], 0.85);
  pianoPressVisual(k);
});

// -------------------------
// Three.js scene
// -------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color('#f2efff'), 7, 16);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.02, 60);
camera.position.set(3.25, 2.05, 3.65);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0.12, 0.98, -0.12);
controls.minDistance = 2.6;
controls.maxDistance = 6.2;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = 1.18;
controls.minAzimuthAngle = -1.4;
controls.maxAzimuthAngle = 0.4;

// Lights (soft & warm)
const hemi = new THREE.HemisphereLight(new THREE.Color('#f5f0ff'), new THREE.Color('#cde6ff'), 0.75);
scene.add(hemi);

const key = new THREE.DirectionalLight(new THREE.Color('#fff4e8'), 1.1);
key.position.set(3.8, 5.6, 2.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 18;
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -6;
key.shadow.bias = -0.00035;
scene.add(key);

const fill = new THREE.DirectionalLight(new THREE.Color('#e9f3ff'), 0.65);
fill.position.set(-4.8, 3.2, 5.4);
scene.add(fill);

// -------------------------
// Materials + textures
// -------------------------
const texLoader = new THREE.TextureLoader();

const woodDiff = texLoader.load('assets/textures/wood_diff_1k.jpg');
woodDiff.colorSpace = THREE.SRGBColorSpace;
woodDiff.wrapS = woodDiff.wrapT = THREE.RepeatWrapping;
woodDiff.repeat.set(1.35, 1.35);

const woodRough = texLoader.load('assets/textures/wood_rough_1k.jpg');
woodRough.wrapS = woodRough.wrapT = THREE.RepeatWrapping;
woodRough.repeat.copy(woodDiff.repeat);

const plasterDiff = texLoader.load('assets/textures/plaster_diff_1k.jpg');
plasterDiff.colorSpace = THREE.SRGBColorSpace;
plasterDiff.wrapS = plasterDiff.wrapT = THREE.RepeatWrapping;
plasterDiff.repeat.set(1.0, 1.0);

const plasterRough = texLoader.load('assets/textures/plaster_rough_1k.jpg');
plasterRough.wrapS = plasterRough.wrapT = THREE.RepeatWrapping;
plasterRough.repeat.copy(plasterDiff.repeat);

const matWood = new THREE.MeshStandardMaterial({
  map: woodDiff,
  roughnessMap: woodRough,
  roughness: 1.0,
  metalness: 0.0
});

const matPlaster = new THREE.MeshStandardMaterial({
  map: plasterDiff,
  roughnessMap: plasterRough,
  roughness: 1.0,
  metalness: 0.0,
  color: new THREE.Color('#fff8ff')
});

const matBase = new THREE.MeshStandardMaterial({ color: '#f4f1ff', roughness: 0.95, metalness: 0.0 });
const floorDiff = woodDiff.clone();
floorDiff.wrapS = floorDiff.wrapT = THREE.RepeatWrapping;
floorDiff.repeat.set(4.6, 2.8);
floorDiff.needsUpdate = true;

const floorRough = woodRough.clone();
floorRough.wrapS = floorRough.wrapT = THREE.RepeatWrapping;
floorRough.repeat.copy(floorDiff.repeat);
floorRough.needsUpdate = true;

const matFloor = new THREE.MeshStandardMaterial({
  map: floorDiff,
  roughnessMap: floorRough,
  roughness: 1.0,
  metalness: 0.0,
  color: new THREE.Color('#ffe9d6')
});
const matWater = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color('#a8d2ff'),
  roughness: 0.25,
  metalness: 0.0,
  transmission: 0.0,
  clearcoat: 0.9,
  clearcoatRoughness: 0.35
});

const matPink = new THREE.MeshStandardMaterial({ color: '#e9b7d2', roughness: 0.85 });
const matLavender = new THREE.MeshStandardMaterial({ color: '#c9c2ff', roughness: 0.9 });
const matWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
const matGray = new THREE.MeshStandardMaterial({ color: '#d8d8e4', roughness: 0.95 });

// -------------------------
// Diorama construction
// -------------------------
const root = new THREE.Group();
scene.add(root);

// water disk
{
  const g = new THREE.CylinderGeometry(2.4, 2.4, 0.18, 64);
  const m = matWater;
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(0, -0.20, 0);
  mesh.receiveShadow = true;
  root.add(mesh);
}

// base platform
{
  const g = new THREE.CylinderGeometry(1.95, 2.05, 0.28, 64);
  const mesh = new THREE.Mesh(g, matBase);
  mesh.position.set(0, 0.02, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.85, 0.12, 64), new THREE.MeshStandardMaterial({ color: '#f8f6ff', roughness: 0.9 }));
  rim.position.set(0, 0.20, 0);
  rim.castShadow = true;
  rim.receiveShadow = true;
  root.add(rim);
}

// stepping stones (kenney rocks)
const gltf = new GLTFLoader();

const assetCache = new Map();
async function loadGLB(url) {
  if (assetCache.has(url)) return assetCache.get(url).clone(true);
  const res = await new Promise((resolve, reject) => {
    gltf.load(url, resolve, undefined, reject);
  });
  assetCache.set(url, res.scene);
  return res.scene.clone(true);
}

function setCastShadow(obj, cast = true, receive = true) {
  obj.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
      // ensure sRGB
      if (c.material?.map) c.material.map.colorSpace = THREE.SRGBColorSpace;
    }
  });
}

function tintModel(obj, { color = null, roughness = null, metalness = null } = {}) {
  obj.traverse((c) => {
    if (!c.isMesh) return;
    c.material = c.material.clone();
    if (color) {
      // gently blend towards palette
      c.material.color.lerp(new THREE.Color(color), 0.72);
    }
    if (roughness != null) c.material.roughness = roughness;
    if (metalness != null) c.material.metalness = metalness;
  });
}

async function buildStonesAndPlants() {
  const ring = new THREE.Group();
  ring.position.y = 0.08;
  root.add(ring);

  const rockA = await loadGLB('assets/models/nature/rock_smallFlatA.glb');
  const rockB = await loadGLB('assets/models/nature/rock_smallFlatB.glb');
  const rockC = await loadGLB('assets/models/nature/rock_smallFlatC.glb');
  const rocks = [rockA, rockB, rockC];

  for (let i = 0; i < 6; i++) {
    const r = rocks[i % rocks.length].clone(true);
    setCastShadow(r, true, true);
    tintModel(r, { color: '#f6f6ff', roughness: 0.95 });
    const a = -0.9 + i * 0.34;
    const dist = 1.62;
    r.position.set(Math.cos(a) * dist, 0.0, Math.sin(a) * dist);
    r.rotation.y = a + 1.5;
    const s = 0.55 + (i % 3) * 0.06;
    r.scale.setScalar(s);
    ring.add(r);
  }

  // edge stones
  const edgeRock1 = await loadGLB('assets/models/nature/rock_smallA.glb');
  const edgeRock2 = await loadGLB('assets/models/nature/rock_smallB.glb');
  for (let i = 0; i < 9; i++) {
    const r = (i % 2 ? edgeRock1 : edgeRock2).clone(true);
    setCastShadow(r, true, true);
    tintModel(r, { color: '#f3f3ff', roughness: 0.98 });
    const a = i / 9 * Math.PI * 2;
    const dist = 2.02 + (i % 3) * 0.03;
    r.position.set(Math.cos(a) * dist, -0.10, Math.sin(a) * dist);
    r.rotation.y = a + 0.4;
    r.scale.setScalar(0.35 + (i % 2) * 0.05);
    root.add(r);
  }

  // plants
  const plantTall = await loadGLB('assets/models/nature/plant_flatTall.glb');
  const plantShort = await loadGLB('assets/models/nature/plant_flatShort.glb');
  const bush = await loadGLB('assets/models/nature/plant_bushSmall.glb');

  const plants = [plantTall, plantShort, bush];
  for (let i = 0; i < 12; i++) {
    const p = plants[i % plants.length].clone(true);
    setCastShadow(p, true, true);
    tintModel(p, { color: '#b7e1b2', roughness: 1.0 });
    const a = i / 12 * Math.PI * 2;
    const dist = 2.15;
    p.position.set(Math.cos(a) * dist, -0.08, Math.sin(a) * dist);
    p.rotation.y = a;
    const s = 0.28 + (i % 3) * 0.05;
    p.scale.setScalar(s);
    root.add(p);
  }
}

// -------------------------
// Room shell
// -------------------------
const room = new THREE.Group();
room.position.set(0, 0.25, 0);
root.add(room);

// base plinth
{
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 2.4), matBase);
  plinth.position.set(0, 0.08, 0);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  room.add(plinth);
}

// floorboards (pink)
{
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.08, 2.05), matFloor);
  floor.position.set(0.06, 0.17, 0.02);
  floor.castShadow = true;
  floor.receiveShadow = true;
  room.add(floor);
}

// walls
{
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.55, 0.10), matPlaster);
  back.position.set(0.06, 0.95, -0.97);
  back.receiveShadow = true;
  room.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.55, 2.05), matPlaster);
  left.position.set(-1.17, 0.95, 0.02);
  left.receiveShadow = true;
  room.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.55, 2.05), matPlaster);
  right.position.set(1.29, 0.95, 0.02);
  right.receiveShadow = true;
  room.add(right);
}

// top frame (open ceiling)
{
  const frame = new THREE.Group();
  const h = 0.18;
  const t = 0.18;
  const y = 1.68;
  const lenX = 2.75;
  const lenZ = 2.20;

  const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, lenZ), matWood);
  left.position.set(-1.17, y, 0.02);
  left.castShadow = true;
  left.receiveShadow = true;

  const right = new THREE.Mesh(new THREE.BoxGeometry(t, h, lenZ), matWood);
  right.position.set(1.29, y, 0.02);
  right.castShadow = true;
  right.receiveShadow = true;

  const back = new THREE.Mesh(new THREE.BoxGeometry(lenX, h, t), matWood);
  back.position.set(0.06, y, -0.97);
  back.castShadow = true;
  back.receiveShadow = true;

  frame.add(left, right, back);
  room.add(frame);
}

// -------------------------
// Decor: string lights
// -------------------------
const bulbs = new THREE.Group();
bulbs.position.set(-0.95, 1.46, -0.8);
room.add(bulbs);
{
  const bulbGeo = new THREE.SphereGeometry(0.026, 16, 16);
  const palette = ['#ffe7ff', '#e8f3ff', '#f6ffea', '#fff5e8', '#eef0ff'];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const x = lerp(0.0, 2.05, t);
    const y = Math.sin(t * Math.PI) * 0.08;
    const c = new THREE.Color(palette[i % palette.length]);
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.55), roughness: 0.35 });
    const s = new THREE.Mesh(bulbGeo, m);
    s.position.set(x, y, 0);
    s.castShadow = true;
    bulbs.add(s);
  }
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.12, 8), new THREE.MeshStandardMaterial({ color: '#6f5a6a', roughness: 0.9 }));
  wire.rotation.z = Math.PI / 2;
  wire.position.set(1.025, 0.0, 0);
  wire.castShadow = false;
  room.add(wire);
}

// -------------------------
// Posters (placeholder textures)
// -------------------------
function makePosterTex(seed = 1) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 768;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  const cols = seed % 2 ? ['#e9f0ff', '#f9e8ff'] : ['#fdf1e6', '#e7f6ff'];
  grad.addColorStop(0, cols[0]);
  grad.addColorStop(1, cols[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(30,18,40,0.12)';
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(
      120 + Math.sin(i * 0.8 + seed) * 140,
      160 + i * 40,
      34 + (i % 5) * 7,
      0, Math.PI * 2
    );
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(60,40,70,0.55)';
  ctx.font = '800 46px ui-rounded, system-ui, sans-serif';
  ctx.fillText('ROOM', 42, 92);
  ctx.font = '700 32px ui-rounded, system-ui, sans-serif';
  ctx.fillText('folio', 44, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const posterMat1 = new THREE.MeshStandardMaterial({ map: makePosterTex(1), roughness: 0.95 });
const posterMat2 = new THREE.MeshStandardMaterial({ map: makePosterTex(2), roughness: 0.95 });

const posters = [];
{
  const geo = new THREE.PlaneGeometry(0.38, 0.58);
  const p1 = new THREE.Mesh(geo, posterMat1);
  p1.position.set(-0.18, 1.03, -0.915);
  p1.rotation.y = 0;
  p1.castShadow = true;
  p1.userData.id = 'poster_left';
  room.add(p1);
  posters.push(p1);

  const p2 = new THREE.Mesh(geo, posterMat2);
  p2.position.set(0.92, 1.00, -0.915);
  p2.castShadow = true;
  p2.userData.id = 'poster_right';
  room.add(p2);
  posters.push(p2);
}

// -------------------------
// Window (simple)
// -------------------------
let windowMesh;
{
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.06), matWood);
  frame.position.set(0.98, 1.20, -0.92);
  frame.castShadow = true;
  room.add(frame);

  const paneMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#a8cfff'),
    roughness: 0.15,
    metalness: 0.0,
    transmission: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.25
  });
  windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), paneMat);
  windowMesh.position.set(0.98, 1.20, -0.89);
  windowMesh.userData.id = 'window';
  room.add(windowMesh);
}

// -------------------------
// Menu sign (3 wood planks)
// -------------------------
const menu = new THREE.Group();
menu.position.set(-1.43, 1.05, -0.55);
menu.rotation.y = 0.18;
room.add(menu);

function makePlank(label, id, y) {
  const geo = new THREE.BoxGeometry(0.48, 0.12, 0.07);
  const tex = makeCanvasTextTexture(label, { font: '800 44px ui-rounded, system-ui, sans-serif', fg: '#3b2c23', padding: 18 });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.0, color: new THREE.Color('#fff8ff') });
  const plank = new THREE.Mesh(geo, mat);
  plank.position.set(0, y, 0);
  plank.castShadow = true;
  plank.userData.id = id;
  menu.add(plank);
  return plank;
}

makePlank('MY WORK', 'menu_work', 0.16);
makePlank('ABOUT', 'menu_about', 0.00);
makePlank('CONTACT', 'menu_contact', -0.16);

// -------------------------
// Furniture & props (Kenney GLB)
// -------------------------
const interactables = [];
const interactableRoots = new Map();

function registerInteractable(obj, id) {
  obj.userData.id = id;
  interactables.push(obj);
  interactableRoots.set(id, obj);
}

let chairRig = null;
let chairBaseX = 0;
let chairBaseRot = 0;

async function buildFurniture() {
  // Drawer
  const drawer = await loadGLB('assets/models/furniture/sideTableDrawers.glb');
  drawer.position.set(-0.88, 0.25, 0.18);
  drawer.rotation.y = 0.12;
  drawer.scale.setScalar(0.75);
  setCastShadow(drawer, true, true);
  tintModel(drawer, { color: '#c9c2ff', roughness: 0.92 });
  room.add(drawer);
  registerInteractable(drawer, 'drawer');

  // Desk
  const desk = await loadGLB('assets/models/furniture/desk.glb');
  desk.position.set(-0.22, 0.25, -0.12);
  desk.rotation.y = -0.22;
  desk.scale.setScalar(0.92);
  setCastShadow(desk, true, true);
  tintModel(desk, { color: '#d9b37e', roughness: 0.88 });
  room.add(desk);

  // Cardboard boxes (under desk)
  const box1 = await loadGLB('assets/models/furniture/cardboardBoxClosed.glb');
  box1.position.set(-0.30, 0.23, -0.46);
  box1.rotation.y = -0.35;
  box1.scale.setScalar(0.72);
  setCastShadow(box1, true, true);
  tintModel(box1, { color: '#f2e4d6', roughness: 0.98 });
  room.add(box1);

  const box2 = await loadGLB('assets/models/furniture/cardboardBoxOpen.glb');
  box2.position.set(-0.02, 0.23, -0.44);
  box2.rotation.y = -0.15;
  box2.scale.setScalar(0.68);
  setCastShadow(box2, true, true);
  tintModel(box2, { color: '#f2e4d6', roughness: 0.98 });
  room.add(box2);

  // Chair (idle sway)
  chairRig = new THREE.Group();
  chairRig.position.set(0.10, 0.25, 0.12);
  chairRig.rotation.y = -0.45;
  chairBaseX = chairRig.position.x;
  chairBaseRot = chairRig.rotation.y;
  room.add(chairRig);
  registerInteractable(chairRig, 'chair');

  const chair = await loadGLB('assets/models/furniture/chairDesk.glb');
  chair.position.set(0, 0, 0);
  chair.rotation.set(0, 0, 0);
  chair.scale.setScalar(0.92);
  setCastShadow(chair, true, true);
  tintModel(chair, { color: '#f1c0da', roughness: 0.9 });
  chairRig.add(chair);

  // Computer screen (we'll add our screen plane in front)
  const screenModel = await loadGLB('assets/models/furniture/computerScreen.glb');
  screenModel.position.set(-0.15, 0.62, -0.22);
  screenModel.rotation.y = -0.22;
  screenModel.scale.setScalar(0.88);
  setCastShadow(screenModel, true, true);
  tintModel(screenModel, { color: '#eaf0ff', roughness: 0.65 });
  room.add(screenModel);
  registerInteractable(screenModel, 'computer_screen');

  // keyboard + mouse
  const kb = await loadGLB('assets/models/furniture/computerKeyboard.glb');
  kb.position.set(-0.14, 0.50, -0.05);
  kb.rotation.y = -0.22;
  kb.scale.setScalar(0.95);
  setCastShadow(kb, true, true);
  tintModel(kb, { color: '#f8f8ff', roughness: 0.9 });
  room.add(kb);

  const mouse = await loadGLB('assets/models/furniture/computerMouse.glb');
  mouse.position.set(0.10, 0.50, -0.02);
  mouse.rotation.y = -0.1;
  mouse.scale.setScalar(0.95);
  setCastShadow(mouse, true, true);
  tintModel(mouse, { color: '#f8f8ff', roughness: 0.9 });
  room.add(mouse);

  // books
  const books = await loadGLB('assets/models/furniture/books.glb');
  books.position.set(-0.57, 0.53, -0.14);
  books.rotation.y = -0.5;
  books.scale.setScalar(0.82);
  setCastShadow(books, true, true);
  tintModel(books, { color: '#d0d9ff', roughness: 0.95 });
  room.add(books);

  // plant
  const plant = await loadGLB('assets/models/furniture/pottedPlant.glb');
  plant.position.set(-0.70, 0.54, 0.06);
  plant.rotation.y = 0.2;
  plant.scale.setScalar(0.75);
  setCastShadow(plant, true, true);
  tintModel(plant, { color: '#bfe3b9', roughness: 0.95 });
  room.add(plant);

  // wall lamp (right)
  const lamp = await loadGLB('assets/models/furniture/lampWall.glb');
  lamp.position.set(1.18, 1.28, -0.68);
  lamp.rotation.y = Math.PI;
  lamp.scale.setScalar(0.9);
  setCastShadow(lamp, true, true);
  tintModel(lamp, { color: '#fff0e8', roughness: 0.7 });
  room.add(lamp);

  const lampLight = new THREE.PointLight(new THREE.Color('#fff1e7'), 0.45, 2.2);
  lampLight.position.set(1.08, 1.22, -0.55);
  room.add(lampLight);

  assetStatusEl.textContent = 'Assets: Kenney GLB ✓ (furniture+nature)';
}

// -------------------------
// Piano (custom) + visual key press
// -------------------------
const piano = new THREE.Group();
piano.position.set(0.85, 0.52, 0.08);
piano.rotation.y = 0.55;
room.add(piano);
registerInteractable(piano, 'piano');

const pianoKeys = [];
const pianoKeyByChar = new Map();

function buildPiano() {
  // X-stand
  const standMat = new THREE.MeshStandardMaterial({ color: '#f3f3ff', roughness: 0.85 });
  const legGeo = new THREE.BoxGeometry(0.05, 0.55, 0.05);
  const leg1 = new THREE.Mesh(legGeo, standMat);
  const leg2 = new THREE.Mesh(legGeo, standMat);
  leg1.position.set(-0.16, -0.20, 0);
  leg2.position.set(0.16, -0.20, 0);
  leg1.rotation.z = 0.55;
  leg2.rotation.z = -0.55;
  piano.add(leg1, leg2);

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: '#e8d8ff', roughness: 0.8 }));
  top.position.set(0, 0.10, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  piano.add(top);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.10, 0.32), new THREE.MeshStandardMaterial({ color: '#f2f0ff', roughness: 0.65 }));
  body.position.set(0, 0.18, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  piano.add(body);

  // keys
  const whites = 8;
  const wW = 0.095;
  const wH = 0.02;
  const wD = 0.25;
  const bW = 0.055;
  const bD = 0.15;

  const whiteGeo = new THREE.BoxGeometry(wW, wH, wD);
  const blackGeo = new THREE.BoxGeometry(bW, wH, bD);
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.65 });
  const blackMat = new THREE.MeshStandardMaterial({ color: '#2f2b38', roughness: 0.6 });

  const baseX = -((whites - 1) * wW) / 2;

  const whiteKeyChars = ['a','s','d','f','g','h','j','k'];
  for (let i = 0; i < whites; i++) {
    const k = new THREE.Mesh(whiteGeo, whiteMat);
    k.position.set(baseX + i * wW, 0.22, 0.02);
    k.castShadow = true;
    k.receiveShadow = true;
    k.userData.piano = { type: 'white', index: i, char: whiteKeyChars[i] };
    piano.add(k);
    pianoKeys.push(k);
    pianoKeyByChar.set(whiteKeyChars[i], k);
  }

  const blackPositions = [0, 1, 3, 4, 5];
  const blackChars = ['w','e','t','y','u'];
  for (let i = 0; i < blackPositions.length; i++) {
    const idx = blackPositions[i];
    const k = new THREE.Mesh(blackGeo, blackMat);
    k.position.set(baseX + (idx + 0.5) * wW, 0.235, -0.03);
    k.castShadow = true;
    k.receiveShadow = true;
    k.userData.piano = { type: 'black', index: idx, char: blackChars[i] };
    piano.add(k);
    pianoKeys.push(k);
    pianoKeyByChar.set(blackChars[i], k);
  }
}

const keyPressSprings = new Map();
function pianoPressVisual(char) {
  const key = pianoKeyByChar.get(char);
  if (!key) return;
  if (!keyPressSprings.has(key)) {
    keyPressSprings.set(key, new Spring1D(0));
  }
  const s = keyPressSprings.get(key);
  s.x = 0;
  s.v = -8.0;
  s.target = 0;
}

function updatePianoPress(dt) {
  for (const [mesh, spring] of keyPressSprings) {
    spring.step(dt);
    const press = clamp(-spring.x, 0, 1);
    mesh.position.y = mesh.userData.piano.type === 'black' ? 0.235 - press * 0.012 : 0.22 - press * 0.01;
  }
}

// -------------------------
// Monitor slideshow (crossfade)
// -------------------------
let monitorPlane;
let monitorMat;
let monitorTexA, monitorTexB;
let monitorCfg;
let monitorIdx = 0;
let monitorT = 0;
let monitorCross = 0;
let monitorState = 'hold';

function makeScreenShader(tex1, tex2) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      t1: { value: tex1 },
      t2: { value: tex2 },
      mixAmt: { value: 0.0 },
      tint: { value: new THREE.Color('#ffffff') }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D t1;
      uniform sampler2D t2;
      uniform float mixAmt;
      uniform vec3 tint;
      varying vec2 vUv;
      void main(){
        vec4 a = texture2D(t1, vUv);
        vec4 b = texture2D(t2, vUv);
        vec4 c = mix(a, b, smoothstep(0.0, 1.0, mixAmt));
        c.rgb *= tint;
        gl_FragColor = c;
      }
    `,
    transparent: false
  });
  return mat;
}

async function buildMonitorScreen() {
  try {
    monitorCfg = await loadJSON('config/monitor.json');
  } catch {
    monitorCfg = { intervalMs: 2600, crossfadeMs: 650, images: [] };
  }

  const imgs = monitorCfg.images?.length ? monitorCfg.images : ['assets/monitor/monitor1.jpg'];

  const loader = new THREE.TextureLoader();
  const loadTex = (u) => new Promise((resolve, reject) => {
    loader.load(u, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      resolve(t);
    }, undefined, reject);
  });

  monitorTexA = await loadTex(imgs[0]);
  monitorTexB = await loadTex(imgs[Math.min(1, imgs.length - 1)]);
  monitorMat = makeScreenShader(monitorTexA, monitorTexB);

  // approximate screen placement
  monitorPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.26), monitorMat);
  monitorPlane.position.set(-0.16, 0.67, -0.265);
  monitorPlane.rotation.y = -0.22;
  monitorPlane.userData.id = 'computer_screen';
  room.add(monitorPlane);
}

function updateMonitor(dt) {
  if (!monitorCfg) return;
  const imgs = monitorCfg.images;
  if (!imgs || imgs.length < 2) return;

  const interval = (monitorCfg.intervalMs ?? 2400) / 1000;
  const crossfade = (monitorCfg.crossfadeMs ?? 600) / 1000;

  // If the next texture isn't ready yet, don't start a crossfade.
  if (monitorState === 'hold') {
    monitorT += dt;
    if (monitorT >= interval && monitorTexB) {
      monitorState = 'cross';
      monitorT = 0;
      monitorCross = 0;
    }
    return;
  }

  if (monitorState === 'cross') {
    monitorCross += dt;
    const a = clamp(monitorCross / crossfade, 0, 1);
    monitorMat.uniforms.mixAmt.value = a;

    if (a >= 1) {
      // Finish: B becomes A.
      monitorTexA = monitorTexB;
      monitorMat.uniforms.t1.value = monitorTexA;
      monitorMat.uniforms.mixAmt.value = 0;

      // Queue next B.
      monitorIdx = (monitorIdx + 1) % imgs.length;
      const nextIdx = (monitorIdx + 1) % imgs.length;
      monitorTexB = null;

      const loader = new THREE.TextureLoader();
      loader.load(
        imgs[nextIdx],
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          monitorTexB = t;
          monitorMat.uniforms.t2.value = monitorTexB;
        },
        undefined,
        () => {
          // On error, just reuse A.
          monitorTexB = monitorTexA;
          monitorMat.uniforms.t2.value = monitorTexB;
        }
      );

      monitorState = 'hold';
      monitorT = 0;
    }
  }
}

// -------------------------
// Interaction: hover + squishy scale + click actions
// -------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

const springs = new Map();
function ensureSpring(obj) {
  if (!springs.has(obj)) {
    springs.set(obj, {
      sx: new Spring1D(1),
      sy: new Spring1D(1),
      sz: new Spring1D(1)
    });
  }
  return springs.get(obj);
}

function setSquishTargets(obj, amt) {
  const s = ensureSpring(obj);
  // squishy: grow xz more than y
  const xz = 1 + amt;
  const y = 1 + amt * 0.48;
  s.sx.target = xz;
  s.sy.target = y;
  s.sz.target = xz;
}

function findClickableRoot(intersectionObj) {
  let o = intersectionObj;
  while (o && !o.userData?.id) o = o.parent;
  return o;
}

function onPointerMove(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

function setHover(obj) {
  if (hovered === obj) return;

  if (hovered) setSquishTargets(hovered, 0);

  hovered = obj;
  document.body.classList.toggle('is-hovering', Boolean(hovered));

  if (hovered) setSquishTargets(hovered, 0.28);
}

canvas.addEventListener('pointermove', onPointerMove);

let actions = {};

function runAction(id) {
  const a = actions[id];
  if (!a) {
    openModal({ title: id.toUpperCase(), body: `config/actions.json에 \"${id}\" 액션을 추가하세요.`, url: '' });
    return;
  }

  if (a.type === 'section') {
    scrollToSection(a.target);
  } else if (a.type === 'link') {
    if (a.url) {
      window.open(a.url, '_blank', 'noopener,noreferrer');
    } else {
      openModal({ title: 'LINK', body: `아직 URL이 비어있어요.\nconfig/actions.json에서 \"${id}\".url 을 채우면 바로 연결됩니다.`, url: '' });
    }
  } else if (a.type === 'modal') {
    openModal({ title: a.title ?? id.toUpperCase(), body: a.body ?? '', url: a.url ?? '' });
  } else if (a.type === 'piano') {
    openModal({ title: 'PIANO', body: '피아노는 클릭 또는 키보드(A,S,D,F,G,H,J,K / W,E,T,Y,U)로 연주할 수 있어요.' });
  }
}

function clickToPiano(intersect) {
  // if a key mesh was clicked, derive midi
  const o = intersect.object;
  const p = o.userData?.piano;
  if (!p) return false;

  const char = p.char;
  if (keyMap[char]) {
    playNote(keyMap[char], p.type === 'black' ? 0.85 : 0.9);
    pianoPressVisual(char);
    return true;
  }
  return false;
}

canvas.addEventListener('pointerdown', (e) => {
  // unlock audio
  onPointerMove(e);
  initAudio();
});

canvas.addEventListener('click', (e) => {
  onPointerMove(e);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([room], true);
  if (!hits.length) return;

  // piano key direct (scan all hits so the body/stand doesn't steal the click)
  for (const h of hits) {
    if (clickToPiano(h)) return;
  }

  const rootObj = findClickableRoot(hits[0].object);
  if (!rootObj) return;

  // punch scale
  setSquishTargets(rootObj, 0.42);
  setTimeout(() => setSquishTargets(rootObj, rootObj === hovered ? 0.28 : 0), 90);

  runAction(rootObj.userData.id);
});

function updateHover() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactables, true);
  if (!hits.length) {
    setHover(null);
    return;
  }
  const rootObj = findClickableRoot(hits[0].object);
  setHover(rootObj);
}

function updateSprings(dt) {
  for (const obj of interactables) {
    const s = ensureSpring(obj);
    s.sx.step(dt);
    s.sy.step(dt);
    s.sz.step(dt);
    obj.scale.set(s.sx.x, s.sy.x, s.sz.x);
  }
}

// -------------------------
// Resize
// -------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// -------------------------
// Init
// -------------------------
async function init() {
  try {
    actions = await loadJSON('config/actions.json');
  } catch {
    actions = {};
  }

  buildPiano();
  await buildStonesAndPlants();
  await buildFurniture();
  await buildMonitorScreen();

  // add a grass patch near front-left (for composition)
  const grass = await loadGLB('assets/models/nature/grass_leafsLarge.glb');
  grass.position.set(-1.55, 0.05, 1.35);
  grass.rotation.y = 0.2;
  grass.scale.setScalar(0.55);
  setCastShadow(grass, true, true);
  tintModel(grass, { color: '#b9e7bb', roughness: 1.0 });
  root.add(grass);

  assetStatusEl.textContent = assetStatusEl.textContent.replace('loading…', 'Kenney GLB ✓');
}

await init();

// -------------------------
// Render loop
// -------------------------
let last = performance.now();
function tick(now) {
  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;

  controls.update();
  updateHover();
  updateSprings(dt);
  updatePianoPress(dt);
  updateMonitor(dt);

  // Chair idle sway (slow, subtle)
  if (chairRig) {
    const t = now * 0.00022;
    chairRig.position.x = chairBaseX + Math.sin(t) * 0.028;
    chairRig.rotation.y = chairBaseRot + Math.sin(t * 0.85) * 0.055;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
