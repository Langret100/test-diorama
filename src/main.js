import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js';
import { RoundedBoxGeometry } from 'https://unpkg.com/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';

const canvas = document.getElementById('c');
const loading = document.getElementById('loading');
const loadingSub = document.getElementById('loadingSub');

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3efff);
scene.fog = new THREE.FogExp2(0xf3efff, 0.06);

// ---------- Camera ----------
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(2.7, 1.85, 2.7);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.8;
controls.maxDistance = 6.0;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0.0, 0.55, 0.0);
controls.update();

function resetView(){
  camera.position.set(2.7, 1.85, 2.7);
  controls.target.set(0.0, 0.55, 0.0);
  controls.update();
}
window.addEventListener('dblclick', resetView);

// ---------- Lights (pastel, soft) ----------
const hemi = new THREE.HemisphereLight(0xdde8ff, 0xffe7f4, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(3.2, 4.0, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 20;
sun.shadow.camera.left = -4;
sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;
sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Window-ish fill light
const fill = new THREE.DirectionalLight(0xcfe6ff, 0.55);
fill.position.set(-3.0, 2.0, -1.0);
scene.add(fill);

const warm = new THREE.PointLight(0xffd3b0, 0.22, 8, 2);
warm.position.set(-0.1, 1.15, -0.35);
scene.add(warm);

// ---------- Helpers ----------
const tex = {
  radialShadow: makeRadialShadowTexture(),
  signText: makeSignTexture('MY WORK\nABOUT\nCONTACT'),
};

function makeRadialShadowTexture(){
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s/2, s/2, 12, s/2, s/2, s/2);
  grd.addColorStop(0, 'rgba(0,0,0,0.32)');
  grd.addColorStop(1, 'rgba(0,0,0,0.0)');
  g.fillStyle = grd;
  g.fillRect(0,0,s,s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeSignTexture(text){
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  // wood-ish background
  g.fillStyle = '#d4a77a';
  g.fillRect(0,0,w,h);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i=0;i<22;i++){
    const y = (i/22)*h;
    g.fillRect(0,y,w,2);
  }

  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(28, 26, w-56, h-52);

  g.fillStyle = '#2d2a3a';
  g.font = '700 44px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  const baseY = h/2 - 64;
  for (let i=0;i<lines.length;i++){
    g.fillText(lines[i], w/2, baseY + i*96);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function setShadow(object, cast=true, receive=true){
  object.traverse((o)=>{
    if (o.isMesh){
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

function recolor(object, color, roughness=0.85){
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness: 0.0,
  });
  object.traverse((o)=>{
    if (o.isMesh){
      o.material = mat;
    }
  });
}

function fitToUnitBox(object, targetSize=1){
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis <= 0) return;
  const s = targetSize / maxAxis;
  object.scale.setScalar(s);
  box.setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.sub(center);
}

function loadFBX(url){
  const loader = new FBXLoader();
  return new Promise((resolve, reject)=>{
    loader.load(url, resolve, undefined, reject);
  });
}

// ---------- Diorama ----------
const diorama = new THREE.Group();
scene.add(diorama);

// Base water
const water = new THREE.Mesh(
  new THREE.CircleGeometry(1.65, 96),
  new THREE.MeshPhysicalMaterial({
    color: 0xcfe7ff,
    transparent: true,
    opacity: 0.85,
    roughness: 0.18,
    metalness: 0.0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
  })
);
water.rotation.x = -Math.PI/2;
water.position.y = 0.0;
water.receiveShadow = true;
diorama.add(water);

const waterFoam = new THREE.Mesh(
  new THREE.RingGeometry(1.42, 1.64, 96),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
);
waterFoam.rotation.x = -Math.PI/2;
waterFoam.position.y = 0.005;
diorama.add(waterFoam);

// Main platform
const platform = new THREE.Mesh(
  new RoundedBoxGeometry(2.05, 0.28, 2.05, 8, 0.12),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })
);
platform.position.y = 0.14;
platform.castShadow = true;
platform.receiveShadow = true;
diorama.add(platform);

// Floor
const floor = new THREE.Mesh(
  new RoundedBoxGeometry(1.78, 0.12, 1.78, 8, 0.12),
  new THREE.MeshStandardMaterial({ color: 0xe7c9a6, roughness: 0.85 })
);
floor.position.y = 0.28;
floor.castShadow = true;
floor.receiveShadow = true;
diorama.add(floor);

// Soft contact shadow on floor
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1.6, 1.6),
  new THREE.MeshBasicMaterial({
    map: tex.radialShadow,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  })
);
contact.rotation.x = -Math.PI/2;
contact.position.y = 0.281;
diorama.add(contact);

// Room shell
const wallMat = new THREE.MeshStandardMaterial({ color: 0xf7f3ff, roughness: 0.95 });
const wallBack = new THREE.Mesh(new RoundedBoxGeometry(1.78, 1.15, 0.10, 8, 0.08), wallMat);
wallBack.position.set(0, 0.86, -0.84);
wallBack.receiveShadow = true;
diorama.add(wallBack);

const wallLeft = new THREE.Mesh(new RoundedBoxGeometry(0.10, 1.15, 1.78, 8, 0.08), wallMat);
wallLeft.position.set(-0.84, 0.86, 0);
wallLeft.receiveShadow = true;
diorama.add(wallLeft);

const wallRight = new THREE.Mesh(new RoundedBoxGeometry(0.10, 1.15, 1.78, 8, 0.08), wallMat);
wallRight.position.set(0.84, 0.86, 0);
wallRight.receiveShadow = true;
diorama.add(wallRight);

// Roof beam (wood)
const beam = new THREE.Mesh(new RoundedBoxGeometry(1.90, 0.18, 1.90, 8, 0.12), new THREE.MeshStandardMaterial({ color: 0xd2a074, roughness: 0.8 }));
beam.position.set(0, 1.42, 0);
beam.castShadow = true;
beam.receiveShadow = true;
diorama.add(beam);

// Window on right wall
const windowFrame = new THREE.Group();
const frameMat = new THREE.MeshStandardMaterial({ color: 0xc99b6e, roughness: 0.8 });
const paneMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.2, transparent: true, opacity: 0.85 });

