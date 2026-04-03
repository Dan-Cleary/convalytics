import { Doc } from "../../convex/_generated/dataModel";

type Page = "overview" | "pages" | "events";

interface SidebarProps {
  projects: Doc<"projects">[];
  activeWriteKey: string;
  onSelectProject: (writeKey: string) => void;
  onAddProject: () => void;
  page: Page;
  onSelectPage: (page: Page) => void;
  onSignOut: () => void;
}

export function Sidebar({
  projects,
  activeWriteKey,
  onSelectProject,
  onAddProject,
  page,
  onSelectPage,
  onSignOut,
}: SidebarProps) {
  function handleProjectChange(value: string) {
    if (value === "__add__") {
      onAddProject();
    } else {
      onSelectProject(value);
    }
  }

  return (
    <nav
      className="w-52 flex-shrink-0 flex flex-col border-r-2 border-[#1a1814]"
      style={{ background: "#1a1814", color: "#e9e6db" }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b-2 border-[#2e2a22]">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
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
        <select
          className="w-full text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#e8651c] cursor-pointer"
          style={{
            background: "#2e2a22",
            border: "1px solid #3e3a32",
            color: "#e9e6db",
          }}
          value={activeWriteKey}
          onChange={(e) => handleProjectChange(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.writeKey} value={p.writeKey}>
              {p.name}
            </option>
          ))}
          <option value="__add__">+ Add project</option>
        </select>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-2">
        <SectionLabel>Web</SectionLabel>
        <NavItem
          label="Overview"
          active={page === "overview"}
          onClick={() => onSelectPage("overview")}
        />
        <NavItem
          label="Pages"
          active={page === "pages"}
          onClick={() => onSelectPage("pages")}
        />
        <SectionLabel>Custom</SectionLabel>
        <NavItem
          label="Events"
          active={page === "events"}
          onClick={() => onSelectPage("events")}
        />
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-4 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest"
      style={{ color: "#3e3a32" }}
    >
      {children}
    </p>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer"
      style={
        active
          ? { background: "#e8651c", color: "#fff" }
          : { color: "#9b9488" }
      }
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.color = "#e9e6db";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.color = "#9b9488";
        }
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
