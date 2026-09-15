import { expect, test, type Page } from "@playwright/test";

/** A log-message string from three.js that survives minification (class names may not). */
const THREE_MARKER = "THREE.WebGLRenderer";

// Software WebGL is slow: allow time for shaders to compile on the first frame.
const READY_TIMEOUT = 60_000;

const chamber = (page: Page) => page.locator("section[data-chamber-state]");

async function waitForChamber(page: Page) {
  await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready", {
    timeout: READY_TIMEOUT,
  });
}

test.describe("3D chamber", () => {
  test.describe.configure({ timeout: 90_000 });

  test("loads the canvas with the spell's details", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/spells/wingardium-leviosa/cast");
    await waitForChamber(page);

    await expect(chamber(page).locator("canvas")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Wingardium Leviosa",
    );
    await expect(
      page.getByRole("button", { name: "Cast Wingardium Leviosa" }),
    ).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("switches spells without reloading the 3D scene", async ({ page }) => {
    await page.goto("/spells/wingardium-leviosa/cast");
    await waitForChamber(page);
    const canvas = await chamber(page).locator("canvas").elementHandle();

    await page
      .getByRole("navigation", { name: "Choose a spell" })
      .getByRole("button", { name: /Alohomora/ })
      .click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alohomora");
    await expect(page).toHaveURL("/spells/alohomora/cast");
    await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready");
    // Same canvas element: the WebGL context survived the switch.
    expect(await canvas?.evaluate((node) => node.isConnected)).toBe(true);
  });

  test("uses the graphics quality chosen in Settings", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "High" }).check({ force: true });
    await page.goto("/chamber");
    await expect(chamber(page)).toHaveAttribute("data-quality", "high");
    await expect(page.getByRole("link", { name: "Graphics: High" })).toBeVisible();
  });

  test("detects a software renderer as the low tier in auto mode", async ({ page }) => {
    await page.goto("/chamber");
    await expect(chamber(page)).toHaveAttribute("data-quality", "low", {
      timeout: READY_TIMEOUT,
    });
    await expect(page.getByRole("link", { name: "Graphics: Low (auto)" })).toBeVisible();
  });
});

test.describe("bundle boundaries", () => {
  async function javascriptOn(page: Page, path: string, settled?: () => Promise<void>) {
    const bodies: Array<Promise<string>> = [];
    page.on("response", (response) => {
      if (response.request().resourceType() !== "script") return;
      bodies.push(response.text().catch(() => ""));
    });
    await page.goto(path, { waitUntil: "networkidle" });
    await settled?.();
    // Reading bodies is async; wait for every one, not just the ones that finished first.
    return (await Promise.all(bodies)).join("\n");
  }

  for (const path of ["/", "/spells", "/spells/wingardium-leviosa"]) {
    test(`never downloads three.js on ${path}`, async ({ page }) => {
      const scripts = await javascriptOn(page, path);
      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts).not.toContain(THREE_MARKER);
    });
  }

  test("does download three.js on the chamber", async ({ page }) => {
    test.setTimeout(90_000);
    // The 3D chunk is requested after hydration and the device check, so wait for the chamber.
    const scripts = await javascriptOn(page, "/chamber", () => waitForChamber(page));
    expect(scripts).toContain(THREE_MARKER);
  });
});
