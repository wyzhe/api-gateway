/* Generations — gallery of image + video tasks. Filterable. */

function GenerationsPage() {
  const [typeF, setTypeF] = useState(null);    // image | video
  const [statusF, setStatusF] = useState(null); // queued | running | succeeded | failed
  const [view, setView] = useState("grid");    // grid | table
  const [selected, setSelected] = useState(null);

  const all = window.GW_DATA.GENERATIONS;
  const items = all.filter(g => {
    if (typeF && g.type !== typeF) return false;
    if (statusF && g.status !== statusF) return false;
    return true;
  });

  const counts = {
    total:    all.length,
    image:    all.filter(g => g.type === "image").length,
    video:    all.filter(g => g.type === "video").length,
    running:  all.filter(g => g.status === "running").length,
    failed:   all.filter(g => g.status === "failed").length,
  };

  return (
    <div className="page-body">
      <PageHeader
        title="Generations"
        sub="Every image and video your team has generated. Click a tile to inspect the request, copy the URL, or download."
        right={
          <>
            <Badge tone="muted">14-day retention</Badge>
            <button className="btn sm"><Icon name="download" size={12} /> Export</button>
          </>
        }
      />

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 14 }}>
        <KpiTile label="Total generations"   value={String(counts.total)} sub="this month" />
        <KpiTile label="Images"               value={String(counts.image)} sub="$28.40 spent" />
        <KpiTile label="Videos"               value={String(counts.video)} sub="$19.10 spent" />
        <KpiTile label="In-flight"            value={String(counts.running + (all.filter(g=>g.status==="queued").length))} sub={`${counts.failed} failed in 24h`} />
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Icon name="search" size={13} />
          <input placeholder="Search prompt, model, or request id…" />
        </div>

        <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>type:</span>
        {[["image", "Image", "image"], ["video", "Video", "video"]].map(([v, l, ic]) => (
          <button key={v} className={`filter-chip ${typeF === v ? "active" : ""}`} onClick={() => setTypeF(typeF === v ? null : v)}>
            <Icon name={ic} size={11} />{l}
          </button>
        ))}
        <span style={{ fontSize: 12, color: "var(--fg-faint)", marginLeft: 8 }}>status:</span>
        {["queued","running","succeeded","failed"].map(s => (
          <button key={s} className={`filter-chip ${statusF === s ? "active" : ""}`} onClick={() => setStatusF(statusF === s ? null : s)}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: s === "succeeded" ? "var(--success)" : s === "running" ? "var(--info)" : s === "failed" ? "var(--danger)" : "var(--fg-faint)"
            }} />
            {s}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: 0, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginRight: 10 }}>
            {items.length} of {all.length}
          </span>
          <div className="pg-mode-tabs">
            <span className={`mt ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")}><Icon name="image" size={11} /> Grid</span>
            <span className={`mt ${view === "table" ? "active" : ""}`} onClick={() => setView("table")}><Icon name="logs" size={11} /> Table</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card"><EmptyState icon="image" title="No generations match these filters" desc="Try clearing the type or status filter." actions={<button className="btn sm" onClick={() => { setTypeF(null); setStatusF(null); }}>Clear filters</button>} /></div>
      ) : view === "grid" ? (
        <div className="gen-grid">
          {items.map(g => (
            <div key={g.id} className="gen-card" onClick={() => setSelected(g)} style={{ cursor: "pointer" }}>
              <MediaPreview
                type={g.type}
                prompt={g.prompt}
                hue={g.hue}
                size={g.size}
                duration={g.duration}
                status={g.status}
                aspect={g.type === "video" ? "aspect-16-9" : "aspect-1-1"}
              />
              <div className="gen-foot">
                <div className="gen-prompt">{g.prompt}</div>
                <div className="gen-meta">
                  <TypeBadge type={g.type} />
                  <span className="mono" style={{ color: "var(--fg-muted)" }}>{g.model}</span>
                  <span style={{ marginLeft: "auto" }}>{g.created}</span>
                </div>
                <div className="gen-meta">
                  <TaskState state={g.status} />
                  <span style={{ marginLeft: "auto" }}>${g.cost.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Preview</th>
                <th>Prompt</th>
                <th>Type</th>
                <th>Model</th>
                <th>Status</th>
                <th>Size / Duration</th>
                <th className="num">Cost</th>
                <th>Created</th>
                <th>Request ID</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(g => (
                <tr key={g.id} className="clickable" onClick={() => setSelected(g)}>
                  <td><div style={{ width: 56 }}><MediaPreview type={g.type} prompt={g.prompt} hue={g.hue} size={g.size} duration={g.duration} status={g.status} aspect={g.type === "video" ? "aspect-16-9" : "aspect-1-1"} /></div></td>
                  <td style={{ maxWidth: 360, whiteSpace: "normal", color: "var(--fg-muted)" }}>{g.prompt}</td>
                  <td><TypeBadge type={g.type} /></td>
                  <td className="mono">{g.model}</td>
                  <td><TaskState state={g.status} /></td>
                  <td className="mono dim">{g.type === "video" ? `${g.duration}s · ${g.size}` : g.size}</td>
                  <td className="num">${g.cost.toFixed(2)}</td>
                  <td className="dim">{g.created}</td>
                  <td className="mono dim">{g.requestId}</td>
                  <td>
                    <div className="row-action" style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                      <button className="btn ghost sm" title="Download"><Icon name="download" size={11} /></button>
                      <button className="btn ghost sm" title="Copy URL"><Icon name="copy" size={11} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GenerationDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
window.GenerationsPage = GenerationsPage;

function GenerationDrawer({ item, onClose }) {
  if (!item) return null;
  return (
    <Drawer wide open={!!item} onClose={onClose}
      title={<span style={{ display: "flex", gap: 10, alignItems: "center" }}><span>{item.id}</span><TaskState state={item.status} /></span>}
      sub={`${item.created} · ${item.model}`}
      footer={
        <>
          <button className="btn ghost"><Icon name="copy" size={12} /> Copy URL</button>
          <button className="btn"><Icon name="download" size={12} /> Download</button>
        </>
      }
    >
      <div style={{ maxWidth: item.type === "video" ? "100%" : 360, margin: "0 auto" }}>
        <MediaPreview type={item.type} prompt={item.prompt} hue={item.hue} size={item.size} duration={item.duration} status={item.status} aspect={item.type === "video" ? "aspect-16-9" : "aspect-1-1"} />
      </div>

      <div className="dl" style={{ marginTop: 16, gridTemplateColumns: "auto 1fr auto 1fr", gap: "8px 18px" }}>
        <dt>Type</dt><dd><TypeBadge type={item.type} /></dd>
        <dt>Model</dt><dd>{item.model}</dd>
        <dt>{item.type === "video" ? "Resolution" : "Size"}</dt><dd>{item.size}</dd>
        {item.type === "video" && <><dt>Duration</dt><dd>{item.duration}s @ 30fps</dd></>}
        <dt>Render time</dt><dd>{item.secs}s</dd>
        <dt>Cost</dt><dd>${item.cost.toFixed(4)}</dd>
        <dt>User</dt><dd>{item.user}</dd>
        <dt>API key</dt><dd>{item.key}</dd>
        <dt>Request ID</dt><dd className="mono">{item.requestId}</dd>
        <dt>Created</dt><dd>{item.created}</dd>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Prompt</div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "var(--fg)", lineHeight: 1.55 }}>
          {item.prompt}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Raw response</div>
        <Code lang="json" code={item.type === "video"
          ? `{
  "id": "task_${item.id.slice(-8)}",
  "object": "video.task",
  "model": "${item.model}",
  "status": "${item.status}",
  "result": ${item.status === "succeeded" ? `{
    "url": "https://relay.gateway/cdn/vid/${item.id.slice(-8)}.mp4",
    "duration": ${item.duration}, "fps": 30, "resolution": "${item.size}"
  }` : "null"},
  "usage": { "seconds": ${item.duration} }
}`
          : `{
  "id": "img_${item.id.slice(-8)}",
  "object": "image.generation",
  "model": "${item.model}",
  "data": [{ "url": "https://relay.gateway/cdn/img/${item.id.slice(-8)}.png", "size": "${item.size}" }],
  "usage": { "images": 1, "size": "${item.size}" }
}`} />
      </div>
    </Drawer>
  );
}
