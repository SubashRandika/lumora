/**
 * Scene colours. The UI tokens (ink, gold, wandlight…) carried into 3D, plus
 * the room's materials. Linear-space conversion is handled by three.js.
 */
export const SCENE = {
  ink: "#0b0d12",
  fog: "#0d0f15",
  wandlight: "#f7e9b8",
  gold: "#c29d5b",
  candleFlame: "#ffb45e",
  candleWax: "#e6dcc2",
  iron: "#1b1c20",
  stone: "#34373e",
  stoneLight: "#4a4d55",
  wood: "#3b2819",
  woodDark: "#24170e",
  rug: "#3a1d22",
  leather: ["#4a2320", "#2f3a2a", "#2a3246", "#5a3a1e", "#3d2a3f", "#1f2a2e", "#6b4a2a"],
  parchment: "#d8c9a6",
} as const;
