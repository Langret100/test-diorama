import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const $ = (sel) => document.querySelector(sel);

// -------- config loading
async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Failed to load ${url}`);
  return await r.json();
}

const sceneConfig = await loadJSON('./config/scene.json');
const actionsConfig = await loadJSON('./config/actions.json');
const monitorConfig = await loadJSON('./config/monitor.json');

// -------- basic setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = sceneConfig.lighting.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color('#efe7fb'), 6.0, 14.0);

// skybox (optional)
{
  const cubeLoader = new THREE.CubeTextureLoader();
  const base = new URL('./assets/textures/skybox/', import.meta.url).toString();
  const tex = cubeLoader.load([
    base + 'px.webp', base + 'nx.webp',
    base + 'py.webp', base + 'ny.webp',
    base + 'pz.webp', base + 'nz.webp'
  ]);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(
  sceneConfig.camera.fov,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(...sceneConfig.camera.position);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(...sceneConfig.camera.target);
controls.minDistance = 1.8;
controls.maxDistance = 4.6;
controls.minPolarAngle = Math.PI * 0.22;
controls.maxPolarAngle = Math.PI * 0.49;
controls.enablePan = false;
controls.update();

// lights (pastel soft)
const hemi = new THREE.HemisphereLight(0xffeffa, 0xbcd9ff, sceneConfig.lighting.hemiIntensity);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, sceneConfig.lighting.dirIntensity);
dir.position.set(3.6, 5.2, 2.4);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.bias = -0.00025;
dir.shadow.camera.left = -3.5;
dir.shadow.camera.right = 3.5;
dir.shadow.camera.top = 3.5;
dir.shadow.camera.bottom = -3.5;
scene.add(dir);

const fill = new THREE.DirectionalLight(0xfff2e2, 0.75);
fill.position.set(-4.0, 3.2, 2.5);
scene.add(fill);

// ground shadow catcher
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({ opacity: 0.16 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// postprocessing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.45,
  0.85,
  0.72
);
composer.addPass(bloom);

// -------- loading UI
const loadingPill = $('#loadingPill');
const soundPill = $('#soundPill');

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  loadingPill.textContent = `Loading… ${Math.round((loaded / total) * 100)}%`;
};
manager.onLoad = () => {
  loadingPill.style.display = 'none';
};

// -------- model loading
const dracoLoader = new DRACOLoader(manager);
dracoLoader.setDecoderPath('./assets/draco/gltf/');

const gltfLoader = new GLTFLoader(manager);
gltfLoader.setDRACOLoader(dracoLoader);

const modelUrl = new URL('./assets/models/Room_Portfolio.glb', import.meta.url);
const gltf = await gltfLoader.loadAsync(modelUrl.toString());
const root = gltf.scene;
root.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material) {
      // a tiny nudge toward the soft pastel look
      o.material.roughness = Math.min(1, (o.material.roughness ?? 0.6) + 0.05);
      o.material.metalness = Math.max(0, (o.material.metalness ?? 0.0) - 0.02);
    }
  }
});
scene.add(root);

// remove ceiling/roof heuristically
if (sceneConfig.removeCeiling) {
  hideCeilingMeshes(root);
}

// -------- interactables detection
const interactables = new Set();
const interactiveRoots = new Map(); // rootObj -> { baseScale, target, velocity }
const pianoKeys = new Map(); // keyMesh -> keyIndex
let chair = null;
let screenAnchor = null;

root.traverse((o) => {
  if (!o.name) return;
  const n = o.name.toLowerCase();
  if (n.includes('chair') || n.includes('seat')) chair = chair ?? o;
  if (n.includes('monitor') || n.includes('screen')) screenAnchor = screenAnchor ?? o;
  if (n.startsWith('key_') || n.includes('piano_key')) {
    const idx = parseInt(o.name.replace(/\D+/g, ''), 10);
    if (Number.isFinite(idx)) pianoKeys.set(o, idx);
  }

  // a broad set of things you might want clickable later
  if (/
      work|about|contact|sign|poster|monitor|screen|piano|keyboard|desk|plant|clock|drawer
    /ix.test(o.name)) {
    interactables.add(o);
  }
});

// if no screenAnchor found, fall back to something plausible
if (!screenAnchor) {
  screenAnchor = findLikelyScreen(root);
}

// attach monitor planes for slideshow
const monitor = await createMonitorSlideshow(screenAnchor, monitorConfig.images);

// piano audio
const piano = new PianoSampler('./assets/audio/sfx/piano/');
let audioArmed = false;

// show "tap to enable sound" until user gesture
soundPill.style.display = 'block';
window.addEventListener('pointerdown', async () => {
  if (audioArmed) return;
  await piano.arm();
  audioArmed = true;
  soundPill.style.display = 'none';
}, { once: true });

// -------- UI panel + menu
const panel = $('#panel');
const panelTitle = $('#panelTitle');
const panelBody = $('#panelBody');
$('#closePanel').addEventListener('click', () => panel.classList.remove('show'));
for (const btn of document.querySelectorAll('.menu button')) {
  btn.addEventListener('click', () => openPanel(btn.dataset.open.replace('#','').toUpperCase()));
}

function openPanel(key) {
  panelTitle.textContent = key;
  panelBody.textContent = `여기에 ${key} 내용을 넣으면 됩니다. (링크/모달 매핑은 config/actions.json 에서 변경)`;
  panel.classList.add('show');
}

// -------- raycast interactions
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredRoot = null;

renderer.domElement.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
});

renderer.domElement.addEventListener('click', async () => {
  const hit = pick();
  if (!hit) return;

  // 1) piano key takes priority
  const keyHit = findPianoKey(hit.object);
  if (keyHit) {
    const idx = pianoKeys.get(keyHit) ?? 1;
    await piano.play(idx);
    popClick(keyHit);
    return;
  }

  // 2) otherwise, run mapped action (placeholder defaults)
  const node = findNamedNode(hit.object);
  const action = (node?.name && actionsConfig.byName?.[node.name]) || actionsConfig.default;
  popClick(node ?? hit.object);

  if (action.type === 'hash') {
    openPanel(action.value.replace('#','').toUpperCase());
  } else if (action.type === 'modal') {
    openPanel(action.value);
  } else if (action.type === 'url') {
    window.open(action.value, '_blank', 'noopener,noreferrer');
  }
});

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const list = Array.from(interactables);
  const hits = raycaster.intersectObjects(list, true);
  return hits[0] ?? null;
}

// -------- animation loop
let lastT = performance.now();
let slideT = 0;
let slideIndex = 0;
let slideFade = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  controls.update();

  // hover detection
  const hit = pick();
  const newHover = hit ? findInteractiveRoot(hit.object) : null;
  if (newHover !== hoveredRoot) {
    if (hoveredRoot) setTargetScale(hoveredRoot, 1.0);
    hoveredRoot = newHover;
    if (hoveredRoot) setTargetScale(hoveredRoot, sceneConfig.hoverScale);
  }

  // update spring scales
  for (const [obj, st] of interactiveRoots.entries()) {
    const target = st.target;
    const curr = obj.scale.x;
    const next = damp(curr, target, 18, dt);
    const squish = (target > 1) ? sceneConfig.squish : 0;
    obj.scale.set(next * (1 + squish), next * (1 - squish), next * (1 + squish));
  }

  // chair gentle sway
  if (chair && sceneConfig.chairSway?.enabled) {
    const s = sceneConfig.chairSway;
    const t = now * 0.001;
    chair.rotation.y = (chair.userData.__baseRotY ?? (chair.userData.__baseRotY = chair.rotation.y)) + Math.sin(t * s.speed) * s.yaw;
    chair.position.x = (chair.userData.__baseX ?? (chair.userData.__baseX = chair.position.x)) + Math.sin(t * (s.speed * 0.7)) * s.x;
  }

  // monitor slideshow
  if (monitor && monitor.textures.length > 0) {
    slideT += dt * 1000;
    if (slideFade > 0) {
      slideFade = Math.max(0, slideFade - dt * 1000);
      const a = 1 - (slideFade / monitorConfig.fadeMs);
      monitor.matA.opacity = 1 - a;
      monitor.matB.opacity = a;
    }
    if (slideT > monitorConfig.intervalMs) {
      slideT = 0;
      slideFade = monitorConfig.fadeMs;
      slideIndex = (slideIndex + 1) % monitor.textures.length;
      // swap: B becomes next
      monitor.matA.map = monitor.matB.map;
      monitor.matB.map = monitor.textures[slideIndex];
      monitor.matA.needsUpdate = true;
      monitor.matB.needsUpdate = true;
      monitor.matA.opacity = 1;
      monitor.matB.opacity = 0;
    }
  }

  composer.render();
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// ---------- helpers ----------
function damp(a, b, lambda, dt) {
  return THREE.MathUtils.damp(a, b, lambda, dt);
}

function setTargetScale(obj, target) {
  const root = findInteractiveRoot(obj);
  if (!root) return;
  if (!interactiveRoots.has(root)) {
    interactiveRoots.set(root, { target: 1 });
  }
  interactiveRoots.get(root).target = target;
}

function popClick(obj) {
  const root = findInteractiveRoot(obj);
  if (!root) return;
  setTargetScale(root, sceneConfig.clickScale);
  // return back after a short time
  setTimeout(() => {
    if (hoveredRoot === root) setTargetScale(root, sceneConfig.hoverScale);
    else setTargetScale(root, 1.0);
  }, 120);
}

function findInteractiveRoot(obj) {
  // prefer a named parent so whole item scales together
  let o = obj;
  for (let i = 0; i < 6 && o; i++) {
    if (o.name && !/^key_/i.test(o.name)) break;
    o = o.parent;
  }
  const root = o ?? obj;
  if (!interactiveRoots.has(root)) {
    interactiveRoots.set(root, { target: 1 });
  }
  return root;
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

function hideCeilingMeshes(root) {
  const sceneBox = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  sceneBox.getSize(size);
  const topY = sceneBox.min.y + size.y * 0.82;

  root.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = new THREE.Vector3();
    b.getSize(s);
    const c = new THREE.Vector3();
    b.getCenter(c);

    const spansMost = (s.x > size.x * 0.65) && (s.z > size.z * 0.65);
    const isThin = s.y < size.y * 0.18;
    const isTop = c.y > topY;
    if (spansMost && isThin && isTop) {
      o.visible = false;
    }
  });
}

function findLikelyScreen(root) {
  // heuristic: pick the flattest reasonably large mesh near desk height
  let best = null;
  let bestScore = -Infinity;
  const sceneBox = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  sceneBox.getSize(size);

  root.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = new THREE.Vector3();
    b.getSize(s);
    const c = new THREE.Vector3();
    b.getCenter(c);

    // likely a screen: thin in depth, wider than tall, not tiny
    const thin = Math.min(s.x, s.y, s.z) / Math.max(s.x, s.y, s.z) < 0.25;
    const notTiny = (s.x * s.y) > (size.x * size.y) * 0.01;
    const deskHeight = c.y > sceneBox.min.y + size.y * 0.35 && c.y < sceneBox.min.y + size.y * 0.75;
    if (!thin || !notTiny || !deskHeight) return;

    const ratio = s.x / Math.max(0.0001, s.y);
    const score = ratio + (1.0 - Math.abs(c.z / size.z));
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  });
  return best;
}

async function createMonitorSlideshow(anchor, imageUrls) {
  if (!anchor) return null;

  // compute size and attach planes
  const box = new THREE.Box3().setFromObject(anchor);
  const size = new THREE.Vector3();
  box.getSize(size);

  const w = Math.max(size.x, size.z) * 0.95;
  const h = Math.max(size.y, Math.min(size.x, size.z)) * 0.72;

  const geom = new THREE.PlaneGeometry(w, h);

  const loader = new THREE.TextureLoader(manager);
  const textures = [];
  for (const url of imageUrls) {
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textures.push(tex);
  }

  const matA = new THREE.MeshBasicMaterial({ map: textures[0] ?? null, transparent: true, opacity: 1 });
  const matB = new THREE.MeshBasicMaterial({ map: textures[1] ?? textures[0] ?? null, transparent: true, opacity: 0 });

  const planeA = new THREE.Mesh(geom, matA);
  const planeB = new THREE.Mesh(geom, matB);

  // position slightly in front of anchor
  planeA.position.set(0, 0, 0.01);
  planeB.position.set(0, 0, 0.011);

  // orient to anchor
  anchor.add(planeA);
  anchor.add(planeB);

  return { textures, matA, matB };
}

class PianoSampler {
  constructor(basePath) {
    this.basePath = basePath;
    this.ctx = null;
    this.buffers = new Map();
  }

  async arm() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    // warm-up a single key to reduce first-click latency
    await this._ensure(1);
  }

  async play(idx) {
    if (!this.ctx) return;
    const buffer = await this._ensure(idx);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.75;

    // tiny "room" feel
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.012;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.18;
    delay.connect(fb);
    fb.connect(delay);

    src.connect(gain);
    gain.connect(this.ctx.destination);
    gain.connect(delay);
    delay.connect(this.ctx.destination);

    src.start();
  }

  async _ensure(idx) {
    const key = Math.max(1, Math.min(24, idx));
    if (this.buffers.has(key)) return this.buffers.get(key);
    const url = `${this.basePath}Key_${key}.ogg`;
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(ab);
    this.buffers.set(key, buffer);
    return buffer;
  }
}
