import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "./ui";

type Props = { children: ReactNode; resetKey: string };
type State = { failed: boolean; detail: string | null };

/**
 * Keeps the navigation visible when one page throws while rendering, for example after an
 * unexpected API response shape. It says what happened and offers a way out. It never invents data.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, detail: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, detail: error instanceof Error ? error.message : null };
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false, detail: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Page failed to render", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        data-testid="route-error"
        className="rounded-lg border border-red-400/30 bg-red-500/10 p-5 text-red-100"
      >
        <h2 className="m-0 text-base font-semibold">This page could not be displayed</h2>
        <p className="mt-2 mb-4 text-sm">
          Something unexpected happened while rendering this page, so nothing is shown here rather than
          showing wrong information. Reload the page, or go back to the dashboard.
        </p>
        {this.state.detail ? (
          <p className="mt-0 mb-4 text-xs text-red-200">Technical detail: {this.state.detail}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClasses("secondary")} onClick={() => window.location.reload()}>
            Reload page
          </button>
          <Link to="/" className={buttonClasses("primary")}>
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }
}
