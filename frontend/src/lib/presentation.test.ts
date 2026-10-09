import { ABSTAINED_RUN, HEALTH_TEST_MODE, RUN } from "../test/fixtures";
import {
  buildDecisionTrail,
  describeAppMode,
  describeProvider,
  explainOutcome,
  gateTone,
  hasDraft,
  humanDecisionLabel,
} from "./presentation";

describe("provider honesty", () => {
  it("labels a test fixture as a fixture and never as Foundry", () => {
    const provider = describeProvider("test_fixture");
    expect(provider.label).toBe("Test fixture");
    expect(provider.isFoundry).toBe(false);
    expect(provider.isFixture).toBe(true);
    expect(provider.description).toMatch(/not a Microsoft Foundry response/i);
    expect(provider.label).not.toMatch(/foundry/i);
  });

  it("only the foundry provider is described as Microsoft Foundry", () => {
    expect(describeProvider("foundry").isFoundry).toBe(true);
    for (const kind of ["test_fixture", "local_hash", "unavailable", "something_else", null, undefined]) {
      expect(describeProvider(kind).isFoundry).toBe(false);
    }
  });

  it("does not advertise Foundry in test mode", () => {
    const badge = describeAppMode(HEALTH_TEST_MODE);
    expect(badge.label).toBe("Test fixture mode");
    expect(badge.label).not.toMatch(/foundry live/i);
  });

  it("advertises Foundry only when the API reports it as live", () => {
    expect(describeAppMode({ ...HEALTH_TEST_MODE, app_mode: "foundry", uses_foundry: true }).label).toBe("Foundry live");
    expect(describeAppMode({ ...HEALTH_TEST_MODE, app_mode: "foundry", uses_foundry: false }).label).toBe(
      "Foundry not configured",
    );
  });
});

describe("assurance presentation", () => {
  it("never describes a passing outcome as proof of correctness", () => {
    expect(explainOutcome("READY_FOR_HUMAN_REVIEW")).toMatch(/does not mean the answer is correct/i);
  });

  it("treats abstention as a safe product outcome", () => {
    expect(explainOutcome("ABSTAINED")).toMatch(/intended safe outcome/i);
    expect(gateTone("ABSTAINED")).toBe("bad");
  });

  it("reports a draft only when one exists and the run did not abstain", () => {
    expect(hasDraft(RUN)).toBe(true);
    expect(hasDraft(ABSTAINED_RUN)).toBe(false);
    expect(hasDraft(undefined)).toBe(false);
  });

  it("labels human decisions in plain language", () => {
    expect(humanDecisionLabel(null)).toBe("Awaiting human decision");
    expect(humanDecisionLabel("edit_and_approve")).toBe("Edited and approved");
  });
});

describe("decision trail", () => {
  it("marks every step pending when there is no run", () => {
    const steps = buildDecisionTrail(undefined);
    expect(steps.find((step) => step.id === "triage")?.state).toBe("pending");
    expect(steps.find((step) => step.id === "assurance")?.state).toBe("pending");
    expect(steps.find((step) => step.id === "case")?.state).toBe("done");
  });

  it("marks steps from the stored run and shows attention for a non ready outcome", () => {
    const steps = buildDecisionTrail(RUN);
    expect(steps.find((step) => step.id === "triage")?.state).toBe("done");
    expect(steps.find((step) => step.id === "revision")?.state).toBe("skipped");
    expect(steps.find((step) => step.id === "assurance")?.state).toBe("attention");
    expect(steps.find((step) => step.id === "decision")?.detail).toBe("Awaiting human");
  });
});
