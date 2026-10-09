import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/** Render a page inside the providers it needs. `path` is the route pattern, `entry` the URL. */
export function renderPage(ui: ReactElement, options: { path?: string; entry?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const path = options.path ?? "/";
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.entry ?? path]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
