import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { QualityProfile } from "@/config/performance";

/**
 * Bloom makes flames and the wand tip glow; the vignette darkens the corners
 * like candlelight falling off. Loaded lazily, and only on tiers that enable it.
 */
export default function ChamberEffects({ quality }: { quality: QualityProfile }) {
  return (
    <EffectComposer multisampling={quality.antialias ? 4 : 0}>
      <Bloom
        mipmapBlur
        intensity={0.75}
        luminanceThreshold={0.82}
        luminanceSmoothing={0.2}
      />
      <Vignette offset={0.22} darkness={quality.postprocessing.vignette ? 0.75 : 0} />
    </EffectComposer>
  );
}
