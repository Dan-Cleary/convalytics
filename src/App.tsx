import { useQuery } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./components/SignInForm";
import { Sidebar } from "./components/Sidebar";
import { BillingSuccessModal } from "./components/BillingSuccessModal";
import { Overview } from "./pages/Overview";
import { EventsPage } from "./pages/EventsPage";
import { PagesPage } from "./pages/PagesPage";
import { ProjectSetup } from "./pages/ProjectSetup";
import { OAuthCallback } from "./pages/OAuthCallback";
import { ClaimPage } from "./pages/ClaimPage";
import { BillingPage } from "./pages/BillingPage";
import { MembersPage } from "./pages/MembersPage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { useState, Component, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";

type Environment = "all" | "production" | "development";
type PlanId = "free" | "solo" | "pro";

class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-64 text-xs" style={{ color: "#9b9488" }}>
          Something went wrong. Try refreshing the page.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route
          path="/claim/:claimToken"
          element={<ClaimPageWrapper />}
        />
        <Route
          path="/invite/:inviteToken"
          element={<InvitePageWrapper />}
        />
        {/* Home — sign-in OR redirect to dashboard */}
        <Route
          path="/"
          element={
            <>
              <Authenticated>
                <Navigate to="/overview" replace />
              </Authenticated>
              <Unauthenticated>
                <SignInForm />
              </Unauthenticated>
              <AuthLoading>
                <LoadingScreen />
              </AuthLoading>
            </>
          }
        />
        {/* Authenticated dashboard */}
        <Route
          path="/*"
          element={
            <>
              <Authenticated>
                <Dashboard />
              </Authenticated>
              <Unauthenticated>
                <Navigate to="/" replace />
              </Unauthenticated>
              <AuthLoading>
                <LoadingScreen />
              </AuthLoading>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
      Loading...
    </div>
  );
}

function InvitePageWrapper() {
  const { inviteToken } = useParams();
  return <AcceptInvitePage token={inviteToken ?? ""} />;
}

function ClaimPageWrapper() {
  const { claimToken } = useParams();
  return <ClaimPage claimToken={claimToken ?? ""} />;
}

function Dashboard() {
  const { signOut } = useAuthActions();
  const projects = useQuery(api.projects.list);
  const usage = useQuery(api.usage.getMyUsage);
  const retentionDays = usage?.retentionDays ?? 90;
  const navigate = useNavigate();
  const location = useLocation();

  const [activeWriteKey, setActiveWriteKey] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    return params.get("project");
  });

  const [billingSuccess, setBillingSuccess] = useState<{
    open: boolean;
    expectedPlan: PlanId | null;
  }>(() => {
    const params = new URLSearchParams(location.search);
    const open = params.get("billing") === "success";
    const planParam = params.get("plan");
    const expectedPlan: PlanId | null =
      planParam === "free" || planParam === "solo" || planParam === "pro"
        ? planParam
        : null;
    if (open) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    return { open, expectedPlan };
  });

  const [addingProject, setAddingProject] = useState(false);
  const [environment, setEnvironment] = useState<Environment>("all");

  const onSignOut = () => void signOut();

  if (projects === undefined) {
    return <LoadingScreen />;
  }

  if (projects === null) {
    // Shouldn't happen inside <Authenticated> but guard anyway
    onSignOut();
    return null;
  }

  if (projects.length === 0 || addingProject) {
    return (
      <ProjectSetup
        existingConvexProjectIds={projects.flatMap((p) =>
          p.convexProjectId ? [p.convexProjectId] : [],
        )}
        onDone={projects.length > 0 ? () => setAddingProject(false) : undefined}
        onSignOut={projects.length === 0 ? onSignOut : undefined}
      />
    );
  }

  const validActiveWriteKey = projects.some((p) => p.writeKey === activeWriteKey)
    ? activeWriteKey
    : null;
  const currentWriteKey = validActiveWriteKey ?? projects[0].writeKey;
  const currentProject =
    projects.find((p) => p.writeKey === currentWriteKey) ?? projects[0];

  const sharedProps = {
    writeKey: currentWriteKey,
    projectName: currentProject.name,
    environment: environment === "all" ? undefined : environment,
    retentionDays,
    onNavigateBilling: () => { void navigate("/billing"); },
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        projects={projects}
        activeWriteKey={currentWriteKey}
        onSelectProject={(key) => { setActiveWriteKey(key); void navigate("/overview"); }}
        onAddProject={() => setAddingProject(true)}
        onSignOut={onSignOut}
        environment={environment}
        onSelectEnvironment={setEnvironment}
      />
      <main className="flex-1 overflow-auto">
        <PageErrorBoundary key={location.key}>
        <Routes>
          <Route path="/overview" element={<Overview {...sharedProps} />} />
          <Route path="/pages" element={<PagesPage {...sharedProps} />} />
          <Route path="/events" element={<EventsPage {...sharedProps} />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
        </PageErrorBoundary>
      </main>

      {billingSuccess.open && (
        <BillingSuccessModal
          expectedPlan={billingSuccess.expectedPlan}
          onClose={() => setBillingSuccess((s) => ({ ...s, open: false }))}
        />
      )}
    </div>
  );
}
