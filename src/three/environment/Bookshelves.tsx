import { useMemo } from "react";
import type { QualityProfile } from "@/config/performance";
import { SCENE } from "../palette";
import type { InstanceSpec } from "../utils/instances";
import { InstancedBoxes } from "../utils/InstancedBoxes";
import { createRandom } from "../utils/random";
import { ROOM } from "./Room";

interface ShelfPlacement {
  /** Centre of the shelf's footprint on the floor. */
  x: number;
  z: number;
  /** Rotation around Y: 0 faces +z (toward the viewer). */
  facing: number;
}

const WIDTH = 2.1;
const HEIGHT = 3.3;
const DEPTH = 0.42;
const SHELF_COUNT = 5;
const BOARD = 0.05;

const FULL: ShelfPlacement[] = [
  { x: -3.3, z: ROOM.back + 0.4, facing: 0 },
  { x: 3.3, z: ROOM.back + 0.4, facing: 0 },
  { x: -ROOM.halfWidth + 0.4, z: -2.6, facing: Math.PI / 2 },
  { x: -ROOM.halfWidth + 0.4, z: 0.2, facing: Math.PI / 2 },
  { x: ROOM.halfWidth - 0.4, z: -2.6, facing: -Math.PI / 2 },
  { x: ROOM.halfWidth - 0.4, z: 0.2, facing: -Math.PI / 2 },
];

const REDUCED: ShelfPlacement[] = FULL.slice(0, 2);

/** Rotates a local (x, z) offset by the shelf's facing and adds its position. */
function place(shelf: ShelfPlacement, lx: number, y: number, lz: number) {
  const cos = Math.cos(shelf.facing);
  const sin = Math.sin(shelf.facing);
  return [shelf.x + lx * cos + lz * sin, y, shelf.z - lx * sin + lz * cos] as const;
}

function buildShelves(placements: ShelfPlacement[], bookDensity: number) {
  const random = createRandom(31);
  const frames: InstanceSpec[] = [];
  const books: InstanceSpec[] = [];

  for (const shelf of placements) {
    const rotation = [0, shelf.facing, 0] as const;
    // Sides, back panel, top.
    for (const side of [-1, 1]) {
      frames.push({
        position: place(shelf, (side * (WIDTH - BOARD)) / 2, HEIGHT / 2, 0),
        scale: [BOARD, HEIGHT, DEPTH],
        rotation,
      });
    }
    frames.push({
      position: place(shelf, 0, HEIGHT / 2, -DEPTH / 2 + 0.01),
      scale: [WIDTH, HEIGHT, 0.02],
      rotation,
    });

    for (let level = 0; level <= SHELF_COUNT; level++) {
      const y = 0.08 + (level * (HEIGHT - 0.1)) / SHELF_COUNT;
      frames.push({
        position: place(shelf, 0, y, 0),
        scale: [WIDTH - BOARD, BOARD, DEPTH],
        rotation,
      });
      if (level === SHELF_COUNT) continue;

      // Fill the shelf left to right with books of varied size, leaving gaps.
      let lx = -WIDTH / 2 + BOARD + 0.02;
      const limit = WIDTH / 2 - BOARD - 0.02;
      while (lx < limit) {
        const thickness = random.range(0.03, 0.075);
        if (lx + thickness > limit) break;
        if (random.next() > bookDensity) {
          lx += random.range(0.04, 0.2);
          continue;
        }
        const height = random.range(0.2, 0.34);
        const bookDepth = random.range(0.2, 0.3);
        const lean = random.next() < 0.08 ? random.range(-0.25, 0.25) : 0;
        books.push({
          position: place(shelf, lx + thickness / 2, y + BOARD / 2 + height / 2, 0.02),
          scale: [thickness, height, bookDepth],
          rotation: [0, shelf.facing, lean],
          color: random.pick(SCENE.leather),
        });
        lx += thickness + 0.003;
      }
    }
  }
  return { frames, books };
}

/** Tall shelves of books along the walls. Two instanced draw calls in total. */
export function Bookshelves({ quality }: { quality: QualityProfile }) {
  const full = quality.environmentDetail === "full";
  const { frames, books } = useMemo(
    () => buildShelves(full ? FULL : REDUCED, full ? 0.88 : 0.6),
    [full],
  );

  return (
    <group>
      <InstancedBoxes
        specs={frames}
        color={SCENE.woodDark}
        roughness={0.8}
        receiveShadow
      />
      <InstancedBoxes specs={books} roughness={0.75} />
    </group>
  );
}
