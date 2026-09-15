import { CanvasTexture, SRGBColorSpace } from "three";

let shared: CanvasTexture | null = null;

/**
 * A soft radial glow for sprites: white core fading to transparent. One
 * 64×64 texture shared by every glow in the chamber. It is never disposed:
 * it's tiny, and a remounted canvas simply uploads it again.
 */
export function getGlowTexture(): CanvasTexture {
  if (shared) return shared;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  shared = new CanvasTexture(canvas);
  shared.colorSpace = SRGBColorSpace;
  return shared;
}
