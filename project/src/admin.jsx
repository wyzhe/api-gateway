/* Admin pages: Users, User Detail, Models, Providers, Logs, Recharge */

function RechargeModal({ open, user, onClose, onApply }) {
  const [amt, setAmt] = useState("100");
  const [note, setNote] = useState("");
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose}
      title={<>Top up <span className="mono" style={{ color: "var(--fg-muted)" }}>{user?.email}</span></>}
      sub="Add credit manually. This action is logged and visible to the user."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={onApply}>Add ${amt}</button>
        </>
      }
    >
      <div className="dl">
        <dt>Current balance</dt><dd>${user?.balance.toFixed(2)}</dd>
        <dt>Lifetime spend</dt><dd>${user?.total.toFixed(2)}</dd>
        <dt>Active keys</dt><dd>{user?.keys}</dd>
      </div>
      <div style={{ marginTop: 16 }}>
        <label className="label">Amount (USD)</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[25, 50, 100, 250, 500].map(v => (
            <button key={v} className={`btn sm ${String(v) === amt ? "primary" : ""}`} onClick={() => setAmt(String(v))}>${v}</button>
          ))}
        </div>
        <input className="input mono" value={amt} onChange={e => setAmt(e.target.value)} />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="label">Internal note (optional)</label>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. monthly top-up" />
      </div>
      <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--fg-muted)" }}>
        Balance after: <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>${((user?.balance || 0) + parseFloat(amt || 0)).toFixed(2)}</span>
      </div>
    </Modal>
  );
}

function CreateUserModal({ open, onClose, onApply }) {
  const [email, setEmail] = useState("");
  const [name, setName]   = useState("");
  const [initial, setInitial] = useState("50");
  const [status, setStatus]   = useState("active");
  const [sendEmail, setSendEmail] = useState(true);
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} wide
      title="Create user"
      sub="Manually onboard a new user. Public sign-up is disabled by design."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={onApply}>Create user</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label className="label">Email</label>
          <input className="input mono" placeholder="someone@company.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Display name</label>
          <input className="input" placeholder="Alex Carter" value={name} onChange={e => setName(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
        <div>
          <label className="label">Initial balance (USD)</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["0", "25", "50", "100"].map(v => (
              <button key={v} className={`btn sm ${v === initial ? "primary" : ""}`} onClick={() => setInitial(v)} style={{ flex: 1 }}>${v}</button>
            ))}
          </div>
          <input className="input mono" style={{ marginTop: 8 }} value={initial} onChange={e => setInitial(e.target.value)} />
        </div>
        <div>
          <label className="label">Status on create</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["active", "disabled"].map(v => (
              <button
                key={v}
                className="btn"
                style={{
                  flex: 1, padding: 10, justifyContent: "flex-start",
                  borderColor: status === v ? "var(--accent-dim)" : "var(--border-strong)",
                  background:  status === v ? "rgba(123,227,139,0.05)" : "var(--surface-2)",
                }}
                onClick={() => setStatus(v)}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: v === "active" ? "var(--success)" : "var(--fg-faint)", marginRight: 8 }} />
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13 }}>Send access email</div>
            <div style={{ fontSize: 11.5, color: "var(--fg-faint)", marginTop: 2 }}>Email contains a one-time sign-in link valid for 48 hours.</div>
          </div>
          <Toggle on={sendEmail} onChange={setSendEmail} />
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 11, color: "var(--fg-faint)", display: "flex", gap: 12, fontFamily: "var(--font-mono)" }}>
        <span>This action is logged.</span>
        <span>User is created with 0 API keys.</span>
      </div>
    </Modal>
  );
}

