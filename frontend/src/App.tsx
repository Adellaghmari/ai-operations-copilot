import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AboutPage } from "./pages/AboutPage";
import { AiRunsPage } from "./pages/AiRunsPage";
import { ArchitecturePage } from "./pages/ArchitecturePage";
import { AssurancePage } from "./pages/AssurancePage";
import { DashboardPage } from "./pages/DashboardPage";
import { EvaluationsPage } from "./pages/EvaluationsPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ReplayPage } from "./pages/ReplayPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/new" element={<NewTicketPage />} />
        <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="ai-runs" element={<AiRunsPage />} />
        <Route path="ai-runs/:runId" element={<AiRunsPage />} />
        <Route path="replay" element={<ReplayPage />} />
        <Route path="assurance" element={<AssurancePage />} />
        <Route path="evaluations" element={<EvaluationsPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="architecture" element={<ArchitecturePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