const frameOuter = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.62, 0.52, 6, 0.05), frameMat);
const frameInner = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.52, 0.42, 6, 0.04), paneMat);
frameOuter.position.x = 0.02;
frameInner.position.x = 0.02;
windowFrame.add(frameOuter, frameInner);
windowFrame.position.set(0.81, 1.05, 0.10);
windowFrame.rotation.y = Math.PI/2;
setShadow(windowFrame, true, true);
diorama.add(windowFrame);

// Blind
const blind = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.55, 0.45, 6, 0.03), new THREE.MeshStandardMaterial({ color: 0xf6f6ff, roughness: 0.9 }));
blind.position.set(0.80, 1.05, 0.10);
blind.rotation.y = Math.PI/2;
blind.position.x += 0.05;
blind.position.y += 0.0;
blind.castShadow = true;
diorama.add(blind);

// Signboard like the reference (left)
const sign = new THREE.Mesh(
  new RoundedBoxGeometry(0.14, 0.86, 0.26, 6, 0.06),
  new THREE.MeshStandardMaterial({ map: tex.signText, roughness: 0.75 })
);
sign.position.set(-1.06, 0.78, -0.10);
sign.rotation.y = Math.PI/10;
sign.castShadow = true;
sign.receiveShadow = true;
diorama.add(sign);

// ---------- Load & place Kenney models ----------
const MODEL_BASE = new URL('../assets/models/', import.meta.url).toString();

