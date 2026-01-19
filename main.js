import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';

// ---------- DOM
const canvas = document.getElementById('c');
const overlay = document.getElementById('intro');
const enterBtn = document.getElementById('enterBtn');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const u = (p) => new URL(p, import.meta.url).toString();

// ---------- Config
const defaults = {
  camera: { fov: 40 },
  controls: {
    minDistance: 6,
    maxDistance: 18,
    minPolarAngle: 0.70,
    maxPolarAngle: 1.42,
    minAzimuthAngle: -0.95,
    maxAzimuthAngle: 0.95
  },
  lighting: {
    hemiIntensity: 0.65,
    keyIntensity: 1.35,
    fillIntensity: 0.55,
    rimIntensity: 0.25
  },
  interaction: {
    hoverScale: 1.055,
    clickScaleXZ: 1.08,
    clickScaleY: 0.96,
    springK: 28,
    springD: 10
  }
};

async function loadJSON(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
}

const [actions, monitorCfg, sceneCfg] = await Promise.all([
  loadJSON(u('./config/actions.json'), { openInNewTab: true, byName: {} }),
  loadJSON(u('./config/monitor.json'), { intervalMs: 3200, fadeMs: 650, images: [] }),
  loadJSON(u('./config/scene.json'), defaults)
]);

const cfg = {
  ...defaults,
  ...sceneCfg,
  camera: { ...defaults.camera, ...(sceneCfg.camera ?? {}) },
  controls: { ...defaults.controls, ...(sceneCfg.controls ?? {}) },
  lighting: { ...defaults.lighting, ...(sceneCfg.lighting ?? {}) },
  interaction: { ...defaults.interaction, ...(sceneCfg.interaction ?? {}) }
};

// Backward-compat: older scene.json keys
// - lighting.dirIntensity -> lighting.keyIntensity
if (sceneCfg?.lighting?.dirIntensity != null && sceneCfg?.lighting?.keyIntensity == null) {
  cfg.lighting.keyIntensity = sceneCfg.lighting.dirIntensity;
}
// - interaction.clickScale + interaction.squish -> clickScaleXZ + clickScaleY
if (sceneCfg?.interaction?.clickScale != null) {
  cfg.interaction.clickScaleXZ = sceneCfg.interaction.clickScale;
  const squish = sceneCfg?.interaction?.squish;
  if (typeof squish === 'number') cfg.interaction.clickScaleY = Math.max(0.5, 1 - squish);
}

// ---------- Three setup
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = cfg?.lighting?.exposure ?? 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// Fog is tuned after the model is framed; initial values are safe defaults.
scene.fog = new THREE.Fog(new THREE.Color('#f3effa'), 10, 120);

// Far plane is generous; we tune fog/camera framing after the model loads.
const camera = new THREE.PerspectiveCamera(cfg.camera.fov, window.innerWidth / window.innerHeight, 0.05, 500);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = cfg.controls.minDistance;
controls.maxDistance = cfg.controls.maxDistance;
controls.minPolarAngle = cfg.controls.minPolarAngle;
controls.maxPolarAngle = cfg.controls.maxPolarAngle;
controls.minAzimuthAngle = cfg.controls.minAzimuthAngle;
controls.maxAzimuthAngle = cfg.controls.maxAzimuthAngle;

// Lighting: pastel & soft
scene.add(new THREE.HemisphereLight(0xffeff7, 0xb9d8ff, cfg.lighting.hemiIntensity));

const key = new THREE.DirectionalLight(0xffffff, cfg.lighting.keyIntensity);
key.position.set(4.0, 6.0, 3.0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0002;
key.shadow.camera.left = -7;
key.shadow.camera.right = 7;
key.shadow.camera.top = 7;
key.shadow.camera.bottom = -7;
scene.add(key);

const fill = new THREE.DirectionalLight(0xfff1da, cfg.lighting.fillIntensity);
fill.position.set(-5.2, 3.4, 2.0);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xd7f0ff, cfg.lighting.rimIntensity);
rim.position.set(1.0, 4.0, -6.0);
scene.add(rim);

