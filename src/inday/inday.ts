import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BRAND } from '../brand';

/**
 * INDAY — the SariSwerte store assistant.
 *
 * The brief asks for the Grab3D "woman base character" GLB, restyled as a
 * Filipina tindera and lip-synced by TalkingHead. Two facts drive the design here:
 *
 *  1. A *base mesh* normally has no facial blend shapes. TalkingHead needs a
 *     Mixamo rig plus 52 ARKit and 15 Oculus viseme shape keys. So we PROBE the
 *     loaded model at runtime and pick the best lip-sync path that actually
 *     exists, instead of assuming one.
 *  2. If the GLB is missing, the scene must not be empty or silently broken. A
 *     procedural stand-in INDAY is shown and the HUD says plainly that the GLB
 *     was not found.
 *
 * Lip-sync strategies, best first:
 *   'visemes'   — Oculus viseme_* morph targets (what TalkingHead drives)
 *   'arkit'     — ARKit jawOpen / mouthFunnel / mouthPucker blend shapes
 *   'jaw-bone'  — rotate the jaw bone directly (works on any rigged mesh)
 *   'none'      — nothing animatable; the HUD reports it honestly
 */

export type LipSyncMode = 'visemes' | 'arkit' | 'jaw-bone' | 'none';

export interface AvatarCapabilities {
  source: 'glb' | 'procedural';
  lipSync: LipSyncMode;
  bones: number;
  morphTargets: string[];
  hasVisemes: boolean;
  hasArkit: boolean;
  note: string;
}

export interface IndayHandle {
  root: THREE.Group;
  capabilities: AvatarCapabilities;
  /** Drive the mouth. `value` is 0..1 jaw opening. */
  setMouthOpen(value: number): void;
  /** Tell the body whether INDAY is mid-sentence, so gestures can react. */
  setSpeaking(active: boolean): void;
  /** Idle breathing + weight shift, called every frame. */
  update(elapsed: number): void;
  dispose(): void;
}

const VISEME_KEYS = [
  'viseme_sil', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD', 'viseme_kk',
  'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR', 'viseme_aa', 'viseme_E',
  'viseme_I', 'viseme_O', 'viseme_U',
];

const ARKIT_KEYS = ['jawOpen', 'mouthFunnel', 'mouthPucker', 'mouthClose', 'mouthSmileLeft', 'mouthSmileRight'];

/** Recursively collect morph target names and the meshes that own them. */
function scanMeshes(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) meshes.push(m);
  });
  const names = new Set<string>();
  for (const m of meshes) {
    const dict = m.morphTargetDictionary;
    if (dict) Object.keys(dict).forEach((k) => names.add(k));
  }
  return { meshes, morphNames: [...names] };
}

/** Find a jaw bone by common rig naming conventions. */
function findJawBone(root: THREE.Object3D): THREE.Bone | null {
  let jaw: THREE.Bone | null = null;
  root.traverse((o) => {
    if (jaw) return;
    const b = o as THREE.Bone;
    if (!b.isBone) return;
    const n = b.name.toLowerCase();
    if (n === 'jaw' || n.endsWith('jaw') || n.includes('jawbone') || n === 'mixamorigjaw') jaw = b;
  });
  return jaw;
}

/** Set a morph target by name across every mesh that owns it. */
function setMorph(meshes: THREE.Mesh[], name: string, value: number) {
  for (const m of meshes) {
    const dict = m.morphTargetDictionary;
    if (!dict) continue;
    const idx = dict[name];
    if (idx === undefined) continue;
    if (!m.morphTargetInfluences) continue;
    m.morphTargetInfluences[idx] = THREE.MathUtils.clamp(value, 0, 1);
  }
}

/**
 * Apply the INDAY look to whatever we loaded. We cannot repaint arbitrary
 * textures without knowing the UVs, so this tints skin/hair materials by name and
 * adds the emerald blouse + gold trim + INDAY name tag as real geometry. That
 * reads correctly for a base mesh and for the procedural stand-in.
 */
function styleAsInday(root: THREE.Object3D, isProcedural: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.color) continue;
      const name = (std.name || '').toLowerCase();
      if (!isProcedural) {
        // Respect the original textures; only nudge materials that are clearly
        // skin or hair so INDAY reads as morena with black hair.
        if (name.includes('skin') || name.includes('body')) std.color.lerp(new THREE.Color(BRAND.skin), 0.55);
        if (name.includes('hair')) std.color.lerp(new THREE.Color(BRAND.hair), 0.8);
        std.roughness = Math.min(1, (std.roughness ?? 0.7) + 0.1);
      }
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

