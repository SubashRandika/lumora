import type { ThreeElements } from "@react-three/fiber";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  AdditiveBlending,
  CatmullRomCurve3,
  DoubleSide,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type Mesh,
} from "three";
import type { TargetModel } from "@/domain/spells/spell.schema";
import { applyFrost, createFrostUniforms } from "../materials/frost";
import { applyScorch, createScorchUniforms } from "../materials/scorch";
import { SCENE } from "../palette";
import { PEDESTAL_TOP } from "./Pedestal";

/*
 * The things spells act on. Every prop is original, low-poly geometry built
 * in code: no downloaded models, and nothing modelled on film props.
 * The chamber wraps each in a group that outcome performers animate
 * (see `casting/outcomes/`).
 */

/** Shadow flags for a whole prop, so each mesh doesn't repeat them. */
function PropGroup({
  children,
  ...props
}: { children: ReactNode } & ThreeElements["group"]) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((object) => {
      // Glass and glowing wards let light through, so they cast no shadow.
      if (
        (object as Mesh).isMesh &&
        !((object as Mesh).material as Material).transparent
      ) {
        object.castShadow = true;
        object.receiveShadow = object.userData.receiveShadow !== false;
      }
    });
  }, []);
  return (
    <group ref={ref} {...props}>
      {children}
    </group>
  );
}

/** Name of the tome's hinged cover group, for outcomes that open it. */
export const TOME_COVER = "tome-cover";

