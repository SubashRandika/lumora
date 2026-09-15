import { useMemo } from "react";
import { Color } from "three";
import type { QualityProfile } from "@/config/performance";
import { SCENE } from "../palette";
import type { InstanceSpec } from "../utils/instances";
import { InstancedBoxes } from "../utils/InstancedBoxes";
import { createRandom } from "../utils/random";

/** Room extents in metres. The pedestal stands at the origin. */
export const ROOM = { halfWidth: 6, back: -5.2, front: 6, height: 5 } as const;

const PLANK_WIDTH = 0.3;
const STONE_HEIGHT = 0.42;

function tint(hex: string, amount: number): string {
  return `#${new Color(hex).offsetHSL(0, 0, amount).getHexString()}`;
}

function buildFloor(): InstanceSpec[] {
  const random = createRandom(11);
  const specs: InstanceSpec[] = [];
  for (let x = -ROOM.halfWidth; x < ROOM.halfWidth; x += PLANK_WIDTH) {
    // Each row is split into boards of uneven length so the seams stagger.
    let z = ROOM.back;
    while (z < ROOM.front) {
      const length = Math.min(random.range(1.6, 3.8), ROOM.front - z);
      specs.push({
        position: [x + PLANK_WIDTH / 2, -0.025, z + length / 2],
        scale: [PLANK_WIDTH - 0.012, 0.05, length - 0.02],
        color: tint(
          random.pick([SCENE.wood, SCENE.woodDark, SCENE.wood]),
          random.range(-0.03, 0.03),
        ),
      });
      z += length;
    }
  }
  return specs;
}

type WallSide = "back" | "left" | "right";

function buildWall(side: WallSide, seed: number): InstanceSpec[] {
  const random = createRandom(seed);
  const specs: InstanceSpec[] = [];
  const span =
    side === "back" ? [-ROOM.halfWidth, ROOM.halfWidth] : [ROOM.back, ROOM.front];
  for (let row = 0; row * STONE_HEIGHT < ROOM.height; row++) {
    let u = span[0]! - (row % 2) * 0.4;
    while (u < span[1]!) {
      const width = random.range(0.6, 1.1);
      const center = u + width / 2;
      const y = row * STONE_HEIGHT + STONE_HEIGHT / 2;
      const depthJitter = random.range(0, 0.05);
      const scale: [number, number, number] = [width - 0.03, STONE_HEIGHT - 0.03, 0.3];
      const color = tint(SCENE.stone, random.range(-0.035, 0.03));
      if (side === "back") {
        specs.push({ position: [center, y, ROOM.back + depthJitter], scale, color });
      } else {
        const x =
          side === "left" ? -ROOM.halfWidth - depthJitter : ROOM.halfWidth + depthJitter;
        specs.push({
          position: [x, y, center],
          scale,
          rotation: [0, Math.PI / 2, 0],
          color,
        });
      }
      u += width;
    }
  }
  return specs;
}

/** Floor, stone walls, and the rug beneath the pedestal. */
export function Room({ quality }: { quality: QualityProfile }) {
  const floor = useMemo(() => buildFloor(), []);
  const walls = useMemo(
    () =>
      quality.environmentDetail === "full"
        ? [...buildWall("back", 21), ...buildWall("left", 22), ...buildWall("right", 23)]
        : [],
    [quality.environmentDetail],
  );

  return (
    <group>
      <InstancedBoxes specs={floor} roughness={0.85} receiveShadow />

      {walls.length > 0 ? (
        <InstancedBoxes specs={walls} roughness={0.95} receiveShadow />
      ) : (
        // Reduced detail: flat walls, three draw calls instead of hundreds of stones' worth of vertices.
        <group>
          <mesh position={[0, ROOM.height / 2, ROOM.back]}>
            <planeGeometry args={[ROOM.halfWidth * 2, ROOM.height]} />
            <meshStandardMaterial color={SCENE.stone} roughness={1} />
          </mesh>
          <mesh
            position={[-ROOM.halfWidth, ROOM.height / 2, 0.4]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[ROOM.front - ROOM.back, ROOM.height]} />
            <meshStandardMaterial color={SCENE.stone} roughness={1} />
          </mesh>
          <mesh
            position={[ROOM.halfWidth, ROOM.height / 2, 0.4]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[ROOM.front - ROOM.back, ROOM.height]} />
            <meshStandardMaterial color={SCENE.stone} roughness={1} />
          </mesh>
        </group>
      )}

      {/* Rug: deep red with a worn gold border. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <circleGeometry args={[1.7, 48]} />
        <meshStandardMaterial color={SCENE.rug} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[1.52, 1.6, 64]} />
        <meshStandardMaterial color={SCENE.gold} roughness={0.7} metalness={0.3} />
      </mesh>
    </group>
  );
}
