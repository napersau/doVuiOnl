import * as THREE from 'three';
import { AUD, SHARED, W, H } from './scene.js';

// ---------- Vật liệu & hình khối dùng chung ----------
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const matCache = new Map();
function toon(color, emissive = 0) {
  const key = color + '|' + emissive;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap, emissive: emissive || 0x000000 }));
  return matCache.get(key);
}
const GEO = {
  leg: new THREE.CapsuleGeometry(0.085, 0.27, 4, 8).translate(0, -0.22, 0),
  arm: new THREE.CapsuleGeometry(0.062, 0.25, 4, 8).translate(0, -0.18, 0),
  body: new THREE.CapsuleGeometry(0.2, 0.26, 4, 14),
  head: new THREE.SphereGeometry(0.3, 22, 16),
  hairCap: new THREE.SphereGeometry(0.325, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
  eye: new THREE.SphereGeometry(0.042, 8, 8),
  shine: new THREE.SphereGeometry(0.014, 6, 6),
  blush: new THREE.CircleGeometry(0.045, 12),
  shoe: new THREE.BoxGeometry(0.14, 0.08, 0.22),
  bun: new THREE.SphereGeometry(0.12, 12, 10),
  tail: new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
  longBack: new THREE.BoxGeometry(0.52, 0.5, 0.14),
  spike: new THREE.ConeGeometry(0.08, 0.22, 6),
  hand: new THREE.SphereGeometry(0.07, 8, 8),
};
const M = {
  eye: new THREE.MeshBasicMaterial({ color: 0x1a1030 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  blush: new THREE.MeshBasicMaterial({ color: 0xff8fb1, transparent: true, opacity: 0.55 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 1, roughness: 0.25, emissive: 0x6b3d00, emissiveIntensity: 0.6 }),
  goldShirt: new THREE.MeshStandardMaterial({ color: 0xffcf4a, metalness: 0.85, roughness: 0.3, emissive: 0x5a3300, emissiveIntensity: 0.5 }),
  ruby: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a6a).multiplyScalar(2) }),
  cape: new THREE.MeshToonMaterial({ color: 0xc0103a, gradientMap, side: THREE.DoubleSide, emissive: 0x300010 }),
  capeInner: new THREE.MeshToonMaterial({ color: 0xffc83d, gradientMap, side: THREE.DoubleSide }),
  wing: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.35, 1.2), side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
  cap: new THREE.MeshToonMaterial({ color: 0x1b1b2e, gradientMap }),
};

const SKIN = [0xffdcc0, 0xf6c7a2, 0xeab48e, 0xffe6d2, 0xdda27c];
const HAIR = [0x2b1a12, 0x4a2c1a, 0x111111, 0xc58b3a, 0xff6fb5, 0x7c5cff, 0xf3e7d3, 0x3b82f6, 0xc81e3c, 0x18b38a];
const SHIRT = [0xff3fa4, 0x2ee6ff, 0xffc83d, 0x8b5cff, 0x1fe07a, 0xff6b35, 0xffffff, 0x222244, 0xe11d48, 0x06b6d4, 0xf472b6, 0x84cc16];
const PANTS = [0x1e1b4b, 0x111827, 0x3f3f46, 0x1d4ed8, 0x7c2d12, 0xf5f5f4, 0x0f766e];

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const RANK_COLORS = { 1: 0xffc83d, 2: 0xd8e2f0, 3: 0xd38b4a };
const tmpV = new THREE.Vector3();

export function randomAudiencePoint(r = Math.random) {
  const z = AUD.zMin + r() * (AUD.zMax - AUD.zMin);
  const xl = AUD.xAt(z);
  return new THREE.Vector3((r() * 2 - 1) * xl, 0, z);
}

export function initialOf(name) {
  const s = String(name || '?').trim();
  return (s[0] || '?').toUpperCase();
}