function Tome() {
  return (
    <PropGroup position={[0, PEDESTAL_TOP, 0]} rotation={[0, 0.45, 0]}>
      <mesh position={[0, 0.013, 0]}>
        <boxGeometry args={[0.46, 0.026, 0.34]} />
        <meshStandardMaterial color={SCENE.leather[0]} roughness={0.7} />
      </mesh>
      <mesh position={[0.005, 0.062, 0.004]}>
        <boxGeometry args={[0.43, 0.072, 0.318]} />
        <meshStandardMaterial color={SCENE.parchment} roughness={0.95} />
      </mesh>
      {/* The top cover hinges at the spine so a levitation can ease it open. */}
      <group name={TOME_COVER} position={[-0.23, 0.098, 0]}>
        <mesh position={[0.23, 0.013, 0]}>
          <boxGeometry args={[0.46, 0.026, 0.34]} />
          <meshStandardMaterial color={SCENE.leather[0]} roughness={0.7} />
        </mesh>
        {/* Gilt corner guards. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0.43, 0.027, side * 0.15]}>
            <boxGeometry args={[0.06, 0.006, 0.04]} />
            <meshStandardMaterial color={SCENE.gold} metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
      </group>
      <mesh position={[-0.222, 0.062, 0]}>
        <boxGeometry args={[0.03, 0.124, 0.34]} />
        <meshStandardMaterial color={SCENE.leather[0]} roughness={0.65} />
      </mesh>
      <mesh position={[0.235, 0.062, 0]}>
        <boxGeometry args={[0.018, 0.05, 0.06]} />
        <meshStandardMaterial color={SCENE.gold} metalness={0.8} roughness={0.35} />
      </mesh>
    </PropGroup>
  );
}

/** Named parts of the warded door, for the unlock outcome. */
export const DOOR_PARTS = {
  /** Hinged at the left jamb; rotating it about Y swings the door away from the viewer. */
  leaf: "door-leaf",
  /** The padlock, pivoting where it hangs from the hasp. */
  lock: "door-lock",
  /** The shackle, pivoting about its left leg. */
  shackle: "door-shackle",
  /** The ward ring: one mesh per piece, each with `userData.angle` (its mid-angle). */
  ward: "door-ward",
} as const;

/** Rest opacity of the ward ring. */
export const WARD_OPACITY = 0.45;
/** Half the doorway's clear width and its height, in metres. */
export const DOORWAY = { halfWidth: 0.57, height: 2.22 } as const;
const HINGE_X = -0.55;
/** Where the padlock hangs, in the door's own space (before the hinge offset). */
const LOCK_AT = [0.45, 1.2, 0.08] as const;
const WARD_PIECES = 10;

function WardedDoor() {
  const plankX = [-0.44, -0.22, 0, 0.22, 0.44];
  // One material for every ward piece, so the outcome fades the ring with one value.
  const wardMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: SCENE.gold,
        transparent: true,
        opacity: WARD_OPACITY,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useLayoutEffect(() => () => wardMaterial.dispose(), [wardMaterial]);
  const pieceArc = (Math.PI * 2) / WARD_PIECES;

  return (
    <PropGroup position={[0, 0, 0.1]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.64, 1.12, 0]}>
          <boxGeometry args={[0.14, 2.24, 0.18]} />
          <meshStandardMaterial color={SCENE.stoneLight} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 2.3, 0]}>
        <boxGeometry args={[1.42, 0.16, 0.2]} />
        <meshStandardMaterial color={SCENE.stoneLight} roughness={0.95} />
      </mesh>

      <group name={DOOR_PARTS.leaf} position={[HINGE_X, 0, 0]}>
        {plankX.map((x, i) => (
          // A swinging leaf passes through the lintel's hard shadow, which reads as a glitch.
          <mesh
            key={x}
            position={[x - HINGE_X, 1.1, 0]}
            userData={{ receiveShadow: false }}
          >
            <boxGeometry args={[0.215, 2.14, 0.07]} />
            <meshStandardMaterial
              color={i % 2 ? SCENE.wood : SCENE.woodDark}
              roughness={0.85}
            />
          </mesh>
        ))}
        {[0.55, 1.7].map((y) => (
          <mesh key={y} position={[-HINGE_X, y, 0.045]}>
            <boxGeometry args={[1.12, 0.07, 0.02]} />
            <meshStandardMaterial color={SCENE.iron} metalness={0.6} roughness={0.5} />
          </mesh>
        ))}

        {/* Hasp: an iron strap ending in the ring the padlock hangs from. */}
        <mesh position={[0.36 - HINGE_X, LOCK_AT[1] + 0.012, 0.045]}>
          <boxGeometry args={[0.2, 0.045, 0.012]} />
          <meshStandardMaterial color={SCENE.iron} metalness={0.6} roughness={0.5} />
        </mesh>
        <mesh
          position={[LOCK_AT[0] - HINGE_X, LOCK_AT[1] + 0.012, 0.06]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[0.018, 0.005, 6, 14]} />
          <meshStandardMaterial color={SCENE.iron} metalness={0.8} roughness={0.35} />
        </mesh>

        <group
          name={DOOR_PARTS.lock}
          position={[LOCK_AT[0] - HINGE_X, LOCK_AT[1], LOCK_AT[2]]}
        >
          <group name={DOOR_PARTS.shackle} position={[-0.045, -0.045, 0]}>
            <mesh position={[0.045, 0, 0]}>
              <torusGeometry args={[0.045, 0.01, 8, 20, Math.PI]} />
              <meshStandardMaterial color={SCENE.iron} metalness={0.8} roughness={0.35} />
            </mesh>
          </group>
          <mesh position={[0, -0.105, 0]}>
            <boxGeometry args={[0.11, 0.11, 0.045]} />
            <meshStandardMaterial color={SCENE.gold} metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.115, 0.024]}>
            <circleGeometry args={[0.011, 12]} />
            <meshBasicMaterial color={SCENE.ink} />
          </mesh>
        </group>

        {/* A faint ward ring around the lock, in pieces so it can crack apart. */}
        <group
          name={DOOR_PARTS.ward}
          position={[LOCK_AT[0] - HINGE_X, LOCK_AT[1] - 0.105, LOCK_AT[2] + 0.035]}
        >
          {Array.from({ length: WARD_PIECES }, (_, i) => (
            <mesh
              key={i}
              material={wardMaterial}
              userData={{ angle: (i + 0.5) * pieceArc }}
            >
              <ringGeometry
                args={[0.15, 0.158, 6, 1, i * pieceArc + 0.03, pieceArc - 0.06]}
              />
            </mesh>
          ))}
        </group>
      </group>
    </PropGroup>
  );
}

/** Named parts of the practice dummy, for outcomes that bind or freeze it. */
export const MANNEQUIN_PARTS = {
  /** The whole dummy; `userData.frost` holds its shared `FrostUniforms`. */
  root: "mannequin",
  /** Each arm pivots at its shoulder; `userData.side` is -1 (left) or 1 (right). */
  arm: "mannequin-arm",
  /** The chalked circle on the chest; a basic material that frost can't reach. */
  chalk: "mannequin-chalk",
} as const;

