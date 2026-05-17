/* API Keys page + create flow + revealed-once flow */

function CreateKeyModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("100");
  const [env, setEnv] = useState("live");
  if (!open) return null;
  function submit() {
    onCreated({
      name: name || "untitled-key",
      env,
      limit: parseFloat(limit) || 0,
      // pretend full key
      full: env === "live"
        ? "rl_live_4xK8aZpN3wQbR7vM2dL9aT2cF1gH6jK4mN8pQrSt"
        : "rl_test_2hL9q8R4xK7vM1cF6jK4mN8pQrStUv3wXyZbE5dG"
    });
  }
  return (
    <Modal open={open} onClose={onClose}
      title="Create API key"
      sub="Key will be displayed once. Copy it before closing."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Create key</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="label">Name</label>
          <input className="input" placeholder="e.g. production-web" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 6 }}>For your reference only. Renamable later.</div>
        </div>
        <div>
          <label className="label">Environment</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              ["live", "Live", "rl_live_…"],
              ["test", "Test", "rl_test_…"],
            ].map(([v, lbl, hint]) => (
              <button
                key={v}
                onClick={() => setEnv(v)}
                className="btn"
                style={{
                  flex: 1, justifyContent: "flex-start", padding: 12,
                  borderColor: env === v ? "var(--accent-dim)" : "var(--border-strong)",
                  background: env === v ? "rgba(123,227,139,0.05)" : "var(--surface-2)"
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, color: "var(--fg)" }}>{lbl}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{hint}</div>
                </div>
                {env === v && <Icon name="check" size={14} className="" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Monthly spend limit</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>$</span>
            <input className="input mono" value={limit} onChange={e => setLimit(e.target.value)} />
            <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>/ month</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 6 }}>
            Requests using this key will be rejected once the monthly spend exceeds the limit. Set to <code>0</code> for no limit.
          </div>
        </div>
      </div>
    </Modal>
  );
}

function KeyRevealedModal({ open, onClose, keyData }) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  function copyIt() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(keyData.full).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <Modal open={open} onClose={onClose} wide
      title={<>API key created — <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>{keyData.name}</span></>}
      sub="This is the only time we'll show the full key. Store it somewhere safe."
      footer={
        <>
          <button className="btn" onClick={onClose}>I've saved it — close</button>
        </>
      }
    >
      <Banner tone="warn" title="Save this key now">
        Relay never stores the full key. If you lose it, you'll need to create a new one.
      </Banner>
      <div style={{ marginTop: 14 }}>
        <label className="label">Your new key</label>
        <div style={{ position: "relative" }}>
          <input className="input mono" readOnly value={keyData.full} onFocus={e => e.target.select()} style={{ paddingRight: 96 }} />
          <button onClick={copyIt} className="btn sm" style={{ position: "absolute", right: 6, top: 4 }}>
            <Icon name={copied ? "check" : "copy"} size={12} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
        <div className="dl">
          <dt>Environment</dt><dd>{keyData.env === "live" ? "live" : "test"}</dd>
          <dt>Limit</dt><dd>{keyData.limit ? `$${keyData.limit}/mo` : "no limit"}</dd>
          <dt>Created</dt><dd>2026-05-17 14:32 UTC</dd>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 6 }}>Add to your env</div>
          <Code lang="bash" code={`export RELAY_API_KEY="${keyData.full}"`} />
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDelete({ open, onClose, name, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose}
      title="Delete API key?"
      sub={<>The key <code style={{ fontFamily: "var(--font-mono)" }}>{name}</code> will stop working immediately. This cannot be undone.</>}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn danger" onClick={onConfirm}>Delete key</button>
        </>
      }
    >
      <Banner tone="danger" title="Any service using this key will start receiving 401s">
        We recommend rotating: create a new key, deploy it, then come back and delete this one.
      </Banner>
    </Modal>
  );
}

function ApiKeys({ onNavigate }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [keys, setKeys] = useState(window.GW_DATA.KEYS);

  function createKey(data) {
    const prefix = data.full.slice(0, 12) + "…" + data.full.slice(-4);
    const next = {
      id: "k_new",
      name: data.name,
      prefix,
      created: "2026-05-17",
      lastUsed: "—",
      monthUsage: 0,
      limit: data.limit,
      status: "active",
    };
    setKeys([next, ...keys]);
    setCreateOpen(false);
    setRevealed(data);
  }
  function doDelete() {
    setKeys(keys.filter(k => k.id !== confirmDel.id));
    setConfirmDel(null);
  }

  return (
    <div className="page-body">
      <PageHeader
        title="API Keys"
        sub="Issue and manage keys for your apps, scripts, and teammates. Each key has its own monthly spend cap."
        right={
          <>
            <button className="btn sm">
              <Icon name="download" size={12} /> Export CSV
            </button>
            <button className="btn primary sm" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={12} /> New key
            </button>
          </>
        }
      />

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 14 }}>
        <KpiTile label="Active keys"  value="4" sub="1 disabled" />
        <KpiTile label="Spend this month" value="$289.99" sub="across 4 keys" />
        <KpiTile label="Aggregate limit" value="$820/mo" sub="35% utilized" />
        <KpiTile label="Last used" value="2 min ago" sub="production-web" />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Created</th>
              <th>Last used</th>
              <th className="num">This month</th>
              <th className="num">Limit</th>
              <th>Status</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {keys.map(k => {
              const pct = k.limit ? Math.min(1, k.monthUsage / k.limit) : 0;
              return (
                <tr key={k.id}>
                  <td>
                    <div>{k.name}</div>
                  </td>
                  <td className="mono dim">{k.prefix}</td>
                  <td className="dim">{k.created}</td>
                  <td className="dim">{k.lastUsed}</td>
                  <td className="num">${k.monthUsage.toFixed(2)}</td>
                  <td className="num">
                    {k.limit ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                        <div style={{ width: 60, height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct * 100}%`, height: "100%", background: pct > 0.85 ? "var(--warn)" : "var(--accent)" }} />
                        </div>
                        <span style={{ minWidth: 50, textAlign: "right" }}>${k.limit}/mo</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td>
                    {k.status === "active"
                      ? <Badge tone="success" dot>active</Badge>
                      : <Badge tone="muted" dot>disabled</Badge>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} className="row-action">
                      <button className="btn ghost sm" title="Rename"><Icon name="edit" size={12} /></button>
                      <button className="btn ghost sm" title="Disable"><Icon name="power" size={12} /></button>
                      <button className="btn ghost sm" title="Delete" onClick={() => setConfirmDel(k)}><Icon name="trash" size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "var(--fg-faint)", display: "flex", gap: 18, fontFamily: "var(--font-mono)" }}>
        <span>Keys never expire automatically.</span>
        <span>Disabled keys keep their history but return 401.</span>
        <span>Deleted keys are unrecoverable.</span>
      </div>

      <CreateKeyModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={createKey} />
      {revealed && <KeyRevealedModal open={!!revealed} keyData={revealed} onClose={() => setRevealed(null)} />}
      {confirmDel && <ConfirmDelete open={!!confirmDel} name={confirmDel.name} onClose={() => setConfirmDel(null)} onConfirm={doDelete} />}
    </div>
  );
}
window.ApiKeys = ApiKeys;
