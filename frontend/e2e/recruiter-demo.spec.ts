import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const liveApiUrl = (process.env.LIVE_API_URL || "").replace(/\/$/, "");
const liveDemo = Boolean(process.env.LIVE_DEMO_URL);

async function apiAvailable(request: APIRequestContext): Promise<boolean> {
  const healthPath = liveApiUrl ? `${liveApiUrl}/api/health` : "/api/health";
  try {
    const response = await request.get(healthPath);
    return response.ok();
  } catch {
    return false;
  }
}

test("recruiter demo: dashboard to approved AI run", async ({ page, request }) => {
  test.setTimeout(liveDemo ? 300_000 : 120_000);
  if (!(await apiAvailable(request))) {
    test.skip(true, "API is not running. Start backend+frontend or set LIVE_DEMO_URL and LIVE_API_URL.");
  }

  await page.goto("/");
  await expect(page.getByTestId("dashboard-heading")).toBeVisible();
  await expect(page.getByTestId("metric-open-tickets")).toBeVisible();
  await expect(page.getByTestId("product-tagline")).toContainText("whether you should trust it");

  await page.getByRole("link", { name: "Ticket queue" }).click();
  await expect(page.getByRole("heading", { name: "Ticket queue" })).toBeVisible();
  const sample = page.locator('a[data-testid^="ticket-link-"]').first();
  await expect(sample).toBeVisible();
  await sample.click();

  await page.getByTestId("run-ai-analysis").click();
  await expect(page.getByTestId("triage-category")).toBeVisible({ timeout: liveDemo ? 240_000 : 60_000 });
  await expect(page.getByTestId("triage-severity")).toBeVisible();
  await expect(page.getByTestId("review-result")).toBeVisible();

  const citation = page.locator('[data-testid^="citation-"], [data-testid^="retrieved-chunk-"]').first();
  if (await citation.count()) {
    await citation.click();
    await expect(page.getByTestId("citation-snippet")).toBeVisible();
    await expect(page.getByTestId("citation-snippet")).toContainText("chunk_id");
    await expect(page.getByTestId("citation-snippet")).toContainText("document_id");
  }

  await page.getByTestId("edit-response").fill(
    "Thank you for writing in. We reviewed the cited internal knowledge and a human specialist approved this edited reply.",
  );
  await page.getByTestId("edit-and-approve").click();
  await expect(page.getByTestId("open-ai-run")).toBeVisible();
  await page.getByTestId("open-ai-run").click();
  await expect(page.getByTestId("ai-run-detail")).toBeVisible();

  await page.getByRole("link", { name: "Feedback" }).click();
  await expect(page.getByTestId("feedback-heading")).toBeVisible();
});

test("navigation reaches the About the Project page", async ({ page }: { page: Page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.getByRole("heading", { name: "About the Project" })).toBeVisible();
  await expect(page.getByText("Decision Assurance Engine", { exact: false }).first()).toBeVisible();
});

test("recruiter demo reset restores synthetic dataset", async ({ page, request }) => {
  test.setTimeout(liveDemo ? 180_000 : 60_000);
  if (liveDemo) {
    test.skip(true, "Public demo reset is an administrative action and is not part of the live recruiter path.");
  }
  if (!(await apiAvailable(request))) {
    test.skip(true, "API is not running. Start backend+frontend or set LIVE_DEMO_URL and LIVE_API_URL.");
  }
  await page.goto("/");
  await page.getByTestId("reset-demo").click();
  await expect(page.getByTestId("reset-demo-dialog")).toBeVisible();
  await page.getByTestId("confirm-reset-demo").click();
  await expect(page.getByTestId("reset-demo-status")).toBeVisible({ timeout: liveDemo ? 120_000 : 30_000 });
  await expect(page.getByTestId("metric-open-tickets")).toBeVisible();
});

test("concurrent demo resets do not 500", async ({ request }) => {
  test.setTimeout(liveDemo ? 180_000 : 60_000);
  if (liveDemo) {
    test.skip(true, "Public demo reset is an administrative action and is not part of the live recruiter path.");
  }
  if (!(await apiAvailable(request))) {
    test.skip(true, "API is not running.");
  }
  const resetPath = liveApiUrl ? `${liveApiUrl}/api/demo/reset` : "/api/demo/reset";
  const [first, second] = await Promise.all([
    request.post(resetPath),
    request.post(resetPath),
  ]);
  expect(first.ok(), `first reset status ${first.status()}`).toBeTruthy();
  expect(second.ok(), `second reset status ${second.status()}`).toBeTruthy();
  const body = await first.json();
  const other = await second.json();
  expect(body.status).toBe("refreshed");
  expect(other.status).toBe("refreshed");
  expect(body.tickets).toBeGreaterThan(0);
  expect(other.tickets).toBeGreaterThan(0);
  expect(body.documents).toBeGreaterThan(0);
  expect(other.documents).toBeGreaterThan(0);
});

test("assurance gates and evidence ledger on a risky case", async ({ page, request }) => {
  test.setTimeout(liveDemo ? 300_000 : 120_000);
  if (!(await apiAvailable(request))) {
    test.skip(true, "API is not running.");
  }
  await page.goto("/");
  const cta = page.getByTestId("try-risky-case");
  await expect(cta).toBeVisible({ timeout: 10_000 });
  await cta.click();
  await page.getByTestId("run-ai-analysis").click();
  await expect(page.getByTestId("assurance-gates")).toBeVisible({ timeout: liveDemo ? 240_000 : 60_000 });
  await expect(page.getByTestId("evidence-ledger")).toBeVisible();
  await expect(page.getByTestId("human-decision")).toBeVisible();
  await page.getByTestId("view-decision-packet").click();
  await expect(page.getByTestId("decision-packet")).toBeVisible();
  await page.getByTestId("close-decision-packet").click();
});

