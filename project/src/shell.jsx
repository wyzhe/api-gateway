/* App shell: sidebar + topbar for workspace and admin */

function NavItem({ active, icon, label, meta, dot, onClick }) {
  return (
    <div className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <Icon name={icon} className="nav-ico" />
      <span>{label}</span>
      {dot && <span className="nav-dot" />}
      {meta && !dot && <span className="nav-meta">{meta}</span>}
    </div>
  );
}

function Sidebar({ current, onNavigate, admin }) {
  const workspace = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "keys", icon: "key", label: "API Keys", meta: "4" },
    { id: "logs", icon: "logs", label: "Usage / Logs" },
    { id: "playground", icon: "play", label: "Playground" },
    { id: "generations", icon: "image", label: "Generations", meta: "18" },
    { id: "billing", icon: "billing", label: "Billing" },
  ];
  const reference = [
    { id: "models", icon: "models", label: "Models" },
    { id: "docs", icon: "docs", label: "Docs" },
    { id: "status", icon: "status", label: "Status", dot: true },
  ];
  const adminItems = [
    { id: "admin-users", icon: "users", label: "Users", meta: "7" },
    { id: "admin-models", icon: "models", label: "Models" },
    { id: "admin-providers", icon: "layers", label: "Providers" },
    { id: "admin-logs", icon: "logs", label: "All Logs" },
    { id: "admin-billing", icon: "billing", label: "Recharge" },
  ];

  return (
    <aside className={`sidebar ${admin ? "admin-mode" : ""}`}>
      <div className="sidebar-brand">
        <span className="brand-mark" />
        <span className="brand-name">Relay</span>
        <span className="brand-env">v0.4</span>
      </div>

      {admin ? (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-label">Admin</div>
            {adminItems.map(it => <NavItem key={it.id} active={current === it.id} {...it} onClick={() => onNavigate(it.id)} />)}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-label">Switch</div>
            <NavItem icon="arrow" label="Back to workspace" onClick={() => onNavigate("dashboard")} />
          </div>
        </>
      ) : (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-label">Workspace</div>
            {workspace.map(it => <NavItem key={it.id} active={current === it.id} {...it} onClick={() => onNavigate(it.id)} />)}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-label">Reference</div>
            {reference.map(it => <NavItem key={it.id} active={current === it.id} {...it} onClick={() => onNavigate(it.id)} />)}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-label">Account</div>
            <NavItem icon="admin" label="Admin panel" onClick={() => onNavigate("admin-users")} />
          </div>
        </>
      )}

      <div className="sidebar-bottom">
        <div className={`balance-pill ${admin ? "" : ""}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="label">{admin ? "Admin mode" : "Balance"}</span>
            <span className="val">{admin ? "elevated" : "$184.22"}</span>
          </div>
          {!admin && <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => onNavigate("billing")}>Request</button>}
          {admin && <span className="admin-tag" style={{ marginLeft: "auto" }}>ADMIN</span>}
        </div>
        <div className="user-chip">
          <span className="avatar">AN</span>
          <span className="who">
            <span className="email">anna@northpole.io</span>
            <span className="role">{admin ? "admin · root" : "owner · 1 seat"}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
window.Sidebar = Sidebar;

function Topbar({ crumbs, actions }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? "cur" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-actions">
        {actions || (
          <>
            <div className="filter-search" style={{ width: 260 }}>
              <Icon name="search" size={13} />
              <input placeholder="Jump to…" />
              <span className="kbd">⌘K</span>
            </div>
            <button className="btn ghost sm" title="Notifications" type="button">
              <Icon name="info" size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
window.Topbar = Topbar;
