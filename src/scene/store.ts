import * as THREE from 'three';
import { BRAND } from '../brand';

/**
 * The SariSwerte store, built entirely from Three.js primitives so the scene has
 * no asset dependencies: modern sari-sari, not the old wooden tindahan.
 *
 * Layout (camera looks down -Z from +Z):
 *   back wall at z = -3, shelves flanking at x = ±3.1, counter centered at z = -0.5,
 *   INDAY standing in front of it at z ≈ +0.5 facing the camera.
 */

export interface StoreHandle {
  root: THREE.Group;
  /** Sign texture so the HUD can show it is live. */
  signTexture: THREE.Texture;
}

const MAT = {
  emerald: new THREE.MeshStandardMaterial({ color: BRAND.emerald, roughness: 0.75, metalness: 0.05 }),
  emeraldDeep: new THREE.MeshStandardMaterial({ color: BRAND.emeraldDeep, roughness: 0.8, metalness: 0.05 }),
  emeraldLight: new THREE.MeshStandardMaterial({ color: BRAND.emeraldLight, roughness: 0.6, metalness: 0.1 }),
  white: new THREE.MeshStandardMaterial({ color: BRAND.white, roughness: 0.45, metalness: 0.02 }),
  offWhite: new THREE.MeshStandardMaterial({ color: BRAND.offWhite, roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: BRAND.gold, roughness: 0.25, metalness: 0.85 }),
  floor: new THREE.MeshStandardMaterial({ color: BRAND.floor, roughness: 0.28, metalness: 0.04 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.3, metalness: 0.8 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: BRAND.glass,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.4,
    transparent: true,
    opacity: 0.32,
  }),
};

/** A warm LED strip: emissive bar plus a soft point light so it actually glows. */
function ledStrip(width: number, color = BRAND.gold, intensity = 0.5): THREE.Group {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.02, 0.02),
    new THREE.MeshBasicMaterial({ color }),
  );
  g.add(bar);
  const glow = new THREE.PointLight(color, intensity, 2.2, 2);
  glow.position.set(0, 0, 0.05);
  g.add(glow);
  return g;
}

/** Product labels drawn on a canvas — real brands, readable from the camera. */
function labelTexture(text: string, bg: string, fg: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = text.length > 10 ? 26 : 34;
  ctx.font = `bold ${size}px Inter, Arial, sans-serif`;
  // Wrap long names onto two lines.
  const words = text.split(' ');
  if (words.length > 1 && text.length > 9) {
    ctx.fillText(words[0], 128, 50);
    ctx.fillText(words.slice(1).join(' '), 128, 86);
  } else {
    ctx.fillText(text, 128, 68);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface ProductDef {
  name: string;
  bg: string;
  fg: string;
  w: number;
  h: number;
  d: number;
  shape: 'can' | 'pack' | 'bag' | 'bottle';
}

/** The six products named in the brief, with plausible proportions and liveries. */
const PRODUCTS: ProductDef[] = [
  { name: 'Century Tuna', bg: '#1e3a8a', fg: '#ffffff', w: 0.13, h: 0.09, d: 0.13, shape: 'can' },
  { name: 'Lucky Me', bg: '#dc2626', fg: '#fde047', w: 0.16, h: 0.1, d: 0.06, shape: 'pack' },
  { name: 'Piattos', bg: '#15803d', fg: '#ffffff', w: 0.19, h: 0.24, d: 0.09, shape: 'bag' },
  { name: 'Nova', bg: '#b91c1c', fg: '#fef3c7', w: 0.19, h: 0.22, d: 0.09, shape: 'bag' },
  { name: 'Skyflakes', bg: '#e2e8f0', fg: '#1e293b', w: 0.2, h: 0.14, d: 0.08, shape: 'pack' },
  { name: 'Coke', bg: '#b91c1c', fg: '#ffffff', w: 0.09, h: 0.22, d: 0.09, shape: 'bottle' },
  { name: 'Sprite', bg: '#16a34a', fg: '#ffffff', w: 0.09, h: 0.22, d: 0.09, shape: 'bottle' },
];

function makeProduct(p: ProductDef): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.bg),
    roughness: 0.55,
    metalness: p.shape === 'can' ? 0.55 : 0.1,
  });

  let geo: THREE.BufferGeometry;
  if (p.shape === 'can' || p.shape === 'bottle') {
    geo = new THREE.CylinderGeometry(p.w / 2, p.w / 2, p.h, 20);
  } else {
    geo = new THREE.BoxGeometry(p.w, p.h, p.d);
  }
  const body = new THREE.Mesh(geo, bodyMat);
  body.position.y = p.h / 2;
  body.castShadow = true;
  g.add(body);

  // Label on the face that points at the camera.
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(p.w * 0.92, p.h * 0.72),
    new THREE.MeshBasicMaterial({ map: labelTexture(p.name, p.bg, p.fg), transparent: true }),
  );
  label.position.set(0, p.h * 0.52, p.d / 2 + 0.002);
  g.add(label);
  return g;
}

