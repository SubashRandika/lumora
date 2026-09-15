import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { BUDGETS, QUALITY_PROFILES } from "../src/config/performance";

/*
 * The performance budgets from docs/PERFORMANCE.md, enforced against the
 * production build the E2E server runs. The scene has no DOM, so draw calls
 * and frame counts come from `window.__chamberProbe`, which the chamber fills
 * in only when a test defines it.
 */

test.describe.configure({ timeout: 150_000 });

const KIB = 1024;
/** For high-quality pages where only counts matter, not pixels. */
const SMALL_CANVAS = { viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 };
const chamber = (page: Page) => page.locator("section[data-chamber-state]");

function useGraphics(page: Page, graphics: "low" | "high") {
  return page.addInitScript((g) => {
    window.__chamberProbe = {};
    localStorage.setItem(
      "magic-words:settings",
      JSON.stringify({
        state: {
          graphics: g,
          motion: "system",
          soundEnabled: false,
          musicEnabled: false,
          masterVolume: 0.7,
        },
        version: 1,
      }),
    );
  }, graphics);
}

async function waitForChamber(page: Page) {
  await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready", {
    timeout: 90_000,
  });
}

/** Resolves once the chamber has drawn `count` more frames. */
async function framesDrawn(page: Page, count: number) {
  const from = await page.evaluate(() => window.__chamberProbe?.frames ?? 0);
  await page.waitForFunction(
    ([start, n]) => (window.__chamberProbe?.frames ?? 0) >= start + n,
    [from, count] as const,
    { timeout: 60_000 },
  );
}

const probe = (page: Page) => page.evaluate(() => ({ ...window.__chamberProbe }));

test.describe("JavaScript size", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "The bundles are the same on every device; measure them once.",
  );

  /** Gzipped size of every script the page downloads, in KiB. */
  async function scriptKib(page: Page, path: string, settled?: () => Promise<void>) {
    const sizes: Array<Promise<number>> = [];
    page.on("response", (response) => {
      if (response.request().resourceType() !== "script") return;
      sizes.push(
        response
          .body()
          .then((body) => gzipSync(body, { level: 6 }).length)
          .catch(() => 0),
      );
    });
    await page.goto(path, { waitUntil: "networkidle" });
    await settled?.();
    const bytes = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);
    return bytes / KIB;
  }

  for (const path of ["/", "/spells", "/spells/wingardium-leviosa"]) {
    test(`content page ${path} stays within ${BUDGETS.contentJsKb} KiB`, async ({
      page,
    }) => {
      const kib = await scriptKib(page, path);
      expect(kib).toBeGreaterThan(0);
      expect(kib, `${kib.toFixed(1)} KiB of JavaScript`).toBeLessThanOrEqual(
        BUDGETS.contentJsKb,
      );
    });
  }

  test.describe(() => {
    // Software WebGL at high quality is very CPU-heavy, and slows every other
    // worker. Script sizes don't depend on the canvas size, so keep it small.
    test.use(SMALL_CANVAS);

    test(`a cast page at high quality stays within ${BUDGETS.chamberJsKb} KiB`, async ({
      page,
    }) => {
      await useGraphics(page, "high");
      // Post-processing loads after the scene; wait for it too.
      const kib = await scriptKib(page, "/spells/wingardium-leviosa/cast", async () => {
        await waitForChamber(page);
        await page.waitForLoadState("networkidle");
      });
      expect(kib, `${kib.toFixed(1)} KiB of JavaScript`).toBeLessThanOrEqual(
        BUDGETS.chamberJsKb,
      );
    });
  });
});

test.describe("draw calls", () => {
  test(`every scene, and a cast, stay within ${BUDGETS.drawCalls.low} on low`, async ({
    page,
  }) => {
    await useGraphics(page, "low");
    await page.goto("/spells/wingardium-leviosa/cast");
    await waitForChamber(page);

    const switcher = page.getByRole("navigation", { name: "Choose a spell" });
    const names = await switcher.getByRole("button").allTextContents();
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) {
      await switcher.getByRole("button", { name }).click();
      await framesDrawn(page, 5);
    }

    // Lumos Solem draws the most on low: its vines, sun, and sunlight pool.
    await switcher.getByRole("button", { name: /Lumos Solem/ }).click();
    await page.getByRole("button", { name: "Cast Lumos Solem" }).click();
    await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
      timeout: 60_000,
    });

    const { maxDrawCalls = Infinity } = await probe(page);
    expect(maxDrawCalls).toBeGreaterThan(0);
    expect(maxDrawCalls).toBeLessThanOrEqual(BUDGETS.drawCalls.low);
  });

  test.describe(() => {
    test.skip(({ isMobile }) => isMobile, "Draw calls don't depend on the screen.");
    // Draw calls don't depend on the canvas size either; see SMALL_CANVAS.
    test.use(SMALL_CANVAS);

    test(`the busiest scene stays within ${BUDGETS.drawCalls.high} on high`, async ({
      page,
    }) => {
      await useGraphics(page, "high");
      await page.goto("/spells/lumos-solem/cast");
      await waitForChamber(page);
      await framesDrawn(page, 5);

      const { maxDrawCalls = Infinity } = await probe(page);
      expect(maxDrawCalls).toBeGreaterThan(0);
      expect(maxDrawCalls).toBeLessThanOrEqual(BUDGETS.drawCalls.high);
    });
  });
});

test("an idle chamber draws at the idle frame rate", async ({ page }) => {
  await useGraphics(page, "low");
  await page.goto("/spells/wingardium-leviosa/cast");
  await waitForChamber(page);
  // No pointer input and no cast: let the camera settle.
  await page.waitForTimeout(3500);

  const seconds = 3;
  const before = (await probe(page)).frames ?? 0;
  await page.waitForTimeout(seconds * 1000);
  const drawn = ((await probe(page)).frames ?? 0) - before;

  expect(drawn).toBeGreaterThan(0);
  // A little slack for timer jitter; a regression to every frame would be ~180.
  expect(drawn).toBeLessThanOrEqual(QUALITY_PROFILES.low.idleFrameRate * seconds + 10);
});
