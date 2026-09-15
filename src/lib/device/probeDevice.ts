import type { DeviceCapabilities } from "@/domain/performance/tier";

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/**
 * Browser-only snapshot of device capabilities. Creates a throwaway WebGL2
 * context and releases it immediately, so it is safe to call before the
 * real canvas exists. Never throws.
 */
export function probeDevice(): DeviceCapabilities {
  const nav = navigator as NavigatorWithHints;
  const dpr = window.devicePixelRatio || 1;
  const base = {
    hardwareConcurrency: nav.hardwareConcurrency || 2,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    devicePixelRatio: dpr,
    screenPixels: Math.round(window.screen.width * window.screen.height * dpr * dpr),
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    saveData: nav.connection?.saveData === true,
  };

  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = document.createElement("canvas").getContext("webgl2", {
      failIfMajorPerformanceCaveat: false,
    });
  } catch {
    gl = null;
  }

  if (!gl) {
    return { ...base, webgl2: false, renderer: null, maxTextureSize: 0 };
  }

  try {
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    return { ...base, webgl2: true, renderer, maxTextureSize };
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
