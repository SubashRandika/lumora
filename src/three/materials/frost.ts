import { Color, type MeshStandardMaterial } from "three";

/*
 * Stone-like frost for any standard material, driven by shared uniforms:
 * everything below `uFrostLine` (a world height, with a ragged edge) turns
 * grey, rough, and faintly glittering, with a cold glow along the edge. At
 * `uFrost` 0 the material looks exactly as it did. No lights are added, so it
 * works on every graphics tier.
 *
 * GLSL here must stay well defined on real GPUs: no pow() of negative values
 * and no reversed smoothstep edges (they give NaN, which bloom smears black).
 */

export interface FrostUniforms {
  uFrostLine: { value: number };
  uFrost: { value: number };
  uFrostRim: { value: number };
  uChill: { value: number };
  uFrostTint: { value: Color };
}

export function createFrostUniforms(): FrostUniforms {
  return {
    uFrostLine: { value: -1 },
    uFrost: { value: 0 },
    uFrostRim: { value: 0 },
    uChill: { value: 0 },
    uFrostTint: { value: new Color("#9fc6ea") },
  };
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vFrostPos;
`;
const VERTEX_BODY = /* glsl */ `
vFrostPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uFrostLine;
uniform float uFrost;
uniform float uFrostRim;
uniform float uChill;
uniform vec3 uFrostTint;
varying vec3 vFrostPos;

float frostHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float frostNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(frostHash(i), frostHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(frostHash(i + vec3(0.0, 1.0, 0.0)), frostHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(frostHash(i + vec3(0.0, 0.0, 1.0)), frostHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(frostHash(i + vec3(0.0, 1.0, 1.0)), frostHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

/** Shared by the colour, roughness, and emissive steps below. */
const FRAGMENT_COVER = /* glsl */ `
float frostGrain = frostNoise(vFrostPos * 22.0) * 0.55 + frostNoise(vFrostPos * 6.0) * 0.45;
float frostEdge = uFrostLine + (frostNoise(vFrostPos * 9.0) - 0.5) * 0.14;
float frostCover = (1.0 - smoothstep(frostEdge - 0.015, frostEdge + 0.015, vFrostPos.y)) * uFrost;
float frostSpeck = step(0.8, frostNoise(vFrostPos * 70.0));
`;

const FRAGMENT_COLOR = /* glsl */ `
// Cold grey stone, mottled, with pale rime in the crevices of the grain. Kept
// dark because the spell's light sits close in front of the target.
// Cool enough that warm candlelight doesn't turn it brown.
vec3 frostStone = mix(vec3(0.11, 0.13, 0.17), vec3(0.26, 0.3, 0.37), frostGrain * frostGrain);
frostStone = mix(frostStone, vec3(0.5, 0.56, 0.62), frostSpeck * 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, frostStone, frostCover);
`;

const FRAGMENT_ROUGHNESS = /* glsl */ `
roughnessFactor = mix(roughnessFactor, mix(0.97, 0.6, frostSpeck), frostCover);
`;

const FRAGMENT_EMISSIVE = /* glsl */ `
float frostD = (vFrostPos.y - frostEdge) / 0.035;
float frostRimGlow = exp(-frostD * frostD) * uFrostRim * uFrost;
float frostShimmer = frostCover * uChill * 0.14 * frostSpeck;
totalEmissiveRadiance += uFrostTint * (frostRimGlow * 0.9 + frostShimmer);
`;

/** Patches a standard material so the shared uniforms can frost it. Call once per material. */
export function applyFrost(material: MeshStandardMaterial, uniforms: FrostUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${FRAGMENT_COVER}\n${FRAGMENT_COLOR}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\n${FRAGMENT_ROUGHNESS}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${FRAGMENT_EMISSIVE}`,
      );
  };
  material.customProgramCacheKey = () => "frost";
  material.needsUpdate = true;
}
