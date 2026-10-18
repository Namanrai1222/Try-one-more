/**
 * 3D view of a 2D game: Three.js draws the level with depth, light and shadow; the
 * player still moves on one plane (z = 0), driven entirely by the deterministic engine.
 * This module only reads sim state — it never writes it, so rendering cannot affect replays.
 * Only imported by game.ts, which is itself behind a dynamic import.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  LEADER_GATE,
  PHYSICS,
  SpikeMode,
  activeGoal,
  inScope,
  spikeUp,
  toFixed,
  toPx,
} from '@jom/engine';
import type { DoorLook, Rect, SimLevel, SimState } from '@jom/engine';
import { colors, fontFamilies } from '@jom/ui';
import type { ColorToken } from '@jom/ui';

/** World units per level pixel: the 960×540 level becomes 30×16.9 units. */
const U = 1 / 32;
/** Depth of the level slabs along z. */
const DEPTH = 4;
/** Minimum world units kept in view, vertically and horizontally (portrait phones). */
const VIEW_H = 8;
const VIEW_W = 13;
/** How far ahead of the runner the camera looks, as a share of the half-width in view. */
const LOOKAHEAD = 0.28;
/** Level-start pan (first visit only): a beat on the far end, then back to the runner. */
const INTRO_HOLD = 0.45;
const INTRO_PAN = 1.0;
/**
 * The rooms behind each chapter (tooling/blender/backdrops.py): seamless 16-unit tiles. They
 * are dim scenery, faded into the sky at the top and never brighter than the course.
 */
const BACKDROPS: Record<number, string> = {
  1: new URL('../assets/backdrop-ch1.webp', import.meta.url).href,
  2: new URL('../assets/backdrop-ch2.webp', import.meta.url).href,
  3: new URL('../assets/backdrop-ch3.webp', import.meta.url).href,
  4: new URL('../assets/backdrop-ch4.webp', import.meta.url).href,
};
/** World units one tile covers: smaller than the view, so the hall reads large and far away. */
const BACKDROP_TILE = 14;
/** How far behind the course the hall stands (z); fog softens it at this depth. */
const BACKDROP_Z = -DEPTH / 2 - 18;

const col = (token: ColorToken, k = 1) => new Color(colors[token]).multiplyScalar(k);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (rate: number, dt: number) => Math.min(1, rate * dt);

/** Fine grey noise, multiplied into surface colours so slabs read as concrete, not plastic. */
function grainTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 190 + Math.random() * 65;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function disposeTree(root: Object3D, ownedMaterialsOnly: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    for (const m of ([] as Material[]).concat(o.material)) {
      if (ownedMaterialsOnly && !m.userData.owned) continue;
      (m as MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  });
}

// ---------------------------------------------------------------- people
/**
 * The player is a person: head, torso, and two-part arms and legs on pivots, so the run is a
 * real stride. Built to the sim's 24×32 px box (1 world unit tall at U = 1/32): feet at the
 * bottom of the box, top of the head at its top — what you see is what gets hit.
 * The figure faces +z; the view turns it towards the direction of travel.
 */
