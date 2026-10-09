import { expect, test, type Page } from "@playwright/test";

function primaryLink(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name, exact: true });
}

test("dashboard and ticket workspace load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dashboard-heading")).toBeVisible();
  await expect(page.getByTestId("centered-brand")).toBeVisible();
  await expect(primaryLink(page, "Ticket queue")).toBeVisible();
  await expect(primaryLink(page, "Replay")).toBeVisible();
  await expect(primaryLink(page, "Assurance")).toBeVisible();
  await primaryLink(page, "Ticket queue").click();
  await expect(page.getByRole("heading", { name: "Ticket queue" })).toBeVisible();
  await primaryLink(page, "About").click();
  await expect(page.getByRole("heading", { name: "About the Project" })).toBeVisible();
  await expect(page.getByText("Decision Assurance Engine", { exact: false }).first()).toBeVisible();
  await primaryLink(page, "Architecture").click();
  await expect(page.getByRole("heading", { name: "Architecture" })).toBeVisible();
  await expect(page.getByText("There is no fourth agent")).toBeVisible();
});
