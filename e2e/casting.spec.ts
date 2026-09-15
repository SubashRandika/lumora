import { expect, test, type Page } from "@playwright/test";

// Software WebGL is slow; casts themselves run on wall-clock timers (~5 s for Alohomora).
test.describe.configure({ timeout: 120_000 });

const chamber = (page: Page) => page.locator("section[data-chamber-state]");

async function openChamber(page: Page, spellId: string, motion = "system") {
  // Low graphics keeps software rendering responsive enough to click during a cast.
  await page.addInitScript((m) => {
    localStorage.setItem(
      "magic-words:settings",
      JSON.stringify({
        state: {
          graphics: "low",
          motion: m,
          soundEnabled: true,
          musicEnabled: false,
          masterVolume: 0.7,
        },
        version: 1,
      }),
    );
  }, motion);
  await page.goto(`/spells/${spellId}/cast`);
  await expect(chamber(page)).toHaveAttribute("data-chamber-state", "ready", {
    timeout: 60_000,
  });
}

test("casting a spell runs through every phase to Spell complete", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openChamber(page, "alohomora");

  const seen = new Set<string>();
  await page.exposeFunction("recordCastState", (state: string) => seen.add(state));
  await page.evaluate(() => {
    const section = document.querySelector("section[data-cast-state]")!;
    new MutationObserver(() => {
      (window as unknown as { recordCastState: (s: string) => void }).recordCastState(
        section.getAttribute("data-cast-state") ?? "",
      );
    }).observe(section, { attributes: true, attributeFilter: ["data-cast-state"] });
  });

  await page.getByRole("button", { name: "Cast Alohomora" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  expect([...seen]).toEqual(
    expect.arrayContaining([
      "preparing",
      "casting",
      "projectile",
      "impact",
      "effect",
      "completed",
    ]),
  );
  await expect(
    page.getByRole("status").filter({ hasText: "spell complete" }),
  ).toBeAttached();
  expect(errors).toEqual([]);

  await page.getByRole("button", { name: "Cast again" }).click();
  await expect(chamber(page)).not.toHaveAttribute("data-cast-state", "completed");
});

test("Space casts and Escape cancels back to idle", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard casting is a desktop interaction");
  await openChamber(page, "wingardium-leviosa");

  await page.keyboard.press("Space");
  await expect(chamber(page)).toHaveAttribute("data-cast-state", /preparing|casting/);
  await expect(page.getByRole("button", { name: /Cancel/ })).toBeVisible();

  // Other spells can't be picked mid-cast.
  await expect(
    page
      .getByRole("navigation", { name: "Choose a spell" })
      .getByRole("button", { name: /Alohomora/ }),
  ).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(chamber(page)).toHaveAttribute("data-cast-state", "idle");
  await expect(
    page.getByRole("button", { name: "Cast Wingardium Leviosa" }),
  ).toBeEnabled();
});

test("Choose another spell moves focus to the spell list", async ({ page }) => {
  await openChamber(page, "petrificus-totalus");
  await page.getByRole("button", { name: "Cast Petrificus Totalus" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Choose another spell" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Choose a spell" })
      .getByRole("button", { name: /Locomotor Mortis/ }),
  ).toBeFocused();
});

test("with reduced motion, casts still complete", async ({ page }) => {
  await openChamber(page, "oculus-reparo", "reduce");
  await page.getByRole("button", { name: "Cast Oculus Reparo" }).click();
  await expect(page.getByText("Spell complete", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
