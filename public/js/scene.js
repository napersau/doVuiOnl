import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const W = 720;
export const H = 1280;
export const STAGE_Y = 1.0;
// Thứ tự bục (trái -> phải): VIP1, TOP2, TOP1, TOP3, VIP2
export const SLOT_X = [-4.6, -2.3, 0, 2.3, 4.6];
export const SLOT_Z = -4.75;
export const SLOT_INFO = [
  { label: 'VIP 1', kind: 'vip', empty: 'Tặng quà để lên!' },
  { label: 'TOP 2', kind: 'top', empty: 'Trả lời đúng nhé!' },
  { label: 'TOP 1', kind: 'top1', empty: 'Ai sẽ là số 1?' },
  { label: 'TOP 3', kind: 'top', empty: 'Trả lời đúng nhé!' },
  { label: 'VIP 2', kind: 'vip', empty: 'Tặng quà để lên!' },
];
// Khu vực khán đài (sàn nhảy)
export const AUD = { zMin: -2.3, zMax: 3.0, xAt: (z) => 5.1 - ((z + 2.3) / 5.3) * 1.7 };

export function slotPosition(i) {
  return new THREE.Vector3(SLOT_X[i], STAGE_Y + (i === 2 ? 0.28 : 0.14), SLOT_Z);
}

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = h;
  g.globalAlpha = 0.6;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

export const SHARED = { glow: null, beam: null };