function AdminUsers({ onOpenUser }) {
  const [recharge, setRecharge] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const users = window.GW_DATA.USERS.filter(u => !search || u.email.includes(search.toLowerCase()));

  return (
    <div className="page-body">
      <PageHeader
        crumbs={["Admin", "Users"]}
        title="Users"
        sub="Create users, manually recharge balances, or disable access. Public sign-up is disabled."
        right={
          <>
            <button className="btn sm"><Icon name="download" size={12} /> Export</button>
            <button className="btn primary sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={12} /> Create user</button>
          </>
        }
      />

      <div className="kpi-grid">
        <KpiTile label="Total users" value="7" sub="6 active, 1 disabled" />
        <KpiTile label="Aggregate balance" value="$639.68" sub="across 7 accounts" />
        <KpiTile label="MTD revenue (gross)" value="$1,418.22" delta="12%" deltaDir="up" />
        <KpiTile label="Spend this month" value="$1,389.04" sub="$29.18 margin" />
      </div>

      <div className="filter-bar" style={{ marginTop: 14 }}>
        <div className="filter-search">
          <Icon name="search" size={13} />
          <input placeholder="Search by email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="filter-chip"><span className="key">status:</span> any</button>
        <button className="filter-chip"><span className="key">balance:</span> any</button>
        <button className="filter-chip"><span className="key">activity:</span> any</button>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>
          {users.length} of {window.GW_DATA.USERS.length}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th className="num">Balance</th>
              <th className="num">Lifetime</th>
              <th className="num">Keys</th>
              <th>Status</th>
              <th>Created</th>
              <th>Last active</th>
              <th style={{ width: 220 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="clickable" onClick={() => onOpenUser(u)}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: `oklch(0.4 0.08 ${(u.id.charCodeAt(2) * 37) % 360})`,
                      display: "grid", placeItems: "center", fontSize: 10, color: "#fff", fontWeight: 600
                    }}>{u.email[0].toUpperCase()}</span>
                    <span>{u.email}</span>
                  </div>
                </td>
                <td className="num" style={{ color: u.balance < 10 ? "var(--warn)" : "var(--fg)" }}>
                  ${u.balance.toFixed(2)}
                </td>
                <td className="num">${u.total.toFixed(2)}</td>
                <td className="num">{u.keys}</td>
                <td>{u.status === "active" ? <Badge tone="success" dot>active</Badge> : <Badge tone="muted" dot>disabled</Badge>}</td>
                <td className="dim">{u.created}</td>
                <td className="dim">{u.lastActive}</td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} className="row-action">
                    <button className="btn sm" onClick={() => setRecharge(u)}><Icon name="plus" size={11} /> Top up</button>
                    <button className="btn ghost sm" title="Disable"><Icon name="power" size={12} /></button>
                    <button className="btn ghost sm" title="More"><Icon name="chevron" size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RechargeModal open={!!recharge} user={recharge} onClose={() => setRecharge(null)} onApply={() => setRecharge(null)} />
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onApply={() => setCreateOpen(false)} />
    </div>
  );
}
window.AdminUsers = AdminUsers;

