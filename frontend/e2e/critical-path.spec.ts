import { expect, test } from "@playwright/test";

test("dashboard and ticket workspace load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-heading")).toBeVisible();
  await page.getByRole("link", { name: "Ticket queue" }).click();
  await expect(page.getByRole("heading", { name: "Ticket queue" })).toBeVisible();
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.getByRole("heading", { name: "About the Project" })).toBeVisible();
  await expect(page.getByText("Decision Assurance Engine", { exact: false }).first()).toBeVisible();
});
