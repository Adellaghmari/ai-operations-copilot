import { expect, test } from "@playwright/test";

test("dashboard and ticket workspace load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("link", { name: "Ticket queue" }).click();
  await expect(page.getByRole("heading", { name: "Ticket queue" })).toBeVisible();
  await page.getByRole("link", { name: "Architecture" }).click();
  await expect(page.getByText("Human-reviewed support workspace")).toBeVisible();
});
