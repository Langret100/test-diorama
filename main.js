import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';

// ---------- helpers
const u = (p) => new URL(p, import.meta.url).toString();
async function loadJSON(path) {
  try {
    const res = await fetch(u(path), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------- DOM
const canvas = document.getElementById('c');
const overlay = document.getElementById('intro');
const enterBtn = document.getElementById('enterBtn');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

// ---------- config
const defaults = {
  camera: { fov: 35 },
  controls: {
    minDistance: 5,
    maxDistance: 45,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI / 2,
    minAzimuthAngle: 0,
    maxAzimuthAngle: Math.PI / 2
  },
  interaction: {
    hoverScale: 1.04,
    clickScaleXZ: 1.06,
    clickScaleY: 0.92,
    springK: 28,
    springD: 18
  },
  chairSway: {
    enabled: true,
    speed: 0.45,
    yaw: 0.05
  },
  overlay: {
    baseFadeMs: 900,
    extraFadeWhenLoadingMs: 2200
  }
};

const [sceneCfg, actionsCfg] = await Promise.all([
  loadJSON('./config/scene.json'),
  loadJSON('./config/actions.json')
]);

const cfg = {
  ...defaults,
  ...(sceneCfg ?? {}),
  camera: { ...defaults.camera, ...(sceneCfg?.camera ?? {}) },
  controls: { ...defaults.controls, ...(sceneCfg?.controls ?? {}) },
  interaction: { ...defaults.interaction, ...(sceneCfg?.interaction ?? {}) },
  chairSway: { ...defaults.chairSway, ...(sceneCfg?.chairSway ?? {}) },
  overlay: { ...defaults.overlay, ...(sceneCfg?.overlay ?? {}) }
};

const actions = actionsCfg ?? { openInNewTab: true, byName: {} };

// ---------- core scene
const scene = new THREE.Scene();
scene.background = new THREE.Color('#D9CAD1');
const camera = new THREE.PerspectiveCamera(
  cfg.camera.fov,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = cfg.controls.minDistance;
controls.maxDistance = cfg.controls.maxDistance;
controls.minPolarAngle = cfg.controls.minPolarAngle;
controls.maxPolarAngle = cfg.controls.maxPolarAngle;
controls.minAzimuthAngle = cfg.controls.minAzimuthAngle;
controls.maxAzimuthAngle = cfg.controls.maxAzimuthAngle;

function setStartCamera() {
  // Values taken from the original implementation (desktop vs mobile)
  if (window.innerWidth < 768) {
    camera.position.set(
      29.567116827654726,
      14.018476147584705,
      31.37040363900147
    );
    controls.target.set(
      -0.08206262548844094,
      3.3119233527087255,
      -0.7433922282864018
    );
  } else {
    camera.position.set(
      17.49173098423395,
      9.108969527553887,
      17.850992894238058
    );
    controls.target.set(
      0.4624746759408973,
      1.9719940043010387,
      -0.8300979125494505
    );
  }
  camera.lookAt(controls.target);
}
setStartCamera();
controls.update();

// ---------- loading manager (for overlay pacing)
let itemsTotal = 0;
let itemsLoaded = 0;
const manager = new THREE.LoadingManager();
manager.onStart = (_url, loaded, total) => {
  itemsLoaded = loaded;
  itemsTotal = total;
};
manager.onProgress = (_url, loaded, total) => {
  itemsLoaded = loaded;
  itemsTotal = total;
  if (enterBtn && loaded === total) enterBtn.textContent = 'Enter';
};
manager.onLoad = () => {
  itemsLoaded = itemsTotal;
  if (enterBtn) enterBtn.textContent = 'Enter';
};

// ---------- overlay
let enterRequested = false;
let enterStart = 0;
function overlayAlpha(now) {
  if (!enterRequested) return 1;
  if (reduceMotion) return 0;

  const base = cfg.overlay.baseFadeMs;
  const extra = cfg.overlay.extraFadeWhenLoadingMs;
  const progress = itemsTotal > 0 ? itemsLoaded / itemsTotal : 0;

  // If things are still loading, slow down the fade so the scene doesn't look "blank".
  const fadeMs = base + (1 - Math.min(1, Math.max(0, progress))) * extra;
  const t = (now - enterStart) / fadeMs;
  return Math.max(0, Math.min(1, 1 - t));
}

// ---------- audio (simple synth)
let audioCtx = null;
let master = null;
let filter = null;

function unlockAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  master = audioCtx.createGain();
  master.gain.value = 0.18;

  filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2200;
  filter.Q.value = 0.6;

  filter.connect(master);
  master.connect(audioCtx.destination);
}

function playTone(freq, duration = 0.55) {
  if (!audioCtx || !master || !filter) return;
  const t0 = audioCtx.currentTime;

  const o1 = audioCtx.createOscillator();
  o1.type = 'triangle';
  o1.frequency.setValueAtTime(freq, t0);

  const o2 = audioCtx.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(freq * 2, t0);

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0, t0);
  g.gain.linearRampToValueAtTime(0.35, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);

  o1.connect(g);
  o2.connect(g);
  g.connect(filter);

  o1.start(t0);
  o2.start(t0);
  o1.stop(t0 + duration + 0.02);
  o2.stop(t0 + duration + 0.02);
}

// ---------- media (dynamic images)
// We only need a user gesture to unlock audio (piano). Monitor uses rotating images.
function unlockMedia() {
  unlockAudio();
}

enterBtn?.addEventListener('click', () => {
  if (enterRequested) return;
  enterRequested = true;
  enterStart = performance.now();
  unlockMedia();
});

// ---------- Theme shader (ported from the original source, but without manual gamma)
const themeVertexShader = `
varying vec2 vUv;
void main(){
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectionPosition = projectionMatrix * viewPosition;
  gl_Position = projectionPosition;
  vUv = uv;
}
`;

const themeFragmentShader = `
uniform sampler2D uDayTexture1;
uniform sampler2D uNightTexture1;
uniform sampler2D uDayTexture2;
uniform sampler2D uNightTexture2;
uniform sampler2D uDayTexture3;
uniform sampler2D uNightTexture3;
uniform sampler2D uDayTexture4;
uniform sampler2D uNightTexture4;
uniform float uMixRatio;
uniform int uTextureSet;

varying vec2 vUv;

void main(){
  vec3 dayColor;
  vec3 nightColor;

  if(uTextureSet == 1){
    dayColor = texture2D(uDayTexture1, vUv).rgb;
    nightColor = texture2D(uNightTexture1, vUv).rgb;
  } else if(uTextureSet == 2){
    dayColor = texture2D(uDayTexture2, vUv).rgb;
    nightColor = texture2D(uNightTexture2, vUv).rgb;
  } else if(uTextureSet == 3){
    dayColor = texture2D(uDayTexture3, vUv).rgb;
    nightColor = texture2D(uNightTexture3, vUv).rgb;
  } else {
    dayColor = texture2D(uDayTexture4, vUv).rgb;
    nightColor = texture2D(uNightTexture4, vUv).rgb;
  }

  vec3 finalColor = mix(dayColor, nightColor, uMixRatio);

  // Match the original project: manual gamma correction for this ShaderMaterial
  finalColor = pow(finalColor, vec3(1.0/2.2));
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ---------- Textures
const texLoader = new THREE.TextureLoader(manager);

const textureMap = {
  First: {
    day: texLoader.load(u('./assets/textures/room/day/first_texture_set_day.webp')),
    night: texLoader.load(u('./assets/textures/room/night/first_texture_set_night.webp'))
  },
  Second: {
    day: texLoader.load(u('./assets/textures/room/day/second_texture_set_day.webp')),
    night: texLoader.load(u('./assets/textures/room/night/second_texture_set_night.webp'))
  },
  Third: {
    day: texLoader.load(u('./assets/textures/room/day/third_texture_set_day.webp')),
    night: texLoader.load(u('./assets/textures/room/night/third_texture_set_night.webp'))
  },
  Fourth: {
    day: texLoader.load(u('./assets/textures/room/day/fourth_texture_set_day.webp')),
    night: texLoader.load(u('./assets/textures/room/night/fourth_texture_set_night.webp'))
  }
};

for (const v of Object.values(textureMap)) {
  for (const t of Object.values(v)) {
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
  }
}

// Environment map for glass
const envPath = u('./assets/textures/skybox/');
const environmentMap = new THREE.CubeTextureLoader(manager)
  .setPath(envPath)
  .load(['px.webp', 'nx.webp', 'py.webp', 'ny.webp', 'pz.webp', 'nz.webp']);
environmentMap.colorSpace = THREE.SRGBColorSpace;

function createMaterialForTextureSet(textureSet) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDayTexture1: { value: textureMap.First.day },
      uNightTexture1: { value: textureMap.First.night },
      uDayTexture2: { value: textureMap.Second.day },
      uNightTexture2: { value: textureMap.Second.night },
      uDayTexture3: { value: textureMap.Third.day },
      uNightTexture3: { value: textureMap.Third.night },
      uDayTexture4: { value: textureMap.Fourth.day },
      uNightTexture4: { value: textureMap.Fourth.night },
      uMixRatio: { value: 0.0 },
      uTextureSet: { value: textureSet }
    },
    vertexShader: themeVertexShader,
    fragmentShader: themeFragmentShader
  });
}

const roomMaterials = {
  First: createMaterialForTextureSet(1),
  Second: createMaterialForTextureSet(2),
  Third: createMaterialForTextureSet(3),
  Fourth: createMaterialForTextureSet(4)
};

// Reuseable materials
const waterMaterial = new THREE.MeshBasicMaterial({
  color: 0x558bc8,
  transparent: true,
  opacity: 0.4,
  depthWrite: false
});

const glassMaterial = new THREE.MeshPhysicalMaterial({
  transmission: 1,
  opacity: 1,
  color: 0xfbfbfb,
  metalness: 0,
  roughness: 0,
  ior: 3,
  thickness: 0.01,
  specularIntensity: 1,
  envMap: environmentMap,
  envMapIntensity: 1,
  depthWrite: false,
  specularColor: 0xfbfbfb
});

const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

// ---------- Dynamic images (monitor / frames / poster)
const dynamicTexturePaths = {
  monitor: [
    u('./assets/monitor/monitor1.png'),
    u('./assets/monitor/monitor2.png'),
    u('./assets/monitor/monitor3.png')
  ],
  frames: [
    u('./assets/dynamic/frame_1.png'),
    u('./assets/dynamic/frame_2.png'),
    u('./assets/dynamic/frame_3.png')
  ],
  posters: [
    u('./assets/dynamic/poster_1.png'),
    u('./assets/dynamic/poster_2.png'),
    u('./assets/dynamic/poster_3.png')
  ]
};

function loadDynamicTextures(paths) {
  return paths.map((p) => {
    const t = texLoader.load(p);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  });
}

const dynamicTextures = {
  monitor: loadDynamicTextures(dynamicTexturePaths.monitor),
  frames: loadDynamicTextures(dynamicTexturePaths.frames),
  posters: loadDynamicTextures(dynamicTexturePaths.posters)
};

function makeDynamicMaterial(map, { opacity = 1.0 } = {}) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: opacity < 1.0,
    opacity,
    toneMapped: false
  });
}

const screenMaterial = makeDynamicMaterial(dynamicTextures.monitor[0], { opacity: 0.92 });

// ---------- Load model
const gltfLoader = new GLTFLoader(manager);
const draco = new DRACOLoader(manager);
// Local decoder (copied from source)
draco.setDecoderPath(u('./assets/draco/'));
draco.setDecoderConfig?.({ type: 'js' });
gltfLoader.setDRACOLoader(draco);

let chairTop = null;
let screenMesh = null;
let frame1Mesh = null;
let frame2Mesh = null;
let frame3Mesh = null;
let posterMesh = null;
const piano = new Map();

// ---------- Raycaster / interaction shared state
// Declared early so model traversal can register hitboxes.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(999, 999);
const raycasterObjects = [];
const hitboxToObjectMap = new Map();
const interactiveObjects = new Set();
let currentIntersects = [];
let currentHoveredHitbox = null;
let currentHoveredObject = null;
let pressedHitbox = null;
let pressedObject = null;
let isDragging = false;

function applyMaterialsAndCollect(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;

    const name = o.name || '';
    const lower = name.toLowerCase();
    // Hide ONLY what was requested:
    // - Alphabet models on the window frame (Name_Letter_1..8)
    // - The board with an 'L' (Name_Platform_Third)
    // Include their hover/raycaster variants if present.
    const isLetter = /^name_letter_[1-8](?:$|_)/i.test(name);
    const isLetterRay = /^name_letter_[1-8].*(raycaster|hover)/i.test(lower);
    const isLBoard = lower === 'name_platform_third' || lower.includes('name_platform_third');
    const isKirby = lower.includes('kirby');

    if (isLetter || isLetterRay || isLBoard || isKirby) {
      o.visible = false;
      return;
    }

    if (lower.includes('water')) {
      o.material = waterMaterial;
    } else if (lower.includes('glass')) {
      o.material = glassMaterial;
    } else if (lower.includes('bubble')) {
      o.material = whiteMaterial;
    } else if (lower === 'screen' || lower.endsWith('_screen')) {
      o.material = screenMaterial;
      if (!screenMesh) screenMesh = o;
    } else if (name.includes('First')) {
      o.material = roomMaterials.First;
    } else if (name.includes('Second')) {
      o.material = roomMaterials.Second;
    } else if (name.includes('Third')) {
      o.material = roomMaterials.Third;
    } else if (name.includes('Fourth')) {
      o.material = roomMaterials.Fourth;
    }

    if (!chairTop && lower.includes('chair_top')) chairTop = o;

    // Surface refs for dynamic textures
    if ((lower === 'screen' || lower.endsWith('_screen')) && !screenMesh) screenMesh = o;
    if (name.startsWith('Frame_1_') && !frame1Mesh) frame1Mesh = o;
    if (name.startsWith('Frame_2_') && !frame2Mesh) frame2Mesh = o;
    if (name.startsWith('Frame_3_') && !frame3Mesh) frame3Mesh = o;

    // Register interactive objects (sample-style: raycaster + invisible hitbox)
    if (name.includes('Raycaster') && o.visible !== false) {
      // Some GLBs author intro-animated objects at scale 0. Force a usable base scale
      // so buttons/labels don't disappear.
      if (o.scale.x === 0 || o.scale.y === 0 || o.scale.z === 0) o.scale.set(1, 1, 1);
      registerInteractive(o);
    }

    // Piano mapping (works with *_Key_Pointer_Raycaster_Third names)
    const m = name.match(/^([A-G])(#?)(\d)_Key_/);
    if (m) {
      const note = m[1] + (m[2] ? '#' : '');
      const octave = parseInt(m[3], 10);
      const idx = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 }[note];
      if (Number.isFinite(idx)) {
        const midi = (octave + 1) * 12 + idx;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        piano.set(o, freq);
      }
    }
  });
}


// ---------- Dynamic surface setup (monitor / frames / poster)
const rotators = [];

function pickRandomIndex(len, avoid = -1) {
  if (len <= 1) return 0;
  let i = Math.floor(Math.random() * len);
  if (i === avoid) i = (i + 1) % len;
  return i;
}

function addRotator(mesh, textures, { opacity = 1.0, intervalMs = 4000 } = {}) {
  if (!mesh || !textures || !textures.length) return;
  const initial = pickRandomIndex(textures.length);
  mesh.material = makeDynamicMaterial(textures[initial], { opacity });
  rotators.push({ mesh, textures, idx: initial, nextMs: performance.now() + intervalMs, intervalMs });
}

function findPosterCandidate(sceneRoot) {
  // The poster mesh in this model is not named (it's a generic Plane.*). We pick the best "thin vertical" mesh.
  let best = null;
  let bestArea = -1;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const box = new THREE.Box3();

  sceneRoot.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const n = (o.name || '').toLowerCase();
    // Skip known meshes/surfaces
    if (n.includes('screen') || n.includes('frame_') || n.includes('water') || n.includes('glass') || n.includes('bubble')) return;
    if (n.includes('name_letter') || n.includes('name_platform')) return;

    box.setFromObject(o);
    box.getSize(size);
    box.getCenter(center);

    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
    const thickness = dims[0];
    const w = dims[1];
    const h = dims[2];
    const area = w * h;

    // Poster heuristics: thin, medium area, above the floor, and taller than wide
    if (thickness > 0.08) return;
    if (area < 0.25 || area > 1.6) return;
    if (center.y < 2.0) return;
    if (h / Math.max(w, 1e-6) < 1.2) return;

    if (area > bestArea) {
      bestArea = area;
      best = o;
    }
  });

  return best;
}

function initDynamicSurfaces(rootScene) {
  // Monitor
  addRotator(screenMesh, dynamicTextures.monitor, { opacity: 0.92, intervalMs: 4000 });

  // Frames (if found)
  addRotator(frame1Mesh, dynamicTextures.frames, { opacity: 1.0, intervalMs: 4000 });
  addRotator(frame2Mesh, dynamicTextures.frames, { opacity: 1.0, intervalMs: 4000 });
  addRotator(frame3Mesh, dynamicTextures.frames, { opacity: 1.0, intervalMs: 4000 });

  // Poster (auto-detected)
  if (!posterMesh && rootScene) posterMesh = findPosterCandidate(rootScene);
  addRotator(posterMesh, dynamicTextures.posters, { opacity: 1.0, intervalMs: 4000 });
}

function updateRotators(nowMs) {
  // Run only after Enter (keeps scene deterministic before the user interacts)
  if (!enterRequested) return;
  for (const r of rotators) {
    if (nowMs < r.nextMs) continue;
    const nextIdx = pickRandomIndex(r.textures.length, r.idx);
    r.idx = nextIdx;
    r.mesh.material.map = r.textures[nextIdx];
    r.mesh.material.needsUpdate = true;
    r.nextMs = nowMs + r.intervalMs;
  }
}

// ---------- Window-frame decoration removal
// The 'square decoration on the window frame' is unnamed in this GLB, so we pick a candidate by
// bounding-box heuristics near the window/letters region and hide it.
let windowFrameDeco = null;
function hideWindowFrameDeco(rootScene) {
  if (!rootScene) return;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  let best = null;
  let bestScore = -1;

  rootScene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const name = o.name || '';
    const lower = name.toLowerCase();

    // Skip known surfaces
    if (lower.includes('screen') || lower.includes('frame_') || lower.includes('glass') || lower.includes('water')) return;
    if (lower.includes('kirby') || lower.includes('name_letter') || lower.includes('name_platform')) return;

    box.setFromObject(o);
    box.getSize(size);
    box.getCenter(center);

    const vol = size.x * size.y * size.z;
    if (vol < 1e-6 || vol > 0.25) return;

    // Window/letter cluster sits around z ~ -4.2 in this model.
    if (center.z > -3.4) return;
    if (center.z < -5.2) return;
    if (center.y < 2.6 || center.y > 4.8) return;

    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
    const thickness = dims[0];
    const maxdim = dims[2];
    if (thickness > 0.12) return;
    if (maxdim < 0.12 || maxdim > 1.4) return;

    // Prefer things closest to the letters area and very 'plaque-like' (thin)
    const score = (0.12 - thickness) * 6 + (-center.z) * 0.5 + center.y * 0.2 + maxdim * 0.2 - vol;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  });

  if (best) {
    windowFrameDeco = best;
    best.visible = false;
    console.info('[auto-hide] window-frame deco:', best.name || '<unnamed>', best.uuid);
  }
}

let root = null;
try {
  const gltf = await gltfLoader.loadAsync(u('./assets/models/Room_Portfolio.glb'));
  root = gltf.scene;
  scene.add(root);
  applyMaterialsAndCollect(root);
  hideWindowFrameDeco(root);
  initDynamicSurfaces(root);
} catch (e) {
  console.error(e);
  if (enterBtn) enterBtn.textContent = 'Enter';
}

// ---------- Interactions (hover + click)
// Match the original behavior: raycaster hits an *invisible hitbox* and we animate the visible mesh.
// (Shared state is declared above, before model loading.)

function shouldUseOriginalMesh(name='') {
  return ['Bulb', 'Cactus', 'Kirby'].some((k) => name.includes(k));
}

function stashInitialTransforms(obj) {
  if (!obj.userData.initialScale) obj.userData.initialScale = obj.scale.clone();
  if (!obj.userData.initialPosition) obj.userData.initialPosition = obj.position.clone();
  if (!obj.userData.initialRotation) obj.userData.initialRotation = obj.rotation.clone();
}

function createStaticHitbox(originalObject) {
  // Use the original mesh itself for some tiny objects (matches sample behavior)
  if (shouldUseOriginalMesh(originalObject.name || '')) {
    stashInitialTransforms(originalObject);
    return originalObject;
  }

  stashInitialTransforms(originalObject);

  // Ensure bbox calc works even if scale was authored as zero
  const curScale = originalObject.scale.clone();
  const hasZeroScale = curScale.x === 0 || curScale.y === 0 || curScale.z === 0;
  if (hasZeroScale) originalObject.scale.set(1, 1, 1);

  const box = new THREE.Box3().setFromObject(originalObject);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  if (hasZeroScale) originalObject.scale.copy(curScale);

  // Slightly generous hitbox so hovering feels forgiving
  const sizeMultiplier = { x: 1.1, y: 1.75, z: 1.1 };
  const geom = new THREE.BoxGeometry(
    Math.max(0.001, size.x * sizeMultiplier.x),
    Math.max(0.001, size.y * sizeMultiplier.y),
    Math.max(0.001, size.z * sizeMultiplier.z)
  );

  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, visible: false });
  const hitbox = new THREE.Mesh(geom, mat);
  hitbox.position.copy(center);
  hitbox.name = (originalObject.name || 'Object') + '_Hitbox';
  hitbox.userData.originalObject = originalObject;

  // Special-case: headphones are rotated in the model so a rotated hitbox feels better
  if ((originalObject.name || '').includes('Headphones')) {
    hitbox.rotation.y = Math.PI / 4;
  }

  return hitbox;
}

function registerInteractive(originalObject) {
  const hitbox = createStaticHitbox(originalObject);
  if (hitbox !== originalObject) scene.add(hitbox);
  raycasterObjects.push(hitbox);
  hitboxToObjectMap.set(hitbox, originalObject);
  interactiveObjects.add(originalObject);
}

function updateCursor() {
  if (!enterRequested) {
    document.body.style.cursor = 'default';
    return;
  }
  if (isDragging) {
    document.body.style.cursor = 'grabbing';
    return;
  }
  if (currentHoveredHitbox) {
    document.body.style.cursor = 'pointer';
    return;
  }
  document.body.style.cursor = 'default';
}

function computeIntersects() {
  if (!raycasterObjects.length) {
    currentIntersects = [];
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  currentIntersects = raycaster.intersectObjects(raycasterObjects, false);
}

// ----- hover / press animation targets
const springs = new Map(); // object -> spring state

function makeSpring(mesh) {
  stashInitialTransforms(mesh);
  const base = mesh.userData.initialScale.clone();
  return { mesh, base, target: base.clone(), current: mesh.scale.clone(), vel: new THREE.Vector3() };
}

function setScaleTarget(mesh, target) {
  let s = springs.get(mesh);
  if (!s) {
    s = makeSpring(mesh);
    springs.set(mesh, s);
  }
  s.target.copy(target);
}

function setHoverState(object, isHovering) {
  if (!object) return;
  stashInitialTransforms(object);

  let scale = 1.4;
  const name = object.name || '';

  if (name.includes('Fish')) scale = 1.2;

  const base = object.userData.initialScale;
  const tgt = base.clone().multiplyScalar(isHovering ? scale : 1.0);
  setScaleTarget(object, tgt);

  // Rotation + position accents (as in sample)
  object.userData._hoverRotXTarget = object.userData.initialRotation.x;
  object.userData._hoverPosYTarget = object.userData.initialPosition.y;

  if (isHovering) {
    if (name.includes('About_Button')) {
      object.userData._hoverRotXTarget = object.userData.initialRotation.x - Math.PI / 10;
    } else if (
      name.includes('Contact_Button') ||
      name.includes('My_Work_Button') ||
      name.includes('GitHub') ||
      name.includes('YouTube') ||
      name.includes('Twitter')
    ) {
      object.userData._hoverRotXTarget = object.userData.initialRotation.x + Math.PI / 10;
    }

    if (name.includes('Boba') || name.includes('Name_Letter')) {
      object.userData._hoverPosYTarget = object.userData.initialPosition.y + 0.2;
    }
  }
}

function setPressState(object, isPressing) {
  if (!object) return;
  stashInitialTransforms(object);
  const base = object.userData.initialScale;
  if (isPressing) {
    const t = base.clone();
    t.x *= cfg.interaction.clickScaleXZ;
    t.z *= cfg.interaction.clickScaleXZ;
    t.y *= cfg.interaction.clickScaleY;
    setScaleTarget(object, t);
  } else {
    // return to hover target if hovered, else base
    const on = object === currentHoveredObject;
    const scale = on ? 1.4 : 1.0;
    setScaleTarget(object, base.clone().multiplyScalar(scale));
  }
}

function pickHitbox() {
  computeIntersects();
  return currentIntersects.length ? currentIntersects[0].object : null;
}

// ----- click/open actions
function openActionFromObject(object) {
  if (!object) return;
  const url = actions?.byName?.[object.name];
  if (!url) return;

  if (url.startsWith('#')) {
    openModal(modalPages[url] ?? `<h2>${url.replace('#','')}</h2><p>Coming soon</p>`);
    return;
  }

  if (actions.openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.href = url;
}

function handleClickOnObject(object) {
  if (!object) return;

  // Piano: play tone and do a quick key-press tilt
  if (piano.has(object)) {
    playTone(piano.get(object), 0.55);
    stashInitialTransforms(object);
    object.rotation.x = object.userData.initialRotation.x + Math.PI / 42;
    // snap back via target
    object.userData._keyReturnAt = performance.now() + 220;
  }

  openActionFromObject(object);
}

// Pointer events
canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
});

canvas.addEventListener('pointerdown', (ev) => {
  if (!enterRequested) return;
  isDragging = true;
  updateCursor();

  const hitbox = pickHitbox();
  if (!hitbox) return;
  const obj = hitboxToObjectMap.get(hitbox) || hitbox.userData.originalObject || null;
  if (!obj) return;

  pressedHitbox = hitbox;
  pressedObject = obj;
  setPressState(obj, true);

  // prevent the first drag frame from rotating the camera when a button is pressed
  ev.stopPropagation?.();
});

canvas.addEventListener('pointerup', (ev) => {
  isDragging = false;
  updateCursor();

  if (!pressedHitbox || !pressedObject) return;

  const hitbox = pickHitbox();
  const obj = hitbox ? (hitboxToObjectMap.get(hitbox) || hitbox.userData.originalObject) : null;

  setPressState(pressedObject, false);

  if (obj === pressedObject) {
    handleClickOnObject(pressedObject);
  }

  pressedHitbox = null;
  pressedObject = null;
  ev.stopPropagation?.();
});

canvas.addEventListener('pointerleave', () => {
  isDragging = false;
  if (pressedObject) {
    setPressState(pressedObject, false);
    pressedObject = null;
    pressedHitbox = null;
  }
  currentHoveredHitbox = null;
  currentHoveredObject = null;
  updateCursor();
});

// Simple debug helper: Alt+Click prints mesh name + bbox for the hovered object
canvas.addEventListener('click', (ev) => {
  if (!ev.altKey) return;
  const hitbox = pickHitbox();
  if (!hitbox) return;
  const obj = hitboxToObjectMap.get(hitbox) || hitbox.userData.originalObject || hitbox;
  try {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    console.info('[ALT+Click] object:', obj.name, { size: size.toArray(), center: center.toArray() });
  } catch {}
});

// ---------- Animation loop
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // Overlay dissolve
  const a = overlayAlpha(now);
  overlay.style.opacity = String(a);
  overlay.style.pointerEvents = a < 0.02 ? 'none' : 'auto';
  if (a < 0.01) overlay.classList.add('hidden');

  // Raycaster hover (hitbox -> visible mesh)
  if (enterRequested) {
    computeIntersects();
    const hitbox = currentIntersects.length ? currentIntersects[0].object : null;
    const obj = hitbox ? (hitboxToObjectMap.get(hitbox) || hitbox.userData.originalObject || null) : null;

    if (hitbox !== currentHoveredHitbox) {
      if (currentHoveredObject) setHoverState(currentHoveredObject, false);
      currentHoveredHitbox = hitbox;
      currentHoveredObject = obj;
      if (currentHoveredObject) setHoverState(currentHoveredObject, true);
      updateCursor();
    }

    // Dampen rotation/position toward hover targets (sample-like)
    if (!reduceMotion) {
      for (const o of interactiveObjects) {
        if (!o || !o.userData) continue;
        if (!o.userData.initialRotation || !o.userData.initialPosition) stashInitialTransforms(o);
        const targetRotX = o.userData._hoverRotXTarget ?? o.userData.initialRotation.x;
        const targetPosY = o.userData._hoverPosYTarget ?? o.userData.initialPosition.y;
        o.rotation.x = THREE.MathUtils.damp(o.rotation.x, targetRotX, 12, dt);
        o.position.y = THREE.MathUtils.damp(o.position.y, targetPosY, 12, dt);

        if (o.userData._keyReturnAt && now >= o.userData._keyReturnAt) {
          o.rotation.x = THREE.MathUtils.damp(o.rotation.x, o.userData.initialRotation.x, 18, dt);
          if (Math.abs(o.rotation.x - o.userData.initialRotation.x) < 5e-4) delete o.userData._keyReturnAt;
        }
      }
    }
  }

  // Dynamic surfaces (monitor / frames / poster)
  updateRotators(now);

  // Chair rotate animation (sample behavior)
  if (chairTop && cfg.chairSway.enabled && !reduceMotion) {
    stashInitialTransforms(chairTop);
    const time = now * 0.001;
    const baseAmplitude = Math.PI / 8;

    const rotationOffset =
      baseAmplitude *
      Math.sin(time * 0.5) *
      (1 - Math.abs(Math.sin(time * 0.5)) * 0.3);

    chairTop.rotation.y = chairTop.userData.initialRotation.y + rotationOffset;
  }

  // Springs
  for (const s of springs.values()) {
    const k = cfg.interaction.springK;
    const d = cfg.interaction.springD;
    s.vel.addScaledVector(s.target.clone().sub(s.current), k * dt);
    s.vel.multiplyScalar(Math.exp(-d * dt));
    s.current.addScaledVector(s.vel, dt);
    s.mesh.scale.copy(s.current);
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- Resize
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // If breakpoint changed, re-apply the known-good framing.
  setStartCamera();
  controls.update();
});
