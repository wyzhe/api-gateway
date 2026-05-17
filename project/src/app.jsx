/* App root: routes between landing + workspace + admin */

const { useState: useStateApp } = React;

function PageSwitcher({ current, onChange }) {
  return (
    <div className="page-switcher">
      <span className="lbl">jump to</span>
      <select value={current} onChange={e => onChange(e.target.value)}>
        <optgroup label="Public">
          <option value="landing">Landing</option>
          <option value="public-models">Models (public)</option>
          <option value="public-docs">Docs (public)</option>
          <option value="public-status">Status (public)</option>
        </optgroup>
        <optgroup label="Workspace">
          <option value="dashboard">Dashboard</option>
          <option value="keys">API Keys</option>
          <option value="logs">Usage / Logs</option>
          <option value="playground">Playground</option>
          <option value="generations">Generations</option>
          <option value="billing">Billing</option>
          <option value="models">Models</option>
          <option value="docs">Docs</option>
          <option value="status">Status</option>
        </optgroup>
        <optgroup label="Admin">
          <option value="admin-users">Users</option>
          <option value="admin-user-detail">User detail</option>
          <option value="admin-models">Models</option>
          <option value="admin-providers">Providers</option>
          <option value="admin-logs">All logs</option>
          <option value="admin-billing">Recharge</option>
        </optgroup>
        <optgroup label="States">
          <option value="state-empty">Empty key list</option>
          <option value="state-no-balance">Insufficient balance</option>
          <option value="state-key-created">Key created</option>
          <option value="state-loading">Loading</option>
          <option value="state-disabled-key">Disabled API key</option>
          <option value="state-model-unavailable">Model unavailable</option>
          <option value="state-provider-error">Provider error</option>
          <option value="state-request-failed">Request failed</option>
          <option value="state-video-failed">Video task failed</option>
          <option value="state-video-timeout">Video task timeout</option>
          <option value="state-asset-expired">Asset expired</option>
        </optgroup>
      </select>
    </div>
  );
}

const PAGES = {
  landing:             { kind: "public",   crumbs: ["Public", "Landing"] },
  "public-models":     { kind: "public",   crumbs: ["Public", "Models"] },
  "public-docs":       { kind: "public",   crumbs: ["Public", "Docs"] },
  "public-status":     { kind: "public",   crumbs: ["Public", "Status"] },
  dashboard:           { kind: "ws",       crumbs: ["workspace", "Dashboard"] },
  keys:                { kind: "ws",       crumbs: ["workspace", "API Keys"] },
  logs:                { kind: "ws",       crumbs: ["workspace", "Usage / Logs"] },
  playground:          { kind: "ws",       crumbs: ["workspace", "Playground"] },
  generations:         { kind: "ws",       crumbs: ["workspace", "Generations"] },
  billing:             { kind: "ws",       crumbs: ["workspace", "Billing"] },
  models:              { kind: "ws",       crumbs: ["workspace", "Models"] },
  docs:                { kind: "ws",       crumbs: ["workspace", "Docs"] },
  status:              { kind: "ws",       crumbs: ["workspace", "Status"] },
  "admin-users":       { kind: "admin",    crumbs: ["admin", "Users"] },
  "admin-user-detail": { kind: "admin",    crumbs: ["admin", "Users", "anna@northpole.io"] },
  "admin-models":      { kind: "admin",    crumbs: ["admin", "Models"] },
  "admin-providers":   { kind: "admin",    crumbs: ["admin", "Providers"] },
  "admin-logs":        { kind: "admin",    crumbs: ["admin", "All logs"] },
  "admin-billing":     { kind: "admin",    crumbs: ["admin", "Recharge"] },
  "state-empty":          { kind: "ws",    crumbs: ["workspace", "API Keys"] },
  "state-no-balance":     { kind: "ws",    crumbs: ["workspace", "Dashboard"] },
  "state-key-created":    { kind: "ws",    crumbs: ["workspace", "API Keys"] },
  "state-loading":        { kind: "ws",    crumbs: ["workspace", "Usage / Logs"] },
  "state-disabled-key":   { kind: "ws",    crumbs: ["workspace", "API Keys"] },
  "state-model-unavailable": { kind: "ws", crumbs: ["workspace", "Playground"] },
  "state-provider-error": { kind: "ws",    crumbs: ["workspace", "Usage / Logs"] },
  "state-request-failed": { kind: "ws",    crumbs: ["workspace", "Usage / Logs"] },
  "state-video-failed":   { kind: "ws",    crumbs: ["workspace", "Generations"] },
  "state-video-timeout":  { kind: "ws",    crumbs: ["workspace", "Generations"] },
  "state-asset-expired":  { kind: "ws",    crumbs: ["workspace", "Generations"] },
};