// Shadow catcher (subtle)
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.ShadowMaterial({ opacity: 0.10 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -0.01;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// ---------- Loading
const manager = new THREE.LoadingManager();
let loadProgress = 0;
let loadDone = false;
let enterRequested = false;
let enterStart = 0;

manager.onProgress = (_url, loaded, total) => {
  loadProgress = total > 0 ? Math.min(1, loaded / total) : 0;
};
manager.onLoad = () => {
  loadProgress = 1;
  loadDone = true;
};

// Keep button always clickable (loading is "hidden" by the overlay illusion).

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function overlayAlpha(now) {
  if (!enterRequested) return 1;
  const base = reduceMotion ? 0.35 : 0.85;
  const extra = (1 - loadProgress) * (reduceMotion ? 0.40 : 1.30);
  const dur = Math.max(0.35, base + extra);
  const p = Math.min(1, (now - enterStart) / 1000 / dur);
  return 1 - easeInOut(p);
}

enterBtn.addEventListener('click', () => {
  if (enterRequested) return;
  enterRequested = true;
  enterStart = performance.now();
  unlockAudio();
});

// ---------- Audio (simple, less "plastic")
let audioCtx = null;
let master = null;
let filter = null;

function unlockAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.gain.value = 0.35;
    filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5200;
    filter.Q.value = 0.6;
    filter.connect(master);
    master.connect(audioCtx.destination);
  } catch {
    audioCtx = null;
  }
}

