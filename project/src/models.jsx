/* Models page + detail view */

function ModelsPage({ publicMode }) {
  const [providerF, setProviderF] = useState(null);
  const [typeF, setTypeF] = useState(null);
  const [sortBy, setSortBy] = useState("provider");
  const [caps, setCaps] = useState({});
  const [selected, setSelected] = useState(null);

  let models = window.GW_DATA.MODELS.slice();
  if (providerF) models = models.filter(m => m.provider === providerF);
  if (typeF) models = models.filter(m => m.type === typeF);
  Object.entries(caps).forEach(([k, v]) => {
    if (!v) return;
    models = models.filter(m =>
      (m.capabilities && m.capabilities.includes(k)) ||
      (k === "vision" && m.vision) ||
      (k === "tools" && m.tools) ||
      (k === "stream" && m.stream)
    );
  });

  if (sortBy === "price-asc")  models.sort((a, b) => priceFloor(a) - priceFloor(b));
  if (sortBy === "price-desc") models.sort((a, b) => priceFloor(b) - priceFloor(a));
  if (sortBy === "ctx")        models.sort((a, b) => (b.ctx || 0) - (a.ctx || 0));

  return (
    <div className="page-body">
      <PageHeader
        title="Models"
        sub="Text, image, and video models routed through Relay. Prices reflect what your team is billed."
        right={
          publicMode
            ? <>
                <Badge tone="muted">{window.GW_DATA.MODELS.length} models · 5 providers</Badge>
                <button className="btn primary sm">Request access <Icon name="arrow" size={12} /></button>
              </>
            : <>
                <Badge tone="muted">{window.GW_DATA.MODELS.length} models · 5 providers</Badge>
                <button className="btn sm"><Icon name="refresh" size={12} /> Refresh prices</button>
              </>
        }
      />

      {publicMode && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info" title="You're browsing the public catalog">
            Anyone can read prices and capabilities. To actually call these models, you need a Relay API key — issued by your admin after access is granted.
          </Banner>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-search">
          <Icon name="search" size={13} />
          <input placeholder="Filter models…" />
        </div>
        <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>type:</span>
        {[
          ["text", "Text", "logs"],
          ["image", "Image", "image"],
          ["video", "Video", "video"],
        ].map(([v, l, ic]) => (
          <button
            key={v}
            className={`filter-chip ${typeF === v ? "active" : ""}`}
            onClick={() => setTypeF(typeF === v ? null : v)}
          >
            <Icon name={ic} size={11} />
            {l}
          </button>
        ))}
        <span style={{ fontSize: 12, color: "var(--fg-faint)", marginLeft: 8 }}>provider:</span>
        {[
          ["openai", "OpenAI"],
          ["anthropic", "Anthropic"],
          ["gemini", "Gemini"],
          ["xai", "xAI"],
          ["veo", "Veo"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={`filter-chip ${providerF === v ? "active" : ""}`}
            onClick={() => setProviderF(providerF === v ? null : v)}
          >
            <span className="prov-swatch" style={{ background: `var(--${v})` }} />
            {l}
          </button>
        ))}
        <span style={{ fontSize: 12, color: "var(--fg-faint)", marginLeft: 8 }}>capability:</span>
        {[
          ["vision", "Vision"], ["tools", "Tools"], ["stream", "Streaming"],
          ["image-to-image", "img→img"], ["image-to-video", "img→vid"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`filter-chip ${caps[k] ? "active" : ""}`}
            onClick={() => setCaps({ ...caps, [k]: !caps[k] })}
          >{l}</button>
        ))}
        <select
          className="filter-chip"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{ marginLeft: "auto", appearance: "none", paddingRight: 24 }}
        >
          <option value="provider">Sort by provider</option>
          <option value="price-asc">Price ↑ (cheapest)</option>
          <option value="price-desc">Price ↓</option>
          <option value="ctx">Context window</option>
        </select>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Type</th>
              <th>Provider</th>
              <th>Capability / Limit</th>
              <th className="num">Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {models.map(m => (
              <tr key={m.id} className="clickable" onClick={() => setSelected(m)}>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="mono">{m.name}</span>
                    <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>{m.desc}</span>
                  </div>
                </td>
                <td><TypeBadge type={m.type} /></td>
                <td><ProviderTag provider={m.provider} /></td>
                <td className="dim">
                  {m.type === "text" && (
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="mono">{(m.ctx/1000).toLocaleString()}k ctx</span>
                      {m.vision && <Badge tone="muted">vision</Badge>}
                      {m.tools && <Badge tone="muted">tools</Badge>}
                      {m.stream && <Badge tone="muted">stream</Badge>}
                    </span>
                  )}
                  {m.type === "image" && (
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="mono">≤ {m.maxSize}</span>
                      {m.capabilities.map(c => <Badge key={c} tone="muted">{c}</Badge>)}
                    </span>
                  )}
                  {m.type === "video" && (
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="mono">≤ {m.maxDuration}s {m.maxResolution}</span>
                      {m.capabilities.map(c => <Badge key={c} tone="muted">{c}</Badge>)}
                    </span>
                  )}
                </td>
                <td className="num">
                  <PricingTag model={m} />
                </td>
                <td>
                  {m.status === "ok" && <Badge tone="success" dot>operational</Badge>}
                  {m.status === "warn" && <Badge tone="warn" dot>degraded</Badge>}
                  {m.status === "down" && <Badge tone="danger" dot>offline</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModelDetailDrawer model={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
window.ModelsPage = ModelsPage;

/* lower is cheaper — used for sort */
function priceFloor(m) {
  if (m.pricingMode === "per_token") return m.input;
  if (m.pricingMode === "per_image") return m.perImage * 25;
  if (m.pricingMode === "per_second") return m.perSecond * 100;
  return 1e9;
}

function ModelDetailDrawer({ model, onClose }) {
  if (!model) return null;
  const codeLang = model.type === "video" ? "curl" : "python";
  const py = model.type === "image"
    ? `client.images.generate(
    model="${model.name}",
    prompt="a tasteful product shot…",
    size="${model.maxSize}",
    n=1,
)`
    : model.type === "video"
    ? `# Video API is Relay's HTTP task surface — no OpenAI SDK helper.
# 1) Create the task
curl https://api.relay.gateway/v1/videos/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model.name}",
    "prompt": "a 6s cinematic city flyover…",
    "duration": 6,
    "resolution": "${model.maxResolution === "1080p" ? "1920x1080" : "1280x720"}"
  }'

# 2) Poll until task.status is "succeeded" or "failed"
curl https://api.relay.gateway/v1/videos/tasks/$TASK_ID \\
  -H "Authorization: Bearer $RELAY_API_KEY"`
    : `client.chat.completions.create(
    model="${model.name}",
    messages=[{"role":"user","content":"Hello"}],
    ${model.stream ? "stream=True," : ""}
    ${model.tools ? 'tools=[{"type":"function","function":{"name":"get_weather","parameters":{}}}],' : ""}
)`;
  return (
    <Drawer open={!!model} onClose={onClose}
      title={<span className="mono">{model.name}</span>}
      sub={<span><ProviderTag provider={model.provider} /></span>}
    >
      <p style={{ color: "var(--fg-muted)", fontSize: 13.5, marginTop: 0 }}>{model.desc}</p>
      <div className="dl" style={{ marginTop: 14 }}>
        <dt>Type</dt><dd><TypeBadge type={model.type} /></dd>
        <dt>Provider model</dt><dd>{model.provider}/{model.name}</dd>
        {model.type === "text" && <>
          <dt>Context</dt><dd>{(model.ctx/1000).toLocaleString()}k tokens</dd>
          <dt>Input price</dt><dd>${model.input.toFixed(2)} / 1M tokens</dd>
          <dt>Output price</dt><dd>${model.output.toFixed(2)} / 1M tokens</dd>
          <dt>Capabilities</dt><dd>{[model.vision && "vision", model.tools && "tools", model.stream && "stream"].filter(Boolean).join(", ") || "text"}</dd>
        </>}
        {model.type === "image" && <>
          <dt>Max size</dt><dd>{model.maxSize}</dd>
          <dt>Price</dt><dd>${model.perImage.toFixed(2)} / image</dd>
          <dt>Capabilities</dt><dd>{model.capabilities.join(", ")}</dd>
        </>}
        {model.type === "video" && <>
          <dt>Max duration</dt><dd>{model.maxDuration}s</dd>
          <dt>Max resolution</dt><dd>{model.maxResolution}</dd>
          <dt>Price</dt><dd>${model.perSecond.toFixed(2)} / second</dd>
          <dt>Capabilities</dt><dd>{model.capabilities.join(", ")}</dd>
        </>}
        <dt>Status</dt><dd>{model.status === "ok" ? "operational" : model.status === "warn" ? "degraded" : "offline"}</dd>
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 6 }}>
          Call this model
        </div>
        <Code lang={codeLang} code={py} />
      </div>
    </Drawer>
  );
}
