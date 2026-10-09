import { ApiError } from "./api";

export type ErrorDescription = {
  /** Short, human sentence shown to the user. */
  summary: string;
  /** Optional secondary technical detail. Only set when it is true and useful. */
  detail: string | null;
  /** Retrying can plausibly help. */
  retryable: boolean;
};

/**
 * Turn any thrown value into calm product copy. A failed request is never data:
 * callers must show this instead of an empty table or a zero.
 */
export function describeError(error: unknown): ErrorDescription {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return {
        summary: "The API could not be reached. Check that the backend is running, then try again.",
        detail: error.technicalDetail,
        retryable: true,
      };
    }
    if (error.status === 404) {
      return { summary: "That item was not found.", detail: error.technicalDetail, retryable: false };
    }
    if (error.status === 429) {
      return { summary: error.message, detail: null, retryable: false };
    }
    if (error.status >= 500) {
      return {
        summary:
          "The API reported a server error, so this data is unknown rather than empty. Try again in a moment.",
        detail: error.technicalDetail,
        retryable: true,
      };
    }
    return { summary: error.message, detail: error.technicalDetail, retryable: false };
  }
  if (error instanceof Error) {
    return { summary: error.message || "Something went wrong.", detail: null, retryable: true };
  }
  return { summary: "Something went wrong.", detail: null, retryable: true };
}
