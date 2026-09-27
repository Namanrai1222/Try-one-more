/**
 * Push Party in 3D (DESIGNING.md §8 Phase 5: same tokens, a different tile language): a floor
 * of concrete tiles hung over the dark, lit from above with soft shadows; rings shake red-pen
 * before they drop. It only reads sim state. Only game.ts imports it, and game.ts is behind the
 * dynamic import in `mountPush`, so Three.js never reaches a page's initial JS.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { toPx } from '@jom/engine';
import { colors } from '@jom/ui';
import type { ColorToken } from '@jom/ui';
import { SEAT_TINTS } from './index.ts';
import {
  ARENA,
  CRUMBLE_FRAMES,
  FIRST_RING_AT,
  GRID,
  RADIUS,
  RING_EVERY,
  TILE,
  ring,
  tileAt,
} from './sim.ts';
import type { PushState } from './sim.ts';

/** World units per arena pixel (the platformer uses the same scale). */
const U = 1 / 32;
const HALF = toPx(ARENA) / 2;
const TILE_W = toPx(TILE) * U;
/** Keep the whole floor, plus a margin, in view on any aspect ratio. */
const FIT = TILE_W * GRID + 3;
const ELEVATION = (58 * Math.PI) / 180;

const col = (token: ColorToken, k = 1) => new Color(colors[token]).multiplyScalar(k);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface PushView {
  readonly canvas: HTMLCanvasElement;
  /** `shown`: where to draw each seat (arena px, smoothed by the caller). */
  render(state: PushState, shown: ReadonlyMap<number, { x: number; y: number }>, me: number): void;
  dispose(): void;
}

export function createPushView(container: HTMLElement): PushView {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = col('carbon');
  scene.fog = new Fog(col('carbon'), 45, 90);
  scene.add(new HemisphereLight(col('chalk'), col('carbon'), 0.9));
  const sun = new DirectionalLight(col('chalk'), 2.2);
  sun.position.set(-8, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -14,
    right: 14,
    top: 14,
    bottom: -14,
    near: 1,
    far: 60,
  });
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- floor
  const tileGeo = new BoxGeometry(TILE_W * 0.94, 0.8, TILE_W * 0.94);
  const solidMat = new MeshStandardMaterial({ color: col('paper-shadow', 0.62), roughness: 0.92 });
  const centreMat = new MeshStandardMaterial({ color: col('paper-shadow', 0.8), roughness: 0.9 });
  const warnMat = new MeshStandardMaterial({ color: col('red-pen', 0.75), roughness: 0.8 });
  const tiles: Mesh[] = [];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const m = new Mesh(tileGeo, solidMat);
      m.position.set(
        (i + 0.5) * TILE_W - (TILE_W * GRID) / 2,
        -0.4,
        (j + 0.5) * TILE_W - (TILE_W * GRID) / 2,
      );
      m.receiveShadow = true;
      m.castShadow = true;
      scene.add(m);
      tiles.push(m);
    }
  }

  // ---------------------------------------------------------------- bodies
  const r = toPx(RADIUS) * U;
  const bodyGeo = new CapsuleGeometry(r * 0.9, r, 8, 16);
  const eyeGeo = new SphereGeometry(r * 0.2, 12, 8);
  const eyeMat = new MeshStandardMaterial({ color: col('chalk'), roughness: 0.3 });
  const bodies = new Map<number, Group>();
  const body = (seat: number) => {
    let g = bodies.get(seat);
    if (!g) {
      g = new Group();
      const mat = new MeshStandardMaterial({
        color: col(SEAT_TINTS[seat] ?? 'chalk'),
        roughness: 0.45,
      });
      const torso = new Mesh(bodyGeo, mat);
      torso.position.y = r * 1.4;
      torso.castShadow = true;
      g.add(torso);
      for (const x of [-r * 0.35, r * 0.35]) {
        const eye = new Mesh(eyeGeo, eyeMat);
        eye.position.set(x, r * 1.9, r * 0.8); // the face looks along +z, the facing direction
        g.add(eye);
      }
      scene.add(g);
      bodies.set(seat, g);
    }
    return g;
  };
  // "You": a chalk ring on the floor under this player's body.
  const youRing = new Mesh(
    new RingGeometry(r * 1.3, r * 1.6, 32),
    new MeshStandardMaterial({
      color: col('chalk'),
      emissive: col('chalk'),
      emissiveIntensity: 0.4,
    }),
  );
  youRing.rotation.x = -Math.PI / 2;
  scene.add(youRing);

  // ---------------------------------------------------------------- camera
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const v = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
    const dist = FIT / 2 / Math.tan(Math.min(v, hfov) / 2);
    camera.position.set(0, dist * Math.sin(ELEVATION), dist * Math.cos(ELEVATION));
    camera.lookAt(0, 0, 0.8);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    canvas,
    render(state, shown, me) {
      const f = state.frame;
      const still = reducedMotion();
      tiles.forEach((m, k) => {
        const i = Math.floor(k / GRID);
        const j = k % GRID;
        const v = tileAt(f, i, j);
        const y0 = -0.4;
        if (v === 0) {
          m.material = ring(i, j) >= 4 ? centreMat : solidMat;
          m.position.y = y0;
          m.visible = true;
        } else if (v > 0) {
          // Shaking harder as it runs out of time.
          m.material = warnMat;
          const k2 = 1 - v / CRUMBLE_FRAMES;
          m.position.y = y0 + (still ? 0 : Math.sin(f * 1.7 + i * 3 + j * 5) * 0.06 * k2);
          m.visible = true;
        } else {
          const gone = FIRST_RING_AT + ring(i, j) * RING_EVERY + CRUMBLE_FRAMES;
          const t = (f - gone) / 60;
          m.position.y = y0 - 12 * t * t;
          m.visible = t < 2.5;
        }
      });

      youRing.visible = false;
      for (const p of state.pushers) {
        const g = body(p.seat);
        g.visible = !p.out;
        if (p.out) continue;
        const at = shown.get(p.seat) ?? { x: toPx(p.x), y: toPx(p.y) };
        const fallT = p.fall / 60;
        g.position.set((at.x - HALF) * U, -30 * fallT * fallT, (at.y - HALF) * U);
        g.rotation.y = Math.atan2(p.fx, p.fy);
        const lunge = p.shove > 0 && !still ? 1.25 : 1;
        g.scale.set(1 / Math.sqrt(lunge), 1, lunge);
        if (p.seat === me && p.fall === 0) {
          youRing.visible = true;
          youRing.position.set(g.position.x, 0.02, g.position.z);
        }
      }
      renderer.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      tileGeo.dispose();
      bodyGeo.dispose();
      eyeGeo.dispose();
      youRing.geometry.dispose();
      scene.traverse((o) => {
        if (o instanceof Mesh)
          ([] as MeshStandardMaterial[]).concat(o.material).forEach((m) => m.dispose());
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}