const tasks = [
  { file: 'desk.fbx', label: 'desk', color: '#d9b18c', size: 0.72, pos: [-0.36, 0.34, -0.54], rotY: Math.PI/2 },
  { file: 'chairDesk.fbx', label: 'chair', color: '#f3c3da', size: 0.46, pos: [-0.15, 0.33, -0.20], rotY: Math.PI/2.4 },
  { file: 'computerScreen.fbx', label: 'screen', color: '#f4f4ff', size: 0.22, pos: [-0.45, 0.63, -0.56], rotY: Math.PI/2 },
  { file: 'computerKeyboard.fbx', label: 'keyboard', color: '#fff1f8', size: 0.19, pos: [-0.35, 0.60, -0.54], rotY: Math.PI/2 },
  { file: 'computerMouse.fbx', label: 'mouse', color: '#fff1f8', size: 0.09, pos: [-0.28, 0.60, -0.54], rotY: Math.PI/2 },
  { file: 'lampRoundTable.fbx', label: 'lamp', color: '#ffd9c6', size: 0.22, pos: [-0.55, 0.60, -0.38], rotY: Math.PI/2 },
  { file: 'plantSmall2.fbx', label: 'plant', color: '#b8dfb8', size: 0.18, pos: [-0.58, 0.60, -0.66], rotY: 0 },
  { file: 'bookcaseOpenLow.fbx', label: 'bookcase', color: '#d2a074', size: 0.62, pos: [-0.70, 0.34, 0.45], rotY: Math.PI/2 },

  // Outside
  { file: 'rock_largeA.fbx', label: 'rock', color: '#c2c0cf', size: 0.40, pos: [0.95, 0.14, 0.95], rotY: 0.5 },
  { file: 'rock_smallFlatA.fbx', label: 'rock', color: '#c2c0cf', size: 0.22, pos: [1.10, 0.10, 0.35], rotY: 1.6 },
  { file: 'rock_smallB.fbx', label: 'rock', color: '#c2c0cf', size: 0.18, pos: [-0.98, 0.10, 1.10], rotY: 0.2 },
  { file: 'grass_large.fbx', label: 'grass', color: '#bfe4c4', size: 0.30, pos: [1.10, 0.10, -0.70], rotY: 2.2 },
  { file: 'grass_leafsLarge.fbx', label: 'grass', color: '#bfe4c4', size: 0.34, pos: [-1.10, 0.10, -0.85], rotY: 0.6 },
  { file: 'plant_bushSmall.fbx', label: 'bush', color: '#bfe4c4', size: 0.28, pos: [0.95, 0.10, -1.10], rotY: 0.2 },
  { file: 'lily_small.fbx', label: 'lily', color: '#cfe7ff', size: 0.22, pos: [0.25, 0.02, 0.95], rotY: 0.0 },
  { file: 'flower_purpleA.fbx', label: 'flower', color: '#d8b6ff', size: 0.18, pos: [-1.00, 0.10, 0.35], rotY: 1.0 },
  { file: 'flower_yellowA.fbx', label: 'flower', color: '#ffe19a', size: 0.18, pos: [1.15, 0.10, 0.05], rotY: 0.7 },

  // Ceiling lamp
  { file: 'lampSquareCeiling.fbx', label: 'ceilingLamp', color: '#f8f6ff', size: 0.26, pos: [0.0, 1.31, -0.20], rotY: 0 },
];

let loaded = 0;
function updateLoading(){
  const pct = Math.floor((loaded / tasks.length) * 100);
  loadingSub.textContent = `${pct}%`;
}

(async function init(){
  updateLoading();

  for (const t of tasks){
    try{
      const obj = await loadFBX(MODEL_BASE + t.file);
      fitToUnitBox(obj, t.size);
      recolor(obj, t.color, 0.82);
      setShadow(obj, true, true);
      obj.position.set(t.pos[0], t.pos[1], t.pos[2]);
      obj.rotation.y = t.rotY ?? 0;
      diorama.add(obj);
    }catch(e){
      console.warn('Failed to load', t.file, e);
    }
    loaded++;
    updateLoading();
  }

  // Extra props to match the screenshot vibe (procedural)
  addProps();

  loading.classList.add('hidden');
})();

