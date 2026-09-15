import { Color, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";

export interface InstanceSpec {
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  color?: string;
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const euler = new Euler();
const color = new Color();

/**
 * Writes transforms (and optional colours) into an InstancedMesh. One draw
 * call renders every instance, which is how the room's hundreds of stones,
 * planks, and books stay cheap.
 */
export function applyInstances(mesh: InstancedMesh, specs: readonly InstanceSpec[]) {
  specs.forEach((spec, i) => {
    position.set(...spec.position);
    euler.set(...(spec.rotation ?? [0, 0, 0]));
    quaternion.setFromEuler(euler);
    scale.set(...spec.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    if (spec.color) mesh.setColorAt(i, color.set(spec.color));
  });
  mesh.count = specs.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}