/** One shelving unit: 3 shelves, LED strip under each, stocked with products. */
function makeShelfUnit(side: -1 | 1): THREE.Group {
  const unit = new THREE.Group();
  const W = 1.9;
  const D = 0.46;

  // Uprights and back panel in emerald, shelves in white — the modern look.
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 2.3, 0.04), MAT.emerald);
  back.position.set(0, 1.15, -D / 2);
  back.receiveShadow = true;
  unit.add(back);

  for (const x of [-W / 2, W / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, D), MAT.emeraldLight);
    post.position.set(x, 1.15, 0);
    post.castShadow = true;
    unit.add(post);
  }

  for (let i = 0; i < 3; i++) {
    const y = 0.62 + i * 0.62;
    const board = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), MAT.white);
    board.position.set(0, y, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    unit.add(board);

    // LED strip tucked under the front edge of each shelf.
    const led = ledStrip(W * 0.94, BRAND.gold, 0.35);
    led.position.set(0, y - 0.035, D / 2 - 0.02);
    unit.add(led);

    // Stock the shelf: a few of each product, spread across the width.
    const row = i === 0 ? PRODUCTS.slice(0, 4) : i === 1 ? PRODUCTS.slice(2, 6) : PRODUCTS;
    const step = W / (row.length + 0.5);
    row.forEach((p, j) => {
      const item = makeProduct(p);
      item.position.set(-W / 2 + step * (j + 0.75), y + 0.03, 0.02);
      item.rotation.y = side === 1 ? -0.18 : 0.18;
      unit.add(item);
    });
  }

  // Emissive emerald valance so the unit reads as "lit display", not furniture.
  const valance = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, 0.03), MAT.gold);
  valance.position.set(0, 2.28, D / 2);
  unit.add(valance);

  unit.position.set(side * 3.1, 0, -2.15);
  unit.rotation.y = side === 1 ? -0.3 : 0.3;
  return unit;
}

/** The gold-on-emerald shop sign, with LED halo. */
function makeSign(): { group: THREE.Group; texture: THREE.Texture } {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0b7a5b');
  grad.addColorStop(0.55, '#065F46');
  grad.addColorStop(1, '#04412F');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 512);

  // Gold inner border.
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 10;
  ctx.strokeRect(28, 28, 2048 - 56, 512 - 56);

  // Wordmark.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FBBF24';
  ctx.shadowColor = 'rgba(251,191,36,0.85)';
  ctx.shadowBlur = 42;
  ctx.font = 'bold 190px Georgia, "Times New Roman", serif';
  ctx.fillText('SariSwerte', 1024, 205);

  // Tagline.
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 64px Inter, Arial, sans-serif';
  ctx.fillText('Tindahan • Essentials • Daily Needs', 1024, 365);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  group.add(board);

  // Backing slab + LED halo so the sign actually emits light into the room.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.28, 0.1), MAT.emeraldDeep);
  slab.position.z = -0.06;
  group.add(slab);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(4.9, 1.55),
    new THREE.MeshBasicMaterial({ color: BRAND.gold, transparent: true, opacity: 0.16 }),
  );
  halo.position.z = -0.02;
  group.add(halo);

  const signLight = new THREE.PointLight(BRAND.gold, 1.5, 7, 2);
  signLight.position.set(0, 0, 0.6);
  group.add(signLight);

  group.position.set(0, 2.62, -2.93);
  return { group, texture: tex };
}

