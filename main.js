import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';
import gsap from 'https://esm.sh/gsap@3.12.5';
import { Howl, Howler } from 'https://esm.sh/howler@2.2.4';

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

// ---------- minimal modal (ABOUT / WORK / CONTACT)
// The original project uses HTML modals driven by GSAP.
// Our static build keeps a minimal version but MUST expose a safe `openModal()`.
const modalEl = document.getElementById('modal');
const modalContentEl = document.getElementById('modalContent');

function closeModal() {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
  modalEl.setAttribute('aria-hidden', 'true');
}

function openModal(html) {
  if (!modalEl || !modalContentEl) return;
  modalContentEl.innerHTML = html;
  modalEl.classList.remove('hidden');
  modalEl.setAttribute('aria-hidden', 'false');
}

// Simple page content for the 3D sign buttons. Replace these later if you want.
const modalPages = {
  '#my-work': `
    <h2>My Work</h2>
    <p>Coming soon. (Replace this content in <code>main.js</code> or wire a full modal like the original source.)</p>
  `,
  '#about': `
    <h2>About</h2>
    <p>Coming soon.</p>
  `,
  '#contact': `
    <h2>Contact</h2>
    <p>Coming soon.</p>
  `
};

// Click/tap anywhere to close (mobile-friendly)
modalEl?.addEventListener('click', () => closeModal(), { passive: true });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'Enter' && !enterRequested) {
    // Allow keyboard-only users to start
    enterBtn?.click();
  }
});

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
// Make zoom/rotate feel natural across mouse, trackpads, and touch.
controls.rotateSpeed = window.innerWidth < 768 ? 0.7 : 0.85;
controls.zoomSpeed = window.innerWidth < 768 ? 0.85 : 0.95;
// On desktop, zooming toward the cursor feels more intuitive.
if ('zoomToCursor' in controls) controls.zoomToCursor = window.innerWidth >= 768;
// Touch gestures: 1 finger rotate, 2 finger pinch-to-zoom.
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

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

// ---------- audio (Howler: sampled piano + bgm)
let audioUnlocked = false;

const bgm = new Howl({
  src: ['assets/audio/music/cosmic_candy.ogg'],
  loop: true,
  volume: 0.6,
  preload: true
});

const clickSfx = new Howl({
  src: ['assets/audio/sfx/click/bubble.ogg'],
  volume: 0.5,
  preload: true
});

const pianoSamples = Array.from({ length: 24 }, (_, i) =>
  new Howl({ src: [`assets/audio/sfx/piano/Key_${i + 1}.ogg`], volume: 0.9, preload: true })
);

const pianoKeyMap = {
  C1_Key: 'Key_24',
  'C#1_Key': 'Key_23',
  D1_Key: 'Key_22',
  'D#1_Key': 'Key_21',
  E1_Key: 'Key_20',
  F1_Key: 'Key_19',
  'F#1_Key': 'Key_18',
  G1_Key: 'Key_17',
  'G#1_Key': 'Key_16',
  A1_Key: 'Key_15',
  'A#1_Key': 'Key_14',
  B1_Key: 'Key_13',
  C2_Key: 'Key_12',
  'C#2_Key': 'Key_11',
  D2_Key: 'Key_10',
  'D#2_Key': 'Key_9',
  E2_Key: 'Key_8',
  F2_Key: 'Key_7',
  'F#2_Key': 'Key_6',
  G2_Key: 'Key_5',
  'G#2_Key': 'Key_4',
  A2_Key: 'Key_3',
  'A#2_Key': 'Key_2',
  B2_Key: 'Key_1'
};

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try { Howler.autoUnlock = true; } catch {}
  try { Howler.ctx?.resume?.(); } catch {}
}


function playPianoByKeyName(keyName) {
  const soundKey = pianoKeyMap[keyName];
  if (!soundKey) return;
  const n = parseInt(soundKey.split('_')[1], 10);
  if (!Number.isFinite(n)) return;
  const idx = Math.max(0, Math.min(23, n - 1));
  const s = pianoSamples[idx];
  if (!s) return;
  s.stop();
  s.play();
}

