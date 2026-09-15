import { useFrame } from "@react-three/fiber";
import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import { useCastRig } from "../casting/CastRig";

interface Framing {
  position: Vector3;
  lookAt: Vector3;
  fov: number;
}

const LANDSCAPE: Framing = {
  position: new Vector3(0, 1.75, 5.4),
  lookAt: new Vector3(0, 1.15, 0),
  fov: 45,
};

// Portrait screens put the HUD over the lower half, so aim low: the pedestal rides higher in frame.
const PORTRAIT: Framing = {
  position: new Vector3(0, 2.3, 7.4),
  lookAt: new Vector3(0, 0.15, 0),
  fov: 52,
};

/** While magic gathers: lean in slightly and glance down toward the wand. */
const WAND_LEAN = {
  position: new Vector3(0.12, -0.08, -0.45),
  look: new Vector3(0.35, -0.35, 0),
};
/** As the spell lands: move a little closer and centre on the target. */
const TARGET_PUSH = new Vector3(0, -0.12, -1.3);

/** Scratch vectors reused every frame to avoid allocations. */
const goal = new Vector3();
const lookGoal = new Vector3();
const target = new Vector3();
const look = LANDSCAPE.lookAt.clone();
/**
 * Following a target an outcome lifts, as shares of the lift: the camera
 * rises a little and the gaze most of the way, so the pedestal stays in frame
 * and the height reads.
 */
const FOLLOW = { rise: 0.15, gaze: 0.55 };
/** The push toward the target eases off as it rises, for the same reason. */
const LIFT_PULLBACK = 0.45;

/**
 * A calm, bounded camera: slight parallax toward the pointer, a slow
 * breathing sway, and gentle cast moves driven by `fx`. No free movement.
 * With reduced motion the camera holds still (cast moves are skipped upstream).
 */
export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const rig = useCastRig();

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    const { fx } = rig;
    const framing = state.size.width < state.size.height ? PORTRAIT : LANDSCAPE;

    if (camera.fov !== framing.fov) {
      camera.fov = framing.fov;
      camera.updateProjectionMatrix();
    }

    goal.copy(framing.position);
    lookGoal.copy(framing.lookAt);
    if (!reducedMotion) {
      goal.x += state.pointer.x * 0.4 * (1 - fx.targetFocus);
      goal.y += state.pointer.y * 0.15 + Math.sin(state.clock.elapsedTime * 0.35) * 0.03;

      goal.addScaledVector(WAND_LEAN.position, fx.wandFocus);
      lookGoal.addScaledVector(WAND_LEAN.look, fx.wandFocus);
      // Follow a target that an outcome moves, such as a floating book.
      const lift = rig.targetOffset.y;
      const push = fx.targetFocus * Math.max(0, 1 - lift * LIFT_PULLBACK);
      goal.addScaledVector(TARGET_PUSH, push);
      goal.y += lift * FOLLOW.rise * fx.targetFocus;
      target.copy(rig.targetFocus).addScaledVector(rig.targetOffset, FOLLOW.gaze);
      lookGoal.lerp(target, fx.targetFocus);

      const jolt = fx.shake * 0.025 + fx.tremor * 0.012;
      if (jolt > 0.0005) {
        const t = state.clock.elapsedTime;
        goal.x += Math.sin(t * 71) * jolt;
        goal.y += Math.cos(t * 53) * jolt;
      }
    }

    const lambda = reducedMotion ? 50 : 2.2 + fx.shake * 20;
    camera.position.x = MathUtils.damp(camera.position.x, goal.x, lambda, delta);
    camera.position.y = MathUtils.damp(camera.position.y, goal.y, lambda, delta);
    camera.position.z = MathUtils.damp(camera.position.z, goal.z, lambda, delta);
    look.lerp(lookGoal, 1 - Math.exp(-lambda * delta));
    camera.lookAt(look);
  });

  return null;
}
