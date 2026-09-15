import { SCENE } from "../palette";

/** Height of the pedestal's top surface, where small targets rest. */
export const PEDESTAL_TOP = 1.1;

export function Pedestal() {
  return (
    <group>
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.14, 0.9]} />
        <meshStandardMaterial color={SCENE.stoneLight} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.32, 0.88, 12]} />
        <meshStandardMaterial color={SCENE.stoneLight} roughness={0.95} />
      </mesh>
      {/* Receives the target's shadow but casts none, so it doesn't paint an arch down the column. */}
      <mesh position={[0, PEDESTAL_TOP - 0.05, 0]} receiveShadow>
        <boxGeometry args={[0.72, 0.1, 0.72]} />
        <meshStandardMaterial color={SCENE.stoneLight} roughness={0.9} />
      </mesh>
    </group>
  );
}