function AdminUserDetail({ user, onBack }) {
  return (
    <div className="page-body">
      <PageHeader
        crumbs={["Admin", "Users", user.email]}
        title={user.email}
        sub={<>Created {user.created} · {user.status === "disabled" ? <span style={{ color: "var(--danger)" }}>disabled</span> : "active"}</>}
        right={
          <>
            <button className="btn sm" onClick={onBack}><Icon name="chevron" size={12} style={{ transform: "rotate(180deg)" }} /> Back</button>
            <button className="btn sm"><Icon name="power" size={12} /> Disable</button>
            <button className="btn primary sm"><Icon name="plus" size={12} /> Top up</button>
          </>
        }
      />

      <div className="kpi-grid">
        <KpiTile label="Balance" value={`$${user.balance.toFixed(2)}`} sub={user.balance < 10 ? "low" : ""} />
        <KpiTile label="Lifetime spend" value={`$${user.total.toFixed(2)}`} />
        <KpiTile label="Spend MTD" value="$184.22" delta="8%" deltaDir="up" />
        <KpiTile label="Requests MTD" value="12,418" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="card">
          <div className="card-header"><span className="title">API keys</span><span className="sub">{user.keys} total</span></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Name</th><th>Prefix</th><th className="num">MTD</th><th>Status</th></tr></thead>
              <tbody>
                {window.GW_DATA.KEYS.slice(0, user.keys).map(k => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td className="mono dim">{k.prefix}</td>
                    <td className="num">${k.monthUsage.toFixed(2)}</td>
                    <td>{k.status === "active" ? <Badge tone="success" dot>active</Badge> : <Badge tone="muted" dot>disabled</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="title">Recharge history</span></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Date</th><th>By</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {[
                  { d: "2026-05-02", by: "admin@relay", a: 200 },
                  { d: "2026-04-04", by: "admin@relay", a: 200 },
                  { d: "2026-03-01", by: "admin@relay", a: 500 },
                  { d: "2026-02-08", by: "admin@relay", a: 100 },
                ].map((r, i) => (
                  <tr key={i}><td className="dim">{r.d}</td><td className="dim">{r.by}</td><td className="num" style={{ color: "var(--success)" }}>+${r.a.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
window.AdminUserDetail = AdminUserDetail;

function AdminModels() {
  const [editing, setEditing] = useState(null);
  const models = window.GW_DATA.MODELS;
  return (
    <div className="page-body">
      <PageHeader
        crumbs={["Admin", "Models"]}
        title="Models"
        sub="Map the names your users call to the upstream provider models. Override pricing, hide models, disable globally."
        right={
          <>
            <button className="btn sm"><Icon name="refresh" size={12} /> Sync prices</button>
            <button className="btn primary sm"><Icon name="plus" size={12} /> Add model</button>
          </>
        }
      />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Public name</th>
              <th>Upstream</th>
              <th>Provider</th>
              <th>Type</th>
              <th>Capabilities</th>
              <th>Pricing</th>
              <th>Enabled</th>
              <th>Visible</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {models.map((m, i) => (
              <tr key={m.id}>
                <td className="mono">{m.name}</td>
                <td className="mono dim">{m.provider}/{m.name}</td>
                <td><ProviderTag provider={m.provider} /></td>
                <td><TypeBadge type={m.type} /></td>
                <td className="dim">
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {m.type === "text" && <>
                      {m.vision && <Badge tone="muted">vision</Badge>}
                      {m.tools && <Badge tone="muted">tools</Badge>}
                      {m.stream && <Badge tone="muted">stream</Badge>}
                    </>}
                    {(m.capabilities || []).map(c => <Badge key={c} tone="muted">{c}</Badge>)}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: 0.04 }}>{m.pricingMode.replace("_", " ")}</span>
                    <span><PricingTag model={m} /></span>
                  </div>
                </td>
                <td><Toggle on={true} onChange={() => {}} /></td>
                <td><Toggle on={i !== 8} onChange={() => {}} /></td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} className="row-action">
                    <button className="btn ghost sm" onClick={() => setEditing(m)}><Icon name="edit" size={12} /></button>
                    <button className="btn ghost sm"><Icon name="trash" size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={!!editing} onClose={() => setEditing(null)}
        title={<>Edit pricing — <span className="mono">{editing?.name}</span></>}
        sub={`${editing?.provider}/${editing?.name}`}
        footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary">Save</button>
        </>}
      >
        {editing && (
          <>
            <div className="dl">
              <dt>Type</dt><dd><TypeBadge type={editing.type} /></dd>
              <dt>Provider model</dt><dd>{editing.provider}/{editing.name}</dd>
              <dt>Public name</dt><dd>{editing.name}</dd>
            </div>

            <div style={{ marginTop: 18 }}>
              <label className="label">Pricing mode</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  ["per_token",      "per input/output token"],
                  ["per_image",      "per image generated"],
                  ["per_second",     "per second of video"],
                  ["per_generation", "flat per call"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className="btn"
                    style={{
                      justifyContent: "flex-start", padding: 10,
                      borderColor: editing.pricingMode === v ? "var(--accent-dim)" : "var(--border-strong)",
                      background:   editing.pricingMode === v ? "rgba(123,227,139,0.05)" : "var(--surface-2)",
                      flexDirection: "column", alignItems: "flex-start", gap: 2,
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg)" }}>{v}</span>
                    <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>{l}</span>
                  </button>
                ))}
              </div>
            </div>

            {editing.pricingMode === "per_token" && <>
              <div style={{ marginTop: 14 }}>
                <label className="label">Input price ($/1M tokens)</label>
                <input className="input mono" defaultValue={editing.input.toFixed(2)} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="label">Output price ($/1M tokens)</label>
                <input className="input mono" defaultValue={editing.output.toFixed(2)} />
              </div>
            </>}
            {editing.pricingMode === "per_image" && <>
              <div style={{ marginTop: 14 }}>
                <label className="label">Price per image (USD)</label>
                <input className="input mono" defaultValue={editing.perImage.toFixed(2)} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="label">Capabilities</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["text-to-image", "image-to-image", "inpaint"].map(c => (
                    <button key={c} className={`filter-chip ${editing.capabilities.includes(c) ? "active" : ""}`}>{c}</button>
                  ))}
                </div>
              </div>
            </>}
            {editing.pricingMode === "per_second" && <>
              <div style={{ marginTop: 14 }}>
                <label className="label">Price per second of video (USD)</label>
                <input className="input mono" defaultValue={editing.perSecond.toFixed(2)} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="label">Max duration (s)</label>
                <input className="input mono" defaultValue={editing.maxDuration} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="label">Capabilities</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["text-to-video", "image-to-video"].map(c => (
                    <button key={c} className={`filter-chip ${editing.capabilities.includes(c) ? "active" : ""}`}>{c}</button>
                  ))}
                </div>
              </div>
            </>}

            <div style={{ marginTop: 14 }}>
              <label className="label">Margin %</label>
              <input className="input mono" defaultValue="0" />
              <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 6 }}>
                Effective price shown to users = provider price × (1 + margin) unless an override is set.
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
window.AdminModels = AdminModels;

function AdminProviders() {
  const provs = window.GW_DATA.PROVIDERS;
  const marks = {
    openai: "OA", anthropic: "AN", gemini: "GE", xai: "xAI", veo: "VEO",
  };
  return (
    <div className="page-body">
      <PageHeader
        crumbs={["Admin", "Providers"]}
        title="Providers"
        sub="Upstream credentials, endpoints, and health. Disable a provider to immediately stop routing requests to its models."
        right={<button className="btn primary sm"><Icon name="plus" size={12} /> Add provider</button>}
      />

      <div className="grid-3">
        {provs.map(p => (
          <div key={p.id} className="card">
            <div className="card-body">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 7, flex: "none",
                  background: `color-mix(in oklab, var(--${p.id}) 18%, transparent)`,
                  display: "grid", placeItems: "center",
                  fontFamily: "var(--font-mono)", fontSize: 10, color: `var(--${p.id})`, fontWeight: 600,
                }}>{marks[p.id]}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{p.endpoint}</div>
                </div>
                <span style={{ marginLeft: "auto" }}>
                  {p.status === "ok" ? <Badge tone="success" dot>operational</Badge> : <Badge tone="warn" dot>degraded</Badge>}
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                {(p.supports || []).map(s => <TypeBadge key={s} type={s} />)}
              </div>

              <div className="dl" style={{ marginTop: 14, fontSize: 12 }}>
                <dt>Credentials</dt><dd>
                  <Badge tone="success" dot>configured</Badge>
                </dd>
                <dt>Error rate 24h</dt><dd style={{ color: p.errRate > 1 ? "var(--warn)" : "var(--fg)" }}>{p.errRate}%</dd>
                <dt>P50 latency</dt><dd>{p.latency >= 1000 ? `${(p.latency/1000).toFixed(1)}s` : `${p.latency} ms`}</dd>
                <dt>Enabled</dt><dd><Toggle on={true} onChange={() => {}} /></dd>
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                <button className="btn sm" style={{ flex: 1 }}><Icon name="edit" size={11} /> Configure</button>
                <button className="btn sm"><Icon name="refresh" size={11} /> Test</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <Banner tone="info" title="No automatic fallback">
          Disabling a provider returns <code>503 provider_offline</code> to clients calling its models. Relay never silently routes to a different provider.
        </Banner>
      </div>
    </div>
  );
}
window.AdminProviders = AdminProviders;

function AdminLogDetail({ row, onClose }) {
  if (!row) return null;
  const type = row.type || "text";
  const user = ({
    "production-web":    "anna@northpole.io",
    "production-worker": "anna@northpole.io",
    "staging":           "ben@spinedge.com",
    "local-dev (anna)":  "anna@northpole.io",
  })[row.key] || "anna@northpole.io";

  const reqJson = type === "image"
    ? `{ "model": "${row.model}", "prompt": "…", "size": "1024x1024", "n": ${row.count} }`
    : type === "video"
    ? `{ "model": "${row.model}", "prompt": "…", "duration": ${row.duration} }`
    : `{ "model": "${row.model}", "messages": […], "temperature": 0.2 }`;

  return (
    <Drawer wide open={!!row} onClose={onClose}
      title={<span style={{ display: "flex", gap: 10, alignItems: "center" }}><span>{row.id}</span><StatusBadge status={row.status} ok={row.ok} /></span>}
      sub={`${row.time} · ${user} · ${row.model}`}
      footer={<>
        <button className="btn ghost"><Icon name="copy" size={12} /> Copy request id</button>
        <button className="btn"><Icon name="external" size={12} /> Open user</button>
      </>}
    >
      <div className="dl" style={{ gridTemplateColumns: "auto 1fr auto 1fr", gap: "8px 18px" }}>
        <dt>User</dt><dd>{user}</dd>
        <dt>API key</dt><dd>{row.key} <span style={{ color: "var(--fg-faint)" }}>· {row.keyPrefix}</span></dd>
        <dt>Type</dt><dd><TypeBadge type={type} /></dd>
        <dt>Model</dt><dd>{row.model}</dd>
        <dt>Provider</dt><dd><ProviderTag provider={row.provider} /></dd>
        <dt>Provider req id</dt><dd className="mono">req_{row.id.slice(-8)}_up</dd>
        <dt>Latency</dt><dd>{row.latency >= 1000 ? `${(row.latency/1000).toFixed(1)}s` : `${row.latency} ms`}</dd>
        <dt>Cost</dt><dd>${row.cost.toFixed(4)}</dd>
      </div>

      {!row.ok && (
        <div style={{ marginTop: 14 }}>
          <Banner tone="danger" title={row.error || "upstream_error"}>
            Upstream returned <code>{row.status}</code>. Relay did not retry. <strong>No tokens billed.</strong>
          </Banner>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Cost breakdown</div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
          {type === "text"  && <div>Prompt {row.pt.toLocaleString()} tok + Completion {row.ct.toLocaleString()} tok → <span style={{ color: "var(--fg)" }}>${row.cost.toFixed(4)}</span></div>}
          {type === "image" && <div>{row.count} × $0.04 / image → <span style={{ color: "var(--fg)" }}>${row.cost.toFixed(4)}</span></div>}
          {type === "video" && <div>{row.duration}s × $0.35 / second → <span style={{ color: "var(--fg)" }}>${row.cost.toFixed(4)}</span></div>}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="tabs">
          <div className="tab active">Request</div>
          <div className="tab">Response</div>
          <div className="tab">Provider raw</div>
        </div>
        <Code lang="json" code={reqJson} />
      </div>
    </Drawer>
  );
}

function AdminLogs() {
  const [selected, setSelected] = useState(null);
  const rows = window.GW_DATA.LOGS_ALL || window.GW_DATA.LOGS;
  const userByKey = {
    "production-web": "anna@northpole.io",
    "production-worker": "anna@northpole.io",
    "staging": "ben@spinedge.com",
  };

  return (
    <div className="page-body">
      <PageHeader
        crumbs={["Admin", "All logs"]}
        title="All usage logs"
        sub="Every request from every user. Useful for billing audits, abuse investigation, and capacity planning."
        right={<><Badge tone="muted">Last 24h</Badge><button className="btn sm"><Icon name="download" size={12} /> Export</button></>}
      />

      <div className="filter-bar">
        <div className="filter-search">
          <Icon name="search" size={13} />
          <input placeholder="Search by user, key, model, or request id…" />
        </div>
        <button className="filter-chip"><span className="key">user:</span> any</button>
        <button className="filter-chip"><span className="key">provider:</span> any</button>
        <button className="filter-chip"><span className="key">model:</span> any</button>
        <button className="filter-chip"><span className="key">status:</span> any</button>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{rows.length} shown · 42,318 total</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Key</th>
              <th>Type</th>
              <th>Model</th>
              <th>Provider</th>
              <th className="num">Usage</th>
              <th className="num">Cost</th>
              <th className="num">Latency</th>
              <th>Status</th>
              <th>Request ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const t = r.type || "text";
              return (
                <tr key={i} className="clickable" onClick={() => setSelected(r)}>
                  <td className="mono dim">{r.time}</td>
                  <td>{userByKey[r.key] || "anna@northpole.io"}</td>
                  <td className="dim">{r.key}</td>
                  <td><TypeBadge type={t} /></td>
                  <td className="mono">{r.model}</td>
                  <td><ProviderTag provider={r.provider} /></td>
                  <td className="num">
                    {t === "text"  && <>{r.total.toLocaleString()} <span style={{ color: "var(--fg-faint)" }}>tok</span></>}
                    {t === "image" && <>{r.count} <span style={{ color: "var(--fg-faint)" }}>img</span></>}
                    {t === "video" && <>{r.duration} <span style={{ color: "var(--fg-faint)" }}>sec</span></>}
                  </td>
                  <td className="num">${r.cost.toFixed(4)}</td>
                  <td className="num">{r.latency >= 1000 ? `${(r.latency/1000).toFixed(1)}s` : `${r.latency}ms`}</td>
                  <td><StatusBadge status={r.status} ok={r.ok} /></td>
                  <td className="mono dim">{r.id}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AdminLogDetail row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
window.AdminLogs = AdminLogs;

function AdminBilling() {
  const recharges = [
    { date: "2026-05-17 09:12", user: "anna@northpole.io", amount: 200, by: "admin@relay", note: "May top-up" },
    { date: "2026-05-15 14:30", user: "ben@spinedge.com", amount: 50, by: "admin@relay", note: "trial credit" },
    { date: "2026-05-10 11:02", user: "claire@usefigment.ai", amount: 500, by: "admin@relay", note: "" },
    { date: "2026-05-04 16:48", user: "felix@halfmoon.dev", amount: 100, by: "admin@relay", note: "monthly" },
    { date: "2026-05-02 09:00", user: "anna@northpole.io", amount: 200, by: "admin@relay", note: "May top-up" },
    { date: "2026-04-28 10:14", user: "dev@redacre.studio", amount: 300, by: "admin@relay", note: "" },
    { date: "2026-04-22 12:38", user: "evan@quietcompany.co", amount: 50, by: "admin@relay", note: "initial credit" },
  ];
  return (
    <div className="page-body">
      <PageHeader
        crumbs={["Admin", "Recharge"]}
        title="Recharge"
        sub="Top up any user's balance, view the global recharge ledger."
        right={<button className="btn primary sm"><Icon name="plus" size={12} /> New recharge</button>}
      />

      <div className="kpi-grid">
        <KpiTile label="Aggregate balance" value="$639.68" sub="across 7 users" />
        <KpiTile label="Recharges this month" value="$1,400.00" delta="14%" deltaDir="up" />
        <KpiTile label="Margin this month" value="$29.18" sub="0% default · 1 override" />
        <KpiTile label="Users at $0" value="1" sub="claire@usefigment.ai" />
      </div>

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>By</th>
              <th>Note</th>
              <th className="num">Amount</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {recharges.map((r, i) => (
              <tr key={i}>
                <td className="dim">{r.date}</td>
                <td>{r.user}</td>
                <td className="dim">{r.by}</td>
                <td className="dim">{r.note || <span style={{ color: "var(--fg-dim)" }}>—</span>}</td>
                <td className="num" style={{ color: "var(--success)" }}>+${r.amount.toFixed(2)}</td>
                <td><button className="btn ghost sm row-action"><Icon name="external" size={11} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
window.AdminBilling = AdminBilling;
