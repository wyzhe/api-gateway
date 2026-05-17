/* Usage / Logs — the heavy hitter */

function LogDetailDrawer({ row, onClose }) {
  if (!row) return null;
  const type = row.type || "text";
  const requestJson = type === "image"
    ? `{
  "model": "${row.model}",
  "prompt": "Editorial portrait of a marathon runner, golden hour…",
  "size": "1024×1024",
  "n": ${row.count}
}`
    : type === "video"
    ? `{
  "model": "${row.model}",
  "prompt": "Drone flyover of a coastline at dawn…",
  "duration": ${row.duration},
  "resolution": "1920×1080",
  "aspect_ratio": "16:9"
}`
    : `{
  "model": "${row.model}",
  "messages": [
    {"role":"system","content":"You are a careful financial summarizer."},
    {"role":"user","content":"Summarize this quarterly report for me…"}
  ],
  "temperature": 0.2,
  "max_tokens": 1024,
  "stream": false
}`;

  const responseJson = !row.ok
    ? `{
  "error": {
    "type": "${row.error}",
    "message": "${row.error === "rate_limit_exceeded" ? "Rate limit exceeded for organization on tokens-per-minute (TPM)" : row.error === "upstream_timeout" ? "Upstream provider did not respond within 30s" : row.error === "upstream_error" ? "Provider returned 500" : "Required field 'messages' is missing"}",
    "provider": "${row.provider}",
    "provider_request_id": "req_${row.id.slice(-8)}_up"
  }
}`
    : type === "image"
    ? `{
  "id": "img_${row.id.replace("req_","")}",
  "created": 1747497120,
  "model": "${row.model}",
  "data": [
    { "url": "https://relay.gateway/cdn/img/….png", "size": "1024×1024" }
  ],
  "usage": { "images": ${row.count}, "size": "1024×1024" }
}`
    : type === "video"
    ? `{
  "id": "task_${row.id.replace("req_","")}",
  "object": "video.task",
  "model": "${row.model}",
  "status": "succeeded",
  "created": 1747497032,
  "finished": 1747497074,
  "result": {
    "url": "https://relay.gateway/cdn/vid/….mp4",
    "duration": ${row.duration}, "fps": 30, "resolution": "1920×1080"
  },
  "usage": { "seconds": ${row.duration} }
}`
    : `{
  "id": "chatcmpl_${row.id.replace("req_","")}",
  "object": "chat.completion",
  "created": 1747497120,
  "model": "${row.model}",
  "choices": [{
    "index": 0,
    "message": {"role":"assistant","content":"In Q1 2026 revenue grew 18% YoY to $42.1M …"},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": ${row.pt},
    "completion_tokens": ${row.ct},
    "total_tokens": ${row.total}
  }
}`;

  return (
    <Drawer wide open={!!row} onClose={onClose}
      title={
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{row.id}</span>
          <StatusBadge status={row.status} ok={row.ok} />
        </span>
      }
      sub={`${row.time} · ${row.model}`}
      footer={
        <>
          <button className="btn ghost"><Icon name="copy" size={12} /> Copy request</button>
          <button className="btn"><Icon name="external" size={12} /> Open in Playground</button>
        </>
      }
    >
      {/* summary strip */}
      <div className="dl" style={{ gridTemplateColumns: "auto 1fr auto 1fr", gap: "8px 18px" }}>
        <dt>Type</dt><dd><TypeBadge type={type} /></dd>
        <dt>Model</dt><dd>{row.model}</dd>
        <dt>Provider</dt><dd><ProviderTag provider={row.provider} /></dd>
        <dt>API key</dt><dd>{row.key} <span style={{ color: "var(--fg-faint)" }}>· {row.keyPrefix}</span></dd>
        <dt>Latency</dt><dd>{row.latency >= 1000 ? `${(row.latency/1000).toFixed(1)}s` : `${row.latency} ms`}</dd>
        <dt>Cost</dt><dd>${row.cost.toFixed(4)}</dd>
        {type === "text" && <>
          <dt>Prompt</dt><dd>{row.pt.toLocaleString()} tokens</dd>
          <dt>Completion</dt><dd>{row.ct.toLocaleString()} tokens</dd>
        </>}
        {type === "image" && <>
          <dt>Images</dt><dd>{row.count}</dd>
          <dt>Size</dt><dd>1024×1024</dd>
        </>}
        {type === "video" && <>
          <dt>Duration</dt><dd>{row.duration}s @ 30fps</dd>
          <dt>Task state</dt><dd><TaskState state={row.ok ? "succeeded" : "failed"} /></dd>
        </>}
      </div>

      {row.ok && type !== "text" && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Generated output</div>
          <div style={{ maxWidth: type === "video" ? 380 : 240 }}>
            <MediaPreview
              type={type}
              prompt={type === "image" ? "Editorial portrait of a marathon runner…" : "Drone flyover of a coastline at dawn…"}
              hue={type === "image" ? 18 : 195}
              size={type === "video" ? "1920×1080" : "1024×1024"}
              duration={row.duration}
              aspect={type === "video" ? "aspect-16-9" : "aspect-1-1"}
            />
          </div>
        </div>
      )}

      {!row.ok && (
        <div style={{ marginTop: 16 }}>
          <Banner tone="danger" title={row.error}>
            {row.status === "429" && <>The upstream provider returned a rate limit. Relay did <strong>not</strong> retry. Your key was not charged.</>}
            {row.status === "500" && <>{row.provider} timed out after 30s. Relay forwarded the original error verbatim.</>}
            {row.status === "400" && <>Request shape rejected before reaching the provider. No tokens billed.</>}
          </Banner>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>
          Cost breakdown
        </div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "6px 16px", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
            {type === "text" && <>
              <span style={{ color: "var(--fg-muted)" }}>Prompt</span>
              <span>{row.pt.toLocaleString()} tok</span>
              <span style={{ color: "var(--fg-faint)" }}>× $3.00/1M</span>
              <span style={{ textAlign: "right" }}>${(row.pt * 3 / 1e6).toFixed(4)}</span>
              <span style={{ color: "var(--fg-muted)" }}>Completion</span>
              <span>{row.ct.toLocaleString()} tok</span>
              <span style={{ color: "var(--fg-faint)" }}>× $15.00/1M</span>
              <span style={{ textAlign: "right" }}>${(row.ct * 15 / 1e6).toFixed(4)}</span>
            </>}
            {type === "image" && <>
              <span style={{ color: "var(--fg-muted)" }}>Images generated</span>
              <span>{row.count}</span>
              <span style={{ color: "var(--fg-faint)" }}>× $0.04 / image</span>
              <span style={{ textAlign: "right" }}>${(row.count * 0.04).toFixed(4)}</span>
              <span style={{ color: "var(--fg-muted)" }}>Size</span>
              <span>1024×1024</span>
              <span style={{ color: "var(--fg-faint)" }}>flat</span>
              <span style={{ textAlign: "right" }}>—</span>
            </>}
            {type === "video" && <>
              <span style={{ color: "var(--fg-muted)" }}>Duration</span>
              <span>{row.duration}s</span>
              <span style={{ color: "var(--fg-faint)" }}>× $0.35 / second</span>
              <span style={{ textAlign: "right" }}>${(row.duration * 0.35).toFixed(4)}</span>
              <span style={{ color: "var(--fg-muted)" }}>Resolution</span>
              <span>1920×1080</span>
              <span style={{ color: "var(--fg-faint)" }}>included</span>
              <span style={{ textAlign: "right" }}>—</span>
            </>}

            <span style={{ borderTop: "1px solid var(--border)", paddingTop: 6, color: "var(--fg)" }}>Total</span>
            <span style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}></span>
            <span style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}></span>
            <span style={{ borderTop: "1px solid var(--border)", paddingTop: 6, textAlign: "right", color: "var(--fg)" }}>${row.cost.toFixed(4)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="tabs">
          <div className="tab active">Request</div>
          <div className="tab">Response</div>
          <div className="tab">Raw usage</div>
          <div className="tab">Headers</div>
        </div>
        <Code lang="json" code={requestJson} />
        <div style={{ height: 12 }} />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>
          Response {row.ok ? "(200)" : `(${row.status})`}
        </div>
        <Code lang="json" code={responseJson} />
      </div>
    </Drawer>
  );
}

