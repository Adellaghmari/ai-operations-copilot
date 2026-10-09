import { buildGuideSteps, nextRecommendedAction } from "./RiskyGuide";

describe("risky case guide state", () => {
  it("recommends the real analysis control before a run exists", () => {
    expect(
      nextRecommendedAction({
        analysisSucceeded: false,
        evidenceAvailable: false,
        assuranceAvailable: false,
        humanDecisionRecorded: false,
        comparableRuns: 0,
      }),
    ).toBe("run");
    const steps = buildGuideSteps({
      analysisSucceeded: false,
      evidenceAvailable: false,
      assuranceAvailable: false,
      humanDecisionRecorded: false,
      comparableRuns: 0,
    });
    expect(steps[0].status).toBe("complete");
    expect(steps[1].status).toBe("current");
    expect(steps[1].progress).toBe("Analysis not run yet");
    expect(steps[2].status).toBe("waiting");
  });

  it("marks stored artefacts complete and waits for a human decision", () => {
    expect(
      nextRecommendedAction({
        analysisSucceeded: true,
        evidenceAvailable: true,
        assuranceAvailable: true,
        humanDecisionRecorded: false,
        comparableRuns: 1,
      }),
    ).toBe("decision");
    const steps = buildGuideSteps({
      analysisSucceeded: true,
      evidenceAvailable: true,
      assuranceAvailable: true,
      humanDecisionRecorded: false,
      comparableRuns: 1,
    });
    expect(steps[1].progress).toBe("Analysis complete");
    expect(steps[2].progress).toBe("Evidence available");
    expect(steps[4].status).toBe("current");
    expect(steps[4].progress).toBe("Human decision pending");
    expect(steps[5].status).not.toBe("complete");
    expect(steps[5].progress).toBe("Needs two stored runs");
  });

  it("does not mark replay complete until two stored runs exist", () => {
    const afterDecision = buildGuideSteps({
      analysisSucceeded: true,
      evidenceAvailable: true,
      assuranceAvailable: true,
      humanDecisionRecorded: true,
      comparableRuns: 1,
    });
    expect(afterDecision[4].status).toBe("complete");
    expect(afterDecision[5].status).toBe("current");
    expect(nextRecommendedAction({
      analysisSucceeded: true,
      evidenceAvailable: true,
      assuranceAvailable: true,
      humanDecisionRecorded: true,
      comparableRuns: 1,
    })).toBe("run");
    const replayReady = buildGuideSteps({
      analysisSucceeded: true,
      evidenceAvailable: true,
      assuranceAvailable: true,
      humanDecisionRecorded: true,
      comparableRuns: 2,
    });
    expect(replayReady[5].status).toBe("complete");
    expect(replayReady[5].progress).toBe("Replay available");
  });
});