// ---------- media (dynamic images)
enterBtn?.addEventListener('click', () => {
  if (enterRequested) return;
  enterRequested = true;
  enterStart = performance.now();
  unlockAudio();
  // Autoplay policies: start music only after a user gesture (Enter).
  try { bgm.play(); } catch {}
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
uniform sampler2D uDayTexture2;
uniform sampler2D uDayTexture3;
uniform sampler2D uDayTexture4;
uniform int uTextureSet;

varying vec2 vUv;

void main(){
  vec3 dayColor;

  if(uTextureSet == 1){
    dayColor = texture2D(uDayTexture1, vUv).rgb;
  } else if(uTextureSet == 2){
    dayColor = texture2D(uDayTexture2, vUv).rgb;
  } else if(uTextureSet == 3){
    dayColor = texture2D(uDayTexture3, vUv).rgb;
  } else {
    dayColor = texture2D(uDayTexture4, vUv).rgb;
  }

  vec3 finalColor = dayColor;

  // Match the original project: manual gamma correction for this ShaderMaterial
  finalColor = pow(finalColor, vec3(1.0/2.2));
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ---------- Textures
const texLoader = new THREE.TextureLoader(manager);

const textureMap = {
  First: {
    day: texLoader.load(u('./assets/textures/room/day/first_texture_set_day.webp'))
  },
  Second: {
    day: texLoader.load(u('./assets/textures/room/day/second_texture_set_day.webp'))
  },
  Third: {
    day: texLoader.load(u('./assets/textures/room/day/third_texture_set_day.webp'))
  },
  Fourth: {
    day: texLoader.load(u('./assets/textures/room/day/fourth_texture_set_day.webp'))
  }
};

for (const { day: t } of Object.values(textureMap)) {
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
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
      uDayTexture2: { value: textureMap.Second.day },
      uDayTexture3: { value: textureMap.Third.day },
      uDayTexture4: { value: textureMap.Fourth.day },
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
const pianoKeyNameByMesh = new Map();

// ---------- Raycaster / interaction shared state
// Declared early so model traversal can register hitboxes.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(999, 999);
const raycasterObjects = [];
const hitboxToObjectMap = new Map();
const interactiveObjects = new Set();

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
    // Skip removed items so they don't leave invisible hitboxes behind.
    if (name.includes('Raycaster') && (name.includes('Kirby') || name.includes('Name_Platform'))) {
      o.visible = false;
      return;
    }
    if (name.includes('Raycaster') && o.visible !== false) {
      // Some GLBs author intro-animated objects at scale 0. Force a usable base scale
      // so buttons/labels don't disappear.
      if (o.scale.x === 0 || o.scale.y === 0 || o.scale.z === 0) o.scale.set(1, 1, 1);
      registerInteractive(o);
    }
    // Piano key mapping (sample-based)
    const km = name.match(/^([A-G])(#?)([12])_Key/);
    if (km) {
      const keyName = `${km[1]}${km[2] ? '#' : ''}${km[3]}_Key`;
      pianoKeyNameByMesh.set(o, keyName);
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
  // The poster in this GLB is often a generic Plane.*.
  // We pick the best thin vertical mesh near the window wall.
  let best = null;
  let bestScore = -1;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const box = new THREE.Box3();

  sceneRoot.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const n = (o.name || '').toLowerCase();
    // Skip known meshes/surfaces
    if (n.includes('screen') || n.includes('frame_') || n.includes('water') || n.includes('glass') || n.includes('bubble')) return;
    if (n.includes('name_letter') || n.includes('name_platform') || n.includes('kirby')) return;

    box.setFromObject(o);
    box.getSize(size);
    box.getCenter(center);

    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
    const thickness = dims[0];
    const w = dims[1];
    const h = dims[2];
    const area = w * h;

    // Poster heuristics: thin, vertical, on the wall near the window
    if (thickness > 0.20) return;
    if (area < 0.08 || area > 3.0) return;
    if (center.y < 1.6) return;
    if (center.z > -2.8 || center.z < -5.6) return;
    if (h / Math.max(w, 1e-6) < 1.05) return;

    // Prefer the right-side wall region (window side)
    let score = area;
    if (center.x >= 1.6 && center.x <= 3.4) score += 0.75;
    score += (0.20 - thickness) * 2.0;
    score += (h / Math.max(w, 1e-6)) * 0.2;

    if (score > bestScore) {
      bestScore = score;
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
// ---------- Window-frame decoration removal
// Remove small square/plaques sitting on the LOWER window sill (unnamed in this GLB).
function hideLowerWindowSillDecos(rootScene) {
  if (!rootScene) return;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  let hidden = 0;

  rootScene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const lower = (o.name || '').toLowerCase();

    // Skip known surfaces
    if (lower.includes('screen') || lower.includes('frame_') || lower.includes('glass') || lower.includes('water')) return;
    if (lower.includes('kirby') || lower.includes('name_letter') || lower.includes('name_platform')) return;

    box.setFromObject(o);
    box.getSize(size);
    box.getCenter(center);

    const vol = size.x * size.y * size.z;
    if (vol < 1e-6 || vol > 0.18) return;

    // Window cluster z ~ -4.2. Lower sill is a bit lower than the letters.
    if (center.z > -3.5 || center.z < -5.3) return;
    if (center.y < 1.75 || center.y > 3.35) return;

    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
    const thickness = dims[0];
    const mid = dims[1];
    const maxdim = dims[2];

    // Plaque-like: thin, small, and roughly square-ish
    if (thickness > 0.18) return;
    if (maxdim < 0.08 || maxdim > 0.75) return;
    const ratio = maxdim / Math.max(mid, 1e-6);
    if (ratio > 1.6) return;

    // Slightly favor right side (window side), but don't require it
    if (center.x < -1.2 || center.x > 4.2) return;

    o.visible = false;
    hidden++;
  });

  if (hidden) console.info('[auto-hide] lower window sill deco count:', hidden);
}

function hideKirbyAndNamePlatform(rootScene) {
  if (!rootScene) return;
  rootScene.traverse((o) => {
    const name = o.name || '';
    if (name.includes('Kirby')) o.visible = false;
    if (name.includes('Name_Platform')) o.visible = false;
  });


// --- Window sill anchor + doll relocation (monitor-side dolls -> window frame)
function getWindowSillAnchor(rootScene) {
  // Prefer Name_Letter_* nodes (even if hidden) to locate the window frame.
  const positions = [];
  let maxY = -Infinity;
  rootScene.traverse((o) => {
    const n = o.name || '';
    if (!n.includes('Name_Letter')) return;
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    positions.push(p);
    if (p.y > maxY) maxY = p.y;
  });

  if (positions.length) {
    const anchor = positions.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / positions.length);
    return { anchor, maxY };
  }

  // Fallback to the removed name platform if letters are missing
  const platform = rootScene.getObjectByName('Name_Platform_Third') || rootScene.getObjectByName('Name_Platform_Third_Raycaster_Hover');
  if (platform) {
    const anchor = new THREE.Vector3();
    platform.getWorldPosition(anchor);
    return { anchor, maxY: anchor.y };
  }

  return null;
}

function translateHitboxForObject(originalObject, deltaWorld) {
  // Our hitboxes are placed in world-space and do NOT follow later transforms.
  for (const [hitbox, obj] of hitboxToObjectMap.entries()) {
    if (obj !== originalObject) continue;
    if (hitbox === originalObject) continue;
    hitbox.position.add(deltaWorld);
    hitbox.updateMatrixWorld(true);
  }
}

function moveInteractiveObjectToWorld(originalObject, targetWorldPos) {
  if (!originalObject) return;
  originalObject.updateMatrixWorld(true);
  const oldWorldPos = new THREE.Vector3();
  originalObject.getWorldPosition(oldWorldPos);
  const deltaWorld = targetWorldPos.clone().sub(oldWorldPos);

  const parent = originalObject.parent;
  const localTarget = parent ? parent.worldToLocal(targetWorldPos.clone()) : targetWorldPos.clone();
  originalObject.position.copy(localTarget);
  originalObject.updateMatrixWorld(true);

  // Keep hover/click animation baselines aligned with the new position.
  originalObject.userData.initialPosition = originalObject.position.clone();
  translateHitboxForObject(originalObject, deltaWorld);
}

function relocateMonitorSideDollsToWindowSill(rootScene) {
  const anchorData = getWindowSillAnchor(rootScene);
  if (!anchorData) return;

  const { anchor, maxY } = anchorData;
  const spacingX = 0.75;
  const y = maxY + 0.18; // "placed on top" feeling
  const z = anchor.z + 0.18;

  const targetLeft = new THREE.Vector3(anchor.x - spacingX, y, z);
  const targetRight = new THREE.Vector3(anchor.x + spacingX, y, z);

  // The two monitor-side dolls in this GLB are the rabbit + rabbit son.
  const rabbitMain = rootScene.getObjectByName('MrRabbit_Fourth_Raycaster_Hover')
    || rootScene.getObjectByName('MrRabbit_Fourth_Hover_Raycaster')
    || (() => {
      let found = null;
      rootScene.traverse((o) => {
        const n = o.name || '';
        if (found) return;
        if (n.includes('MrRabbit') && n.includes('Raycaster') && n.includes('Hover')) found = o;
      });
      return found;
    })();

  const rabbitSon = rootScene.getObjectByName('MrRabbit_Son_Raycaster_Fourth_Hover')
    || (() => {
      let found = null;
      rootScene.traverse((o) => {
        const n = o.name || '';
        if (found) return;
        if (n.includes('MrRabbit_Son') && n.includes('Raycaster') && n.includes('Hover')) found = o;
      });
      return found;
    })();

  if (rabbitMain) moveInteractiveObjectToWorld(rabbitMain, targetLeft);
  if (rabbitSon) moveInteractiveObjectToWorld(rabbitSon, targetRight);
}

// --- Post-it (behind monitor) cleanup
function hideMonitorPostItDecalMeshes(rootScene) {
  // If the post-it is a thin plane mesh near the monitor back, hide it.
  const screen = rootScene.getObjectByName('Screen');
  if (!screen) return;

  const screenPos = new THREE.Vector3();
  screen.getWorldPosition(screenPos);

  let hidden = 0;
  rootScene.traverse((o) => {
    if (!(o && o.isMesh)) return;
    const name = (o.name || '').toLowerCase();
    if (name.includes('screen') || name.includes('glass')) return;

    const box = new THREE.Box3().setFromObject(o);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const dist = center.distanceTo(screenPos);
    const thickness = Math.min(size.x, size.y, size.z);
    const maxdim = Math.max(size.x, size.y, size.z);

    // Small thin plaque, close to the screen and slightly behind it.
    if (dist > 0.75) return;
    if (thickness > 0.015) return;
    if (maxdim < 0.05 || maxdim > 0.45) return;
    if (center.z > screenPos.z - 0.03) return;

    o.visible = false;
    hidden++;
  });

  if (hidden) console.info('[auto-hide] monitor post-it decals:', hidden);
}

// --- Kirby floor decal cleanup (if any decal plane mesh remains)
function hideFloorDecalsNearKirby(rootScene) {
  let kirby = null;
  rootScene.traverse((o) => {
    if (kirby) return;
    const n = o.name || '';
    if (n.includes('Kirby')) kirby = o;
  });
  if (!kirby) return;

  const kPos = new THREE.Vector3();
  kirby.getWorldPosition(kPos);

  let hidden = 0;
  rootScene.traverse((o) => {
    if (!(o && o.isMesh)) return;
    const name = (o.name || '').toLowerCase();
    if (name.includes('floor') || name.includes('wall') || name.includes('piano') || name.includes('kirby')) return;

    const box = new THREE.Box3().setFromObject(o);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const thickness = Math.min(size.x, size.y, size.z);
    const maxdim = Math.max(size.x, size.y, size.z);

    // Very thin plane close to the ground near Kirby's former position.
    const distXZ = Math.hypot(center.x - kPos.x, center.z - kPos.z);
    if (distXZ > 0.9) return;
    if (center.y > kPos.y + 0.25) return;
    if (thickness > 0.012) return;
    if (maxdim < 0.08 || maxdim > 1.2) return;

    o.visible = false;
    hidden++;
  });

  if (hidden) console.info('[auto-hide] floor decals near Kirby:', hidden);
}

let root = null;
try {
  const gltf = await gltfLoader.loadAsync(u('./assets/models/Room_Portfolio.glb'));
  root = gltf.scene;
  scene.add(root);
  applyMaterialsAndCollect(root);
  hideKirbyAndNamePlatform(root);
  hideLowerWindowSillDecos(root);
  relocateMonitorSideDollsToWindowSill(root);
  hideMonitorPostItDecalMeshes(root);
  hideFloorDecalsNearKirby(root);
  initDynamicSurfaces(root);
  // Re-apply the intended starting view after the GLB is decoded/added.
  setStartCamera();
  controls.update();
} catch (e) {
  console.error(e);
  if (enterBtn) enterBtn.textContent = 'Enter';
}

// ---------- Interactions (hover + click)
// Raycaster hits *invisible hitboxes*; we animate the visible mesh.

function shouldUseOriginalMesh(name='') {
  return ['Bulb', 'Cactus'].some((k) => name.includes(k));
}

function stashInitialTransforms(obj) {
  if (!obj.userData.initialScale) obj.userData.initialScale = obj.scale.clone();
  if (!obj.userData.initialPosition) obj.userData.initialPosition = obj.position.clone();
  if (!obj.userData.initialRotation) obj.userData.initialRotation = obj.rotation.clone();
}

function isPianoKey(obj) {
  return !!obj && pianoKeyNameByMesh.has(obj);
}

function createStaticHitbox(originalObject) {
  // Use the original mesh itself for some tiny objects (matches sample feel)
  if (shouldUseOriginalMesh(originalObject.name || '')) {
    stashInitialTransforms(originalObject);
    return originalObject;
  }

  stashInitialTransforms(originalObject);

  // Compute bounding box once and freeze the hitbox there
  const box = new THREE.Box3().setFromObject(originalObject);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // If the bounding box is degenerate (rare), just use the object
  if (size.lengthSq() < 1e-10) return originalObject;

  const sizeMultiplier = { x: 1.1, y: 1.7, z: 1.1 };
  const geom = new THREE.BoxGeometry(
    Math.max(0.001, size.x * sizeMultiplier.x),
    Math.max(0.001, size.y * sizeMultiplier.y),
    Math.max(0.001, size.z * sizeMultiplier.z)
  );

  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, visible: false });
  const hitbox = new THREE.Mesh(geom, mat);
  hitbox.position.copy(center);
  hitbox.name = originalObject.name || 'Object';
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

// Pointer + raycast state (pointer/raycaster declared earlier so model traversal can register hitboxes)
let currentIntersects = [];

let currentHoveredHitbox = null;
let currentHoveredObject = null;
let pressedHitbox = null;
let pressedObject = null;

let pointerIsDown = false;
let dragMoved = false;
let downX = 0;
let downY = 0;

function updateCursor() {
  if (!enterRequested) {
    document.body.style.cursor = 'default';
    return;
  }
  if (pointerIsDown && dragMoved) {
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

function pickHitbox() {
  computeIntersects();
  return currentIntersects.length ? currentIntersects[0].object : null;
}

function objectFromHitbox(hitbox) {
  if (!hitbox) return null;
  return hitboxToObjectMap.get(hitbox) || hitbox.userData.originalObject || null;
}

function getHoverScale(obj) {
  const name = obj?.name || '';
  if (name.includes('Fish')) return 1.2;
  return cfg.interaction.hoverScale;
}

function hoverIn(obj) {
  if (!obj) return;
  stashInitialTransforms(obj);

  // Piano keys: subtle tilt instead of scale.
  if (isPianoKey(obj)) {
    gsap.killTweensOf(obj.rotation);
    gsap.to(obj.rotation, {
      x: obj.userData.initialRotation.x - Math.PI / 64,
      duration: 0.12,
      ease: 'power2.out'
    });
    return;
  }

  const base = obj.userData.initialScale;
  const s = getHoverScale(obj);
  const target = base.clone().multiplyScalar(s);

  gsap.killTweensOf(obj.scale);
  gsap.to(obj.scale, {
    x: target.x,
    y: target.y,
    z: target.z,
    duration: 0.22,
    ease: 'back.out(2)'
  });

  // Rotation/position accents (soft)
  const name = obj.name || '';
  let rotX = obj.userData.initialRotation.x;
  let posY = obj.userData.initialPosition.y;

  if (name.includes('About_Button')) {
    rotX -= Math.PI / 10;
  } else if (
    name.includes('Contact_Button') ||
    name.includes('My_Work_Button') ||
    name.includes('GitHub') ||
    name.includes('YouTube') ||
    name.includes('Twitter')
  ) {
    rotX += Math.PI / 10;
  }

  if (name.includes('Boba') || name.includes('Name_Letter')) {
    posY += 0.2;
  }

  gsap.killTweensOf(obj.rotation);
  gsap.to(obj.rotation, { x: rotX, duration: 0.24, ease: 'back.out(2)' });

  gsap.killTweensOf(obj.position);
  gsap.to(obj.position, { y: posY, duration: 0.24, ease: 'back.out(2)' });
}

function hoverOut(obj) {
  if (!obj) return;
  stashInitialTransforms(obj);

  if (isPianoKey(obj)) {
    gsap.killTweensOf(obj.rotation);
    gsap.to(obj.rotation, {
      x: obj.userData.initialRotation.x,
      duration: 0.12,
      ease: 'power2.out'
    });
    return;
  }

  const base = obj.userData.initialScale;
  gsap.killTweensOf(obj.scale);
  gsap.to(obj.scale, {
    x: base.x,
    y: base.y,
    z: base.z,
    duration: 0.22,
    ease: 'back.out(2)'
  });

  gsap.killTweensOf(obj.rotation);
  gsap.to(obj.rotation, { x: obj.userData.initialRotation.x, duration: 0.22, ease: 'power3.out' });

  gsap.killTweensOf(obj.position);
  gsap.to(obj.position, { y: obj.userData.initialPosition.y, duration: 0.22, ease: 'power3.out' });
}

function pressDown(obj) {
  if (!obj) return;
  stashInitialTransforms(obj);

  if (isPianoKey(obj)) {
    // Piano plays on press for snappy feel
    const keyName = pianoKeyNameByMesh.get(obj);
    if (keyName) {
      unlockAudio();
      playPianoByKeyName(keyName);
    }

    gsap.killTweensOf(obj.rotation);
    gsap.to(obj.rotation, {
      x: obj.userData.initialRotation.x + Math.PI / 42,
      duration: 0.08,
      ease: 'back.out(1.6)'
    });
    return;
  }

  const base = obj.userData.initialScale;
  const t = base.clone();
  t.x *= cfg.interaction.clickScaleXZ;
  t.z *= cfg.interaction.clickScaleXZ;
  t.y *= cfg.interaction.clickScaleY;

  gsap.killTweensOf(obj.scale);
  gsap.to(obj.scale, {
    x: t.x,
    y: t.y,
    z: t.z,
    duration: 0.10,
    ease: 'back.out(1.4)'
  });
}

function pressUp(obj) {
  if (!obj) return;
  stashInitialTransforms(obj);

  if (isPianoKey(obj)) {
    gsap.killTweensOf(obj.rotation);
    gsap.to(obj.rotation, {
      x: obj.userData.initialRotation.x,
      duration: 0.14,
      ease: 'power2.out'
    });
    return;
  }

  // Return to hovered scale if still hovered; otherwise base
  const base = obj.userData.initialScale;
  const s = obj === currentHoveredObject ? getHoverScale(obj) : 1.0;
  const target = base.clone().multiplyScalar(s);

  gsap.killTweensOf(obj.scale);
  gsap.to(obj.scale, {
    x: target.x,
    y: target.y,
    z: target.z,
    duration: 0.22,
    ease: 'back.out(2)'
  });
}

function setHoveredFromRaycast() {
  if (!enterRequested) return;

  computeIntersects();
  const hitbox = currentIntersects.length ? currentIntersects[0].object : null;
  const obj = hitbox ? objectFromHitbox(hitbox) : null;

  if (hitbox !== currentHoveredHitbox) {
    if (currentHoveredObject) hoverOut(currentHoveredObject);
    currentHoveredHitbox = hitbox;
    currentHoveredObject = obj;
    if (currentHoveredObject) hoverIn(currentHoveredObject);
    updateCursor();
  }
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

  // Piano: some browsers may ignore audio on pointerdown in certain cases;
  // also trigger on click to be safe.
  if (isPianoKey(object)) {
    const keyName = pianoKeyNameByMesh.get(object);
    if (keyName) {
      unlockAudio();
      playPianoByKeyName(keyName);
    }
    return;
  }

  // Non-piano: soft click feedback sound
  try { clickSfx.play(); } catch {}
  openActionFromObject(object);
}


// Pointer events
canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);

  if (pointerIsDown) {
    const dx = ev.clientX - downX;
    const dy = ev.clientY - downY;
    if (!dragMoved && (dx * dx + dy * dy) > 36) dragMoved = true;
    updateCursor();
  }
});

canvas.addEventListener('pointerdown', (ev) => {
  if (!enterRequested) return;

  pointerIsDown = true;
  dragMoved = false;
  downX = ev.clientX;
  downY = ev.clientY;

  const hitbox = pickHitbox();
  const obj = objectFromHitbox(hitbox);

  pressedHitbox = hitbox;
  pressedObject = obj;

  if (obj) {
    pressDown(obj);
    // prevent the first drag frame from rotating the camera when an object is pressed
    ev.stopPropagation?.();
  }

  updateCursor();
});

canvas.addEventListener('pointerup', (ev) => {
  if (!enterRequested) return;

  pointerIsDown = false;
  updateCursor();

  if (pressedObject) {
    pressUp(pressedObject);
  }

  // Treat as click only if we didn't drag
  if (!dragMoved && pressedHitbox && pressedObject) {
    const hitboxNow = pickHitbox();
    const objNow = objectFromHitbox(hitboxNow);
    if (objNow === pressedObject) {
      handleClickOnObject(pressedObject);
    }
  }

  pressedHitbox = null;
  pressedObject = null;
  ev.stopPropagation?.();
});

canvas.addEventListener('pointerleave', () => {
  pointerIsDown = false;
  dragMoved = false;

  if (pressedObject) {
    pressUp(pressedObject);
  }

  pressedHitbox = null;
  pressedObject = null;

  if (currentHoveredObject) hoverOut(currentHoveredObject);
  currentHoveredHitbox = null;
  currentHoveredObject = null;
  updateCursor();
});

// Simple debug helper: Alt+Click prints mesh name + bbox for the hovered object
canvas.addEventListener('click', (ev) => {
  if (!ev.altKey) return;
  const hitbox = pickHitbox();
  if (!hitbox) return;
  const obj = objectFromHitbox(hitbox) || hitbox;
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

  // Hover detection (keeps hover correct even while orbiting)
  setHoveredFromRaycast();

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