function playTone(freq, duration = 0.55) {
  if (!audioCtx || !master || !filter) return;
  const t0 = audioCtx.currentTime;

  // Fundamental
  const o1 = audioCtx.createOscillator();
  o1.type = 'triangle';
  o1.frequency.setValueAtTime(freq, t0);

  // Soft harmonic
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

// ---------- Textures (atlas)
const texLoader = new THREE.TextureLoader(manager);
const atlas = {
  first: texLoader.load(u('./assets/textures/first_texture_set_day.webp')),
  second: texLoader.load(u('./assets/textures/second_texture_set_day.webp')),
  third: texLoader.load(u('./assets/textures/third_texture_set_day.webp')),
  fourth: texLoader.load(u('./assets/textures/fourth_texture_set_day.webp'))
};
for (const t of Object.values(atlas)) {
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
}

const matSet = {
  first: new THREE.MeshStandardMaterial({ map: atlas.first, roughness: 1.0, metalness: 0.0 }),
  second: new THREE.MeshStandardMaterial({ map: atlas.second, roughness: 1.0, metalness: 0.0 }),
  third: new THREE.MeshStandardMaterial({ map: atlas.third, roughness: 1.0, metalness: 0.0 }),
  fourth: new THREE.MeshStandardMaterial({ map: atlas.fourth, roughness: 1.0, metalness: 0.0 })
};

// ---------- Screen shader
const monitorTextures = [];
for (const src of monitorCfg.images ?? []) {
  const t = texLoader.load(u(src));
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  monitorTextures.push(t);
}

function makeScreenMaterial() {
  const texA = monitorTextures[0] ?? atlas.third;
  const texB = monitorTextures[1] ?? atlas.second;
  return new THREE.ShaderMaterial({
    uniforms: {
      texA: { value: texA },
      texB: { value: texB },
      mixAmt: { value: 0.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D texA;
      uniform sampler2D texB;
      uniform float mixAmt;
      void main(){
        vec4 a = texture2D(texA, vUv);
        vec4 b = texture2D(texB, vUv);
        gl_FragColor = mix(a, b, mixAmt);
      }
    `,
    toneMapped: true
  });
}

// ---------- Load model
const gltfLoader = new GLTFLoader(manager);
const draco = new DRACOLoader(manager);
draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
draco.setDecoderConfig({ type: 'js' });
gltfLoader.setDRACOLoader(draco);

let root = null;
let chairTop = null;
let screenMesh = null;
let screenMat = null;

const pickables = [];
const springs = new Map(); // mesh -> spring state
const piano = new Map();   // mesh -> frequency

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

function isSuffix(name, suf) {
  return name.toLowerCase().includes(`_${suf}`);
}

function applyMaterialsAndCollect(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;

    const name = o.name || '';
    const lower = name.toLowerCase();

    // Hide ONLY the requested window-sill decoration:
    // - Name_Letter_1..8_Third_Raycaster_Hover
    // - Name_Platform_Third (the "L" board)
    const shouldHide =
      lower.startsWith('name_letter_') ||
      lower.includes('name_platform');

    if (shouldHide) {
      o.visible = false;
      return;
    }

    // Identify chair top for slow sway
    if (!chairTop && lower.includes('chair_top')) chairTop = o;

    // Identify screen
    if (!screenMesh && lower === 'screen') screenMesh = o;

    // Materials
    if (lower.includes('glass')) {
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ffffff'),
        roughness: 0.05,
        metalness: 0.0,
        transmission: 1.0,
        thickness: 0.08,
        ior: 1.35,
        transparent: true,
        opacity: 1.0
      });
      o.material = Array.isArray(o.material) ? o.material.map(() => glassMat) : glassMat;
      return;
    }

    if (lower.includes('water')) {
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#bfe4ff'),
        roughness: 0.12,
        metalness: 0.0,
        transmission: 0.9,
        thickness: 0.12,
        ior: 1.33,
        transparent: true,
        opacity: 0.55
      });
      o.material = Array.isArray(o.material) ? o.material.map(() => waterMat) : waterMat;
      return;
    }

    // Screen gets its own shader
    if (lower === 'screen') {
      screenMat = makeScreenMaterial();
      o.material = Array.isArray(o.material) ? o.material.map(() => screenMat) : screenMat;
      return;
    }

    // Atlas material selection
    let mat = matSet.fourth;
    if (isSuffix(name, 'first')) mat = matSet.first;
    else if (isSuffix(name, 'second')) mat = matSet.second;
    else if (isSuffix(name, 'third')) mat = matSet.third;
    else if (isSuffix(name, 'fourth')) mat = matSet.fourth;

    o.material = Array.isArray(o.material) ? o.material.map(() => mat) : mat;

    // Pickables (only real interactables)
    const pick =
      lower.includes('button_') ||
      lower.includes('github_') ||
      lower.includes('twitter_') ||
      lower.includes('youtube_') ||
      lower.includes('_key_pointer_') ||
      lower.includes('keyboard_') ||
      lower === 'screen';

    if (pick && o.visible !== false) {
      pickables.push(o);
      o.userData.__interactive = true;
    }

    // Piano: note keys
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

function hideCeiling(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const topY = box.min.y + size.y * 0.90;

  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const n = (o.name || '').toLowerCase();
    if (n.includes('chair')) return; // don't touch chair

    const b = new THREE.Box3().setFromObject(o);
    const s = new THREE.Vector3();
    const c = new THREE.Vector3();
    b.getSize(s);
    b.getCenter(c);

    const spansMost = (s.x > size.x * 0.72) && (s.z > size.z * 0.72);
    const isThin = s.y < size.y * 0.12;
    const isTop = c.y > topY;

    if (spansMost && isThin && isTop) o.visible = false;
  });
}

// Some exports come in with a scale (e.g., centimeters) that makes the camera/controls
// end up *inside* the room. We auto-normalize the scene scale to sit nicely within
// the configured OrbitControls distance range.
function normalizeSceneScale(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return;

  // Keep the whole diorama comfortably visible within maxDistance.
  const targetMaxDim = Math.max(6, cfg.controls.maxDistance * 0.65);
  const ratio = targetMaxDim / maxDim;

  // Only apply when the mismatch is significant (avoid surprising tiny rescaling).
  if (ratio < 0.4 || ratio > 2.5) {
    obj.scale.multiplyScalar(ratio);
    obj.updateWorldMatrix(true, true);
  }
}

function frameCamera(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const radius = maxDim * 0.55;
  controls.target.copy(center).add(new THREE.Vector3(0, radius * 0.12, 0));

  camera.position.copy(controls.target).add(new THREE.Vector3(radius * 1.55, radius * 1.05, radius * 1.75));
  camera.lookAt(controls.target);

  // If the scene is larger than the control constraints, expand them so the camera
  // doesn't get clamped *inside* the room.
  // Initial camera distance is ~2.56*radius (from the vector above).
  // Give a little headroom so OrbitControls won't clamp it.
  const wantMax = Math.max(cfg.controls.maxDistance, radius * 2.8);
  const wantMin = Math.min(cfg.controls.minDistance, radius * 0.6);
  controls.maxDistance = wantMax;
  controls.minDistance = wantMin;
  controls.update();

  // Tune fog to the scene size so it never blankets the entire diorama.
  scene.fog.near = Math.max(6, maxDim * 0.9);
  scene.fog.far = Math.max(scene.fog.near + 10, maxDim * 3.4);
  camera.far = Math.max(camera.far, scene.fog.far * 1.25);
  camera.updateProjectionMatrix();

  // shadow plane below the scene
  shadowPlane.position.y = box.min.y - 0.02;
}

try {
  const gltf = await gltfLoader.loadAsync(u('./assets/models/Room_Portfolio.glb'));
  root = gltf.scene;
  normalizeSceneScale(root);
  scene.add(root);

  applyMaterialsAndCollect(root);
  hideCeiling(root);
  frameCamera(root);
} catch (e) {
  // Fail quietly with a friendly overlay still present.
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
  // allow clicking links without immediately closing
  if (ev.target?.closest?.('a')) return;
  closeModal();
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeModal();
});

function openAction(mesh) {
  const url = actions?.byName?.[mesh.name];
  if (!url) return;

  // Internal pages are shown in-modal (no extra buttons on the main UI)
  if (url.startsWith('#')) {
    openModal(modalPages[url] ?? `<h2>${url.replace('#','')}</h2><p>Coming soon</p>`);
    return;
  }

  // External links
  if (actions.openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.href = url;
}

canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -(((ev.clientY - r.top) / r.height) * 2 - 1);
});

canvas.addEventListener('pointerdown', (ev) => {
  // Only after entering (so overlay click doesn't accidentally click objects)
  if (!enterRequested) return;

  const hit = pick();
  if (!hit) return;
  pressed = hit;
  setPress(hit, true);

  // Piano plays on press
  if (piano.has(hit)) playTone(piano.get(hit), 0.55);
});

canvas.addEventListener('pointerup', () => {
  if (!pressed) return;
  const hit = pick();
  setPress(pressed, false);
  if (hit === pressed) {
    if (pressed.name === 'Screen') {
      // Screen click can be wired via actions.json too.
      openAction(pressed);
    } else {
      openAction(pressed);
    }
  }
  pressed = null;
});

// ---------- Screen slideshow
let slideIdx = 0;
let slideT0 = 0;
let nextAt = 0;
let fading = false;

function advanceSlide(now) {
  if (!screenMat || monitorTextures.length < 2) return;

  if (!fading && now > nextAt) {
    const a = monitorTextures[slideIdx % monitorTextures.length];
    const b = monitorTextures[(slideIdx + 1) % monitorTextures.length];
    screenMat.uniforms.texA.value = a;
    screenMat.uniforms.texB.value = b;
    screenMat.uniforms.mixAmt.value = 0.0;
    fading = true;
    slideT0 = now;
  }

  if (fading) {
    const t = Math.min(1, (now - slideT0) / (monitorCfg.fadeMs || 650));
    screenMat.uniforms.mixAmt.value = easeInOut(t);
    if (t >= 1) {
      slideIdx++;
      fading = false;
      nextAt = now + (monitorCfg.intervalMs || 3200);
    }
  }
}

// ---------- Animation loop
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // Overlay dissolve ("Enter" illusion)
  const a = overlayAlpha(now);
  overlay.style.opacity = String(a);
  overlay.style.pointerEvents = a < 0.02 ? 'none' : 'auto';
  if (a < 0.01) overlay.classList.add('hidden');

  // Hover detection
  const hit = enterRequested ? pick() : null;
  if (hit !== hovered) {
    if (hovered) setHover(hovered, false);
    hovered = hit;
    if (hovered) setHover(hovered, true);
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  }

  // Chair sway
  if (chairTop && !reduceMotion) {
    const sp = cfg?.chairSway?.speed ?? 0.45;
    const yaw = cfg?.chairSway?.yaw ?? 0.05;
    chairTop.rotation.y = Math.sin(now * 0.001 * sp) * yaw;
  }

  // Springs
  for (const s of springs.values()) {
    const k = cfg.interaction.springK;
    const d = cfg.interaction.springD;

    // v += k*(target-current)
    s.vel.addScaledVector(s.target.clone().sub(s.current), k * dt);
    // damping
    s.vel.multiplyScalar(Math.exp(-d * dt));
    // x += v
    s.current.addScaledVector(s.vel, dt);

    s.mesh.scale.copy(s.current);
  }

  // Controls (limited orbit)
  controls.update();

  // Screen
  advanceSlide(now);

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
});