export function createWorld(canvas, quality = 'high') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0420);
  scene.fog = new THREE.Fog(0x0a0420, 22, 42);

  const camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 120);
  const camBase = new THREE.Vector3(0, 12, 12.25);
  const camTarget = new THREE.Vector3(0, 3.75, -6);
  camera.position.copy(camBase);
  camera.lookAt(camTarget);

  SHARED.glow = glowTexture();
  SHARED.beam = beamTexture();

  // Ánh sáng
  scene.add(new THREE.HemisphereLight(0xb9a6ff, 0x2a0b4a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(3, 10, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff4fd8, 0.8);
  rim.position.set(-6, 6, -8);
  scene.add(rim);
  const stageLights = [];
  [0xff3fa4, 0x2ee6ff, 0xffc83d, 0x8b5cff].forEach((c, i) => {
    const p = new THREE.PointLight(c, 5, 10, 1.6);
    p.position.set(-5 + i * 3.4, 4.2, -1.8);
    scene.add(p);
    stageLights.push(p);
  });

  const updaters = [];

  // ---------- Tường LED phía sau ----------
  const ledMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        vec2 cell = fract(uv * vec2(110.0, 100.0));
        float dotm = smoothstep(0.52, 0.30, length(cell - 0.5));
        float wave = sin(uv.x * 9.0 + uTime * 1.2 + sin(uv.y * 5.0 + uTime)) * 0.5 + 0.5;
        vec3 c1 = vec3(1.0, 0.15, 0.65), c2 = vec3(0.12, 0.55, 1.0), c3 = vec3(0.55, 0.2, 1.0);
        vec3 col = mix(mix(c1, c2, wave), c3, smoothstep(0.2, 1.0, uv.y));
        float stripes = 0.2 + 0.8 * smoothstep(0.35, 1.0, sin((uv.y * 7.0 - uTime * 0.5 + sin(uv.x * 4.0 + uTime * 0.3)) * 3.14159) * 0.5 + 0.5);
        float col16 = floor(uv.x * 28.0);
        float h = 0.06 + 0.22 * abs(sin(col16 * 1.7 + uTime * 2.3)) * abs(sin(col16 * 0.37 + uTime * 0.9));
        float bars = step(fract(uv.x * 28.0), 0.82) * step(uv.y, h);
        vec3 base = col * stripes * 0.42 + bars * mix(c2, c1, uv.y * 4.0) * 0.5;
        // phần dưới (sau lưng các bục) tối hơn để nhân vật nổi bật
        float lower = smoothstep(0.12, 0.42, uv.y);
        gl_FragColor = vec4(base * (0.25 + dotm * 1.1) * (0.18 + 0.82 * lower), 1.0);
      }`,
  });
  const led = new THREE.Mesh(new THREE.PlaneGeometry(24, 19), ledMat);
  led.position.set(0, 9, -9.5);
  scene.add(led);
  updaters.push((t) => { ledMat.uniforms.uTime.value = t; });

  // Vòng neon lớn + chữ "LỚP 5"
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3fa4).multiplyScalar(2.2) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.13, 16, 96), ringMat);
  ring.position.set(0, 8.6, -9.2);
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2ee6ff).multiplyScalar(2) }));
  ring2.position.copy(ring.position);
  scene.add(ring2);
  {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.font = '900 150px "Baloo 2", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff7ad1'; g.shadowBlur = 30;
    g.fillStyle = '#fff';
    g.fillText('LỚP 5', 256, 140);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(1.8, 1.5, 1.8) }));
    txt.position.set(0, 8.5, -9.1);
    scene.add(txt);
  }
  updaters.push((t) => {
    ring.rotation.z = Math.sin(t * 0.5) * 0.08;
    ringMat.color.setHSL((0.9 + Math.sin(t * 0.3) * 0.08) % 1, 1, 0.5).multiplyScalar(2.2);
    ring2.rotation.z = -t * 0.2;
  });

  // ---------- Sân khấu ----------
  const stageMat = new THREE.MeshStandardMaterial({ color: 0x1a0c3a, metalness: 0.6, roughness: 0.35 });
  const stage = new THREE.Mesh(new THREE.BoxGeometry(14, STAGE_Y, 5), stageMat);
  stage.position.set(0, STAGE_Y / 2, -5.7);
  scene.add(stage);
  // vạch neon mép sân khấu
  const neonCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2ee6ff).multiplyScalar(2.4) });
  const neonPink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3fa4).multiplyScalar(2.4) });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.06), neonCyan);
  edge.position.set(0, STAGE_Y, -3.2);
  scene.add(edge);
  const edge2 = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 0.05), neonPink);
  edge2.position.set(0, 0.06, -3.18);
  scene.add(edge2);
  // dải đèn chạy ở mặt trước sân khấu
  const stripCount = 28;
  const stripGeo = new THREE.BoxGeometry(0.36, 0.5, 0.02);
  const strip = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), stripCount);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < stripCount; i++) {
    m4.makeTranslation(-6.75 + i * 0.5, STAGE_Y / 2, -3.19);
    strip.setMatrixAt(i, m4);
    strip.setColorAt(i, new THREE.Color(0, 0, 0));
  }
  scene.add(strip);
  const tmpC = new THREE.Color();
  updaters.push((t) => {
    for (let i = 0; i < stripCount; i++) {
      const v = Math.max(0, Math.sin(i * 0.6 - t * 5));
      tmpC.setHSL((i / stripCount + t * 0.05) % 1, 1, 0.5).multiplyScalar(0.3 + v * 1.8);
      strip.setColorAt(i, tmpC);
    }
    strip.instanceColor.needsUpdate = true;
  });

  // Loa 2 bên sân khấu
  const spkMat = new THREE.MeshStandardMaterial({ color: 0x14102a, metalness: 0.3, roughness: 0.6 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x2b2452, metalness: 0.5, roughness: 0.4, emissive: 0x3a1080, emissiveIntensity: 0.6 });
  const speakers = [];
  [-6.3, 6.3].forEach((x) => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 0.9), spkMat);
    box.position.y = 1.2;
    g.add(box);
    [0.65, 1.75].forEach((y, k) => {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(k ? 0.28 : 0.4, k ? 0.28 : 0.4, 0.08, 24), coneMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, y, 0.46);
      g.add(cone);
      speakers.push(cone);
    });
    g.position.set(x, STAGE_Y, -5.2);
    scene.add(g);
  });
  updaters.push((t) => {
    const s = 1 + Math.max(0, Math.sin(t * 8.5)) * 0.08;
    speakers.forEach((c) => c.scale.set(s, 1, s));
  });

  // Giàn khung (truss) + đèn quét
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x8c8ca8, metalness: 0.9, roughness: 0.3 });
  const beams = [];
  [-5.6, 5.6].forEach((x, side) => {
    const g = new THREE.Group();
    for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 11, 6), trussMat);
      pole.position.set(dx, 5.5, dz);
      g.add(pole);
    }
    for (let y = 0.5; y < 11; y += 0.7) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), trussMat);
      bar.position.set(0, y, 0.25);
      bar.rotation.z = (y * 10) % 2 ? 0.6 : -0.6;
      g.add(bar);
    }
    g.position.set(x, 0, -7.6);
    scene.add(g);
    // 2 đèn quét trên mỗi giàn
    for (let k = 0; k < 2; k++) {
      const color = [0xff3fa4, 0x2ee6ff, 0xffc83d, 0x8b5cff][side * 2 + k];
      const pivot = new THREE.Group();
      pivot.position.set(x, 9.5 - k * 3.2, -7.4);
      const coneGeo = new THREE.ConeGeometry(1.5, 13, 24, 1, true);
      coneGeo.translate(0, -6.5, 0);
      const mat = new THREE.MeshBasicMaterial({ color, map: SHARED.beam, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Mesh(coneGeo, mat);
      pivot.add(cone);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }));
      pivot.add(head);
      scene.add(pivot);
      beams.push({ pivot, side: x < 0 ? 1 : -1, k, mat });
    }
  });
  updaters.push((t) => {
    beams.forEach((b, i) => {
      b.pivot.rotation.z = b.side * (0.45 + Math.sin(t * (0.6 + i * 0.13) + i) * 0.35);
      b.pivot.rotation.x = 0.35 + Math.sin(t * 0.5 + i * 2) * 0.3;
      b.mat.opacity = 0.14 + Math.max(0, Math.sin(t * 2 + i)) * 0.12;
    });
  });

  // ---------- Sàn nhảy khán đài ----------
  const cols = 15, rows = 10;
  const tile = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff }), cols * rows);
  const tilePos = [];
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -7 + c, z = -2.6 + r;
    m4.makeRotationX(-Math.PI / 2).setPosition(x, 0.005, z);
    tile.setMatrixAt(n, m4);
    tile.setColorAt(n, new THREE.Color(0, 0, 0));
    tilePos.push([x, z, c, r]);
    n++;
  }
  scene.add(tile);
  const floorBase = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x07031a, roughness: 0.4, metalness: 0.4 }));
  floorBase.rotation.x = -Math.PI / 2;
  floorBase.position.set(0, -0.001, 2);
  scene.add(floorBase);
  const palette = [0xff3fa4, 0x2ee6ff, 0x8b5cff, 0xffc83d, 0x1fe07a].map((c) => new THREE.Color(c));
  updaters.push((t) => {
    const mode = Math.floor(t / 9) % 4;
    for (let i = 0; i < tilePos.length; i++) {
      const [x, z, c, r] = tilePos[i];
      let v, ci;
      if (mode === 0) { v = Math.max(0, Math.sin(Math.hypot(x, z - 1) * 1.3 - t * 3)); ci = Math.floor(Math.hypot(x, z) + t) % 5; }
      else if (mode === 1) { v = ((c + r + Math.floor(t * 2)) % 2) ? 0.9 : 0.08; ci = (c + Math.floor(t)) % 5; }
      else if (mode === 2) { v = Math.max(0, Math.sin(x * 0.8 + t * 3.5)); ci = (r + Math.floor(t * 0.7)) % 5; }
      else { const s = Math.sin(i * 12.9898 + Math.floor(t * 3) * 78.233) * 43758.5453; v = (s - Math.floor(s)) > 0.7 ? 1 : 0.06; ci = i % 5; }
      tmpC.copy(palette[ci]).multiplyScalar(0.05 + v * 0.55);
      tile.setColorAt(i, tmpC);
    }
    tile.instanceColor.needsUpdate = true;
  });

  // Dây neon ngăn cách khán đài - sân khấu
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc83d).multiplyScalar(2) }));
  rope.rotation.z = Math.PI / 2;
  rope.position.set(0, 0.55, -2.75);
  scene.add(rope);
  for (let x = -6; x <= 6; x += 2) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 10), trussMat);
    post.position.set(x, 0.3, -2.75);
    scene.add(post);
  }

  // ---------- 5 bục máy trả lời ----------
  const podiums = SLOT_INFO.map((info, i) => createPodium(scene, i, info, updaters));

  // ---------- Hạt (pháo hoa, lấp lánh) ----------
  const particles = new Particles(scene);
  const confetti = new Confetti(scene);
  updaters.push((t, dt) => { particles.update(dt); confetti.update(dt); });

  // ---------- Hậu kỳ (bloom) ----------
  let composer = null;
  if (quality !== 'low') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.65, 0.4, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  function setPixelRatio(pr) {
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    if (composer) { composer.setPixelRatio(pr); composer.setSize(W, H); }
  }

  function update(t, dt) {
    camera.position.x = camBase.x + Math.sin(t * 0.13) * 0.35;
    camera.position.y = camBase.y + Math.sin(t * 0.21) * 0.12;
    camera.lookAt(camTarget);
    stageLights.forEach((p, i) => { p.intensity = 3 + Math.max(0, Math.sin(t * 2 + i * 1.6)) * 5; });
    updaters.forEach((u) => u(t, dt));
  }

  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  return { renderer, scene, camera, update, render, setPixelRatio, podiums, particles, confetti };
}

// ---------- Bục máy trả lời ----------
function createPodium(scene, i, info, updaters) {
  const g = new THREE.Group();
  const x = SLOT_X[i];
  const isVip = info.kind === 'vip';
  const isTop1 = info.kind === 'top1';
  const mainColor = isVip ? 0xffc83d : isTop1 ? 0xff3fa4 : 0x2ee6ff;

  // Bệ đứng
  const baseH = i === 2 ? 0.28 : 0.14;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, baseH, 32), new THREE.MeshStandardMaterial({ color: 0x241248, metalness: 0.7, roughness: 0.3 }));
  base.position.set(x, STAGE_Y + baseH / 2, SLOT_Z);
  g.add(base);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(mainColor).multiplyScalar(2.2) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.025, 8, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, STAGE_Y + baseH, SLOT_Z);
  g.add(ring);

  // Máy (bàn trả lời) phía trước
  const deskMat = new THREE.MeshStandardMaterial({ color: isVip ? 0x3a2400 : 0x10183a, metalness: 0.8, roughness: 0.25, emissive: mainColor, emissiveIntensity: 0.08 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.72, 0.5), deskMat);
  desk.position.set(x, STAGE_Y + 0.36, SLOT_Z + 0.62);
  g.add(desk);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.62), new THREE.MeshBasicMaterial({ color: new THREE.Color(mainColor).multiplyScalar(1.6) }));
  top.position.set(x, STAGE_Y + 0.74, SLOT_Z + 0.62);
  g.add(top);
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a55).multiplyScalar(2) }));
  btn.position.set(x + 0.45, STAGE_Y + 0.77, SLOT_Z + 0.62);
  g.add(btn);

  // Màn hình mặt trước (canvas)
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 160;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.6), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) }));
  screen.position.set(x, STAGE_Y + 0.38, SLOT_Z + 0.875);
  g.add(screen);

  // Cột sáng cho VIP / TOP1
  let beam = null;
  if (isVip || isTop1) {
    const geo = new THREE.CylinderGeometry(0.9, 1.25, 7, 24, 1, true);
    geo.translate(0, 3.5, 0);
    beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: mainColor, map: SHARED.beam, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.rotation.x = Math.PI;
    beam.position.set(x, STAGE_Y + 7, SLOT_Z);
    g.add(beam);
  }
  scene.add(g);

  const state = { occupied: false, name: '' };
  function draw() {
    const c = canvas.getContext('2d');
    const grd = c.createLinearGradient(0, 0, 384, 160);
    if (isVip) { grd.addColorStop(0, '#3a1d00'); grd.addColorStop(0.5, '#6b3d00'); grd.addColorStop(1, '#3a1d00'); }
    else if (isTop1) { grd.addColorStop(0, '#3b0030'); grd.addColorStop(0.5, '#6d0a5a'); grd.addColorStop(1, '#3b0030'); }
    else { grd.addColorStop(0, '#001a3a'); grd.addColorStop(0.5, '#00356b'); grd.addColorStop(1, '#001a3a'); }
    c.fillStyle = grd;
    c.fillRect(0, 0, 384, 160);
    c.strokeStyle = isVip ? '#ffd36b' : isTop1 ? '#ff7ad1' : '#7cf0ff';
    c.lineWidth = 8;
    c.strokeRect(6, 6, 372, 148);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = isVip ? '#fff1a8' : '#ffffff';
    c.font = '900 64px "Baloo 2", sans-serif';
    c.fillText((isVip ? '👑 ' : isTop1 ? '🥇 ' : '') + info.label, 192, state.occupied ? 80 : 62);
    if (!state.occupied) {
      c.font = '700 30px "Be Vietnam Pro", sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText(info.empty, 192, 118);
    }
    tex.needsUpdate = true;
  }
  draw();
  setTimeout(draw, 1500); // vẽ lại khi font đã tải

  updaters.push((t) => {
    ring.rotation.z = t * (i % 2 ? 1 : -1);
    const pulse = 0.5 + Math.sin(t * 3 + i) * 0.5;
    ringMat.color.setHex(mainColor).multiplyScalar(state.occupied ? 1.6 + pulse * 1.6 : 0.8);
    deskMat.emissiveIntensity = state.occupied ? 0.12 + pulse * 0.12 : 0.05;
    if (beam) {
      beam.material.opacity += ((state.occupied ? 0.07 + pulse * 0.04 : 0) - beam.material.opacity) * 0.05;
      beam.rotation.y = t * 0.6;
    }
  });

  return {
    setOccupied(on) {
      if (state.occupied === on) return;
      state.occupied = on;
      draw();
    },
  };
}

// ---------- Hệ hạt dùng chung ----------
class Particles {
  constructor(scene, max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    const mat = new THREE.PointsMaterial({ size: 0.16, map: SHARED.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -100;
    scene.add(this.points);
  }

  emit(origin, { count = 40, color = 0xffd36b, speed = 2.5, life = 1.2, gravity = -2, spread = 1, up = 1.5, colors = null } = {}) {
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      c.set(colors ? colors[k % colors.length] : color);
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = origin.x; this.pos[i * 3 + 1] = origin.y; this.pos[i * 3 + 2] = origin.z;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * s * spread;
      this.vel[i * 3 + 1] = Math.cos(ph) * s + up;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s * spread;
      this.base[i * 3] = c.r * 2; this.base[i * 3 + 1] = c.g * 2; this.base[i * 3 + 2] = c.b * 2;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }

  firework(origin, colors) {
    this.emit(origin, { count: 120, colors, speed: 4.5, life: 1.6, gravity: -2.5, up: 0 });
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) { this.pos[k + 1] = -100; this.col[k] = this.col[k + 1] = this.col[k + 2] = 0; continue; }
      this.vel[k + 1] += this.grav[i] * dt;
      this.vel[k] *= 0.985; this.vel[k + 2] *= 0.985;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------- Mưa giấy kim tuyến ----------
class Confetti {
  constructor(scene, n = 420) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    this.mesh.frustumCulled = false;
    this.p = Array.from({ length: n }, () => ({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, sp: 0, on: false }));
    const colors = [0xff3fa4, 0x2ee6ff, 0xffc83d, 0x8b5cff, 0x1fe07a, 0xffffff];
    const c = new THREE.Color();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      c.set(colors[i % colors.length]).multiplyScalar(1.3);
      this.mesh.setColorAt(i, c);
      this.m.makeTranslation(0, -50, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.active = 0;
    scene.add(this.mesh);
  }

  burst() {
    this.p.forEach((p) => {
      p.x = (Math.random() - 0.5) * 12; p.y = 9 + Math.random() * 6; p.z = -5 + Math.random() * 9;
      p.vx = (Math.random() - 0.5) * 1.5; p.vy = -1 - Math.random() * 1.5; p.vz = (Math.random() - 0.5);
      p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.sp = 2 + Math.random() * 6; p.on = true;
    });
    this.active = 7;
  }

  update(dt) {
    if (this.active <= 0) return;
    this.active -= dt;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      if (!p.on) continue;
      p.x += (p.vx + Math.sin(p.ry) * 0.6) * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.sp * dt; p.ry += p.sp * 0.7 * dt;
      if (p.y < 0 || this.active <= 0) { p.on = false; p.y = -50; }
      this.e.set(p.rx, p.ry, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