/** Shoulder angle, in radians, with the arms out as the dummy rests. Multiply by `side`. */
export const ARM_REST_ANGLE = 1.1;
/** Shoulder angle with the arms clamped to the sides. */
export const ARM_BOUND_ANGLE = 0.1;
export const CHALK_OPACITY = 0.6;
const BURLAP = "#7d6749";

function PracticeMannequin() {
  const frost = useMemo(() => createFrostUniforms(), []);
  const materials = useMemo(() => {
    const made = {
      burlap: new MeshStandardMaterial({ color: BURLAP, roughness: 1 }),
      wood: new MeshStandardMaterial({ color: SCENE.wood, roughness: 0.8 }),
      woodDark: new MeshStandardMaterial({ color: SCENE.woodDark, roughness: 0.8 }),
    };
    for (const material of Object.values(made)) applyFrost(material, frost);
    return made;
  }, [frost]);
  useLayoutEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );

  return (
    <PropGroup position={[0, 0, 0]} name={MANNEQUIN_PARTS.root} userData={{ frost }}>
      <mesh position={[0, 0.03, 0]} material={materials.woodDark}>
        <cylinderGeometry args={[0.3, 0.34, 0.06, 16]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} material={materials.wood}>
        <cylinderGeometry args={[0.03, 0.035, 1.14, 8]} />
      </mesh>
      <mesh position={[0, 1.36, 0]} material={materials.burlap}>
        <capsuleGeometry args={[0.17, 0.42, 6, 12]} />
      </mesh>
      <mesh position={[0, 1.86, 0]} material={materials.burlap}>
        <sphereGeometry args={[0.125, 16, 12]} />
      </mesh>
      {[-1, 1].map((side) => (
        // Pivot at the shoulder; the arm hangs along the pivot's -y.
        <group
          key={side}
          name={MANNEQUIN_PARTS.arm}
          userData={{ side }}
          position={[side * 0.2, 1.56, 0]}
          rotation={[0, 0, side * ARM_REST_ANGLE]}
        >
          <mesh position={[0, -0.24, 0]} material={materials.burlap}>
            <capsuleGeometry args={[0.05, 0.38, 4, 8]} />
          </mesh>
        </group>
      ))}
      {/* Chalked target circle on the chest. */}
      <mesh name={MANNEQUIN_PARTS.chalk} position={[0, 1.4, 0.172]}>
        <ringGeometry args={[0.05, 0.065, 28]} />
        <meshBasicMaterial
          color={SCENE.parchment}
          transparent
          opacity={CHALK_OPACITY}
          depthWrite={false}
        />
      </mesh>
    </PropGroup>
  );
}

/** Named parts of the cracked spectacles, for the mend outcome. */
export const SPECTACLES_PARTS = {
  /** The frames, lifted and turned; `userData.restY` and `userData.restRotation` hold their rest pose. */
  frames: "spectacles-frames",
  /** The cracked right lens: its group is the space shard homes and the crack live in. */
  cracked: "spectacles-cracked-lens",
  /** The right lens's glass; its material fades from hazy to clear. */
  glass: "spectacles-glass",
  /** Each crack segment: `userData.along` is where it sits along the crack, 0 to 1. */
  crack: "spectacles-crack",
  /** Each fallen shard on the case: `userData.home` is its place in the lens. */
  shard: "spectacles-shard",
  /** A glow ring round each lens, for the ring sweep. */
  ring: "spectacles-ring",
  /** A spark that runs round each ring: `userData.side` is -1 or 1. */
  spark: "spectacles-spark",
  /** The glint that crosses the mended lens. */
  glint: "spectacles-glint",
} as const;

/** How the frames rest on the case, in radians. */
export const SPECTACLES_REST_ROTATION = [-0.35, 0.2, 0] as const;
export const SPECTACLES_REST_Y = 0.12;
export const SPECTACLES_SCALE = 1.8;
/** Right lens: where it sits in the frames' space, and its glass as cracked and as mended. */
export const LENS = { x: 0.068, radius: 0.05, hazy: 0.34, clear: 0.16 } as const;
export const CRACK_OPACITY = 0.85;
export const SHARD_OPACITY = 0.6;

type Point2 = readonly [number, number];