/** Glass display counter with tinapay, eggs, POS, card machine and QR standees. */
function makeCounter(): THREE.Group {
  const g = new THREE.Group();
  const W = 2.6;
  const H = 0.92;
  const D = 0.72;

  // Base cabinet — white with an emerald kick plate.
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.12, D), MAT.white);
  base.position.y = (H - 0.12) / 2 + 0.12;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const kick = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, D), MAT.emerald);
  kick.position.y = 0.06;
  g.add(kick);

  // Gold trim along the counter top edge.
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.03, D + 0.04), MAT.gold);
  trim.position.y = H - 0.015;
  g.add(trim);

  // Top surface.
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), MAT.offWhite);
  top.position.y = H;
  top.receiveShadow = true;
  g.add(top);

  // Glass display case holding the tinapay and eggs.
  const caseGlass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.46, D * 0.72), MAT.glass);
  caseGlass.position.set(-W * 0.14, H + 0.25, 0);
  g.add(caseGlass);

  const caseFrameMat = MAT.steel;
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.02, D * 0.72), caseFrameMat);
  frameTop.position.set(-W * 0.14, H + 0.48, 0);
  g.add(frameTop);

  // Tinapay — a row of pandesal on a tray inside the case.
  const tray = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.02, D * 0.5), MAT.steel);
  tray.position.set(-W * 0.14, H + 0.05, 0);
  g.add(tray);

  const breadMat = new THREE.MeshStandardMaterial({ color: 0xc98b4b, roughness: 0.85 });
  for (let i = 0; i < 6; i++) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), breadMat);
    bun.scale.set(1, 0.72, 1.15);
    bun.position.set(-W * 0.14 - 0.28 + (i % 3) * 0.16, H + 0.1, -0.11 + Math.floor(i / 3) * 0.18);
    bun.castShadow = true;
    g.add(bun);
  }

  // Eggs in a tray beside the bread.
  const eggMat = new THREE.MeshStandardMaterial({ color: 0xf5e6cf, roughness: 0.6 });
  const eggTray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.3), MAT.steel);
  eggTray.position.set(W * 0.09, H + 0.05, 0);
  g.add(eggTray);
  for (let i = 0; i < 6; i++) {
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.037, 12, 10), eggMat);
    egg.scale.set(1, 1.28, 1);
    egg.position.set(W * 0.09 - 0.11 + (i % 3) * 0.11, H + 0.1, -0.07 + Math.floor(i / 3) * 0.14);
    egg.castShadow = true;
    g.add(egg);
  }

  // POS terminal — screen on a stand, facing INDAY.
  const posBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.13), MAT.dark);
  posBase.position.set(W * 0.3, H + 0.03, 0.02);
  g.add(posBase);
  const posStem = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), MAT.dark);
  posStem.position.set(W * 0.3, H + 0.1, 0.02);
  g.add(posStem);
  const posScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.17, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x1d4ed8, emissiveIntensity: 0.55 }),
  );
  posScreen.position.set(W * 0.3, H + 0.24, 0.02);
  posScreen.rotation.x = -0.22;
  g.add(posScreen);

  // Card machine — small terminal on the customer side.
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.1), MAT.dark);
  card.position.set(W * 0.42, H + 0.06, -0.18);
  card.rotation.y = 0.3;
  g.add(card);
  const cardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x22c55e, emissiveIntensity: 0.5 }),
  );
  cardFace.position.set(W * 0.42, H + 0.095, -0.18);
  cardFace.rotation.set(-Math.PI / 2, 0, 0.3);
  g.add(cardFace);

  // GCash + Maya QR standees.
  const qr = (x: number, brand: string, tint: string) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 320;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, 256, 58);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px Inter, Arial, sans-serif';
    ctx.fillText(brand, 128, 40);
    // Pseudo-QR block pattern, deterministic.
    ctx.fillStyle = '#0f172a';
    let seed = brand.length * 977;
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        if (seed % 3 !== 0) ctx.fillRect(34 + x * 16, 78 + y * 16, 14, 14);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.19), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(x, H + 0.11, -0.26);
    board.rotation.y = 0.12;
    g.add(board);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.04), MAT.steel);
    stand.position.set(x, H + 0.01, -0.26);
    g.add(stand);
  };
  qr(-W * 0.42, 'GCash', '#0070e0');
  qr(-W * 0.2, 'Maya', '#0f9d58');

  g.position.set(0, 0, -0.55);
  return g;
}