function addProps(){
  // Desk mat
  const mat = new THREE.Mesh(
    new RoundedBoxGeometry(0.55, 0.02, 0.30, 6, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf7d9ee, roughness: 0.9 })
  );
  mat.position.set(-0.28, 0.585, -0.44);
  mat.rotation.y = Math.PI/2;
  mat.castShadow = true;
  diorama.add(mat);

  // Transparent storage box
  const box = new THREE.Mesh(
    new RoundedBoxGeometry(0.32, 0.18, 0.22, 6, 0.06),
    new THREE.MeshPhysicalMaterial({
      color: 0xe7dcff,
      transparent: true,
      opacity: 0.55,
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
    })
  );
  box.position.set(0.10, 0.46, -0.70);
  box.castShadow = true;
  box.receiveShadow = true;
  diorama.add(box);

  // Back-wall shelf
  const shelf = new THREE.Mesh(
    new RoundedBoxGeometry(0.70, 0.06, 0.16, 6, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xd2a074, roughness: 0.85 })
  );
  shelf.position.set(-0.15, 1.10, -0.80);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  diorama.add(shelf);

  // Tiny decor blocks on shelf
  const colors = ['#ffd9c6', '#d8b6ff', '#cfe6ff', '#ffe19a'];
  for (let i=0;i<4;i++){
    const b = new THREE.Mesh(
      new RoundedBoxGeometry(0.10, 0.10, 0.08, 4, 0.03),
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.75 })
    );
    b.position.set(-0.40 + i*0.14, 1.16, -0.80);
    b.castShadow = true;
    diorama.add(b);
  }

  // String lights
  const wire = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.006, 10, 64, Math.PI * 1.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
  );
  wire.position.set(-0.10, 1.02, -0.79);
  wire.rotation.z = -0.12;
  wire.rotation.y = Math.PI;
  diorama.add(wire);

  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, roughness: 0.25, emissive: 0xfff0c2, emissiveIntensity: 0.35 });
  for (let i=0;i<7;i++){
    const a = (i/6) * Math.PI * 1.02;
    const x = wire.position.x + Math.cos(a + Math.PI*0.10) * 0.42;
    const y = wire.position.y + Math.sin(a + Math.PI*0.10) * 0.12;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 16), bulbMat);
    b.position.set(x, y, -0.78);
    b.castShadow = true;
    diorama.add(b);
  }

  // Posters (simple soft illustrations)
  const posterTex = makePosterTexture();
  const posterMat = new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.9 });
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), posterMat);
  poster.position.set(0.20, 0.88, -0.79);
  poster.rotation.y = Math.PI;
  diorama.add(poster);

  const poster2Tex = makePosterTexture2();
  const poster2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.34), new THREE.MeshStandardMaterial({ map: poster2Tex, roughness: 0.9 }));
  poster2.position.set(0.78, 0.84, -0.05);
  poster2.rotation.y = -Math.PI/2;
  diorama.add(poster2);

  // Soft rug
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(0.32, 64),
    new THREE.MeshStandardMaterial({ color: 0xf6f6ff, roughness: 1.0 })
  );
  rug.rotation.x = -Math.PI/2;
  rug.position.set(0.15, 0.2815, 0.25);
  diorama.add(rug);
}

function makePosterTexture(){
  const w=512,h=768;
  const c=document.createElement('canvas');
  c.width=w;c.height=h;
  const g=c.getContext('2d');
  g.fillStyle='#f6f0ff';
  g.fillRect(0,0,w,h);
  g.fillStyle='rgba(0,0,0,0.06)';
  g.fillRect(22,22,w-44,h-44);

  // cute character blob
  g.save();
  g.translate(w/2,h/2+40);
  g.fillStyle='#ffd9f0';
  g.beginPath();
  g.ellipse(0,0,150,180,0,0,Math.PI*2);
  g.fill();
  g.fillStyle='#2d2a3a';
  g.beginPath(); g.arc(-55,-30,14,0,Math.PI*2); g.fill();
  g.beginPath(); g.arc( 55,-30,14,0,Math.PI*2); g.fill();
  g.fillStyle='#ff6aa2';
  g.beginPath(); g.ellipse(0,30,28,18,0,0,Math.PI*2); g.fill();
  g.restore();

  g.fillStyle='#6d6886';
  g.font='700 42px ui-sans-serif, system-ui';
  g.textAlign='center';
  g.fillText('ROOM', w/2, 110);

  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=4;
  return t;
}

function makePosterTexture2(){
  const w=512,h=768;
  const c=document.createElement('canvas');
  c.width=w;c.height=h;
  const g=c.getContext('2d');
  g.fillStyle='#ecf6ff';
  g.fillRect(0,0,w,h);
  g.fillStyle='rgba(0,0,0,0.05)';
  g.fillRect(24,24,w-48,h-48);

  // abstract flowers
  const cols=['#d8b6ff','#ffe19a','#ffd9c6','#bfe4c4'];
  for(let i=0;i<9;i++){
    const x=90+(i%3)*160;
    const y=170+Math.floor(i/3)*170;
    g.save();
    g.translate(x,y);
    g.rotate((i*17)*Math.PI/180);
    g.fillStyle=cols[i%cols.length];
    for(let p=0;p<5;p++){
      g.beginPath();
      g.ellipse(0,0,18,50,(p*Math.PI*2)/5,0,Math.PI*2);
      g.fill();
    }
    g.fillStyle='#ffffffcc';
    g.beginPath(); g.arc(0,0,16,0,Math.PI*2); g.fill();
    g.restore();
  }

  g.fillStyle='#2d2a3a';
  g.font='800 38px ui-sans-serif, system-ui';
  g.textAlign='center';
  g.fillText('DREAM', w/2, 90);

  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=4;
  return t;
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ---------- Animate ----------
let t0 = performance.now();
function animate(t){
  const dt = Math.min(0.05, (t - t0) / 1000);
  t0 = t;

  controls.update();

  // Gentle bob to make it feel alive
  const bob = Math.sin(t * 0.0007) * 0.006;
  diorama.position.y = bob;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