export function avatarHTML(user, cls = 'av') {
  const hue = (hashHue(user.id || user.nick || '') * 360) | 0;
  if (user.avatar) return `<span class="${cls}" style="background:hsl(${hue} 70% 50%)"><img src="${escapeAttr(user.avatar)}" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  return `<span class="${cls}" style="background:hsl(${hue} 70% 50%)">${escapeHTML(initialOf(user.nick))}</span>`;
}
function hashHue(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (h % 1000) / 1000; }
export function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHTML(s); }

const TIER_BADGE = ['', '💖', '👑', '💎', '🐉'];

export class Character {
  constructor(user, ctx) {
    this.ctx = ctx; // { scene, labelsEl, particles, camera }
    this.user = user;
    this.id = user.id;
    const r = rng(String(user.id));
    this.r = r;

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const skin = toon(SKIN[(r() * SKIN.length) | 0]);
    const hairColor = HAIR[(r() * HAIR.length) | 0];
    const hair = toon(hairColor);
    this.shirtMat = toon(SHIRT[(r() * SHIRT.length) | 0]);
    const pants = toon(PANTS[(r() * PANTS.length) | 0]);
    const shoe = toon(r() < 0.5 ? 0xffffff : 0x111111);

    // Chân
    this.legL = new THREE.Group(); this.legL.position.set(-0.1, 0.47, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.1, 0.47, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.add(new THREE.Mesh(GEO.leg, pants));
      const s = new THREE.Mesh(GEO.shoe, shoe); s.position.set(0, -0.43, 0.04); leg.add(s);
      this.body.add(leg);
    }
    // Thân
    this.torso = new THREE.Mesh(GEO.body, this.shirtMat);
    this.torso.position.y = 0.78;
    this.body.add(this.torso);
    // Tay
    this.armL = new THREE.Group(); this.armL.position.set(-0.26, 1.0, 0); this.armL.rotation.z = 0.18;
    this.armR = new THREE.Group(); this.armR.position.set(0.26, 1.0, 0); this.armR.rotation.z = -0.18;
    for (const arm of [this.armL, this.armR]) {
      arm.add(new THREE.Mesh(GEO.arm, this.shirtMat));
      const h = new THREE.Mesh(GEO.hand, skin); h.position.y = -0.37; arm.add(h);
      this.body.add(arm);
    }
    // Đầu
    this.head = new THREE.Group();
    this.head.position.y = 1.38;
    this.body.add(this.head);
    this.head.add(new THREE.Mesh(GEO.head, skin));
    const cap = new THREE.Mesh(GEO.hairCap, hair);
    cap.rotation.x = -0.32;
    cap.position.set(0, 0.02, -0.02);
    this.head.add(cap);
    const style = (r() * 6) | 0;
    if (style === 1) { const b = new THREE.Mesh(GEO.longBack, hair); b.position.set(0, -0.18, -0.2); this.head.add(b); }
    if (style === 2) { for (let k = -2; k <= 2; k++) { const s = new THREE.Mesh(GEO.spike, hair); s.position.set(k * 0.1, 0.3, -0.03); s.rotation.z = -k * 0.25; this.head.add(s); } }
    if (style === 3) { const b = new THREE.Mesh(GEO.bun, hair); b.position.set(0, 0.3, -0.12); this.head.add(b); }
    if (style === 4) { for (const sx of [-1, 1]) { const t = new THREE.Mesh(GEO.tail, hair); t.position.set(sx * 0.33, -0.05, -0.05); t.rotation.z = sx * 0.4; this.head.add(t); } }
    if (style === 5) { const b = new THREE.Mesh(GEO.longBack, hair); b.scale.set(1, 0.6, 1); b.position.set(0, -0.08, -0.2); this.head.add(b); }
    // Mắt + má hồng
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(GEO.eye, M.eye); e.position.set(sx * 0.11, 0.0, 0.27); e.scale.set(1, 1.25, 0.6); this.head.add(e);
      const s = new THREE.Mesh(GEO.shine, M.white); s.position.set(sx * 0.11 + 0.015, 0.025, 0.3); this.head.add(s);
      const b = new THREE.Mesh(GEO.blush, M.blush); b.position.set(sx * 0.18, -0.08, 0.255); b.rotation.y = sx * 0.55; this.head.add(b);
    }
    this.eyes = this.head.children.filter((c) => c.geometry === GEO.eye);

    this.decor = new THREE.Group();
    this.root.add(this.decor);
    this.rankDecor = null;
    this.tier = -1;

    // Trạng thái chuyển động
    this.root.position.copy(randomAudiencePoint());
    this.target = randomAudiencePoint();
    this.speed = 0.65 + r() * 0.55;
    this.wait = r() * 2;
    this.phase = r() * 10;
    this.mode = 'crowd';
    this.slot = -1;
    this.jumpT = 0;
    this.spawnT = 0;
    this.removing = false;
    this.dead = false;
    this.root.scale.setScalar(0.001);
    ctx.scene.add(this.root);

    // Nhãn DOM
    this.label = document.createElement('div');
    this.label.className = 'clabel';
    this.label.innerHTML = `<div class="bubble-slot"></div><div class="rank"></div><div class="name"></div>`;
    this.bubbleSlot = this.label.firstChild;
    this.rankEl = this.label.children[1];
    this.nameEl = this.label.children[2];
    ctx.labelsEl.appendChild(this.label);
    this.bubbleTimer = null;
    this.setUser(user);
  }

  setUser(user) {
    this.user = { ...this.user, ...user };
    const t = this.user.tier || 0;
    this.nameEl.innerHTML = `${avatarHTML(this.user)}<span class="nm">${escapeHTML(this.user.nick)}</span>${t ? `<span class="tierbadge">${TIER_BADGE[t]}</span>` : ''}`;
    this.label.classList.remove('t1', 't2', 't3', 't4');
    if (t) this.label.classList.add('t' + t);
    if (t !== this.tier) this.setTier(t);
  }

  setTier(tier) {
    const up = tier > this.tier && this.tier >= 0;
    this.tier = tier;
    // xóa đồ cũ
    while (this.decor.children.length) this.decor.remove(this.decor.children[0]);
    (this.extras || []).forEach((o) => o.parent && o.parent.remove(o));
    this.extras = [];
    this.crown = this.cape = this.wings = this.aura = this.pillar = null;
    this.torso.material = tier >= 2 ? M.goldShirt : this.shirtMat;
    this.armL.children[0].material = this.armR.children[0].material = tier >= 2 ? M.goldShirt : this.shirtMat;
    if (tier >= 1) {
      // Vòng sáng dưới chân
      const ringColor = tier >= 4 ? 0xffffff : tier >= 3 ? 0xff3fa4 : 0xffc83d;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(ringColor).multiplyScalar(2.5) }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: SHARED.glow, color: ringColor, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      this.decor.add(ring, glow);
      this.aura = ring;
    }
    if (tier >= 2) {
      // Vương miện
      const crown = new THREE.Group();
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 16, 1, true), M.gold);
      crown.add(band);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), M.gold);
        sp.position.set(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2);
        crown.add(sp);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), M.ruby);
        gem.position.set(Math.cos(a) * 0.215, 0.0, Math.sin(a) * 0.215);
        crown.add(gem);
      }
      crown.position.set(0, 0.36, -0.02);
      crown.rotation.x = -0.15;
      this.head.add(crown);
      this.crown = crown;
      this.extras.push(crown);
    }
    if (tier >= 3) {
      // Áo choàng
      const geo = new THREE.PlaneGeometry(0.62, 0.85, 1, 4);
      geo.translate(0, -0.42, 0);
      const cape = new THREE.Group();
      const outer = new THREE.Mesh(geo, M.cape);
      const inner = new THREE.Mesh(geo, M.capeInner);
      inner.position.z = 0.005;
      cape.add(outer, inner);
      cape.position.set(0, 1.08, -0.2);
      cape.rotation.x = 0.18;
      this.body.add(cape);
      this.cape = cape;
      this.extras.push(cape);
      // Hạt lấp lánh quanh người
      this.sparkle = 0;
    }
    if (tier >= 4) {
      // Đôi cánh
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.25, 0.35, 0.75, 0.55, 0.95, 0.45);
      shape.bezierCurveTo(0.8, 0.25, 0.85, 0.05, 0.7, -0.05);
      shape.bezierCurveTo(0.55, -0.15, 0.6, -0.35, 0.4, -0.35);
      shape.bezierCurveTo(0.25, -0.3, 0.1, -0.15, 0, 0);
      const wGeo = new THREE.ShapeGeometry(shape, 12);
      const wings = new THREE.Group();
      this.wingL = new THREE.Mesh(wGeo, M.wing);
      this.wingR = new THREE.Mesh(wGeo, M.wing);
      this.wingR.scale.x = -1;
      const wl = new THREE.Group(); wl.add(this.wingR); wl.position.x = -0.06;
      const wr = new THREE.Group(); wr.add(this.wingL); wr.position.x = 0.06;
      this.wingPivotL = wl; this.wingPivotR = wr;
      wings.add(wl, wr);
      wings.position.set(0, 0.95, -0.22);
      this.body.add(wings);
      this.wings = wings;
      this.extras.push(wings);
      // Cột sáng cầu vồng
      const pGeo = new THREE.CylinderGeometry(0.55, 0.55, 3.2, 24, 1, true);
      pGeo.translate(0, 1.6, 0);
      this.pillarMat = new THREE.MeshBasicMaterial({ map: SHARED.beam, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const pillar = new THREE.Mesh(pGeo, this.pillarMat);
      pillar.rotation.x = Math.PI;
      pillar.position.y = 3.2;
      this.decor.add(pillar);
      this.pillar = pillar;
    }
    if (up) this.celebrate(tier >= 3 ? 120 : 70);
  }

  // Mũ tốt nghiệp cho Top 1-2-3 điểm
  setRank(rank) {
    if (this.rank === rank) return;
    this.rank = rank;
    if (this.rankDecor) { this.head.remove(this.rankDecor); this.rankDecor = null; }
    if (!rank || this.tier >= 2) return; // VIP đã có vương miện
    const color = RANK_COLORS[rank] || 0xffffff;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 16), M.cap);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.62), M.cap);
    board.position.y = 0.08;
    board.rotation.y = Math.PI / 4;
    const tasselMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8) });
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), tasselMat);
    btn.position.y = 0.11;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), tasselMat);
    string.position.set(0.3, -0.04, 0);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.1, 6), tasselMat);
    end.position.set(0.3, -0.2, 0);
    g.add(base, board, btn, string, end);
    g.position.set(0, 0.33, -0.02);
    g.rotation.x = -0.12;
    this.head.add(g);
    this.rankDecor = g;
  }

  goPodium(slot, pos, rankLabel, kind) {
    const wasCrowd = this.mode !== 'podium';
    this.mode = 'podium';
    this.baseScale = 1.2;
    this.slot = slot;
    this.podiumPos = pos.clone();
    this.label.classList.add('podium');
    this.label.classList.toggle('rank-vip', kind === 'vip');
    this.label.classList.toggle('rank-top', kind !== 'vip');
    this.rankEl.textContent = rankLabel;
    this.nameEl.dataset.rank = rankLabel.split(' ')[0];
    if (wasCrowd || this.root.position.distanceTo(pos) > 0.1) {
      this.ctx.particles.emit(this.root.position.clone().setY(0.8), { count: 50, color: 0xffffff, speed: 2.5, up: 1 });
      this.root.position.copy(pos);
      this.ctx.particles.emit(pos.clone().setY(pos.y + 0.9), { count: 80, colors: [0xffc83d, 0xff3fa4, 0x2ee6ff], speed: 3, up: 1.5 });
      this.spawnT = 0;
      this.root.scale.setScalar(0.001);
    }
    this.root.rotation.y = 0;
  }

  leavePodium() {
    if (this.mode !== 'podium') return;
    this.mode = 'crowd';
    this.baseScale = 1;
    this.slot = -1;
    this.label.classList.remove('podium', 'rank-vip', 'rank-top');
    delete this.nameEl.dataset.rank;
    this.setRank(null);
    this.root.position.copy(randomAudiencePoint());
    this.target = randomAudiencePoint();
    this.spawnT = 0;
    this.root.scale.setScalar(0.001);
  }

  say(text, choice) {
    clearTimeout(this.bubbleTimer);
    const b = document.createElement('div');
    b.className = 'bubble' + (choice != null ? ' c' + choice : '');
    b.innerHTML = (choice != null ? `<span class="bl">${'ABCD'[choice]}</span>` : '') + escapeHTML(text);
    this.bubbleSlot.innerHTML = '';
    this.bubbleSlot.appendChild(b);
    this.bubbleTimer = setTimeout(() => {
      b.classList.add('out');
      setTimeout(() => b.remove(), 300);
    }, 3800);
  }

  jump() { this.jumpT = 0.6; }

  celebrate(count = 60) {
    this.jump();
    const p = this.root.position.clone();
    p.y += 1.2;
    this.ctx.particles.emit(p, { count, colors: [0xffc83d, 0xfff1a8, 0xff3fa4], speed: 3, up: 2 });
  }

  headScreen(out) {
    tmpV.copy(this.root.position);
    const top = 1.82 + (this.crown || this.rankDecor ? 0.22 : 0) + (this.jumpOffset || 0);
    tmpV.y += top * this.root.scale.y;
    tmpV.project(this.ctx.camera);
    out.x = (tmpV.x + 1) * 0.5 * W;
    out.y = (1 - tmpV.y) * 0.5 * H;
    out.z = tmpV.z;
    return out;
  }

  remove() {
    if (this.removing) return;
    this.removing = true;
    this.removeT = 0.35;
    this.ctx.particles.emit(this.root.position.clone().setY(0.8), { count: 30, color: 0x9be7ff, speed: 2, up: 1 });
  }

  dispose() {
    this.dead = true;
    this.ctx.scene.remove(this.root);
    this.label.remove();
    clearTimeout(this.bubbleTimer);
  }

  update(dt, t, others) {
    // xuất hiện / biến mất
    const bs = this.baseScale || 1;
    if (this.removing) {
      this.removeT -= dt;
      this.root.scale.setScalar(Math.max(0.001, (this.removeT / 0.35) * bs));
      if (this.removeT <= 0) { this.dispose(); return; }
    } else if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
      const s = this.spawnT;
      const e = 1 + 2.7 * Math.pow(s - 1, 3) + 1.7 * Math.pow(s - 1, 2); // easeOutBack
      this.root.scale.setScalar(Math.max(0.001, e * bs));
    }

    const ph = this.phase + t;
    let walking = false;
    if (this.mode === 'crowd') {
      const p = this.root.position;
      if (this.wait > 0) {
        this.wait -= dt;
      } else {
        const dx = this.target.x - p.x, dz = this.target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) {
          this.wait = 0.4 + this.r() * 2.6;
          this.target = randomAudiencePoint(this.r);
        } else {
          const step = Math.min(d, this.speed * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          const ang = Math.atan2(dx, dz);
          let diff = ang - this.root.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          this.root.rotation.y += diff * Math.min(1, dt * 8);
          walking = true;
        }
      }
      // tách nhau ra cho khỏi chồng lên
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o === this || o.mode !== 'crowd') continue;
        const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z;
        const dd = ox * ox + oz * oz;
        if (dd < 0.36 && dd > 1e-6) {
          const f = (0.6 - Math.sqrt(dd)) * dt * 2.5;
          p.x += ox * f; p.z += oz * f;
        }
      }
      // giữ trong khán đài
      p.z = Math.min(AUD.zMax, Math.max(AUD.zMin, p.z));
      const xl = AUD.xAt(p.z);
      p.x = Math.min(xl, Math.max(-xl, p.x));
      if (!walking) {
        // đứng nghỉ thì quay dần về phía sân khấu/camera
        let diff = 0 - this.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.root.rotation.y += diff * Math.min(1, dt * 2);
      }
    }

    // hoạt ảnh tay chân
    if (walking) {
      const s = Math.sin(ph * 9 * this.speed);
      this.legL.rotation.x = s * 0.7;
      this.legR.rotation.x = -s * 0.7;
      this.armL.rotation.x = -s * 0.6;
      this.armR.rotation.x = s * 0.6;
      this.body.position.y = Math.abs(Math.cos(ph * 9 * this.speed)) * 0.05;
      this.armL.rotation.z = 0.18; this.armR.rotation.z = -0.18;
    } else {
      // nhảy nhót tại chỗ
      const beat = ph * (this.mode === 'podium' ? 5 : 4);
      this.legL.rotation.x *= 0.85; this.legR.rotation.x *= 0.85;
      this.body.position.y = Math.abs(Math.sin(beat)) * (this.mode === 'podium' ? 0.08 : 0.04);
      this.armL.rotation.x = Math.sin(beat) * 0.3 - 0.2;
      this.armR.rotation.x = Math.sin(beat + Math.PI) * 0.3 - 0.2;
      const wave = this.mode === 'podium' ? 1.2 + Math.sin(beat * 0.5) * 0.9 : 0.25;
      this.armL.rotation.z = 0.18 + (Math.sin(beat * 0.5) > 0.3 ? wave * 0.6 : 0);
      this.armR.rotation.z = -0.18 - (Math.sin(beat * 0.5 + 1.5) > 0.3 ? wave * 0.6 : 0);
      this.head.rotation.z = Math.sin(beat) * 0.08;
    }

    // nhảy lên khi trả lời đúng
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      const k = Math.max(0, this.jumpT) / 0.6;
      this.jumpOffset = Math.sin(k * Math.PI) * 0.6;
      this.body.position.y += this.jumpOffset;
      this.armL.rotation.z = 2.6; this.armR.rotation.z = -2.6;
    } else this.jumpOffset = 0;

    // chớp mắt
    const blink = (ph % 4.2) < 0.12 ? 0.15 : 1.25;
    this.eyes.forEach((e) => (e.scale.y = blink));

    // đồ VIP
    if (this.aura) this.aura.rotation.z = t * 2;
    if (this.cape) this.cape.rotation.x = 0.15 + (walking ? 0.35 : 0) + Math.sin(ph * 4) * 0.06;
    if (this.wings) {
      const f = Math.sin(ph * 3) * 0.35;
      this.wingPivotL.rotation.y = -0.5 + f;
      this.wingPivotR.rotation.y = 0.5 - f;
    }
    if (this.pillar) {
      this.pillarMat.color.setHSL((t * 0.15) % 1, 1, 0.6);
      this.pillar.rotation.y = t;
    }
    if (this.tier >= 3 && !this.removing) {
      this.sparkle = (this.sparkle || 0) + dt;
      if (this.sparkle > 0.12) {
        this.sparkle = 0;
        const p = this.root.position;
        this.ctx.particles.emit(new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.2 + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 0.6),
          { count: 1, colors: this.tier >= 4 ? [0xffffff, 0x2ee6ff, 0xff3fa4, 0xffc83d] : [0xffc83d, 0xfff1a8], speed: 0.2, up: 0.8, gravity: 0, life: 1 });
      }
    }
  }
}