/** A 5kg sack of Sinandomeng rice resting at the foot of the counter. */
function makeRiceSack(): THREE.Group {
  const g = new THREE.Group();
  const sack = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.3, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.95 }),
  );
  sack.position.y = 0.15;
  sack.castShadow = true;
  g.add(sack);

  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f2ead6';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#065F46';
  ctx.fillRect(0, 92, 512, 78);
  ctx.fillStyle = '#FBBF24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillText('SINANDOMENG', 256, 118);
  ctx.fillStyle = '#065F46';
  ctx.font = 'bold 44px Inter, Arial, sans-serif';
  ctx.fillText('5 KG', 256, 200);
  ctx.font = '600 30px Inter, Arial, sans-serif';
  ctx.fillStyle = '#0b7a5b';
  ctx.fillText('PREMIUM RICE', 256, 46);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.26),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  front.position.set(0, 0.16, 0.171);
  g.add(front);

  g.position.set(-0.86, 0, 0.06);
  g.rotation.y = 0.28;
  return g;
}

/** Light grey tile floor with a subtle grout grid. */
function makeFloor(): THREE.Mesh {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d7dbe0';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#c2c8cf';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 7);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 8.5),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  return floor;
}

export function buildStore(): StoreHandle {
  const root = new THREE.Group();

  root.add(makeFloor());

  // Walls: emerald lower band, white upper band — the modern two-tone look.
  const back = new THREE.Mesh(new THREE.BoxGeometry(11, 3.6, 0.12), MAT.emerald);
  back.position.set(0, 1.8, -3);
  back.receiveShadow = true;
  root.add(back);

  const backUpper = new THREE.Mesh(new THREE.BoxGeometry(11, 1.0, 0.14), MAT.white);
  backUpper.position.set(0, 3.1, -3);
  root.add(backUpper);

  const wainscot = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.16), MAT.gold);
  wainscot.position.set(0, 2.6, -3);
  root.add(wainscot);

  for (const side of [-1, 1] as const) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 8.5), MAT.white);
    wall.position.set(side * 5.5, 1.8, 0.2);
    wall.receiveShadow = true;
    root.add(wall);
  }

  root.add(makeShelfUnit(-1));
  root.add(makeShelfUnit(1));
  root.add(makeCounter());
  root.add(makeRiceSack());

  const sign = makeSign();
  root.add(sign.group);

  // Ceiling light panels — bright modern, warm LED.
  for (const z of [-2.2, 0.6]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 0.04, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xfff4e0 }),
    );
    panel.position.set(0, 3.45, z);
    root.add(panel);
    const lamp = new THREE.PointLight(0xfff0d8, 1.15, 9, 2);
    lamp.position.set(0, 3.2, z);
    root.add(lamp);
  }

  return { root, signTexture: sign.texture };
}

/** Warm ambient + key lighting tuned for a bright, welcoming interior. */
export function addStoreLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd7dbe0, 1.05));

  const key = new THREE.DirectionalLight(0xfff6e8, 1.5);
  key.position.set(3.4, 5.2, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0008;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdff3ff, 0.5);
  fill.position.set(-4, 3, 3);
  scene.add(fill);

  const rim = new THREE.PointLight(BRAND.gold, 0.9, 8, 2);
  rim.position.set(0, 2.4, 1.6);
  scene.add(rim);
}