/** The crack's path across the right lens, in the lens's own space, with two short branches. */
const CRACK_PATH: readonly Point2[] = [
  [-0.042, 0.03],
  [-0.015, 0.008],
  [0.004, 0.014],
  [0.022, -0.01],
  [0.043, -0.026],
];
const CRACK_BRANCHES: ReadonlyArray<{ from: number; to: Point2 }> = [
  { from: 2, to: [0.012, 0.037] },
  { from: 3, to: [0.017, -0.038] },
];

/** Fallen shards: where they lie on the case (prop space) and where they belong in the lens. */
const SHARDS = [
  { rest: [0.13, 0.062, 0.1], spin: 0.4, home: [0.018, 0.02], size: 0.014 },
  { rest: [0.17, 0.062, -0.03], spin: 2.1, home: [-0.012, -0.012], size: 0.011 },
  { rest: [-0.08, 0.062, 0.12], spin: 1.2, home: [0.03, -0.02], size: 0.012 },
  { rest: [0.07, 0.062, 0.13], spin: 3.3, home: [-0.026, 0.02], size: 0.009 },
] as const;

function crackSegments() {
  const segments: Array<{ a: Point2; b: Point2; along: number }> = [];
  const lengths = CRACK_PATH.slice(1).map((p, i) =>
    Math.hypot(p[0] - CRACK_PATH[i]![0], p[1] - CRACK_PATH[i]![1]),
  );
  const total = lengths.reduce((a, b) => a + b, 0);
  let run = 0;
  const alongAt = [0];
  lengths.forEach((length, i) => {
    segments.push({
      a: CRACK_PATH[i]!,
      b: CRACK_PATH[i + 1]!,
      along: (run + length / 2) / total,
    });
    run += length;
    alongAt.push(run / total);
  });
  for (const branch of CRACK_BRANCHES) {
    segments.push({
      a: CRACK_PATH[branch.from]!,
      b: branch.to,
      along: alongAt[branch.from]! + 0.05,
    });
  }
  return segments.map(({ a, b, along }) => ({
    along,
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.0016] as const,
    length: Math.hypot(b[0] - a[0], b[1] - a[1]),
    angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
  }));
}

function CrackedSpectacles() {
  const segments = useMemo(() => crackSegments(), []);
  const materials = useMemo(
    () => ({
      glass: new MeshStandardMaterial({
        color: "#dfe8ee",
        transparent: true,
        opacity: LENS.hazy,
        roughness: 0.35,
        side: DoubleSide,
      }),
      shard: new MeshStandardMaterial({
        color: "#e6f0f7",
        transparent: true,
        opacity: SHARD_OPACITY,
        roughness: 0.1,
        side: DoubleSide,
      }),
      glint: new MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
      glow: new MeshBasicMaterial({
        color: "#cfe3f2",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    }),
    [],
  );
  useLayoutEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );

  return (
    <PropGroup position={[0, PEDESTAL_TOP, 0]}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.44, 0.06, 0.34]} />
        <meshStandardMaterial color={SCENE.leather[2]} roughness={1} />
      </mesh>

      <group
        name={SPECTACLES_PARTS.frames}
        position={[0, SPECTACLES_REST_Y, 0]}
        rotation={[...SPECTACLES_REST_ROTATION]}
        scale={SPECTACLES_SCALE}
      >
        {[-1, 1].map((side) => (
          <group
            key={side}
            name={side === 1 ? SPECTACLES_PARTS.cracked : undefined}
            position={[side * LENS.x, 0, 0]}
          >
            <mesh>
              <torusGeometry args={[0.052, 0.005, 8, 32]} />
              <meshStandardMaterial color={SCENE.gold} metalness={0.8} roughness={0.3} />
            </mesh>
            {side === 1 ? (
              <mesh name={SPECTACLES_PARTS.glass} material={materials.glass}>
                <circleGeometry args={[LENS.radius, 32]} />
              </mesh>
            ) : (
              <mesh>
                <circleGeometry args={[LENS.radius, 32]} />
                <meshStandardMaterial
                  color="#cfe3f2"
                  transparent
                  opacity={LENS.clear}
                  roughness={0.1}
                  side={DoubleSide}
                />
              </mesh>
            )}
            <mesh position={[side * 0.05, 0, -0.06]} rotation={[0, side * 0.12, 0]}>
              <boxGeometry args={[0.004, 0.004, 0.12]} />
              <meshStandardMaterial color={SCENE.gold} metalness={0.8} roughness={0.3} />
            </mesh>

            {/* A ring of light and a running spark, hidden until the mend sweeps them round. */}
            <mesh name={SPECTACLES_PARTS.ring} material={materials.glow} visible={false}>
              <torusGeometry args={[0.058, 0.0035, 6, 48]} />
            </mesh>
            <mesh
              name={SPECTACLES_PARTS.spark}
              userData={{ side }}
              material={materials.glow}
              visible={false}
            >
              <sphereGeometry args={[0.007, 8, 6]} />
            </mesh>

            {side === 1 && (
              <>
                {/* The crack, in segments so it can glow and close from end to end. */}
                {segments.map((segment, i) => (
                  <mesh
                    key={i}
                    name={SPECTACLES_PARTS.crack}
                    userData={{ along: segment.along }}
                    position={[...segment.position]}
                    rotation={[0, 0, segment.angle]}
                  >
                    <boxGeometry args={[segment.length + 0.002, 0.0017, 0.001]} />
                    <meshBasicMaterial
                      color="#ffffff"
                      transparent
                      opacity={CRACK_OPACITY}
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>
                ))}
                <mesh
                  name={SPECTACLES_PARTS.glint}
                  material={materials.glint}
                  rotation={[0, 0, 0.5]}
                  position={[0, 0, 0.002]}
                  visible={false}
                >
                  <planeGeometry args={[0.008, 0.1]} />
                </mesh>
              </>
            )}
          </group>
        ))}
        <mesh position={[0, 0.012, 0]}>
          <torusGeometry args={[0.018, 0.004, 6, 12, Math.PI]} />
          <meshStandardMaterial color={SCENE.gold} metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Shards of the lens that fell onto the case. */}
      {SHARDS.map((shard, i) => (
        <mesh
          key={i}
          name={SPECTACLES_PARTS.shard}
          material={materials.shard}
          userData={{ home: shard.home }}
          position={[...shard.rest]}
          rotation={[-Math.PI / 2, 0, shard.spin]}
          scale={shard.size * SPECTACLES_SCALE}
        >
          <circleGeometry args={[1, 3]} />
        </mesh>
      ))}
    </PropGroup>
  );
}

