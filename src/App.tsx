import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./components/SignInForm";
import { Sidebar } from "./components/Sidebar";
import { Overview } from "./pages/Overview";
import { EventsPage } from "./pages/EventsPage";
import { PagesPage } from "./pages/PagesPage";
import { ProjectSetup } from "./pages/ProjectSetup";
import { OAuthCallback } from "./pages/OAuthCallback";
import { useState, useCallback } from "react";
import { clearSession, getSessionToken } from "./lib/auth";

type Page = "overview" | "pages" | "events";

export default function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(
    getSessionToken,
  );

  const handleSignOut = useCallback(() => {
    clearSession();
    setSessionToken(null);
  }, []);

  const handleSignIn = useCallback(() => {
    const token = getSessionToken();
    setSessionToken(token);
  }, []);

  if (window.location.pathname === "/oauth/callback") {
    return <OAuthCallback onSuccess={handleSignIn} />;
  }

  if (!sessionToken) {
    return <SignInForm />;
  }

  return (
    <Dashboard
      sessionToken={sessionToken}
      onSignOut={handleSignOut}
    />
  );
}

function Dashboard({
  sessionToken,
  onSignOut,
}: {
  sessionToken: string;
  onSignOut: () => void;
}) {
  const projects = useQuery(api.projects.list, { sessionToken });
  const [activeWriteKey, setActiveWriteKey] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [addingProject, setAddingProject] = useState(false);

  if (projects === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  if (projects.length === 0 || addingProject) {
    return (
      <ProjectSetup
        sessionToken={sessionToken}
        existingConvexProjectIds={projects.flatMap((p) =>
          p.convexProjectId ? [p.convexProjectId] : [],
        )}
        onDone={projects.length > 0 ? () => setAddingProject(false) : undefined}
        onSignOut={projects.length === 0 ? onSignOut : undefined}
      />
    );
  }

  const currentWriteKey = activeWriteKey ?? projects[0].writeKey;
  const currentProject =
    projects.find((p) => p.writeKey === currentWriteKey) ?? projects[0];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        projects={projects}
        activeWriteKey={currentWriteKey}
        onSelectProject={setActiveWriteKey}
        onAddProject={() => setAddingProject(true)}
        page={page}
        onSelectPage={setPage}
        onSignOut={onSignOut}
      />
      <main className="flex-1 overflow-auto">
        {page === "overview" && (
          <Overview
            sessionToken={sessionToken}
            writeKey={currentWriteKey}
            projectName={currentProject.name}
          />
        )}
        {page === "pages" && (
          <PagesPage
            sessionToken={sessionToken}
            writeKey={currentWriteKey}
            projectName={currentProject.name}
          />
        )}
        {page === "events" && (
          <EventsPage
            sessionToken={sessionToken}
            writeKey={currentWriteKey}
            projectName={currentProject.name}
          />
        )}
      </main>
    </div>
  );
}
