import { useState } from "react";
import MissionControl from "./MissionControl";
import RouterAdmin from "./RouterAdmin";
import WorkflowEditor from "./WorkflowEditor";

function resolveInitialView(): "workflow" | "mission" | "router-admin" {
  const pathname = window.location.pathname;
  if (pathname === "/router-admin") return "router-admin";
  if (pathname === "/workflow") return "workflow";
  return "mission";
}

export default function App() {
  const [view, setView] = useState<"workflow" | "mission" | "router-admin">(resolveInitialView);

  function setViewWithPath(next: "workflow" | "mission" | "router-admin") {
    setView(next);
    const path = next === "router-admin" ? "/router-admin" : next === "workflow" ? "/workflow" : "/";
    window.history.replaceState({}, "", path);
  }

  return (
    <div className="app-shell">
      <header className="header-row">
        <h1>Conversational Workflow Agent POC</h1>
        <div className="nav-tabs">
          <button className={view === "mission" ? "tab active" : "tab"} onClick={() => setViewWithPath("mission")}>
            Mission Control
          </button>
          <button className={view === "workflow" ? "tab active" : "tab"} onClick={() => setViewWithPath("workflow")}>
            Workflow Editor
          </button>
          <button className={view === "router-admin" ? "tab active" : "tab"} onClick={() => setViewWithPath("router-admin")}>
            Router Admin
          </button>
        </div>
      </header>

      {view === "mission" && <MissionControl />}
      {view === "workflow" && <WorkflowEditor />}
      {view === "router-admin" && <RouterAdmin />}
    </div>
  );
}