/** The emerald blouse with gold trim, fitted to a humanoid torso. */
function makeBlouse(): THREE.Group {
  const g = new THREE.Group();
  const blouseMat = new THREE.MeshStandardMaterial({ color: BRAND.emerald, roughness: 0.62, metalness: 0.08 });
  const goldMat = new THREE.MeshStandardMaterial({ color: BRAND.gold, roughness: 0.25, metalness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.5, 24, 1, true), blouseMat);
  torso.position.y = 0;
  torso.castShadow = true;
  g.add(torso);

  // Gold collar and centre placket — the "with gold details" requirement.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 8, 28), goldMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.25;
  g.add(collar);

  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.42, 0.012), goldMat);
  placket.position.set(0, 0.02, 0.208);
  g.add(placket);

  return g;
}

/** The INDAY name tag worn on the blouse. */
function makeNameTag(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#065F46';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 62px Inter, Arial, sans-serif';
  ctx.fillText('INDAY', 128, 52);
  ctx.fillStyle = '#0b7a5b';
  ctx.font = '600 26px Inter, Arial, sans-serif';
  ctx.fillText('Store Assistant', 128, 98);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, 0.055),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  return tag;
}

/**
 * Procedural INDAY: a stylised-but-realistic humanoid in A-pose. Used when the
 * Grab3D GLB is absent, and as the reference for where the blouse and tag sit.
 */
function buildProceduralInday(): { root: THREE.Group; jaw: THREE.Object3D; mouthAnchor: THREE.Object3D } {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: BRAND.skin, roughness: 0.62, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: BRAND.hair, roughness: 0.42, metalness: 0.05 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.25 });

  // Torso in the emerald blouse.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 8, 20), skin);
  torso.position.y = 1.16;
  torso.castShadow = true;
  root.add(torso);

  const blouse = makeBlouse();
  blouse.position.y = 1.2;
  root.add(blouse);

  // Hips / skirt.
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.3, 0.5, 22),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }),
  );
  skirt.position.y = 0.78;
  skirt.castShadow = true;
  root.add(skirt);

  // Neck + head.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 14), skin);
  neck.position.y = 1.46;
  root.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.62;
  root.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 28, 24), skin);
  skull.scale.set(0.92, 1.1, 0.96);
  skull.castShadow = true;
  head.add(skull);

  // Jaw — the piece that actually opens for lip-sync in 'jaw-bone' mode.
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.098, 22, 16, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), skin);
  jaw.scale.set(0.88, 0.8, 0.92);
  jaw.position.set(0, -0.028, 0.004);
  head.add(jaw);

  // Dark brown eyes.
  for (const x of [-0.042, 0.042]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 14, 12), eyeMat);
    eye.position.set(x, 0.018, 0.098);
    head.add(eye);
    const white = new THREE.Mesh(
      new THREE.SphereGeometry(0.0175, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.2 }),
    );
    white.position.set(x, 0.018, 0.094);
    head.add(white);
  }

  // Long straight black hair: cap + back sheet + two front strands.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  cap.scale.set(0.96, 1.06, 1);
  cap.position.y = 0.012;
  head.add(cap);

  const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.52, 0.075), hairMat);
  backHair.position.set(0, -0.24, -0.075);
  backHair.castShadow = true;
  head.add(backHair);

  for (const x of [-0.088, 0.088]) {
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.055), hairMat);
    strand.position.set(x, -0.16, 0.055);
    strand.rotation.z = x > 0 ? -0.04 : 0.04;
    head.add(strand);
  }

  // Name tag on the blouse.
  const tag = makeNameTag();
  tag.position.set(0.075, 1.24, 0.198);
  root.add(tag);

  // A-pose arms: angled out and down, not a T, not a squat.
  for (const side of [-1, 1] as const) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.44, 6, 14), skin);
    arm.position.set(side * 0.245, 1.12, 0);
    arm.rotation.z = side * 0.38;
    arm.castShadow = true;
    root.add(arm);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.3, 6, 14), skin);
    forearm.position.set(side * 0.365, 0.79, 0.02);
    forearm.rotation.z = side * 0.2;
    forearm.castShadow = true;
    root.add(forearm);

    // Legs, straight and together — standing, definitely not squatting.
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.5, 6, 14), skin);
    leg.position.set(side * 0.095, 0.36, 0);
    leg.castShadow = true;
    root.add(leg);
  }

  const mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, -0.05, 0.09);
  head.add(mouthAnchor);

  return { root, jaw, mouthAnchor };
}

