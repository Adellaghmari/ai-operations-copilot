import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EVAL_CASES, EVAL_RESULTS, EVAL_RUN, HEALTH_TEST_MODE } from "../test/fixtures";
import { installMockApi } from "../test/mockApi";
import type { MockRoute } from "../test/mockApi";
import { renderPage } from "../test/render";
import { EvaluationsPage } from "./EvaluationsPage";

const DASH = /[\u2013\u2014]|\s-\s/;

function routes(extra: Partial<Record<"runs" | "cases", MockRoute>> = {}): MockRoute[] {
  return [
    { match: "/api/health", json: HEALTH_TEST_MODE },
    extra.cases ?? { match: "/api/evaluations/cases", json: EVAL_CASES },
    extra.runs ?? { match: "/api/evaluations", json: [EVAL_RUN] },
    { match: new RegExp(`^/api/evaluations/${EVAL_RUN.id}/results$`), json: EVAL_RESULTS },
  ];
}

describe("EvaluationsPage", () => {
  let restore: () => void = () => undefined;
  afterEach(() => restore());

  it("states plainly that the lab uses fixture output and empty retrieval", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    const scope = await screen.findByTestId("eval-scope");
    expect(scope).toHaveTextContent(/deterministic test fixture/i);
    expect(scope).toHaveTextContent(/does not call Microsoft Foundry/i);
    expect(scope).toHaveTextContent(/Retrieval is empty/i);
    expect(scope).toHaveTextContent(/no confidence or quality percentage/i);
  });

  it("shows counts, marks unmeasured metrics, and avoids misleading precision", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    const detail = await screen.findByTestId("eval-run-detail");
    expect(within(detail).getByText("golden-v2")).toBeInTheDocument();
    expect(within(detail).getAllByText("Not measured").length).toBeGreaterThanOrEqual(4);
    expect(within(detail).getByText("3 of 4 cases")).toBeInTheDocument();
    expect(within(detail).getByText("Fixed by construction")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\d\s*%/);
    expect(document.body.textContent ?? "").not.toMatch(/\{"/);
  });

  it("lists case outcomes with the failure reason", async () => {
    const user = userEvent.setup();
    ({ restore } = installMockApi(routes()));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    expect(await screen.findByText("Failure reason: Deterministic expectation mismatch")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Show failed cases only"));
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
  });

  it("shows an empty state, not invented numbers, when no run is stored", async () => {
    ({ restore } = installMockApi(routes({ runs: { match: "/api/evaluations", json: [] } })));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    expect(await screen.findByText("No evaluation run is stored yet")).toBeInTheDocument();
    expect(screen.queryByTestId("eval-run-detail")).not.toBeInTheDocument();
  });

  it("shows an error with retry when runs cannot load", async () => {
    ({ restore } = installMockApi(routes({ runs: { match: "/api/evaluations", status: 500 } })));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    const alert = await screen.findByText("Evaluation runs could not be loaded");
    expect(alert).toBeInTheDocument();
    expect(screen.queryByText("No evaluation run is stored yet")).not.toBeInTheDocument();
  });

  it("does not offer an evaluation mutation on the public demo", async () => {
    ({ restore } = installMockApi([
      {
        match: "/api/health",
        json: {
          ...HEALTH_TEST_MODE,
          public_demo: true,
          administrative_mutations_enabled: false,
        },
      },
      { match: "/api/evaluations/cases", json: EVAL_CASES },
      { match: "/api/evaluations", json: [EVAL_RUN] },
      { match: new RegExp(`^/api/evaluations/${EVAL_RUN.id}/results$`), json: EVAL_RESULTS },
    ]));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    expect(await screen.findByText(/Starting evaluation runs is disabled/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run fixture evaluation" })).not.toBeInTheDocument();
  });

  it("opens a dataset case and shows the stored result for that case", async () => {
    const user = userEvent.setup();
    ({ restore } = installMockApi(routes()));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    await screen.findByTestId("eval-run-detail");
    await user.click(screen.getByRole("button", { name: /SSO login failure/ }));
    const detail = await screen.findByTestId("eval-case-detail");
    expect(within(detail).getByText("SSO login failure")).toBeInTheDocument();
    expect(within(detail).getByText("access-sso")).toBeInTheDocument();
    expect(within(detail).getByText("golden-v2")).toBeInTheDocument();
    expect(await within(detail).findByText("Passed")).toBeInTheDocument();
    expect(within(detail).getByText("No failure reason is stored for this case.")).toBeInTheDocument();
  });

  it("uses no dash characters in visible copy", async () => {
    ({ restore } = installMockApi(routes()));
    renderPage(<EvaluationsPage />, { path: "/evaluations" });
    await screen.findByTestId("eval-run-detail");
    expect(document.body.textContent ?? "").not.toMatch(DASH);
  });
});