function StateEmptyKeys({ onCreate }) {
  return (
    <div className="page-body">
      <PageHeader title="API Keys" sub="Issue and manage keys for your apps, scripts, and teammates."
        right={<button className="btn primary sm" onClick={onCreate}><Icon name="plus" size={12} /> New key</button>}
      />
      <div className="card">
        <EmptyState
          icon="key"
          title="You don't have any keys yet"
          desc="Create your first API key to start calling models. We'll show the full key once — copy it before closing the dialog."
          actions={
            <>
              <button className="btn primary sm" onClick={onCreate}><Icon name="plus" size={12} /> Create your first key</button>
              <button className="btn sm">Read the docs</button>
            </>
          }
        />
      </div>
    </div>
  );
}

function StateNoBalance({ onNavigate }) {
  return (
    <div className="page-body">
      <PageHeader title="Dashboard" sub="Your balance is $0.00. Requests are being rejected." />
      <Banner tone="danger" title="Insufficient balance — requests are returning 402"
        action={<button className="btn primary sm">Request top-up</button>}>
        At $0.00 Relay returns <code style={{ fontFamily: "var(--font-mono)" }}>402 insufficient_balance</code> for every call. Ask your admin to credit your account.
      </Banner>

      <div className="kpi-grid" style={{ marginTop: 14 }}>
        <KpiTile label="Balance" value="$0.00" sub="empty" />
        <KpiTile label="Requests today" value="142" sub="138 succeeded · 4 rejected" />
        <KpiTile label="Last successful call" value="3 hr ago" sub="claude-sonnet-4.5" />
        <KpiTile label="Last rejected" value="2 min ago" sub="402" />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header"><span className="title">Recent rejections</span></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Time</th><th>Key</th><th>Model</th><th>Status</th><th>Error</th></tr></thead>
            <tbody>
              {[
                ["2 min ago", "production-web", "claude-sonnet-4.5", "402", "insufficient_balance — account balance is $0.00"],
                ["4 min ago", "production-web", "claude-sonnet-4.5", "402", "insufficient_balance — account balance is $0.00"],
                ["8 min ago", "production-worker", "gpt-5-mini", "402", "insufficient_balance — account balance is $0.00"],
                ["12 min ago", "production-worker", "gpt-5-mini", "402", "insufficient_balance — account balance is $0.00"],
              ].map((r, i) => (
                <tr key={i}>
                  <td className="mono dim">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td className="mono">{r[2]}</td>
                  <td><Badge tone="danger" dot>{r[3]}</Badge></td>
                  <td className="dim">{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StateKeyCreated({ onClose }) {
  return (
    <div className="page-body">
      <PageHeader title="API Keys" right={<button className="btn primary sm"><Icon name="plus" size={12} /> New key</button>} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th className="num">MTD</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td>new-prototype-key</td>
              <td className="mono dim">rl_live_4xK…rSt</td>
              <td className="dim">just now</td>
              <td className="dim">—</td>
              <td className="num">$0.00</td>
              <td><Badge tone="success" dot>active</Badge></td>
            </tr>
            {window.GW_DATA.KEYS.map(k => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="mono dim">{k.prefix}</td>
                <td className="dim">{k.created}</td>
                <td className="dim">{k.lastUsed}</td>
                <td className="num">${k.monthUsage.toFixed(2)}</td>
                <td>{k.status === "active" ? <Badge tone="success" dot>active</Badge> : <Badge tone="muted" dot>disabled</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <KeyRevealedModalStandalone />
    </div>
  );
}

function KeyRevealedModalStandalone() {
  const [open, setOpen] = useStateApp(true);
  if (!open) return null;
  return (
    <Modal open={open} onClose={() => setOpen(false)} wide
      title={<>API key created — <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>new-prototype-key</span></>}
      sub="This is the only time we'll show the full key. Store it somewhere safe."
      footer={<button className="btn" onClick={() => setOpen(false)}>I've saved it — close</button>}
    >
      <Banner tone="warn" title="Save this key now">
        Relay never stores the full key. If you lose it, you'll need to create a new one.
      </Banner>
      <div style={{ marginTop: 14 }}>
        <label className="label">Your new key</label>
        <input className="input mono" readOnly value="rl_live_4xK8aZpN3wQbR7vM2dL9aT2cF1gH6jK4mN8pQrSt" />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 6 }}>Add to your env</div>
        <Code lang="bash" code={`export RELAY_API_KEY="rl_live_4xK8aZpN3wQbR7vM2dL9aT2cF1gH6jK4mN8pQrSt"`} />
      </div>
    </Modal>
  );
}

function StateLoading() {
  return (
    <div className="page-body">
      <PageHeader title="Usage / Logs" sub="Loading the last 24 hours…" right={<Badge tone="muted">Last 24h</Badge>} />
      <div className="kpi-grid">
        {[0,1,2,3].map(i => (
          <div className="kpi" key={i}>
            <div className="skeleton" style={{ width: 80, height: 10 }} />
            <div className="skeleton" style={{ width: 120, height: 22, marginTop: 10 }} />
            <div className="skeleton" style={{ width: 90, height: 10, marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th><th>Request</th><th>Model</th><th>Provider</th><th>Key</th>
              <th className="num">Tokens</th><th className="num">Cost</th><th className="num">ms</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 9 }).map((__, j) => (
                  <td key={j}><div className="skeleton" style={{ width: j === 1 ? 110 : j === 2 ? 130 : 60, height: 10 }} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PublicShell({ nav, onNavigate, children }) {
  return (
    <div className="landing-page" style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <LandingNav onNavigate={onNavigate} />
      <div style={{ padding: "8px 16px 60px", maxWidth: 1480, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}

/* ===================== New state pages ===================== */

function MiniLogRow({ time, type, model, status, msg, error }) {
  return (
    <tr>
      <td className="mono dim">{time}</td>
      <td><TypeBadge type={type} /></td>
      <td className="mono">{model}</td>
      <td><StatusBadge status={status} ok={false} /></td>
      <td className="dim" style={{ whiteSpace: "normal" }}><span className="mono" style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span> · {msg}</td>
    </tr>
  );
}

function StateDisabledKey() {
  return (
    <div className="page-body">
      <PageHeader title="API Keys" sub="One of your keys was disabled by your admin." />
      <Banner tone="warn" title="Key “old-cli” was disabled 4 hours ago by admin@relay">
        Requests using this key are now returning <code>401 invalid_api_key</code>. Existing history is preserved. To use it again, ask your admin to re-enable it, or create a replacement key.
      </Banner>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead><tr><th>Name</th><th>Key</th><th>Last used</th><th className="num">MTD</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {window.GW_DATA.KEYS.map(k => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="mono dim">{k.prefix}</td>
                <td className="dim">{k.lastUsed}</td>
                <td className="num">${k.monthUsage.toFixed(2)}</td>
                <td>
                  {k.name === "old-cli"
                    ? <Badge tone="danger" dot>disabled by admin</Badge>
                    : k.status === "active" ? <Badge tone="success" dot>active</Badge> : <Badge tone="muted" dot>disabled</Badge>}
                </td>
                <td>{k.name === "old-cli" && <button className="btn sm">Request re-enable</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StateModelUnavailable() {
  return (
    <div className="page-body">
      <PageHeader title="Playground" sub="The model you selected is currently unavailable." />
      <Banner tone="danger" title="grok-imagine-video is offline"
        action={<button className="btn sm">Switch model</button>}>
        xAI has temporarily disabled this model upstream. Relay will not silently route to a different model. See <a style={{ color: "var(--accent)", cursor: "pointer" }}>Status</a> for details.
      </Banner>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header"><span className="title">Suggested alternatives</span><span className="sub">same modality, similar pricing</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {window.GW_DATA.VIDEO_MODELS.filter(m => m.status === "ok").map(m => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px", gap: 14, padding: "12px 16px", borderTop: "1px solid var(--border-soft)", alignItems: "center" }}>
              <span className="mono">{m.name}</span>
              <ProviderTag provider={m.provider} />
              <span className="mono dim" style={{ fontSize: 12 }}>${m.perSecond.toFixed(2)} / sec · ≤ {m.maxDuration}s</span>
              <button className="btn sm primary">Use this</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StateProviderError() {
  return (
    <div className="page-body">
      <PageHeader title="Usage / Logs" sub="A provider is returning elevated errors. Affected requests are shown below." />
      <Banner tone="danger" title="Google Gemini error rate at 18% over the last 15 min"
        action={<button className="btn sm">Open status</button>}>
        Upstream is intermittently returning <code>500 upstream_error</code>. Relay does not retry — your client sees the error. Failed requests are <strong>not billed</strong>.
      </Banner>

      <div className="kpi-grid" style={{ marginTop: 14 }}>
        <KpiTile label="Affected requests" value="42" sub="in the last 15 min" />
        <KpiTile label="Error rate" value="18.4%" sub="↑ from 0.3% baseline" />
        <KpiTile label="Refused cost" value="$0.00" sub="provider errors not billed" />
        <KpiTile label="Provider" value="Gemini" sub="all models affected" />
      </div>

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead><tr><th>Time</th><th>Type</th><th>Model</th><th>Status</th><th>Error</th></tr></thead>
          <tbody>
            <MiniLogRow time="just now" type="text"  model="gemini-2.5-flash" status="500" error="upstream_error" msg="Gemini returned: backend timeout" />
            <MiniLogRow time="14s ago"  type="text"  model="gemini-2.5-pro"   status="500" error="upstream_error" msg="Gemini returned: backend timeout" />
            <MiniLogRow time="22s ago"  type="image" model="nano-banana-pro"  status="500" error="upstream_error" msg="Gemini returned: backend timeout" />
            <MiniLogRow time="38s ago"  type="text"  model="gemini-2.5-flash" status="500" error="upstream_error" msg="Gemini returned: backend timeout" />
            <MiniLogRow time="42s ago"  type="text"  model="gemini-2.5-flash" status="500" error="upstream_error" msg="Gemini returned: backend timeout" />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StateRequestFailed() {
  return (
    <div className="page-body">
      <PageHeader title="Request failed — req_2xy9pR4k" sub="Click below to inspect the full payload, then retry from Playground." />
      <Banner tone="danger" title="400 invalid_request — Missing required field 'messages'">
        Your request was rejected before reaching the provider. No tokens were billed.
      </Banner>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-header"><span className="title">Request</span></div>
          <div className="card-body">
            <Code lang="json" code={`{
  "model": "claude-sonnet-4.5",
  "temperature": 0.2,
  "max_tokens": 1024
}`} />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="title">Response</span></div>
          <div className="card-body">
            <Code lang="json" code={`{
  "error": {
    "type": "invalid_request",
    "message": "Required field 'messages' is missing",
    "param": "messages",
    "code": "missing_field"
  }
}`} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <button className="btn primary"><Icon name="refresh" size={12} /> Retry in Playground</button>
        <button className="btn"><Icon name="copy" size={12} /> Copy request id</button>
      </div>
    </div>
  );
}

function StateVideoFailed() {
  return (
    <div className="page-body">
      <PageHeader title="Video task failed — task_2xy9pR4k" sub="Provider returned an error during render. No tokens billed." />
      <Banner tone="danger" title="content_policy_violation"
        action={<button className="btn sm">Edit prompt</button>}>
        Google Veo refused this prompt at second <strong>3 of 8</strong>. Your balance was not deducted. Consider rewriting the prompt or trying a different model.
      </Banner>
      <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
        <div>
          <MediaPreview type="video" prompt="…" hue={0} size="1920×1080" duration={8} status="failed" aspect="aspect-16-9" />
        </div>
        <div className="card">
          <div className="card-header"><span className="title">Task</span></div>
          <div className="card-body">
            <div className="dl">
              <dt>Task id</dt><dd>task_2xy9pR4k</dd>
              <dt>Model</dt><dd>veo-3.1</dd>
              <dt>Failed at</dt><dd>3s / 8s</dd>
              <dt>Cost</dt><dd>$0.00 <span style={{ color: "var(--fg-faint)" }}>(not billed)</span></dd>
              <dt>Error type</dt><dd className="mono" style={{ color: "var(--danger)" }}>content_policy_violation</dd>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <button className="btn"><Icon name="copy" size={12} /> Copy task id</button>
              <button className="btn"><Icon name="refresh" size={12} /> Retry</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StateVideoTimeout() {
  return (
    <div className="page-body">
      <PageHeader title="Video task timed out — task_3kK9pR4f" sub="Render exceeded the 5-minute provider limit and was cancelled." />
      <Banner tone="warn" title="provider_timeout — 300s"
        action={<button className="btn sm">Retry shorter</button>}>
        Veo did not return a result within 5 minutes. Relay cancelled the task. <strong>You were not billed.</strong>
      </Banner>
      <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
        <div className="card">
          <div className="card-header"><span className="title">Task</span></div>
          <div className="card-body">
            <div className="dl">
              <dt>Task id</dt><dd>task_3kK9pR4f</dd>
              <dt>Model</dt><dd>veo-3.1</dd>
              <dt>Requested duration</dt><dd>60s @ 1080p</dd>
              <dt>Render budget</dt><dd>300s</dd>
              <dt>Elapsed</dt><dd>300.4s</dd>
              <dt>Cost</dt><dd>$0.00</dd>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="title">Recommendations</span></div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--fg-muted)", fontSize: 13.5, lineHeight: 1.7 }}>
              <li>Try <code className="mono">veo-3.1-fast</code> — same scene, ~3× faster.</li>
              <li>Reduce duration to ≤ 30s.</li>
              <li>Drop resolution to 720p for faster render.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StateAssetExpired() {
  return (
    <div className="page-body">
      <PageHeader title="Generations" sub="An asset URL has expired. The asset itself can be re-generated." />
      <Banner tone="warn" title="Asset URL expired 32 minutes ago">
        Relay-hosted asset URLs are valid for <strong>24 hours</strong>. To keep the asset, copy it to your own storage right after generation. Re-running the same prompt is not free — you'll pay the provider price again.
      </Banner>
      <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
        <div>
          <div style={{ position: "relative" }}>
            <MediaPreview type="image" prompt="Editorial portrait of a marathon runner…" hue={18} size="1024×1024" status="succeeded" aspect="aspect-1-1" />
            <div style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.75)", display: "grid", placeItems: "center", borderRadius: 8 }}>
              <div style={{ textAlign: "center" }}>
                <Icon name="alert" size={24} className="" />
                <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>URL_EXPIRED</div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="title">Asset</span></div>
          <div className="card-body">
            <div className="dl">
              <dt>Generation id</dt><dd>gen_2xy9pR4k</dd>
              <dt>Model</dt><dd>gpt-image-2</dd>
              <dt>Created</dt><dd>2026-05-16 04:12 UTC</dd>
              <dt>URL expired</dt><dd>2026-05-17 04:12 UTC</dd>
              <dt>Original cost</dt><dd>$0.04</dd>
              <dt>Prompt</dt><dd style={{ whiteSpace: "normal", fontFamily: "var(--font-sans)" }}>Editorial portrait of a marathon runner mid-stride, golden hour…</dd>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <button className="btn primary"><Icon name="sparkle" size={12} /> Re-generate ($0.04)</button>
              <button className="btn"><Icon name="copy" size={12} /> Copy prompt</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useStateApp("landing");
  const [user, setUser] = useStateApp(null); // for admin user-detail

  function navigate(target) {
    setPage(target);
  }
  function openUser(u) {
    setUser(u);
    setPage("admin-user-detail");
  }
  const meta = PAGES[page];
  const isPublic = meta.kind === "public";
  const isAdmin = meta.kind === "admin";

  let content;
  switch (page) {
    case "landing":          content = <LandingPage onNavigate={navigate} />; break;
    case "public-models":    content = <PublicShell nav="models" onNavigate={navigate}><ModelsPage publicMode /></PublicShell>; break;
    case "public-docs":      content = <PublicShell nav="docs" onNavigate={navigate}><DocsPage onNavigate={navigate} publicMode /></PublicShell>; break;
    case "public-status":    content = <PublicShell nav="status" onNavigate={navigate}><StatusPage /></PublicShell>; break;
    case "dashboard":        content = <Dashboard onNavigate={navigate} />; break;
    case "keys":             content = <ApiKeys onNavigate={navigate} />; break;
    case "logs":             content = <UsageLogs />; break;
    case "playground":       content = <Playground />; break;
    case "generations":      content = <GenerationsPage />; break;
    case "billing":          content = <Billing />; break;
    case "models":           content = <ModelsPage />; break;
    case "docs":             content = <DocsPage onNavigate={navigate} />; break;
    case "status":           content = <StatusPage />; break;
    case "admin-users":      content = <AdminUsers onOpenUser={openUser} />; break;
    case "admin-user-detail":content = <AdminUserDetail user={user || window.GW_DATA.USERS[0]} onBack={() => navigate("admin-users")} />; break;
    case "admin-models":     content = <AdminModels />; break;
    case "admin-providers":  content = <AdminProviders />; break;
    case "admin-logs":       content = <AdminLogs />; break;
    case "admin-billing":    content = <AdminBilling />; break;
    case "state-empty":         content = <StateEmptyKeys onCreate={() => navigate("state-key-created")} />; break;
    case "state-no-balance":    content = <StateNoBalance onNavigate={navigate} />; break;
    case "state-key-created":   content = <StateKeyCreated onClose={() => navigate("keys")} />; break;
    case "state-loading":       content = <StateLoading />; break;
    case "state-disabled-key":  content = <StateDisabledKey />; break;
    case "state-model-unavailable": content = <StateModelUnavailable />; break;
    case "state-provider-error":content = <StateProviderError />; break;
    case "state-request-failed":content = <StateRequestFailed />; break;
    case "state-video-failed":  content = <StateVideoFailed />; break;
    case "state-video-timeout": content = <StateVideoTimeout />; break;
    case "state-asset-expired": content = <StateAssetExpired />; break;
    default: content = null;
  }

  return (
    <>
      {isPublic ? (
        <div className="app no-sidebar">
          <div className="page">{content}</div>
        </div>
      ) : (
        <div className={`app ${isAdmin ? "admin-mode" : ""}`}>
          <Sidebar current={page} onNavigate={navigate} admin={isAdmin} />
          <div className="page">
            <Topbar crumbs={meta.crumbs} />
            {content}
          </div>
        </div>
      )}
      <PageSwitcher current={page} onChange={navigate} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
