import { expect, test } from "@playwright/test";

// A browser with WebGL switched off entirely, like an old or locked-down device.
test.use({
  launchOptions: { args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] },
});

test("the chamber shows a fallback with a way to read about the spell", async ({
  page,
}) => {
  await page.goto("/spells/petrificus-totalus/cast");
  const chamber = page.locator("section[data-chamber-state]");

  await expect(chamber).toHaveAttribute("data-chamber-state", "unsupported");
  await expect(
    page.getByRole("heading", { name: "Your device can’t show the 3D chamber" }),
  ).toBeVisible();
  await expect(chamber.locator("canvas")).toHaveCount(0);

  await page.getByRole("link", { name: "Read about Petrificus Totalus" }).click();
  await expect(page).toHaveURL("/spells/petrificus-totalus");
});