function humanGeometry() {
  return {
    head: new SphereGeometry(0.1, 20, 14),
    hair: new SphereGeometry(0.107, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    eye: new SphereGeometry(0.013, 6, 4),
    nose: new SphereGeometry(0.018, 8, 6),
    neck: new CylinderGeometry(0.04, 0.045, 0.07, 10),
    torso: new CapsuleGeometry(0.14, 0.06, 6, 14),
    upperArm: new CapsuleGeometry(0.045, 0.1, 4, 10),
    forearm: new CapsuleGeometry(0.04, 0.09, 4, 10),
    hand: new SphereGeometry(0.045, 10, 8),
    thigh: new CapsuleGeometry(0.065, 0.1, 4, 10),
    shin: new CapsuleGeometry(0.055, 0.12, 4, 10),
    shoe: new BoxGeometry(0.09, 0.05, 0.16),
  };
}
type HumanGeometry = ReturnType<typeof humanGeometry>;
interface HumanLooks {
  top: Material;
  legs: Material;
  skin: Material;
  hair: Material;
  shoes: Material;
  eyes: Material;
}

interface Human {
  /** Feet at the origin. */
  readonly root: Group;
  /** Squash, stretch and lean act on this. */
  readonly body: Group;
  /** The hoodie: body and sleeves. */
  setTop(m: Material): void;
  /** vx: px/frame; rise: px/frame upwards, away from the feet; dt: seconds. */
  pose(vx: number, rise: number, grounded: boolean, dt: number): void;
}

const RUN_MAX = toPx(PHYSICS.runMax);

function makeHuman(geo: HumanGeometry, looks: HumanLooks, shadows = true): Human {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const top: Mesh[] = [];
  const part = (
    g: HumanGeometry[keyof HumanGeometry],
    m: Material,
    parent: Group,
    y = 0,
    z = 0,
  ) => {
    const mesh = new Mesh(g, m);
    mesh.position.set(0, y, z);
    mesh.castShadow = shadows;
    parent.add(mesh);
    if (m === looks.top) top.push(mesh);
    return mesh;
  };
  const pivot = (parent: Group, x: number, y: number) => {
    const g = new Group();
    g.position.set(x, y, 0);
    parent.add(g);
    return g;
  };
  part(geo.torso, looks.top, body, 0.62).scale.z = 0.7; // wider than deep
  part(geo.neck, looks.skin, body, 0.81);
  const head = pivot(body, 0, 0.9);
  part(geo.head, looks.skin, head);
  // Tilted back: a hairline above the eyes, shorter at the front than the back.
  part(geo.hair, looks.hair, head, 0.012, -0.01).rotation.x = -0.35;
  for (const x of [-0.035, 0.035]) part(geo.eye, looks.eyes, head, 0.012, 0.094).position.x = x;
  part(geo.nose, looks.skin, head, -0.015, 0.098);

  const limb = (x: number, y: number, arm: boolean) => {
    const upper = pivot(body, x, y);
    part(arm ? geo.upperArm : geo.thigh, arm ? looks.top : looks.legs, upper, arm ? -0.095 : -0.11);
    const joint = pivot(upper, 0, arm ? -0.19 : -0.22);
    part(arm ? geo.forearm : geo.shin, arm ? looks.top : looks.legs, joint, arm ? -0.085 : -0.105);
    if (arm) part(geo.hand, looks.skin, joint, -0.18);
    else part(geo.shoe, looks.shoes, joint, -0.215, 0.03);
    return { upper, joint };
  };
  const armL = limb(-0.185, 0.75, true);
  const armR = limb(0.185, 0.75, true);
  const legL = limb(-0.075, 0.47, false);
  const legR = limb(0.075, 0.47, false);

  let phase = 0;
  let clock = 0;
  // rotation.x > 0 swings a hanging limb backwards (and bends a knee); < 0 swings it forwards.
  const to = (o: Group, x: number, k: number) => (o.rotation.x += (x - o.rotation.x) * k);
  return {
    root,
    body,
    setTop(m) {
      for (const t of top) t.material = m;
    },
    pose(vx, rise, grounded, dt) {
      const k = Math.min(1, 18 * dt);
      const speed = Math.min(1, Math.abs(vx) / RUN_MAX);
      clock += dt;
      if (grounded) {
        // The stride: legs swing opposite each other, the recovering knee bends, arms counter.
        phase += Math.abs(vx) * dt * 4.6;
        const swing = Math.sin(phase) * 0.8 * speed;
        to(legL.upper, -swing, k);
        to(legR.upper, swing, k);
        to(legL.joint, Math.max(0, Math.cos(phase)) * 1.2 * speed + 0.04, k);
        to(legR.joint, Math.max(0, -Math.cos(phase)) * 1.2 * speed + 0.04, k);
        to(armL.upper, swing * 0.9, k);
        to(armR.upper, -swing * 0.9, k);
        to(armL.joint, -(0.2 + 0.7 * speed), k);
        to(armR.joint, -(0.2 + 0.7 * speed), k);
        body.position.y = Math.abs(Math.sin(phase)) * 0.035 * speed;
        // Running: lean in. Standing: breathe.
        const lean = 0.14 * speed + Math.sin(clock * 2) * 0.012 * (1 - speed);
        body.rotation.x += (lean - body.rotation.x) * k;
      } else {
        // Going up: knee tucked, arms up. Coming down: legs reaching, arms flailing.
        const up = rise > 0;
        const flail = up ? 0 : Math.sin(clock * 18) * 0.25;
        to(legL.upper, up ? -1.1 : -0.35, k);
        to(legL.joint, up ? 1.5 : 0.35, k);
        to(legR.upper, up ? 0.25 : 0.2, k);
        to(legR.joint, up ? 0.9 : 0.2, k);
        to(armL.upper, (up ? -2.6 : -2.1) + flail, k);
        to(armR.upper, (up ? -2.4 : -1.9) - flail, k);
        to(armL.joint, -0.35, k);
        to(armR.joint, -0.35, k);
        body.position.y -= body.position.y * k;
        body.rotation.x += (0.05 - body.rotation.x) * k;
      }
    },
  };
}

/** How far a person turns towards the direction of travel (the camera still sees their face). */
const TURN = 1.15;

export interface View {
  readonly canvas: HTMLCanvasElement;
  /** `intro`: pan to the far end and back before play (first visit to a level). */
  setLevel(level: SimLevel, intro?: boolean): void;
  /** px/py: interpolated top-left of the player in level pixels. dt in seconds. */
  render(state: SimState, px: number, py: number, dt: number, showPlayer?: boolean): void;
  jumped(): void;
  landed(): void;
  died(state: SimState): void;
  /** Ghosts (levels with `view.ghosts`): failed attempts' paths from `attemptTracks`. */
  setGhosts(tracks: readonly Int32Array[]): void;
  /** Party play: this player's seat colour. */
  setTint(token: ColorToken): void;
  /** Party play: everyone else, from the server's snapshots. */
  setOthers(bodies: readonly OtherBody[]): void;
  /** Sabotage: ghost outlines on the slots that can still be armed. */
  setMarkers(on: boolean): void;
  /** Canvas CSS pixels of a level point (level px), for DOM controls over the world. */
  project(x: number, y: number): { x: number; y: number };
  dispose(): void;
}

/** Another player's body, in sim units (as the server snapshot carries it). */
export interface OtherBody {
  x: number;
  y: number;
  big: number;
  gravity: number;
  tint: ColorToken;
}

/** Chapter tile sets: the same concrete, tinted per chapter, within the palette. */
const CHAPTER_TONE: Record<number, [ColorToken, number]> = {
  2: ['saw', 1.05],
  3: ['red-pen', 0.42],
  4: ['jade', 0.55],
};
const MAX_GHOSTS = 12;

/** `fixed`: render at exactly this many pixels instead of following the container (clips). */
export function createView(container: HTMLElement, fixed?: { w: number; h: number }): View {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(fixed ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  // ---------------------------------------------------------------- world
  const scene = new Scene();
  const sky = col('ink', 1.25);
  scene.background = sky;
  const fog = new Fog(sky, 22, 55); // near/far follow the camera distance (see resize)
  scene.fog = fog;
  // Soft studio reflections: without an environment, metal renders near-black.
  const pmrem = new PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.35;

  const hemi = new HemisphereLight(col('chalk'), col('carbon'), 0.8);
  scene.add(hemi);
  // Darkness (levels 16–17): only this lamp, carried by the player, lights the way.
  const lamp = new PointLight(col('chalk'), 0, 8, 1.6);
  scene.add(lamp);
  const sun = new DirectionalLight(col('chalk'), 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -14,
    right: 14,
    top: 12,
    bottom: -12,
    near: 1,
    far: 60,
  });
  sun.shadow.radius = 4; // soft edges (PCF)
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const wall = new Mesh(
    new PlaneGeometry(400, 120),
    new MeshStandardMaterial({ color: col('ink', 1.9), roughness: 1 }),
  );
  wall.position.set(0, 20, BACKDROP_Z - 6);
  wall.receiveShadow = true;
  scene.add(wall);

  // The chapter's room, just in front of the wall: far enough back for real parallax, unlit
  // (the light is baked into the render), and faded into the sky over its top quarter.
  const fade = document.createElement('canvas');
  fade.width = 1;
  fade.height = 64;
  const fadeCtx = fade.getContext('2d');
  if (fadeCtx) {
    const g = fadeCtx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, colors.carbon); // alpha maps read brightness: dark = transparent
    g.addColorStop(0.3, colors.chalk);
    g.addColorStop(1, colors.chalk);
    fadeCtx.fillStyle = g;
    fadeCtx.fillRect(0, 0, 1, 64);
  }
  const backdropMat = new MeshBasicMaterial({
    color: col('chalk', 0.55),
    alphaMap: new CanvasTexture(fade),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const backdrop = new Mesh(new PlaneGeometry(1, BACKDROP_TILE), backdropMat);
  backdrop.position.z = BACKDROP_Z;
  backdrop.visible = false;
  scene.add(backdrop);
  const backdropTextures = new Map<number, Texture>();
  const loader = new TextureLoader();
  const showBackdrop = (chapter: number) => {
    const url = BACKDROPS[chapter] ?? BACKDROPS[1]!;
    let tex = backdropTextures.get(chapter);
    if (!tex) {
      tex = loader.load(url);
      tex.colorSpace = SRGBColorSpace;
      tex.wrapS = RepeatWrapping;
      backdropTextures.set(chapter, tex);
    }
    backdropMat.map = tex;
    backdropMat.needsUpdate = true;
    return tex;
  };

  const grain = grainTexture();
  const spikeMat = new MeshStandardMaterial({
    color: col('red-pen'),
    metalness: 0.55,
    roughness: 0.35,
  });
  const sawMat = new MeshStandardMaterial({ color: col('saw'), metalness: 0.9, roughness: 0.25 });
  const darkMetal = new MeshStandardMaterial({ color: col('ink'), metalness: 0.4, roughness: 0.5 });
  const doorMat = new MeshStandardMaterial({
    color: col('marigold'),
    emissive: col('marigold'),
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });
  const altDoorMat = new MeshStandardMaterial({
    color: col('red-pen'),
    emissive: col('red-pen'),
    emissiveIntensity: 0.7,
    roughness: 0.4,
  });
  const coinMat = new MeshStandardMaterial({
    color: col('marigold'),
    emissive: col('marigold'),
    emissiveIntensity: 0.6,
    metalness: 0.8,
    roughness: 0.2,
  });
  const pressMat = new MeshStandardMaterial({
    color: col('saw', 0.55),
    metalness: 0.7,
    roughness: 0.45,
  });
  const playerMat = new MeshStandardMaterial({
    color: col('marigold'),
    roughness: 0.45,
    metalness: 0.05,
  });
  // Ghosts and the clone: translucent chalk, clearly not the player (DESIGNING.md §8 Phase 4).
  const ghostMat = new MeshStandardMaterial({
    color: col('chalk'),
    roughness: 0.6,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const iceMat = new MeshStandardMaterial({
    color: col('chalk', 0.85),
    roughness: 0.06,
    metalness: 0.15,
  });
  const flagMat = new MeshStandardMaterial({ color: col('marigold'), roughness: 0.7 });

  // ---------------------------------------------------------------- people
  // Hoodie (playerMat, recoloured by setTint), jeans, sneakers; skin and hair from the palette.
  const humanGeo = humanGeometry();
  const looks: HumanLooks = {
    top: playerMat,
    legs: new MeshStandardMaterial({ color: col('cobalt', 0.45), roughness: 0.85 }),
    skin: new MeshStandardMaterial({
      color: col('paper-shadow').lerp(col('vermilion'), 0.22).multiplyScalar(0.92),
      roughness: 0.6,
    }),
    hair: new MeshStandardMaterial({ color: col('carbon'), roughness: 0.8 }),
    shoes: new MeshStandardMaterial({ color: col('chalk', 0.9), roughness: 0.5 }),
    eyes: new MeshStandardMaterial({ color: col('carbon'), roughness: 0.3 }),
  };
  const hero = makeHuman(humanGeo, looks);
  const player = hero.root;
  const body = hero.body;
  scene.add(player);
  let squash = 1;
  let facing = 1;
  let size = 1; // 2 after a grow trap (eased)

  /** Anyone who is not the player: animated from how far they moved since the last frame. */
  interface Figure {
    human: Human;
    x: number;
    y: number;
    facing: number;
  }
  const figure = (l: HumanLooks, shadows: boolean): Figure => {
    const human = makeHuman(humanGeo, l, shadows);
    human.root.visible = false;
    scene.add(human.root);
    return { human, x: 0, y: 0, facing: 1 };
  };
  /** Turn towards the way they are going; upside down when gravity is. */
  const orient = (root: Object3D, face: number, flipped: boolean, dt: number) => {
    root.rotation.z += ((flipped ? Math.PI : 0) - root.rotation.z) * ease(14, dt);
    root.rotation.y += (face * TURN - root.rotation.y) * ease(10, dt);
  };
  /** x, y: the sim box's top-left in px; k: 2 when big. */
  function place(f: Figure, x: number, y: number, k: number, flipped: boolean, dt: number) {
    const frames = Math.max(dt * 60, 1e-3);
    let vx = (x - f.x) / frames;
    let vy = (y - f.y) / frames;
    // Just appeared, respawned or teleported: no stride for the jump.
    if (!f.human.root.visible || Math.abs(vx) > 20 || Math.abs(vy) > 30) vx = vy = 0;
    f.x = x;
    f.y = y;
    if (Math.abs(vx) > 0.2) f.facing = Math.sign(vx);
    const root = f.human.root;
    root.visible = true;
    root.position.set(wx(x + 12 * k), flipped ? wy(y) : wy(y + 32 * k), 0);
    root.scale.setScalar(k);
    orient(root, f.facing, flipped, dt);
    f.human.pose(vx, flipped ? vy : -vy, Math.abs(vy) < 0.5, dt);
  }

  // Ghosts and the clone: the player's own past, all in translucent chalk.
  const ghostLooks: HumanLooks = {
    top: ghostMat,
    legs: ghostMat,
    skin: ghostMat,
    hair: ghostMat,
    shoes: ghostMat,
    eyes: ghostMat,
  };
  const clone = figure(ghostLooks, false);
  const ghosts = Array.from({ length: MAX_GHOSTS }, () => figure(ghostLooks, false));
  let ghostTracks: readonly Int32Array[] = [];

  // Party play: other players in their seat colours, and sabotage slot markers.
  let others: readonly OtherBody[] = [];
  const otherFigures: Figure[] = [];
  const tintMats = new Map<ColorToken, MeshStandardMaterial>();
  const tintMat = (token: ColorToken) => {
    let m = tintMats.get(token);
    if (!m) {
      m = new MeshStandardMaterial({ color: col(token), roughness: 0.45 });
      tintMats.set(token, m);
    }
    return m;
  };
  const markerMat = new MeshStandardMaterial({
    color: col('chalk'),
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  let markers: (Mesh | null)[] = [];
  let markersOn = false;

  const debrisGeo = new BoxGeometry(0.12, 0.12, 0.12);
  const debris = Array.from({ length: 16 }, (_, i) => {
    const m = new Mesh(debrisGeo, [playerMat, looks.legs, looks.skin][i % 3]);
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
    return { m, vx: 0, vy: 0, vz: 0, life: 0 };
  });
  let shake = 0;

  // ---------------------------------------------------------------- camera
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  let distance = 20;
  let halfW = 10;
  let halfH = 6;
  let camX = Number.NaN;
  let camY = Number.NaN;
  let viewH = VIEW_H;
  let fullHeight = false;
  let spinAngle = 0;
  let look = 0;
  /** Seconds into the level-start pan; < 0 when there is none. */
  let intro = -1;
  let introFrom = 0;
  const resize = () => {
    const w = fixed?.w ?? (container.clientWidth || 1);
    const h = fixed?.h ?? (container.clientHeight || 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(MathUtils.degToRad(camera.fov / 2));
    // Portrait phones show a shorter stretch of the course so the player and traps stay legible.
    const viewWidth = w < h ? 6 : VIEW_W;
    distance = Math.max(viewH / (2 * tan), viewWidth / (2 * tan * camera.aspect));
    halfH = distance * tan;
    halfW = halfH * camera.aspect;
    // Fog only thickens behind the play plane, whatever the screen shape.
    fog.near = distance + 6;
    fog.far = distance + 40;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  if (!fixed) ro.observe(container);
  resize();

  // ---------------------------------------------------------------- level
  let level: SimLevel | null = null;
  let levelGroup = new Group();
  scene.add(levelGroup);
  let H = 540;
  let solids: { mesh: Mesh; y: number; v: number }[] = [];
  let hazards: (Group | null)[] = [];
  let doors: Group[] = [];
  const wx = (px: number) => px * U;
  const wy = (py: number) => (H - py) * U;

  let tone: [ColorToken, number] = ['paper-shadow', 1];
  const concrete = (k: number, repeatX: number, repeatY: number) => {
    const map = grain.clone();
    map.repeat.set(repeatX / 96, repeatY / 96);
    map.needsUpdate = true;
    const m = new MeshStandardMaterial({ color: col(tone[0], k * tone[1]), roughness: 0.9, map });
    m.userData.owned = true;
    return m;
  };

  /** Level 21: the taunt is the platform — printed on the slab's face, legible, load-bearing. */
  const printed = (text: string, w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.max(64, Math.round((1024 * h) / w));
    const g = c.getContext('2d')!;
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const font = `700 ${Math.round(c.height * 0.78)}px ${fontFamilies.display}`;
    const draw = () => {
      g.fillStyle = colors.chalk;
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = colors.ink;
      g.font = font;
      g.textBaseline = 'middle';
      g.fillText(text, c.height * 0.2, c.height * 0.54, c.width - c.height * 0.4);
      tex.needsUpdate = true;
    };
    draw();
    void document.fonts?.load(font).then(draw, () => {});
    const m = new MeshStandardMaterial({ map: tex, roughness: 0.85 });
    m.userData.owned = true;
    return m;
  };

  function setLevel(next: SimLevel, withIntro = false): void {
    look = 0;
    // No pan where it would give a lie away (Small World's fake end) or show nothing (darkness).
    intro = withIntro && !next.view?.frameW && !next.view?.dark && !next.view?.spin ? 0 : -1;
    introFrom = toPx(next.spawn.x);
    disposeTree(levelGroup, true);
    scene.remove(levelGroup);
    levelGroup = new Group();
    scene.add(levelGroup);
    level = next;
    H = toPx(next.bounds.h);
    camX = camY = Number.NaN;
    // Levels with something visible overhead (a ceiling, the press, a door up top) show their
    // full height. Hidden saws don't count — False Trust must frame exactly like Trust.
    const high = toFixed(toPx(next.bounds.h) * 0.4);
    fullHeight =
      next.solids.some((s) => s.y < high) ||
      next.goals.some((g) => g.rect.y < high) ||
      next.traps.some((t) => t.type === 'faller' && t.look === 'crusher');
    viewH = fullHeight ? toPx(next.bounds.h) * U + 0.6 : VIEW_H;
    resize();

    const v = next.view;
    tone = CHAPTER_TONE[v?.chapter ?? 1] ?? ['paper-shadow', 1];
    const dark = v?.dark;
    hemi.intensity = dark ? 0.05 : 0.8;
    sun.intensity = dark ? 0.08 : 2.4;
    scene.environmentIntensity = dark ? 0.03 : 0.35;
    lamp.intensity = dark ? 26 : 0;
    lamp.distance = dark ? dark * U * 2.4 : 8;
    const bg = dark ? col('carbon') : sky;
    scene.background = bg;
    fog.color = bg;
    spinAngle = 0;
    ghostTracks = [];

    // The room behind the course: wide enough for the camera and the parallax at both ends.
    const levelW = toPx(next.bounds.w) * U;
    const roomW = levelW + 90;
    const tex = showBackdrop(v?.chapter ?? 1);
    tex.repeat.x = roomW / BACKDROP_TILE;
    backdrop.scale.x = roomW;
    backdrop.position.x = levelW / 2;
    backdrop.visible = !dark;
    wall.position.x = levelW / 2;
    wall.scale.x = Math.max(1, (levelW + 260) / 400);

    solids = next.solids.map((s, i) => {
      const [x, y, w, h] = [toPx(s.x), toPx(s.y), toPx(s.w), toPx(s.h)];
      const side = s.ice ? iceMat : concrete(0.62, w, h);
      const top = s.ice ? iceMat : concrete(0.92, w, DEPTH / U);
      const text = v?.texts?.[i];
      const front = text ? printed(text, w, h) : side;
      // 2px narrower than the collider so neighbouring slabs show a seam — tiles read as tiles
      const mesh = new Mesh(new BoxGeometry((w - 2) * U, h * U, DEPTH), [
        side,
        side,
        top,
        side,
        front,
        side,
      ]);
      mesh.position.set(wx(x + w / 2), wy(y + h / 2), 0);
      mesh.castShadow = mesh.receiveShadow = true;
      levelGroup.add(mesh);
      return { mesh, y: mesh.position.y, v: 0 };
    });

    hazards = next.traps.map((t) => {
      switch (t.type) {
        case 'spike':
          return add(spikes(t.rect));
        case 'faller':
          return add(t.look === 'saw' ? saw(t.rect) : crusher(t.rect));
        case 'coin':
          return add(coin(t.rect));
        case 'fakeGoal':
          return add(door(t.rect, t.look));
        case 'fakeClear':
          return add(door(t.rect, 'primary'));
        case 'spring':
          return add(spring(t.rect));
        case 'teleport':
          return add(flag(t.rect));
        default:
          return null; // collapse, goalShift, flips, timer, shuffle, clone: no mesh of their own
      }
    });
    // Real doors and fake doors are built identically — that is the point of Two Doors.
    doors = next.goals.map((g) => add(door(g.rect, g.look)));
    // Sabotage slots (numbered gates): a faint box where the trap would go.
    markers = next.traps.map((t) => {
      if (!t.gate || t.gate === LEADER_GATE || !('rect' in t)) return null;
      const [x, , w] = px4(t.rect);
      const h = t.type === 'faller' ? 40 : toPx(t.rect.h);
      const m = new Mesh(new BoxGeometry(w * U, h * U, DEPTH * 0.9), markerMat);
      m.position.set(
        wx(x + w / 2),
        t.type === 'faller' ? wy(toPx(t.fallTo) + h / 2) : wy(toPx(t.rect.y) + h / 2),
        0,
      );
      m.visible = false;
      levelGroup.add(m);
      return m;
    });
  }

  const add = (g: Group) => {
    g.traverse((o) => (o.castShadow = true));
    levelGroup.add(g);
    return g;
  };
  const px4 = (r: Rect) => [toPx(r.x), toPx(r.y), toPx(r.w), toPx(r.h)] as const;

  /** A strip of cones. Group origin sits on the base so eruptions scale up from the floor. */
  function spikes(r: Rect): Group {
    const [x, y, w, h] = px4(r);
    const g = new Group();
    const n = Math.max(1, Math.round(w / 14));
    const rad = (w / n / 2) * U;
    const geo = new ConeGeometry(rad * 0.95, h * U, 10);
    for (const z of [-1.2, -0.4, 0.4, 1.2]) {
      for (let i = 0; i < n; i++) {
        const cone = new Mesh(geo, spikeMat);
        cone.position.set(rad * (2 * i + 1), (h * U) / 2, z);
        g.add(cone);
      }
    }
    g.position.set(wx(x), wy(y + h), 0);
    return g;
  }

  function saw(r: Rect): Group {
    const rad = (toPx(r.w) / 2) * U;
    const g = new Group();
    const disk = new Mesh(new CylinderGeometry(rad, rad, 0.12, 40), sawMat);
    disk.rotation.x = Math.PI / 2;
    const hub = new Mesh(new CylinderGeometry(rad * 0.25, rad * 0.25, 0.22, 16), darkMetal);
    hub.rotation.x = Math.PI / 2;
    g.add(disk, hub);
    const toothGeo = new ConeGeometry(rad * 0.16, rad * 0.3, 4);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tooth = new Mesh(toothGeo, sawMat);
      tooth.position.set(Math.cos(a) * rad * 1.1, Math.sin(a) * rad * 1.1, 0);
      tooth.rotation.z = a - Math.PI / 2;
      g.add(tooth);
    }
    g.position.x = wx(toPx(r.x) + toPx(r.w) / 2);
    return g;
  }

  /** A steel press with a row of teeth underneath; origin at its centre. */
  function crusher(r: Rect): Group {
    const [, , w, h] = px4(r);
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(w * U, h * U, DEPTH + 0.4), pressMat));
    const toothGeo = new ConeGeometry(0.22, 0.45, 8);
    for (let tx = 16; tx < w; tx += 32) {
      for (const z of [-1, 1]) {
        const tooth = new Mesh(toothGeo, spikeMat);
        tooth.rotation.x = Math.PI;
        tooth.position.set((tx - w / 2) * U, (-h * U) / 2 - 0.2, z);
        g.add(tooth);
      }
    }
    g.position.x = wx(toPx(r.x) + w / 2);
    return g;
  }

  function coin(r: Rect): Group {
    const [x, y, w, h] = px4(r);
    const rad = (w / 2) * U;
    const g = new Group();
    const face = new Mesh(new CylinderGeometry(rad, rad, 0.12, 40), coinMat);
    face.rotation.x = Math.PI / 2;
    const glow = new PointLight(col('marigold'), 4, 4, 2);
    glow.position.z = 0.8;
    g.add(face, glow);
    g.position.set(wx(x + w / 2), wy(y + h / 2), 0);
    return g;
  }

  /** A squat coil with a red pad; origin at its base. */
  function spring(r: Rect): Group {
    const [x, y, w, h] = px4(r);
    const g = new Group();
    const coil = new Mesh(new CylinderGeometry(w * U * 0.4, w * U * 0.4, h * U, 12), sawMat);
    coil.position.y = (h * U) / 2;
    const pad = new Mesh(new BoxGeometry(w * U, 0.08, 0.8), spikeMat);
    pad.position.y = h * U;
    g.add(coil, pad);
    g.position.set(wx(x + w / 2), wy(y + h), 0);
    return g;
  }

  /** A checkpoint flag: the universal symbol for "progress saved". It isn't. */
  function flag(r: Rect): Group {
    const [x, y, , h] = px4(r);
    const g = new Group();
    const pole = new Mesh(new CylinderGeometry(0.04, 0.04, h * U, 8), darkMetal);
    pole.position.y = (h * U) / 2;
    const cloth = new Mesh(new BoxGeometry(0.6, 0.38, 0.03), flagMat);
    cloth.position.set(0.32, h * U - 0.22, 0);
    g.add(pole, cloth);
    g.position.set(wx(x + 2), wy(y + h), 0);
    return g;
  }

  /** A door standing on its rect's bottom edge. `alt` doors are red, `primary` marigold. */
  function door(r: Rect, look: DoorLook): Group {
    const [x, y, w, h] = px4(r);
    const [gw, gh] = [w * U, h * U];
    const g = new Group();
    const panel = new Mesh(new BoxGeometry(gw, gh, 0.1), look === 'alt' ? altDoorMat : doorMat);
    panel.position.y = gh / 2;
    const postGeo = new BoxGeometry(0.14, gh + 0.14, 0.4);
    const left = new Mesh(postGeo, darkMetal);
    left.position.set(-gw / 2 - 0.07, gh / 2, 0);
    const right = new Mesh(postGeo, darkMetal);
    right.position.set(gw / 2 + 0.07, gh / 2, 0);
    const lintel = new Mesh(new BoxGeometry(gw + 0.28, 0.14, 0.4), darkMetal);
    lintel.position.y = gh + 0.07;
    const glow = new PointLight(col(look === 'alt' ? 'red-pen' : 'marigold'), 6, 7, 2);
    glow.position.set(0, gh * 0.6, 1);
    g.add(panel, left, right, lintel, glow);
    g.position.set(wx(x + w / 2), wy(y + h), -0.6);
    return g;
  }

  // ---------------------------------------------------------------- frame
  function render(state: SimState, px: number, py: number, dt: number, showPlayer = true): void {
    if (!level) return;
    player.visible = showPlayer;

    // Player: feet at the bottom-centre of the sim box (24×32 px) — or the top when gravity
    // is flipped, where the whole character turns upside down.
    const flipped = state.gravity < 0;
    const [pw, ph] = state.big ? [48, 64] : [24, 32];
    const cx = wx(px + pw / 2);
    const feet = flipped ? wy(py) : wy(py + ph);
    player.position.set(cx, feet, 0);
    size += ((state.big ? 2 : 1) - size) * ease(8, dt);
    player.scale.setScalar(size);
    lamp.position.set(cx, feet + 0.8, 1.2);

    // The clone (level 18) and ghosts (level 28): the player's own past, in chalk.
    const c = state.clone;
    if (c.active > 0) place(clone, toPx(c.x), toPx(c.y), 1, flipped, dt);
    else clone.human.root.visible = false;
    ghosts.forEach((g, i) => {
      const track = ghostTracks[i];
      const at = state.attemptFrame * 2;
      if (track && at + 1 < track.length) {
        place(g, toPx(track[at]!), toPx(track[at + 1]!), 1, false, dt);
      } else g.human.root.visible = false;
    });
    others.forEach((b, i) => {
      const f = (otherFigures[i] ??= figure({ ...looks, top: tintMat(b.tint) }, true));
      f.human.setTop(tintMat(b.tint));
      place(f, toPx(b.x), toPx(b.y), b.big ? 2 : 1, b.gravity < 0, dt);
    });
    for (const f of otherFigures.slice(others.length)) f.human.root.visible = false;
    const vx = toPx(state.player.vx);
    if (Math.abs(vx) > 0.2) facing = Math.sign(vx);
    orient(player, facing, flipped, dt);
    const vy = toPx(state.player.vy);
    hero.pose(vx, flipped ? vy : -vy, state.player.onGround, dt);
    squash += (1 - squash) * ease(10, dt);
    const thin = 1 / Math.sqrt(squash);
    body.scale.set(thin, squash, thin);

    // Collapsing slabs fall away; they snap back when a new attempt starts
    solids.forEach((s, i) => {
      if (state.gone[i]) {
        s.v += 30 * dt;
        s.mesh.position.y -= s.v * dt;
        s.mesh.rotation.z += dt * 0.8;
        s.mesh.visible = s.mesh.position.y > -20;
      } else if (s.v !== 0) {
        s.v = 0;
        s.mesh.position.y = s.y;
        s.mesh.rotation.z = 0;
        s.mesh.visible = true;
      }
    });

    level.traps.forEach((t, i) => {
      const mesh = hazards[i];
      const run = state.traps[i];
      const gateOn = !t.gate || (state.gates & t.gate) !== 0;
      const marker = markers[i];
      if (marker) marker.visible = markersOn && !gateOn;
      if (!mesh || !run) return;
      mesh.visible = run.active === 1 && gateOn;
      if (t.type === 'spike') {
        const up = spikeUp(state, level!, i);
        if (t.mode === SpikeMode.Near) {
          // A pop-up gives nothing away: no slot, no peek, until it fires — then it snaps up.
          mesh.visible &&= up;
          mesh.scale.y = up ? mesh.scale.y + (1 - mesh.scale.y) * ease(45, dt) : 0.01;
        } else {
          // Retracted spikes still peek out of their slot, so the danger is legible.
          const target = up ? 1 : 0.18;
          mesh.scale.y += (target - mesh.scale.y) * ease(t.mode === SpikeMode.Always ? 60 : 30, dt);
        }
      } else if (t.type === 'faller') {
        // An untriggered saw is hidden entirely — even its shadow would give the trap away.
        if (t.look === 'saw') {
          mesh.visible &&= run.fired === 1;
          mesh.rotation.z -= dt * 14;
        }
        mesh.position.y = wy(toPx(run.y) + toPx(t.rect.h) / 2);
      } else if (t.type === 'coin') {
        mesh.rotation.y += dt * 2.5;
      } else if (t.type === 'spring') {
        mesh.visible &&= !t.hidden || run.fired === 1;
      }
    });

    // Doors exist per attempt; the real one may slide (goalShift)
    const real = activeGoal(state, level);
    level.goals.forEach((goal, i) => {
      const d = doors[i];
      if (!d) return;
      d.visible = inScope(goal, state.attempt);
      const shift = goal === real ? state.goalShift : 0;
      const tx = wx(toPx(goal.rect.x + shift) + toPx(goal.rect.w) / 2);
      d.position.x += (tx - d.position.x) * ease(8, dt);
    });

    for (const d of debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vy -= 20 * dt;
      d.m.position.x += d.vx * dt;
      d.m.position.y += d.vy * dt;
      d.m.position.z += d.vz * dt;
      d.m.rotation.x += dt * 8;
      d.m.scale.setScalar(Math.max(0.01, d.life / 0.9));
      d.m.visible = d.life > 0;
    }

    // Camera: follow the player, never show past the level's ends — or, on Small World, past
    // the end the level pretends to have, until the player walks through it.
    const lie = level.view?.frameW;
    const levelW = lie && cx < lie * U ? lie * U : toPx(level.bounds.w) * U;
    // Look ahead the way the runner is going, so a closer camera still shows what's coming.
    const moving = Math.abs(vx) > 0.2;
    look += (facing * halfW * LOOKAHEAD * (moving ? 1 : 0.5) - look) * ease(2.2, dt);
    let aim = cx + look;
    if (intro >= 0) {
      // Any movement hands the camera straight back to the player.
      if (Math.abs(px - introFrom) > 2) {
        intro = -1;
      } else {
        intro += dt;
        const t = MathUtils.clamp((intro - INTRO_HOLD) / INTRO_PAN, 0, 1);
        const k = t * t * (3 - 2 * t);
        aim = levelW + (cx - levelW) * k;
        if (t >= 1) intro = -1;
      }
    }
    const tx = levelW <= 2 * halfW ? levelW / 2 : MathUtils.clamp(aim, halfW, levelW - halfW);
    // Keep the player's feet ~30% up from the bottom on any screen shape (portrait included).
    const ty = fullHeight ? (H * U) / 2 : feet + state.gravity * halfH * 0.4;
    if (Number.isNaN(camX)) {
      camX = tx;
      camY = ty;
    }
    camX += (tx - camX) * ease(intro >= 0 ? 9 : 5, dt);
    camY += (ty - camY) * ease(4, dt);
    shake = Math.max(0, shake - dt);
    const jitter = shake > 0 ? 0.08 : 0;
    camera.position.set(
      camX + (Math.random() - 0.5) * jitter,
      camY + 1.6 + (Math.random() - 0.5) * jitter,
      distance,
    );
    camera.lookAt(camX, camY, 0);
    const spin = level.view?.spin;
    if (spin && !reducedMotion()) {
      spinAngle += MathUtils.degToRad(spin) * dt;
      camera.rotateZ(spinAngle);
    }
    // The hall's floor line (a quarter up the tile) sits just behind the course's far edge.
    backdrop.position.y = camY - 3;
    sun.position.set(camX - 7, camY + 16, 12);
    sun.target.position.set(camX, camY - 3, 0);

    renderer.render(scene, camera);
  }

  return {
    canvas,
    setLevel,
    render,
    jumped: () => (squash = 1.25),
    landed: () => (squash = 0.78),
    died(state) {
      const x = wx(toPx(state.lastDeath.x) + 12);
      const y = wy(toPx(state.lastDeath.y) + 16);
      for (const d of debris) {
        d.m.position.set(x, y, 0);
        d.vx = (Math.random() - 0.5) * 8;
        d.vy = 2 + Math.random() * 7;
        d.vz = (Math.random() - 0.5) * 4;
        d.life = 0.9;
        d.m.visible = true;
      }
      squash = 1;
      if (!reducedMotion()) shake = 0.12;
    },
    setGhosts(tracks) {
      ghostTracks = tracks.slice(-MAX_GHOSTS);
    },
    setTint(token) {
      playerMat.color = col(token);
    },
    setOthers(bodies) {
      others = bodies;
    },
    setMarkers(on) {
      markersOn = on;
    },
    project(x, y) {
      const v = new Vector3(wx(x), wy(y), 0).project(camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    },
    dispose() {
      ro.disconnect();
      disposeTree(scene, false);
      grain.dispose();
      for (const tex of backdropTextures.values()) tex.dispose();
      backdropMat.alphaMap?.dispose();
      envMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