/** Named parts of the creeping vines, for the sunburst outcome. */
export const VINES_PARTS = {
  /** Each vine, pivoting where it leaves the soil: `userData.angle` is the direction it grows out toward. */
  vine: "vine",
  /** A vine's stem: its tube is drawn from the soil up, so shortening its draw range pulls the tip in. */
  stem: "vine-stem",
  /** Each leaf: `userData.along` is where it grows on its vine, 0 to 1; `userData.rest` its rest rotation. */
  leaf: "vine-leaf",
} as const;

/** Where the vines leave the soil: just under the pot's rim, in the prop's space. */
const VINE_BASE_Y = 0.18;
const VINE_COUNT = 5;
/** Tube segments along each stem; the draw range shortens by whole segments. */
export const VINE_SEGMENTS = 48;
const VINE_LEAVES = [0.3, 0.55, 0.8] as const;
export const VINE_COLORS = { stem: "#2c3b22", leaf: "#3a5230" } as const;
/** A leaf's scale as it rests, open. */
export const LEAF_SCALE = [0.045, 0.012, 0.028] as const;

function CreepingVines() {
  const vines = useMemo(
    () =>
      Array.from({ length: VINE_COUNT }, (_, i) => {
        const angle = (i / VINE_COUNT) * Math.PI * 2;
        const base = new Vector3(
          Math.cos(angle) * 0.1,
          VINE_BASE_Y,
          Math.sin(angle) * 0.1,
        );
        // The curve lives in the vine's own space, starting at its base, so the vine pivots there.
        const points = Array.from({ length: 7 }, (_, step) => {
          const h = step / 6;
          const r = 0.1 + h * 0.18;
          const a = angle + h * 3.2;
          return new Vector3(
            Math.cos(a) * r,
            VINE_BASE_Y + h * 0.75,
            Math.sin(a) * r,
          ).sub(base);
        });
        const curve = new CatmullRomCurve3(points);
        return {
          angle,
          base,
          curve,
          leaves: VINE_LEAVES.map((along) => ({
            along,
            position: curve.getPoint(along),
            rotation: [0.6, i + along * 4, 0.3] as const,
          })),
        };
      }),
    [],
  );

  return (
    <PropGroup position={[0, PEDESTAL_TOP, 0]}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.16, 0.12, 0.2, 16]} />
        <meshStandardMaterial color="#6b3b26" roughness={0.9} />
      </mesh>
      {vines.map((vine, i) => (
        <group
          key={i}
          name={VINES_PARTS.vine}
          userData={{ angle: vine.angle }}
          position={vine.base}
        >
          <mesh name={VINES_PARTS.stem}>
            <tubeGeometry args={[vine.curve, VINE_SEGMENTS, 0.011, 5, false]} />
            <meshStandardMaterial color={VINE_COLORS.stem} roughness={0.9} />
          </mesh>
          {vine.leaves.map((leaf) => (
            <mesh
              key={leaf.along}
              name={VINES_PARTS.leaf}
              userData={{ along: leaf.along, rest: leaf.rotation }}
              position={leaf.position}
              rotation={[...leaf.rotation]}
              scale={[...LEAF_SCALE]}
            >
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial color={VINE_COLORS.leaf} roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
    </PropGroup>
  );
}

/** Named parts of the cloak on its stand, for the ignite outcome. */
export const CLOAK_PARTS = {
  /** The whole stand; `userData.scorch` holds the cloth's shared `ScorchUniforms`. */
  root: "cloak-stand",
  /** Each piece of cloth (the cloak and its hood), which flames climb. */
  cloth: "cloak-cloth",
} as const;

function CloakStand() {
  const scorch = useMemo(() => createScorchUniforms(), []);
  const cloth = useMemo(() => {
    const material = new MeshStandardMaterial({
      color: "#232638",
      roughness: 1,
      side: DoubleSide,
    });
    applyScorch(material, scorch);
    return material;
  }, [scorch]);
  useLayoutEffect(() => () => cloth.dispose(), [cloth]);

  const cloak = useMemo(() => {
    const profile = [
      new Vector2(0.05, 1.66),
      new Vector2(0.16, 1.55),
      new Vector2(0.24, 1.3),
      new Vector2(0.3, 0.9),
      new Vector2(0.38, 0.5),
      new Vector2(0.4, 0.42),
    ];
    const geometry = new LatheGeometry(profile, 36);
    // Add folds: push the surface in and out around the circumference.
    const position = geometry.attributes.position!;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = position.getY(i);
      const fold =
        1 + 0.09 * Math.sin(Math.atan2(z, x) * 9) * Math.min(1, (1.6 - y) * 1.2);
      position.setX(i, x * fold);
      position.setZ(i, z * fold);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);

  useLayoutEffect(() => () => cloak.dispose(), [cloak]);

  return (
    <PropGroup position={[0, 0, 0]} name={CLOAK_PARTS.root} userData={{ scorch }}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.06, 16]} />
        <meshStandardMaterial color={SCENE.woodDark} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 1.8, 8]} />
        <meshStandardMaterial color={SCENE.wood} roughness={0.8} />
      </mesh>
      <mesh name={CLOAK_PARTS.cloth} geometry={cloak} material={cloth} />
      <mesh
        name={CLOAK_PARTS.cloth}
        position={[0, 1.7, -0.02]}
        scale={[1, 0.9, 1]}
        material={cloth}
      >
        <sphereGeometry args={[0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
      </mesh>
    </PropGroup>
  );
}

interface TargetEntry {
  Component: ComponentType;
  /** Small props rest on the pedestal; large ones stand on the floor in its place. */
  onPedestal: boolean;
  /** World-space point where spells land: the lock, the chest, the book's cover. */
  focus: readonly [number, number, number];
}

export const TARGETS: Record<TargetModel, TargetEntry> = {
  tome: { Component: Tome, onPedestal: true, focus: [0, PEDESTAL_TOP + 0.12, 0] },
  "warded-door": { Component: WardedDoor, onPedestal: false, focus: [0.45, 1.1, 0.25] },
  "practice-mannequin": {
    Component: PracticeMannequin,
    onPedestal: false,
    focus: [0, 1.42, 0.2],
  },
  "cracked-spectacles": {
    Component: CrackedSpectacles,
    onPedestal: true,
    focus: [0, PEDESTAL_TOP + 0.14, 0],
  },
  "creeping-vines": {
    Component: CreepingVines,
    onPedestal: true,
    focus: [0, PEDESTAL_TOP + 0.5, 0],
  },
  "cloak-stand": { Component: CloakStand, onPedestal: false, focus: [0, 1.2, 0.3] },
};
