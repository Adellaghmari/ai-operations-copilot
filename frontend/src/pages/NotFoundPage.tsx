import { Link } from "react-router-dom";
import { EmptyState, PageHeader, buttonClasses } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Not found" title="This page does not exist" />
      <EmptyState
        title="Nothing is here"
        body="The address does not match any page in this app. Use the navigation or return to the dashboard."
        action={
          <Link to="/" className={buttonClasses("primary")}>
            Go to the dashboard
          </Link>
        }
      />
    </div>
  );
}
