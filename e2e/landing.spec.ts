import { expect, test } from "@playwright/test";

/*
 * Several tests end in the 3D chamber. Software WebGL is CPU-heavy, so they
 * render it on low graphics, and anything that waits on animation frames
 * gets extra time while other workers are rendering too.
 */
const UNDER_LOAD = { timeout: 15_000 };

test.describe("landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "magic-words:settings",
        JSON.stringify({
          state: {
            graphics: "low",
            motion: "system",
            soundEnabled: true,
            musicEnabled: false,
            masterVolume: 0.7,
          },
          version: 1,
        }),
      );
    });
  });

  test("has one headline; the carved wall is hidden from assistive tech", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cast the Magic.");
    // The wall repeats every incantation many times; none of it should be exposed.
    const hero = page.locator("section[aria-labelledby='hero-title']");
    expect(await hero.ariaSnapshot()).not.toContain("Alohomora");
  });

  test("Enter the Chamber plays the transition, then opens the chamber", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby='hero-title']");

    await page.getByRole("link", { name: "Enter the Chamber" }).click();
    await expect(hero).toHaveAttribute("data-entering", "true");
    await expect(page).toHaveURL("/chamber", UNDER_LOAD);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("with reduced motion, entering skips the transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    // Record whether the flare ever starts. The navigation is client-side, so this survives it.
    await page.evaluate(() => {
      const hero = document.querySelector("section[aria-labelledby='hero-title']")!;
      new MutationObserver(() => {
        if (hero.getAttribute("data-entering") === "true") {
          (window as { flareStarted?: boolean }).flareStarted = true;
        }
      }).observe(hero, { attributes: true });
    });

    await page.getByRole("link", { name: "Enter the Chamber" }).click();
    await expect(page).toHaveURL("/chamber", UNDER_LOAD);
    expect(
      await page.evaluate(() => (window as { flareStarted?: boolean }).flareStarted),
    ).toBeUndefined();
  });

  test("Enter the Chamber works from the keyboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Enter the Chamber" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/chamber", UNDER_LOAD);
  });

  test("the light follows the pointer", async ({ page, isMobile }) => {
    test.skip(isMobile, "Pointer steering is a desktop interaction");
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby='hero-title']");
    const lightX = () =>
      hero.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--light-x"));

    // Under load the page may hydrate after the first moves, so keep steering until
    // the light responds. Alternate positions: a move to the same spot fires no event.
    let nudge = 0;
    await expect(async () => {
      nudge = (nudge + 1) % 2;
      await page.mouse.move(100 + nudge * 10, 150, { steps: 3 });
      expect(parseFloat(await lightX())).toBeLessThan(20);
    }).toPass(UNDER_LOAD);
  });

  test("spell index rows open the spell page", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("region", { name: "The first year’s spells" })
      .getByRole("link", { name: /Petrificus Totalus/ })
      .click();
    await expect(page).toHaveURL("/spells/petrificus-totalus");
  });
});
