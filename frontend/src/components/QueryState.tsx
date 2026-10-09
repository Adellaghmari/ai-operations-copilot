import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { DegradedNotice, ErrorState, LoadingState } from "./ui";

/**
 * One consistent loading, error, empty, degraded and success contract for every data surface.
 *
 * - pending: skeleton with an accessible status message
 * - error without data: a failure state with retry. Never an empty table or a zero.
 * - error with stale data: the data stays visible with a degraded notice and retry
 * - empty: only when the API answered successfully and the answer was empty
 */
export function QueryState<T>({
  query,
  label,
  errorTitle,
  isEmpty,
  empty,
  loading,
  children,
}: {
  query: Pick<UseQueryResult<T>, "data" | "isPending" | "isError" | "error" | "isFetching" | "refetch">;
  label: string;
  errorTitle?: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const retry = () => {
    void query.refetch();
  };
  if (query.isPending) return <>{loading ?? <LoadingState label={`Loading ${label}`} />}</>;
  if (query.isError && query.data === undefined) {
    return (
      <ErrorState
        title={errorTitle ?? `${label} could not be loaded`}
        error={query.error}
        onRetry={retry}
        retrying={query.isFetching}
      />
    );
  }
  const data = query.data as T;
  if (isEmpty?.(data)) return <>{empty}</>;
  return (
    <div className="space-y-3">
      {query.isError ? (
        <DegradedNotice onRetry={retry} retrying={query.isFetching}>
          Showing the last data that loaded. Refreshing {label.toLowerCase()} failed.
        </DegradedNotice>
      ) : null}
      {children(data)}
    </div>
  );
}
