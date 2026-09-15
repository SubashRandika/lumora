import { expect, test } from "@playwright/test";

test.describe("foundation routes", () => {
  test("home leads to the spell library and a spell page", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /cast the magic/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Browse spells" }).click();
    await expect(page).toHaveURL("/spells");
    await expect(page.getByRole("article")).toHaveCount(7);

    await page.getByRole("link", { name: "Wingardium Leviosa", exact: true }).click();
    await expect(page).toHaveURL("/spells/wingardium-leviosa");
    await expect(page).toHaveTitle("Wingardium Leviosa | Lumora");
    await expect(page.getByText("Book, chapter 10")).toBeVisible();
  });

  test("unknown spells return 404", async ({ page }) => {
    const response = await page.goto("/spells/not-a-spell");
    expect(response?.status()).toBe(404);
  });

  test("settings persist across reloads", async ({ page }) => {
    await page.goto("/settings");
    const sound = page.getByRole("switch", { name: "Sound effects" });
    await expect(sound).toHaveAttribute("aria-checked", "true");
    await sound.click();
    await page.getByRole("radio", { name: "Low" }).check({ force: true });

    await page.reload();
    await expect(page.getByRole("switch", { name: "Sound effects" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(page.getByRole("radio", { name: "Low" })).toBeChecked();
  });

  test("skip link is the first tab stop", async ({ page }) => {
    await page.goto("/spells");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
});
