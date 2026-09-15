import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type HemisphereLight, type SpotLight } from "three";
import type { QualityProfile } from "@/config/performance";
import { useCastRig } from "../casting/CastRig";
import { PEDESTAL_TOP } from "../objects/Pedestal";

const HEMI = 1.1;
const KEY = 85;

/**
 * A cool, dim fill so the room reads as night, and one warm key light from
 * above onto the pedestal: the only light that casts shadows. Spells can
 * brighten or dim the room through `fx`. Candle lights live with the candles.
 */
export function ChamberLighting({ quality }: { quality: QualityProfile }) {
  const { fx } = useCastRig();
  const hemi = useRef<HemisphereLight>(null);
  const key = useRef<SpotLight>(null);
  const target = useMemo(() => {
    const object = new Object3D();
    object.position.set(0, PEDESTAL_TOP, 0);
    return object;
  }, []);
  const shadows = quality.shadows === "key-light";

  useFrame(() => {
    const level = 1 + fx.brighten * 1.4 - fx.dim * 0.55;
    if (hemi.current) hemi.current.intensity = HEMI * level;
    if (key.current) key.current.intensity = KEY * (1 + fx.brighten * 0.6 - fx.dim * 0.4);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#4a5878", "#1c140e", HEMI]} />
      {/* With few candle lights, lift the shadows so the far side of the room doesn't vanish. */}
      {quality.maxDynamicLights <= 2 && <ambientLight color="#6a5a48" intensity={0.9} />}
      <primitive object={target} />
      <spotLight
        ref={key}
        position={[0.6, 5.2, 2.6]}
        target={target}
        color="#ffdcae"
        intensity={KEY}
        angle={0.4}
        penumbra={0.75}
        distance={12}
        decay={1.7}
        castShadow={shadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}