function UsageLogs() {
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all"); // all | ok | err
  const [typeFilter, setTypeFilter] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [provider, setProvider] = useState(null);
  const [model, setModel] = useState(null);
  const [keyFilter, setKeyFilter] = useState(null);
  const [range, setRange] = useState("24h"); // 1h | 24h | 7d | 30d
  const [search, setSearch] = useState("");

  // Use real taskStatus from data (set on MEDIA_LOGS); fall back to deriving for older rows.
  function rowTaskStatus(r) {
    if (r.taskStatus !== undefined && r.taskStatus !== null) return r.taskStatus;
    if (r.type !== "video") return null;
    return r.ok ? "succeeded" : "failed";
  }

  const rows = (window.GW_DATA.LOGS_ALL || window.GW_DATA.LOGS).filter(r => {
    if (statusFilter === "ok" && !r.ok) return false;
    if (statusFilter === "err" && r.ok) return false;
    if (typeFilter && (r.type || "text") !== typeFilter) return false;
    if (taskStatus && rowTaskStatus(r) !== taskStatus) return false;
    if (provider && r.provider !== provider) return false;
    if (model && r.model !== model) return false;
    if (keyFilter && r.key !== keyFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(r.model.includes(s) || r.id.includes(s) || r.key.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  return (
    <div className="page-body">
      <PageHeader
        title="Usage / Logs"
        sub="Every request made through Relay, with raw request/response and cost breakdown. Retained for 14 days."
        right={
          <>
            <div className="pg-mode-tabs" style={{ marginRight: 4 }}>
              {[
                ["1h", "1h"], ["24h", "24h"], ["7d", "7d"], ["30d", "30d"],
              ].map(([v, l]) => (
                <span key={v} className={`mt ${range === v ? "active" : ""}`} onClick={() => setRange(v)} style={{ padding: "4px 10px", fontSize: 11.5 }}>{l}</span>
              ))}
            </div>
            <button className="btn sm"><Icon name="download" size={12} /> Export</button>
            <button className="btn sm"><Icon name="refresh" size={12} /> Auto-refresh</button>
          </>
        }
      />

      <div className="kpi-grid">
        <KpiTile label="Requests"   value="1,284" delta="8.2%" deltaDir="up" spark={[40,50,38,60,75,58,72,80,95,88,110,130]} />
        <KpiTile label="Success"    value="99.6%" sub="5 failed" spark={[99.2,99.4,99.7,99.5,99.6,99.6,99.7,99.6,99.6,99.5,99.6,99.6]} />
        <KpiTile label="Avg latency" value="640 ms" delta="−4%" deltaDir="down" sub="p95 1.8s" spark={[800,720,680,700,650,640,620,640,650,630,640,640]} />
        <KpiTile label="Cost" value="$3.92" sub="$48.91 MTD" spark={[10,14,18,16,22,20,24,28,30,33,36,41]} />
      </div>

      <div className="filter-bar" style={{ marginTop: 14 }}>
        <div className="filter-search">
          <Icon name="search" size={13} />
          <input placeholder="Search by request id, model, or key…" value={search} onChange={e => setSearch(e.target.value)} />
          <span className="kbd">/</span>
        </div>
        <span style={{ color: "var(--fg-faint)", fontSize: 12, padding: "0 6px" }}>filter:</span>
        {[
          ["all", "All"],
          ["ok", "Success"],
          ["err", "Errors"],
        ].map(([v, lbl]) => (
          <button
            key={v}
            className={`filter-chip ${statusFilter === v ? "active" : ""}`}
            onClick={() => setStatusFilter(v)}
          >
            {v === "ok" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />}
            {v === "err" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)" }} />}
            {lbl}
          </button>
        ))}
        <span style={{ color: "var(--fg-faint)", fontSize: 12, padding: "0 6px 0 4px" }}>type:</span>
        {[
          ["text", "Text", "logs"],
          ["image", "Image", "image"],
          ["video", "Video", "video"],
        ].map(([v, lbl, ic]) => (
          <button
            key={v}
            className={`filter-chip ${typeFilter === v ? "active" : ""}`}
            onClick={() => setTypeFilter(typeFilter === v ? null : v)}
          >
            <Icon name={ic} size={11} />
            {lbl}
          </button>
        ))}
        <Dropdown
          label="Provider"
          value={provider}
          onChange={setProvider}
          options={[
            { v: "openai",    l: "OpenAI" },
            { v: "anthropic", l: "Anthropic" },
            { v: "gemini",    l: "Gemini" },
            { v: "xai",       l: "xAI · Grok" },
            { v: "veo",       l: "Google Veo" },
          ]}
        />
        <Dropdown
          label="Model"
          value={model}
          onChange={setModel}
          options={window.GW_DATA.MODELS.map(m => ({ v: m.name, l: m.name }))}
        />
        <Dropdown
          label="API key"
          value={keyFilter}
          onChange={setKeyFilter}
          options={window.GW_DATA.KEYS.map(k => ({ v: k.name, l: k.name }))}
        />
        <Dropdown
          label="Task status"
          value={taskStatus}
          onChange={setTaskStatus}
          options={[
            { v: "queued",    l: "queued" },
            { v: "running",   l: "running" },
            { v: "succeeded", l: "succeeded" },
            { v: "failed",    l: "failed" },
          ]}
        />
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>
          {rows.length} of 1,284 shown
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Time</th>
              <th>Request</th>
              <th>Type</th>
              <th>Model</th>
              <th>Provider</th>
              <th>Key</th>
              <th className="num">Usage</th>
              <th className="num">Cost</th>
              <th className="num">Latency</th>
              <th>HTTP</th>
              <th>Task</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={11}>
                <EmptyState
                  icon="search"
                  title="No requests match these filters"
                  desc="Try widening the time range or clearing a filter."
                  actions={<button className="btn sm" onClick={() => { setStatusFilter("all"); setTypeFilter(null); setTaskStatus(null); setProvider(null); setModel(null); setKeyFilter(null); setSearch(""); }}>Clear filters</button>}
                />
              </td></tr>
            ) : rows.map((r, i) => {
              const t = r.type || "text";
              const ts = rowTaskStatus(r);
              return (
                <tr key={i} className="clickable" onClick={() => setSelected(r)}>
                  <td className="mono dim">{r.time}</td>
                  <td className="mono">{r.id}</td>
                  <td><TypeBadge type={t} /></td>
                  <td className="mono">{r.model}</td>
                  <td><ProviderTag provider={r.provider} /></td>
                  <td className="dim">{r.key}</td>
                  <td className="num">
                    {t === "text"  && <>{r.total.toLocaleString()} <span style={{ color: "var(--fg-faint)" }}>tok</span></>}
                    {t === "image" && <>{r.count} <span style={{ color: "var(--fg-faint)" }}>img</span></>}
                    {t === "video" && <>{r.duration} <span style={{ color: "var(--fg-faint)" }}>sec</span></>}
                  </td>
                  <td className="num">${r.cost.toFixed(4)}</td>
                  <td className="num">{r.latency >= 1000 ? `${(r.latency/1000).toFixed(1)}s` : `${r.latency}ms`}</td>
                  <td><StatusBadge status={r.status} ok={r.ok} /></td>
                  <td>{ts ? <TaskState state={ts} /> : <span style={{ color: "var(--fg-dim)" }}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <LogDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
window.UsageLogs = UsageLogs;

/* tiny inline dropdown component */
function Dropdown({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    function click(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);
  const cur = options.find(o => o.v === value);
  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        className={`filter-chip ${value ? "active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <span className="key">{label}:</span>
        <span>{cur ? cur.l : "any"}</span>
        {value && <span className="x" onClick={(e) => { e.stopPropagation(); onChange(null); }}>×</span>}
        <Icon name="chevron" size={10} style={{ transform: "rotate(90deg)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          minWidth: 200, background: "var(--surface)", border: "1px solid var(--border-strong)",
          borderRadius: 8, zIndex: 50, padding: 4, maxHeight: 280, overflow: "auto",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.6)"
        }}>
          {options.map(o => (
            <div
              key={o.v}
              style={{
                padding: "6px 10px", borderRadius: 4,
                background: value === o.v ? "var(--surface-3)" : "transparent",
                fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              }}
              onMouseDown={() => { onChange(o.v); setOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={e => e.currentTarget.style.background = value === o.v ? "var(--surface-3)" : "transparent"}
            >
              {o.l}
              {value === o.v && <Icon name="check" size={12} className="" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
window.Dropdown = Dropdown;
