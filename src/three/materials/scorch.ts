import { Color, type MeshStandardMaterial } from "three";

/*
 * Fire damage for any standard material, driven by shared uniforms. Below
 * `uScorchLine` (a world height with a ragged edge) the surface chars dark and
 * rough with glowing ember flecks; below `uEaten` it is burnt away entirely,
 * with an ember-bright rim along the ragged edge. At `uChar` 0 and `uEaten`
 * under the mesh the material looks exactly as it did. No lights are added, so
 * it works on every graphics tier.
 *
 * GLSL here must stay well defined on real GPUs: no pow() of negative values
 * and no reversed smoothstep edges (they give NaN, which bloom smears black).
 */

export interface ScorchUniforms {
  uScorchLine: { value: number };
  uChar: { value: number };
  uEaten: { value: number };
  uEmbers: { value: number };
  uFlicker: { value: number };
  uScorchTime: { value: number };
  uEmberColor: { value: Color };
}

export function createScorchUniforms(): ScorchUniforms {
  return {
    uScorchLine: { value: -1 },
    uChar: { value: 0 },
    uEaten: { value: -1 },
    uEmbers: { value: 0 },
    uFlicker: { value: 0 },
    uScorchTime: { value: 0 },
    uEmberColor: { value: new Color("#ff7a2e") },
  };
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vScorchPos;
`;
const VERTEX_BODY = /* glsl */ `
vScorchPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uScorchLine;
uniform float uChar;
uniform float uEaten;
uniform float uEmbers;
uniform float uFlicker;
uniform float uScorchTime;
uniform vec3 uEmberColor;
varying vec3 vScorchPos;

float scorchHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float scorchNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(scorchHash(i), scorchHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(scorchHash(i + vec3(0.0, 1.0, 0.0)), scorchHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(scorchHash(i + vec3(0.0, 0.0, 1.0)), scorchHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(scorchHash(i + vec3(0.0, 1.0, 1.0)), scorchHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

/** Shared by the colour, roughness, and emissive steps below. */
const FRAGMENT_COVER = /* glsl */ `
float scorchGrain = scorchNoise(vScorchPos * 18.0) * 0.6 + scorchNoise(vScorchPos * 5.0) * 0.4;
// The burnt-away hem: a ragged edge, scalloped more than the char line.
float scorchEatenEdge = uEaten + (scorchNoise(vScorchPos * vec3(11.0, 3.0, 11.0)) - 0.5) * 0.12;
if (vScorchPos.y < scorchEatenEdge) discard;
float scorchEdge = uScorchLine + (scorchNoise(vScorchPos * 7.0) - 0.5) * 0.18;
float scorchCover = (1.0 - smoothstep(scorchEdge - 0.05, scorchEdge + 0.02, vScorchPos.y)) * uChar;
// Char is heaviest near the burnt edge and patchier higher up.
float scorchNear = 1.0 - smoothstep(scorchEatenEdge, scorchEatenEdge + 0.45, vScorchPos.y);
float scorchAmount = scorchCover * clamp(0.55 + 0.45 * scorchNear + (scorchGrain - 0.5) * 0.6, 0.0, 1.0);
`;

const FRAGMENT_COLOR = /* glsl */ `
vec3 scorchChar = mix(vec3(0.02, 0.018, 0.016), vec3(0.07, 0.05, 0.035), scorchGrain);
diffuseColor.rgb = mix(diffuseColor.rgb, scorchChar, scorchAmount);
`;

const FRAGMENT_ROUGHNESS = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 1.0, scorchAmount);
`;

const FRAGMENT_EMISSIVE = /* glsl */ `
float scorchRimD = (vScorchPos.y - scorchEatenEdge) / 0.03;
float scorchRim = exp(-scorchRimD * scorchRimD);
float scorchFleck = smoothstep(0.7, 0.9, scorchNoise(vScorchPos * 40.0 + vec3(0.0, uScorchTime * 0.2, 0.0)));
float scorchPulse = 1.0 - uFlicker * 0.45 * (0.5 + 0.5 * sin(uScorchTime * 13.0 + scorchGrain * 30.0));
float scorchGlow = (scorchRim * 1.6 + scorchFleck * scorchCover * scorchNear * 0.8) * uEmbers * scorchPulse;
totalEmissiveRadiance += uEmberColor * scorchGlow;
`;

/** Patches a standard material so the shared uniforms can scorch it. Call once per material. */
export function applyScorch(material: MeshStandardMaterial, uniforms: ScorchUniforms) {
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
  material.customProgramCacheKey = () => "scorch";
  material.needsUpdate = true;
}
