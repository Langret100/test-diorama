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

// ---------- media (video texture)
const videoElement = document.createElement('video');
videoElement.src = u('./assets/textures/video/Screen.mp4');
videoElement.loop = true;
videoElement.muted = true;
videoElement.playsInline = true;
videoElement.preload = 'auto';

const videoTexture = new THREE.VideoTexture(videoElement);
videoTexture.colorSpace = THREE.SRGBColorSpace;
videoTexture.flipY = false;

function unlockMedia() {
  unlockAudio();
  // Autoplay policy: start video on user gesture.
  videoElement.play().catch(() => {
    // ignore
  });
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

// Pointer hitboxes should not render, but should remain raycastable.
const hitboxMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  visible: false
});

const screenMaterial = new THREE.MeshBasicMaterial({
  map: videoTexture,
  transparent: true,
  opacity: 0.92
});

// ---------- Load model
const gltfLoader = new GLTFLoader(manager);
const draco = new DRACOLoader(manager);
// Local decoder (copied from source)
draco.setDecoderPath(u('./assets/draco/'));
draco.setDecoderConfig?.({ type: 'js' });
gltfLoader.setDRACOLoader(draco);

let chairTop = null;
const pickables = [];
const piano = new Map();

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

    if (isLetter || isLetterRay || isLBoard) {
      o.visible = false;
      return;
    }


    // Hitboxes (Pointer_* / *_Raycaster_Pointer_*) should never be rendered.
    const isPointerHitbox = /pointer_raycaster|raycaster_pointer/i.test(name);
    if (isPointerHitbox) {
      o.material = hitboxMaterial;
    } else if (lower.includes('water')) {
      o.material = waterMaterial;
    } else if (lower.includes('glass')) {
      o.material = glassMaterial;
    } else if (lower.includes('bubble')) {
      o.material = whiteMaterial;
    } else if (lower === 'screen' || lower.endsWith('_screen')) {
      o.material = screenMaterial;
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

    // Pickables (keep interaction behavior working; pointer hitboxes are used for picking)
    const pick =
      lower.includes('button_') ||
      lower.includes('github_') ||
      lower.includes('twitter_') ||
      lower.includes('youtube_') ||
      lower.includes('_key_pointer_') ||
      lower.includes('pointer_raycaster') ||
      lower.includes('raycaster_pointer') ||
      lower === 'screen';

    if (pick && o.visible !== false) {
      pickables.push(o);
      o.userData.__interactive = true;
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

let root = null;
try {
  const gltf = await gltfLoader.loadAsync(u('./assets/models/Room_Portfolio.glb'));
  root = gltf.scene;
  scene.add(root);
  applyMaterialsAndCollect(root);
} catch (e) {
  console.error(e);
  if (enterBtn) enterBtn.textContent = 'Enter';
}

// ---------- Interactions (hover + click)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(999, 999);
let hovered = null;
let pressed = null;

function pick() {
  if (!pickables.length) return null;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  return hits.length ? hits[0].object : null;
}

const springs = new Map(); // mesh -> spring state

function setBaseScale(o) {
  if (!o.userData.__baseScale) o.userData.__baseScale = o.scale.clone();
}

function makeSpring(mesh) {
  setBaseScale(mesh);
  const base = mesh.userData.__baseScale;
  return {
    mesh,
    base,
    target: base.clone(),
    current: base.clone(),
    vel: new THREE.Vector3(0, 0, 0)
  };
}

function setTarget(mesh, vec3) {
  let s = springs.get(mesh);
  if (!s) {
    s = makeSpring(mesh);
    springs.set(mesh, s);
  }
  s.target.copy(vec3);
}

function baseScale(mesh) {
  setBaseScale(mesh);
  return mesh.userData.__baseScale;
}

function setHover(mesh, on) {
  const b = baseScale(mesh);
  const s = on ? cfg.interaction.hoverScale : 1.0;
  setTarget(mesh, b.clone().multiplyScalar(s));
}

function setPress(mesh, on) {
  const b = baseScale(mesh);
  if (on) {
    const t = b.clone();
    t.x *= cfg.interaction.clickScaleXZ;
    t.z *= cfg.interaction.clickScaleXZ;
    t.y *= cfg.interaction.clickScaleY;
    setTarget(mesh, t);
  } else {
    setTarget(mesh, b.clone());
  }
}

// ---------- Modal pages (opened by clicking 3D objects)
const modalPages = {
  '#about': `
    <h2>About</h2>
    <p>Andrew Woan의 작품을 참고/ 활용하였습니다.</p>
    <p>출처: <a href="https://github.com/andrewwoan/sooahkimsfolio" target="_blank" rel="noopener noreferrer">github.com/andrewwoan/sooahkimsfolio</a></p>
  `,
  '#my-work': `
    <h2>My Work</h2>
    <p>이 영역은 프로젝트/작업 링크로 채우기 위한 자리입니다.</p>
  `,
  '#contact': `
    <h2>Contact</h2>
    <p>이 영역은 연락처/소셜 링크로 채우기 위한 자리입니다.</p>
  `
};

function openModal(html) {
  if (!modal || !modalContent) return;
  modalContent.innerHTML = html;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

modal?.addEventListener('click', (ev) => {
  if (ev.target?.closest?.('a')) return;
  closeModal();
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeModal();
});

function openAction(mesh) {
  const url = actions?.byName?.[mesh.name];
  if (!url) return;

  if (url.startsWith('#')) {
    openModal(modalPages[url] ?? `<h2>${url.replace('#','')}</h2><p>Coming soon</p>`);
    return;
  }

  if (actions.openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.href = url;
}

canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
});

canvas.addEventListener('pointerdown', () => {
  if (!enterRequested) return;
  const hit = pick();
  if (!hit) return;
  pressed = hit;
  setPress(hit, true);

  if (piano.has(hit)) playTone(piano.get(hit), 0.55);
});

canvas.addEventListener('pointerup', () => {
  if (!pressed) return;
  const hit = pick();
  setPress(pressed, false);
  if (hit === pressed) openAction(pressed);
  pressed = null;
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

  // Hover
  const hit = enterRequested ? pick() : null;
  if (hit !== hovered) {
    if (hovered) setHover(hovered, false);
    hovered = hit;
    if (hovered) setHover(hovered, true);
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  }

  // Chair sway
  if (chairTop && cfg.chairSway.enabled && !reduceMotion) {
    const sp = cfg.chairSway.speed;
    const yaw = cfg.chairSway.yaw;
    chairTop.rotation.y = Math.sin(now * 0.001 * sp) * yaw;
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