export interface LoadIndayOptions {
  /** Path to the GLB. Defaults to the brief's filename. */
  url?: string;
  /** Called with progress 0..1 while the GLB downloads. */
  onProgress?: (fraction: number) => void;
}

export async function loadInday(opts: LoadIndayOptions = {}): Promise<IndayHandle> {
  const url = opts.url ?? 'models/INDAY_Avatar.glb';

  const place = (root: THREE.Group) => {
    root.position.set(0, 0, 0.55);
    root.rotation.y = 0;
    return root;
  };

  /**
   * A dev server's SPA fallback answers a missing .glb with index.html and HTTP
   * 200, which GLTFLoader then tries to parse forever. Verify the response really
   * is a binary glTF before handing the URL to the loader.
   */
  const glbAvailable = async (): Promise<boolean> => {
    try {
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-11' } });
      if (!res.ok) return false;
      const type = res.headers.get('content-type') || '';
      if (/text\/html/i.test(type)) return false;
      const head = new Uint8Array(await res.arrayBuffer());
      // "glTF" magic.
      return head.length >= 4 && head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46;
    } catch {
      return false;
    }
  };

  let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>> | null = null;
  if (await glbAvailable()) {
    try {
      const loader = new GLTFLoader();
      gltf = await loader.loadAsync(
        url,
        opts.onProgress
          ? (ev) => {
              if (ev.total > 0) opts.onProgress!(ev.loaded / ev.total);
            }
          : undefined,
      );
    } catch {
      gltf = null;
    }
  }

  if (!gltf) {
    const { root, jaw } = buildProceduralInday();
    styleAsInday(root, true);
    let jawBase: number | undefined;
    const handle: IndayHandle = {
      root: place(root),
      capabilities: {
        source: 'procedural',
        lipSync: 'jaw-bone',
        bones: 0,
        morphTargets: [],
        hasVisemes: false,
        hasArkit: false,
        note: `GLB "${url}" not found — showing the procedural INDAY stand-in. Drop the Grab3D file next to index.html and reload.`,
      },
      setMouthOpen(v: number) {
        if (jawBase === undefined) jawBase = jaw.rotation.x;
        jaw.rotation.x = jawBase + v * 0.42;
      },
      setSpeaking() {
        // The procedural stand-in has no rig to gesture with.
      },
      update(elapsed: number) {
        root.position.y = Math.sin(elapsed * 1.1) * 0.006;
        root.rotation.y = Math.sin(elapsed * 0.35) * 0.03;
      },
      dispose() {},
    };
    return handle;
  }

  const root = gltf.scene;

  /**
   * The Blender export contains both INDAY and a Store_* set. The web app builds
   * its own richer store from Three.js primitives, so keep only the character
   * ("INDAY_*") and drop the rest to avoid a doubled-up shop.
   */
  const strays: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (/^Store_/i.test(o.name)) strays.push(o);
  });
  for (const o of strays) o.parent?.remove(o);

  styleAsInday(root, false);

  const { meshes, morphNames } = scanMeshes(root);
  const hasVisemes = VISEME_KEYS.some((k) => morphNames.includes(k));
  const hasArkit = ARKIT_KEYS.some((k) => morphNames.includes(k));
  const jawBone = findJawBone(root);

  let boneCount = 0;
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) boneCount++;
  });

  // Scale the GLB to a believable ~1.7 m store assistant and stand it on the floor.
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.01) {
    const targetHeight = 1.7;
    const s = targetHeight / size.y;
    if (s < 0.4 || s > 2.5) root.scale.setScalar(s);
  }
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

  const group = new THREE.Group();
  group.add(root);

  // The Blender build already ships the emerald blouse, gold trim and INDAY name
  // tag. Only add them when the model arrived without them (a bare base mesh).
  // A skinned character already ships its own clothing and textures; adding
  // procedural geometry on top would float over the rig. Only the bare
  // procedural stand-in gets the emerald outfit.
  const isRigged = boneCount > 0;
  if (!isRigged) {
    const blouse = makeBlouse();
    blouse.position.set(0, 1.2, 0);
    blouse.scale.setScalar(1.02);
    group.add(blouse);

    const tag = makeNameTag();
    tag.position.set(0.08, 1.24, 0.21);
    group.add(tag);
  }

  // ---- Body animation -------------------------------------------------
  // The operator's avatar is a skinned Mixamo-style rig, so we can move real
  // bones: breathing, a slow head sway, and a talking gesture with the arms.
  // Bones are cached with their rest rotation so every frame is an offset
  // from the authored pose instead of drifting further away.
  type RigBone = { bone: THREE.Bone; rest: THREE.Euler };
  const grab = (suffixes: string[]): RigBone[] => {
    const out: RigBone[] = [];
    root.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      const n = b.name.toLowerCase();
      if (suffixes.some((sfx) => n === sfx || n.endsWith(sfx))) {
        out.push({ bone: b, rest: b.rotation.clone() });
      }
    });
    return out;
  };
  const spineBones = grab(['spine', 'spine1', 'spine2']);
  const headBones = grab(['neck', 'neck1', 'neck2', 'head']);
  const armBonesL = grab(['leftarm', 'leftforearm']);
  const armBonesR = grab(['rightarm', 'rightforearm']);
  // Only the wrist itself, not the fingers: grabbing every finger bone made the
  // hands curl and uncurl on their own, which looked restless.
  const handBonesL = grab(['lefthand']);
  const handBonesR = grab(['righthand']);
  const rigged = boneCount > 0;

  let speaking = false;
  let talkRamp = 0;

  const animateBody = (t: number, talking: boolean) => {
    if (!rigged) return;
    // Ease the gesture in and out so the arms do not snap between poses.
    talkRamp += ((talking ? 1 : 0) - talkRamp) * 0.06;

    const breathe = Math.sin(t * 1.15) * 0.018;
    for (const { bone, rest } of spineBones) {
      bone.rotation.x = rest.x + breathe * 0.5;
      bone.rotation.z = rest.z + Math.sin(t * 0.7) * 0.006;
    }

    // Head: slow idle sway, plus a small nod on the beat of the sentence.
    const nod = Math.sin(t * 2.3) * 0.035 * talkRamp;
    for (const { bone, rest } of headBones) {
      bone.rotation.x = rest.x + Math.sin(t * 0.9) * 0.03 + nod;
      bone.rotation.y = rest.y + Math.sin(t * 0.62) * 0.09;
      bone.rotation.z = rest.z + Math.sin(t * 0.45) * 0.02;
    }

    // Arms: relaxed at rest, and a small gesture only while speaking. The
    // gesture is deliberately low-amplitude and slow (0.55 Hz, ~4 degrees).
    // An earlier version swung them continuously at 1.9 rad/s with the whole
    // shoulder, which read as a windmill and looked tiring.
    const gest = Math.sin(t * 0.55) * talkRamp;
    for (const { bone, rest } of armBonesL) {
      bone.rotation.z = rest.z + gest * 0.055 + talkRamp * 0.02;
      bone.rotation.x = rest.x - gest * 0.03;
    }
    for (const { bone, rest } of armBonesR) {
      bone.rotation.z = rest.z - gest * 0.045 - talkRamp * 0.015;
      bone.rotation.x = rest.x + gest * 0.025;
    }

    // Hands stay softly curled rather than stiff, and the wrist barely moves.
    const wrist = Math.sin(t * 0.5) * talkRamp * 0.04;
    for (const { bone, rest } of handBonesL) {
      bone.rotation.z = rest.z + wrist;
    }
    for (const { bone, rest } of handBonesR) {
      bone.rotation.z = rest.z - wrist;
    }
  };

  const mode: LipSyncMode = hasVisemes ? 'visemes' : hasArkit ? 'arkit' : jawBone ? 'jaw-bone' : 'none';

  // ---- Face -----------------------------------------------------------
  // The rig ships 51 ARKit blendshapes but no jaw bone, so the mouth has to be
  // driven entirely by morphs. Opening the jaw alone looked mechanical, so the
  // lips and cheeks move with it: a wide "aa" rounds the mouth, and the lower
  // lip drops instead of the whole face shifting.
  const MORPHS = {
    open: ['jawOpen'],
    round: ['mouthFunnel', 'mouthPucker'],
    lower: ['mouthLowerDownLeft', 'mouthLowerDownRight'],
    close: ['mouthClose'],
    smile: ['mouthSmileLeft', 'mouthSmileRight'],
  } as const;

  /** Slowly blinking eyes, because a face that never blinks looks dead. */
  let nextBlink = 2.5;
  let blinkStart = -1;

  const driveFace = (t: number, open: number) => {
    if (mode !== 'arkit') return;
    setMorph(meshes, 'jawOpen', open);
    // Funnel/pucker only on the wider vowels, so speech does not look like a kiss.
    const round = open > 0.55 ? (open - 0.55) / 0.45 : 0;
    for (const name of MORPHS.round) setMorph(meshes, name, round * 0.35);
    const lower = Math.max(0, open - 0.25);
    for (const name of MORPHS.lower) setMorph(meshes, name, lower * 0.3);
    setMorph(meshes, 'mouthClose', Math.max(0, 0.28 - open) * 0.9);
    // A light smile at rest, so she does not look bored between sentences.
    const smile = 0.12 + open * 0.1;
    for (const name of MORPHS.smile) setMorph(meshes, name, smile);

    // Blink on a natural interval, never twice in the same beat.
    if (blinkStart < 0 && t >= nextBlink) {
      blinkStart = t;
    }
    if (blinkStart >= 0) {
      const phase = (t - blinkStart) / 0.16;
      if (phase >= 1) {
        blinkStart = -1;
        nextBlink = t + 2.4 + Math.random() * 3.2;
        setMorph(meshes, 'eyeBlinkLeft', 0);
        setMorph(meshes, 'eyeBlinkRight', 0);
      } else {
        const v = Math.sin(phase * Math.PI);
        setMorph(meshes, 'eyeBlinkLeft', v);
        setMorph(meshes, 'eyeBlinkRight', v);
      }
    }
  };

  let jawBase: number | undefined;
  /** Latest mouth opening from the lip-sync track, consumed by update(). */
  let lastMouth = 0;
  const setMouthOpen = (v: number) => {
    const open = THREE.MathUtils.clamp(v, 0, 1);
    if (mode === 'visemes') {
      // Drive a vowel-ish viseme mix; TalkingHead does the real sequencing.
      setMorph(meshes, 'viseme_aa', open * 0.9);
      setMorph(meshes, 'viseme_O', open * 0.35);
      setMorph(meshes, 'viseme_sil', 1 - open);
    } else if (mode === 'arkit') {
      // Face is driven from update(), which has the clock for blinking.
      lastMouth = open;
    } else if (mode === 'jaw-bone' && jawBone) {
      if (jawBase === undefined) jawBase = jawBone.rotation.x;
      jawBone.rotation.x = jawBase + open * 0.32;
    }
  };

  const note =
    mode === 'visemes'
      ? 'Oculus viseme blend shapes found — TalkingHead can lip-sync this model directly.'
      : mode === 'arkit'
        ? 'ARKit blend shapes found (no Oculus visemes) — driving jawOpen/mouthClose.'
        : mode === 'jaw-bone'
          ? 'No facial blend shapes in this GLB (it is a base mesh). Lip-sync falls back to jaw-bone rotation. For true TalkingHead lip-sync the GLB needs a Mixamo rig plus 52 ARKit / 15 Oculus viseme shape keys.'
          : 'This GLB has no blend shapes and no jaw bone, so the mouth cannot be animated. TalkingHead needs a Mixamo rig plus ARKit and Oculus viseme shape keys.';

  return {
    root: place(group),
    capabilities: {
      source: 'glb',
      lipSync: mode,
      bones: boneCount,
      morphTargets: morphNames,
      hasVisemes,
      hasArkit,
      note,
    },
    setMouthOpen,
    setSpeaking(active: boolean) {
      speaking = active;
    },
    update(elapsed: number) {
      group.position.y = Math.sin(elapsed * 1.1) * 0.005;
      animateBody(elapsed, speaking);
      driveFace(elapsed, lastMouth);
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm) => mm?.dispose());
        }
      });
    },
  };
}
