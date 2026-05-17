/* Print app: renders every page sequentially, each with its own shell, with page breaks between */

function PrintShell({ kind, crumbs, children, label }) {
  if (kind === "public") {
    return (
      <div className="print-page">
        <div className="print-label">{label}</div>
        {children}
      </div>
    );
  }
  return (
    <div className={`print-page ${kind === "admin" ? "admin-mode" : ""}`}>
      <div className="print-label">{label}</div>
      <div className="app">
        <Sidebar current={crumbs.id} onNavigate={() => {}} admin={kind === "admin"} />
        <div className="page">
          <Topbar crumbs={crumbs.path} />
          {children}
        </div>
      </div>
    </div>
  );
}

function PrintApp() {
  const noop = () => {};
  const sample = window.GW_DATA.USERS[0];

  const pages = [
    { id: "landing",          kind: "public", label: "01 — Landing page",
      el: <LandingPage onNavigate={noop} /> },
    { id: "dashboard",        kind: "ws", label: "02 — Dashboard",
      crumbs: ["workspace", "Dashboard"], el: <Dashboard onNavigate={noop} /> },
    { id: "keys",             kind: "ws", label: "03 — API Keys",
      crumbs: ["workspace", "API Keys"], el: <ApiKeys onNavigate={noop} /> },
    { id: "logs",             kind: "ws", label: "04 — Usage / Logs",
      crumbs: ["workspace", "Usage / Logs"], el: <UsageLogs /> },
    { id: "playground",       kind: "ws", label: "05 — Playground",
      crumbs: ["workspace", "Playground"], el: <Playground /> },
    { id: "generations",      kind: "ws", label: "06 — Generations",
      crumbs: ["workspace", "Generations"], el: <GenerationsPage /> },
    { id: "billing",          kind: "ws", label: "07 — Billing",
      crumbs: ["workspace", "Billing"], el: <Billing /> },
    { id: "models",           kind: "ws", label: "08 — Models",
      crumbs: ["workspace", "Models"], el: <ModelsPage /> },
    { id: "docs",             kind: "ws", label: "09 — Docs",
      crumbs: ["workspace", "Docs"], el: <DocsPage onNavigate={noop} /> },
    { id: "status",           kind: "ws", label: "10 — Status",
      crumbs: ["workspace", "Status"], el: <StatusPage /> },
    { id: "admin-users",      kind: "admin", label: "11 — Admin · Users",
      crumbs: ["admin", "Users"], el: <AdminUsers onOpenUser={noop} /> },
    { id: "admin-user-detail",kind: "admin", label: "12 — Admin · User detail",
      crumbs: ["admin", "Users", sample.email], el: <AdminUserDetail user={sample} onBack={noop} /> },
    { id: "admin-models",     kind: "admin", label: "13 — Admin · Models",
      crumbs: ["admin", "Models"], el: <AdminModels /> },
    { id: "admin-providers",  kind: "admin", label: "14 — Admin · Providers",
      crumbs: ["admin", "Providers"], el: <AdminProviders /> },
    { id: "admin-logs",       kind: "admin", label: "15 — Admin · All logs",
      crumbs: ["admin", "All logs"], el: <AdminLogs /> },
    { id: "admin-billing",    kind: "admin", label: "16 — Admin · Recharge",
      crumbs: ["admin", "Recharge"], el: <AdminBilling /> },
  ];

  return (
    <div className="print-root">
      {pages.map(p => (
        <PrintShell key={p.id} kind={p.kind} crumbs={{ id: p.id, path: p.crumbs || [] }} label={p.label}>
          {p.el}
        </PrintShell>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PrintApp />);

/* Auto-print once fonts + layout are ready */
window.addEventListener("load", async () => {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch (e) {}
  await new Promise(r => setTimeout(r, 800));
  window.print();
});
