import { Doc } from "../../convex/_generated/dataModel";
import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

type Environment = "all" | "production" | "development";

interface SidebarProps {
  projects: Doc<"projects">[];
  activeWriteKey: string;
  onSelectProject: (writeKey: string) => void;
  onAddProject: () => void;
  onSignOut: () => void;
  environment: Environment;
  onSelectEnvironment: (env: Environment) => void;
}

export function Sidebar({
  projects,
  activeWriteKey,
  onSelectProject,
  onAddProject,
  onSignOut,
  environment,
  onSelectEnvironment,
}: SidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.writeKey === activeWriteKey) ?? projects[0];

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <nav
      className="w-52 flex-shrink-0 flex flex-col border-r-2 border-[#1a1814]"
      style={{ background: "#1a1814", color: "#e9e6db" }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b-2 border-[#2e2a22]">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 flex items-center justify-center flex-shrink-0"
            style={{ background: "#e8651c" }}
          >
            <span className="text-white text-xs font-bold leading-none">C</span>
          </div>
          <span className="text-sm font-bold tracking-tight" style={{ color: "#e9e6db" }}>
            Convalytics
          </span>
        </div>
      </div>

      {/* Project switcher */}
      <div className="px-3 pt-3 pb-2 border-b border-[#2e2a22]">
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-1" style={{ color: "#6b6456" }}>
          Project
        </p>
        <div className="relative" ref={dropdownRef}>
          <button
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-left cursor-pointer transition-colors"
            style={{
              background: dropdownOpen ? "#3e3a32" : "#2e2a22",
              border: "1px solid #3e3a32",
              color: "#e9e6db",
            }}
            onClick={() => setDropdownOpen((o) => !o)}
          >
            <span className="truncate">{activeProject?.name ?? "Select project"}</span>
            <Chevron open={dropdownOpen} />
          </button>

          {dropdownOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1 z-50 py-1 flex flex-col"
              style={{ background: "#2e2a22", border: "1px solid #3e3a32", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}
            >
              {projects.map((p) => (
                <button
                  key={p.writeKey}
                  className="w-full text-left px-3 py-2 text-xs truncate cursor-pointer transition-colors"
                  style={{
                    color: p.writeKey === activeWriteKey ? "#e8651c" : "#e9e6db",
                    background: p.writeKey === activeWriteKey ? "#1a1814" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (p.writeKey !== activeWriteKey)
                      (e.currentTarget as HTMLButtonElement).style.background = "#3e3a32";
                  }}
                  onMouseLeave={(e) => {
                    if (p.writeKey !== activeWriteKey)
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                  onClick={() => {
                    onSelectProject(p.writeKey);
                    setDropdownOpen(false);
                  }}
                >
                  {p.name}
                </button>
              ))}
              <div style={{ borderTop: "1px solid #3e3a32" }} className="mt-1 pt-1">
                <button
                  className="w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors"
                  style={{ color: "#6b6456" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#e9e6db")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#6b6456")}
                  onClick={() => {
                    setDropdownOpen(false);
                    onAddProject();
                  }}
                >
                  + Add project
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-2">
        <SectionLabel>Web Analytics</SectionLabel>
        <NavItem label="Overview" active={pathname === "/overview"} onClick={() => { void navigate("/overview"); }} />
        <NavItem label="Pages" active={pathname === "/pages"} onClick={() => { void navigate("/pages"); }} />
        <SectionLabel>Product Analytics</SectionLabel>
        <NavItem label="Events" active={pathname === "/events"} onClick={() => { void navigate("/events"); }} />
        <SectionLabel>Settings</SectionLabel>
        <NavItem label="Members" active={pathname === "/members"} onClick={() => { void navigate("/members"); }} />
        <NavItem label="Billing" active={pathname === "/billing"} onClick={() => { void navigate("/billing"); }} />
      </div>

      {/* Environment toggle */}
      <div className="px-3 py-2 border-t border-[#2e2a22]">
        <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5 px-1" style={{ color: "#3e3a32" }}>
          Environment
        </p>
        <div className="flex gap-0.5 p-0.5" style={{ background: "#2e2a22" }}>
          {(["all", "production", "development"] as const).map((env) => (
            <button
              key={env}
              className="flex-1 text-center py-1 text-[10px] font-medium uppercase tracking-wider cursor-pointer transition-colors"
              style={
                environment === env
                  ? { background: "#e8651c", color: "#fff" }
                  : { color: "#6b6456" }
              }
              onClick={() => onSelectEnvironment(env)}
            >
              {env === "all" ? "All" : env === "production" ? "Prod" : "Dev"}
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div className="px-4 py-3 border-t border-[#2e2a22]">
        <button
          className="text-xs uppercase tracking-wider transition-colors cursor-pointer"
          style={{ color: "#6b6456" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#e9e6db")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6b6456")}
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 150ms ease",
        color: "#6b6456",
      }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: "#6b6456" }}>
      {children}
    </p>
  );
}

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="w-full text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer"
      style={active ? { background: "#e8651c", color: "#fff" } : { color: "#9b9488" }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#e9e6db"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#9b9488"; }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
