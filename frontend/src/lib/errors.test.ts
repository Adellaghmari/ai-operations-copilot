import { ApiError } from "./api";
import { describeError } from "./errors";

describe("describeError", () => {
  it("explains an unreachable API as unknown, not empty", () => {
    const result = describeError(new ApiError(0, "The API could not be reached.", "Failed to fetch"));
    expect(result.summary).toMatch(/could not be reached/i);
    expect(result.retryable).toBe(true);
  });

  it("treats server errors as retryable and says the data is unknown", () => {
    const result = describeError(new ApiError(500, "Request failed (500).", "HTTP 500"));
    expect(result.summary).toMatch(/unknown rather than empty/i);
    expect(result.retryable).toBe(true);
    expect(result.detail).toBe("HTTP 500");
  });

  it("does not offer retry for a missing item", () => {
    const result = describeError(new ApiError(404, "Not found", "HTTP 404"));
    expect(result.retryable).toBe(false);
  });

  it("passes the quota message through without a retry", () => {
    const result = describeError(new ApiError(429, "Demo quota reached.", "HTTP 429"));
    expect(result.summary).toBe("Demo quota reached.");
    expect(result.retryable).toBe(false);
  });

  it("handles unknown thrown values", () => {
    expect(describeError("boom").summary).toBe("Something went wrong.");
    expect(describeError(new Error("Specific")).summary).toBe("Specific");
  });
});
