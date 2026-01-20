import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';
import gsap from 'https://esm.sh/gsap@3.12.5';
import { Howl } from 'https://esm.sh/howler@2.2.4';

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
const modalClose = document.getElementById('modalClose');
const modalBackdrop = document.getElementById('modalBackdrop');
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

// ---------- Modal router (ABOUT / WORK / CONTACT)
// actions.json can map 3D objects to hash pages (#about, #my-work, #contact).
const modalPages = {
  'my-work': `
    <h2>My Work</h2>
    <p>Coming soon. Replace this content in <code>main.js</code> if you want fully custom pages.</p>
  `,
  about: `
    <h2>About</h2>
    <p>Coming soon.</p>
  `,
  contact: `
    <h2>Contact</h2>
    <p>Coming soon.</p>
  `
};

function closeModal() {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function openModal(key) {
  if (!modal || !modalContent) return;
  modalContent.innerHTML = modalPages[key] ?? `
    <h2>${key}</h2>
    <p>Coming soon.</p>
  `;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

modalClose?.addEventListener('click', closeModal, { passive: true });
modalBackdrop?.addEventListener('click', closeModal, { passive: true });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function handleAction(action) {
  if (!action) return;
  if (action.startsWith('#')) {
    openModal(action.slice(1));
    return;
  }
  if (actions.openInNewTab) window.open(action, '_blank', 'noopener,noreferrer');
  else window.location.href = action;
}


// ---------- core scene
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
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.9;
controls.enablePan = false;
// Keep the camera above the floor and avoid extreme tilts
controls.minPolarAngle = Math.PI * 0.15;
controls.maxPolarAngle = Math.PI * 0.55;
// Do NOT clamp azimuth (causes 'stuck' feeling)
controls.minAzimuthAngle = -Infinity;
controls.maxAzimuthAngle = Infinity;
// Touch gestures: 1 finger rotate, 2 finger pinch-to-zoom
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
if ('zoomToCursor' in controls) controls.zoomToCursor = true;

// Prevent the page from scrolling/zooming while interacting with the canvas.
renderer.domElement.style.touchAction = 'none';
renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
  },
  { passive: false }
);

controls.minDistance = cfg.controls.minDistance;
controls.maxDistance = cfg.controls.maxDistance;

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
// ---------- Audio (Howler)
// (Assets copied from source.zip into ./assets/audio/...)
const bgm = new Howl({
  src: [u('./assets/audio/music/cosmic_candy.ogg')],
  loop: true,
  volume: 0.6
});
const clickSfx = new Howl({
  src: [u('./assets/audio/sfx/click/bubble.ogg')],
  volume: 0.85
});
const pianoSamples = Array.from({ length: 24 }, (_, i) =>
  new Howl({ src: [u(`./assets/audio/sfx/piano/Key_${i + 1}.ogg`)], volume: 0.9 })
);

function playPiano(idx) {
  const s = pianoSamples[idx];
  if (!s) return;
  s.stop();
  s.play();
}

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  bgm.play();
}

// We only need a user gesture to unlock audio; the Enter button click qualifies.
enterBtn?.addEventListener('click', () => {
  if (enterRequested) return;
  enterRequested = true;
  enterStart = performance.now();
  unlockAudio();
});

// Fallback: if Enter was triggered some other way, the first pointerdown unlocks audio.
window.addEventListener('pointerdown', () => {
  if (enterRequested) unlockAudio();
}, { once: true, passive: true });

// ---------- Theme shader// ---------- Theme shader (ported from the original source, but without manual gamma)
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
const pianoCandidates = [];
const pianoKeyIndex = new Map();

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
    // Hide ONLY what was requested (avoid broad matches):
    const letterRe = /^Name_Letter_[1-8]_Third(?:_Raycaster_Hover)?$/;
    const isLetter = letterRe.test(name);
    const isLBoard = name === 'Name_Platform_Third';
    const isKirby = /\bKirby\b/i.test(name);

    if (isLetter || isLBoard || isKirby) {
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

    // Piano mapping: collect key meshes and assign samples later
    const k = name.match(/^([A-G])(#?)(\d)_Key_/);
    if (k) pianoCandidates.push(o);

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

// ---------- Window-frame decoration removal (blue 'D')
// The decoration is unnamed; we detect it by UVs on the Third texture set and location near the window.
function hideWindowFrameBlueD(rootScene) {
  if (!rootScene) return;
  const D_U = [0.834, 0.934];
  const D_V = [0.782, 0.878];
  const M = 0.004;

  function uvHitsD(geom) {
    const uv = geom?.attributes?.uv;
    if (!uv) return false;
    for (let i = 0; i < uv.count; i++) {
      const u0 = uv.getX(i);
      const v0 = uv.getY(i);
      if (u0 > D_U[0] - M && u0 < D_U[1] + M && v0 > D_V[0] - M && v0 < D_V[1] + M) return true;
    }
    return false;
  }

  const p = new THREE.Vector3();
  rootScene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.includes(roomMaterials.Third)) return;
    if (!uvHitsD(o.geometry)) return;
    o.getWorldPosition(p);
    // The window/letter cluster sits around z ~ -4.2 in this model.
    const nearWindow = p.z < -3.4 && p.z > -5.2 && p.y > 2.6 && p.y < 4.8;
    if (!nearWindow) return;
    o.visible = false;
  });
}

