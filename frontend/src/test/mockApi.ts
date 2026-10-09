/**
 * Fetch stub for unit tests. It answers only the routes you list and returns a clear 404 for
 * anything else, so a test can never pass by accident on an unlisted request.
 *
 * It is a test helper. It is not a backend and it is not shipped in the application bundle.
 */
export type MockRoute = {
  method?: string;
  /** Matched against the path including the query string. */
  match: RegExp | string;
  /** JSON body for a success response. */
  json?: unknown;
  /** Use a non 2xx status to simulate a failing API. */
  status?: number;
  /** Raw body for a failing response. */
  body?: string;
  /** Simulate an unreachable API by rejecting the fetch. */
  networkError?: boolean;
  /** Delay in milliseconds, to exercise loading states. */
  delayMs?: number;
};

export type RecordedRequest = { method: string; path: string; body: string | null };

export function installMockApi(routes: MockRoute[]): { requests: RecordedRequest[]; restore: () => void } {
  const requests: RecordedRequest[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    requests.push({ method, path, body: typeof init?.body === "string" ? init.body : null });

    const route = routes.find((candidate) => {
      if ((candidate.method ?? "GET").toUpperCase() !== method) return false;
      return typeof candidate.match === "string" ? path === candidate.match : candidate.match.test(path);
    });
    if (!route) {
      return new Response(JSON.stringify({ detail: `No mock route for ${method} ${path}` }), { status: 404 });
    }
    if (route.delayMs) await new Promise((resolve) => setTimeout(resolve, route.delayMs));
    if (route.networkError) throw new TypeError("Failed to fetch");
    const status = route.status ?? 200;
    if (status >= 400) {
      return new Response(route.body ?? JSON.stringify({ detail: "Mocked failure" }), { status });
    }
    return new Response(JSON.stringify(route.json ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return {
    requests,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