let root = null;let root = null;
try {
  const gltf = await gltfLoader.loadAsync(u('./assets/models/Room_Portfolio.glb'));
  root = gltf.scene;
  scene.add(root);
  applyMaterialsAndCollect(root);
  hideWindowFrameBlueD(root);
  initDynamicSurfaces(root);

  // Fit controls to scene bounds (prevents zoom/rotate clamping bugs)
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3()).length();
  const center = bounds.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  controls.minDistance = Math.max(1, size / 25);
  controls.maxDistance = Math.max(controls.minDistance + 1, size / 2);
  camera.near = size / 100;
  camera.far = size * 2;
  camera.updateProjectionMatrix();
  controls.update();

  // Piano sample mapping (left-to-right)
  const uniq = Array.from(new Set(pianoCandidates));
  const tmp = new THREE.Vector3();
  uniq.sort((a, b) => a.getWorldPosition(tmp).x - b.getWorldPosition(new THREE.Vector3()).x);
  uniq.slice(0, 24).forEach((o, idx) => pianoKeyIndex.set(o, idx));
  if (pianoKeyIndex.size && pianoKeyIndex.size !== 24) {
    console.warn('[piano] expected 24 keys, got', pianoKeyIndex.size);
  }
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

// ----- hover / press animation (GSAP)
function tweenScale(mesh, factor, { duration = 0.12, ease = 'power2.out' } = {}) {
  if (!mesh) return;
  stashInitialTransforms(mesh);
  const base = mesh.userData.initialScale;
  gsap.killTweensOf(mesh.scale);
  gsap.to(mesh.scale, {
    x: base.x * factor,
    y: base.y * factor,
    z: base.z * factor,
    duration,
    ease
  });
}

function setHovered(mesh, on) {
  if (!mesh) return;
  tweenScale(mesh, on ? 1.06 : 1.0);
}

function setPressed(mesh, on) {
  if (!mesh) return;
  if (pianoKeyIndex.has(mesh)) return; // piano keys are rotate-only
  if (!on) {
    // release to hover or base
    const isHover = mesh === currentHoveredObject;
    tweenScale(mesh, isHover ? 1.06 : 1.0, { duration: 0.14 });
    return;
  }
  stashInitialTransforms(mesh);
  const base = mesh.userData.initialScale;
  gsap.killTweensOf(mesh.scale);
  gsap.to(mesh.scale, {
    x: base.x * 1.06,
    z: base.z * 1.06,
    y: base.y * 0.92,
    duration: 0.08,
    ease: 'power2.out'
  });
}

function pressKey(keyMesh) {
  stashInitialTransforms(keyMesh);
  gsap.killTweensOf(keyMesh.rotation);
  gsap.to(keyMesh.rotation, {
    x: keyMesh.userData.initialRotation.x + Math.PI / 42,
    duration: 0.06,
    yoyo: true,
    repeat: 1,
    ease: 'power1.out'
  });
}

// ----- click/open actions
// ----- click/open actions
function openActionFromObject(object) {
  if (!object) return;
  const action = actions?.byName?.[object.name];
  handleAction(action);
}

function handleClickOnObject(object) {
  if (!object) return;

    // Piano keys: play sample + rotate only (no scale squash)
  if (pianoKeyIndex.has(object)) {
    playPiano(pianoKeyIndex.get(object));
    pressKey(object);
    return;
  }

  // Click sfx for other interactives
  clickSfx?.play?.();

  handleAction(actions?.byName?.[object.name]);
}

// Pointer events
canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);

  if (!enterRequested) return;
  computeIntersects();
  const hitbox = currentIntersects.length ? currentIntersects[0].object : null;
  const obj = hitbox ? (hitboxToObjectMap.get(hitbox) || hitbox.userData.originalObject || null) : null;

  if (hitbox !== currentHoveredHitbox) {
    if (currentHoveredObject) setHovered(currentHoveredObject, false);
    currentHoveredHitbox = hitbox;
    currentHoveredObject = obj;
    if (currentHoveredObject) setHovered(currentHoveredObject, true);
    updateCursor();
  }
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
  setPressed(obj, true);

  // prevent the first drag frame from rotating the camera when a button is pressed
  ev.stopPropagation?.();
});

canvas.addEventListener('pointerup', (ev) => {
  isDragging = false;
  updateCursor();

  if (!pressedHitbox || !pressedObject) return;

  const hitbox = pickHitbox();
  const obj = hitbox ? (hitboxToObjectMap.get(hitbox) || hitbox.userData.originalObject) : null;

  setPressed(pressedObject, false);

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
    setPressed(pressedObject, false);
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
