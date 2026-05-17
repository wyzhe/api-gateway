/* Playground — Chat / Image / Video modes
   Same 3-column shell across all modes; the contents of each panel swap. */

function Playground() {
  const [mode, setMode] = useState("chat"); // chat | image | video

  return (
    <div style={{ padding: "14px 24px 24px" }}>
      <div className="page-header" style={{ marginBottom: 18, alignItems: "center" }}>
        <div>
          <div className="title">Playground</div>
          <div className="sub">A request builder, not a chat app. Build a call, run it, copy the curl.</div>
        </div>
        <div className="right" style={{ gap: 12 }}>
          <div className="pg-mode-tabs">
            <span className={`mt ${mode === "chat" ? "active" : ""}`} onClick={() => setMode("chat")}>
              <Icon name="logs" size={12} /> Chat
            </span>
            <span className={`mt image ${mode === "image" ? "active" : ""}`} onClick={() => setMode("image")}>
              <Icon name="image" size={12} /> Image
            </span>
            <span className={`mt video ${mode === "video" ? "active" : ""}`} onClick={() => setMode("video")}>
              <Icon name="video" size={12} /> Video
            </span>
          </div>
          <Badge tone="muted">Uses your live key</Badge>
        </div>
      </div>

      {mode === "chat"  && <PlaygroundChat />}
      {mode === "image" && <PlaygroundImage />}
      {mode === "video" && <PlaygroundVideo />}
    </div>
  );
}
window.Playground = Playground;

/* ---------------- Chat mode (the previous Playground) ---------------- */
function PlaygroundChat() {
  const [model, setModel] = useState("claude-sonnet-4.5");
  const [system, setSystem] = useState("You are a careful, concise assistant. Reply in markdown.");
  const [userMsg, setUserMsg] = useState("Summarize what an OpenAI-compatible API gateway does in 3 bullets.");
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [stream, setStream] = useState(true);

  const out = `## What it does

- Translates one request shape (OpenAI's) into the native format of each provider you've configured.
- Centralizes API key issuance, spend caps, and request logs across your team.
- Reports per-request token usage and cost the moment the call finishes.`;
  const usage = { pt: 184, ct: 124, lat: 612, cost: 0.0028 };

  return (
    <div className="pg">
      <div className="pg-panel">
        <div className="pg-panel-head">
          <span className="title">Request</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>POST /v1/chat/completions</span>
        </div>
        <div className="pg-panel-body">
          <div className="pg-field">
            <label className="label">Model</label>
            <select className="select" value={model} onChange={e => setModel(e.target.value)}>
              {["openai","anthropic","gemini"].map(p => (
                <optgroup key={p} label={p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : "Gemini"}>
                  {window.GW_DATA.TEXT_MODELS.filter(m => m.provider === p).map(m => <option key={m.id}>{m.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="pg-field">
            <label className="label">API key</label>
            <select className="select">
              <option>production-web — rl_live_4xK…9aT2</option>
              <option>staging — rl_test_2hL…q8R4</option>
            </select>
          </div>
          <div className="pg-field">
            <label className="label">Temperature <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{temperature.toFixed(2)}</span></label>
            <input className="pg-slider" type="range" min="0" max="2" step="0.05" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
          </div>
          <div className="pg-field">
            <label className="label">Max tokens</label>
            <input className="input mono" value={maxTokens} onChange={e => setMaxTokens(e.target.value)} />
          </div>
          <div className="pg-field">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label className="label" style={{ margin: 0 }}>Stream (SSE)</label>
              <Toggle on={stream} onChange={setStream} />
            </div>
          </div>
          <div className="pg-field">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label className="label" style={{ margin: 0 }}>Tools enabled</label>
              <Toggle on={false} onChange={() => {}} />
            </div>
          </div>
          <div className="pg-field">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label className="label" style={{ margin: 0 }}>JSON mode</label>
              <Toggle on={false} onChange={() => {}} />
            </div>
          </div>
        </div>
      </div>

      <div className="pg-panel">
        <div className="pg-panel-head">
          <span className="title">Messages</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn sm"><Icon name="play" size={11} /> Run</button>
            <button className="btn sm ghost"><Icon name="refresh" size={11} /> Clear</button>
          </div>
        </div>
        <div className="pg-panel-body">
          <div className="pg-field">
            <label className="label">System</label>
            <textarea className="textarea" value={system} onChange={e => setSystem(e.target.value)} />
          </div>
          <div className="pg-field">
            <label className="label">User</label>
            <textarea className="textarea" value={userMsg} onChange={e => setUserMsg(e.target.value)} style={{ minHeight: 90 }} />
          </div>
          <div className="pg-field">
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <label className="label" style={{ margin: 0 }}>Assistant</label>
              <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-faint)", fontFamily: "var(--font-mono)" }}>
                {usage.pt} in · {usage.ct} out · {usage.lat}ms · ${usage.cost.toFixed(4)}
              </div>
            </div>
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", minHeight: 160, fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{out}</div>
          </div>
        </div>
      </div>

      <div className="pg-panel">
        <div className="pg-panel-head"><span className="title">Reproduce</span></div>
        <div className="pg-panel-body">
          <Code lang="curl" code={`curl https://api.relay.gateway/v1/chat/completions \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [
      {"role":"system","content":"${system.slice(0,32)}…"},
      {"role":"user","content":"${userMsg.slice(0,32)}…"}
    ],
    "temperature": ${temperature},
    "max_tokens": ${maxTokens},
    "stream": ${stream}
  }'`} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Image mode ---------------- */
function PlaygroundImage() {
  const [model, setModel] = useState("gpt-image-2");
  const [prompt, setPrompt] = useState("Editorial portrait of a marathon runner mid-stride, golden hour, photoreal, Kodak Portra grain");
  const [negPrompt, setNegPrompt] = useState("low resolution, watermark, text artifacts");
  const [size, setSize]  = useState("1024×1024");
  const [count, setCount] = useState(2);
  const [strength, setStrength] = useState(0.65);
  const [seed, setSeed] = useState("auto");
  const [style, setStyle] = useState("photoreal");
  const [quality, setQuality] = useState("standard");
  const [format, setFormat] = useState("png");
  const [apiKey, setApiKey] = useState("production-web");
  const [hasRef, setHasRef] = useState(false);
  const [rawTab, setRawTab] = useState("response");

  const m = window.GW_DATA.IMAGE_MODELS.find(x => x.id === model);
  const qMult = quality === "hd" ? 1.5 : 1;
  const cost = (m?.perImage || 0) * count * qMult;
  const samples = Array.from({ length: count }, (_, i) => ({
    hue: (18 + i * 47) % 360,
    size,
  }));

  return (
    <div className="pg">
      {/* LEFT */}
      <div className="pg-panel">
        <div className="pg-panel-head">
          <span className="title">Request</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>POST /v1/images/generations</span>
        </div>
        <div className="pg-panel-body">
          <div className="pg-field">
            <label className="label">Model</label>
            <select className="select" value={model} onChange={e => setModel(e.target.value)}>
              {window.GW_DATA.IMAGE_MODELS.map(im => <option key={im.id} value={im.id}>{im.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <ProviderTag provider={m?.provider} /> · <PricingTag model={m} /> · up to {m?.maxSize}
            </div>
          </div>

          <div className="pg-field">
            <label className="label">API key</label>
            <select className="select" value={apiKey} onChange={e => setApiKey(e.target.value)}>
              {window.GW_DATA.KEYS.filter(k => k.status === "active").map(k => (
                <option key={k.id} value={k.name}>{k.name} — {k.prefix}</option>
              ))}
            </select>
          </div>

          <div className="pg-field">
            <label className="label">Reference image <span style={{ color: "var(--fg-faint)" }}>(image-to-image)</span></label>
            {hasRef ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div style={{ width: 56 }}><MediaPreview type="image" prompt="reference.png" hue={120} size="1024×1024" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>reference.png</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>1024×1024 · 482 KB</div>
                </div>
                <button className="btn ghost sm" onClick={() => setHasRef(false)}><Icon name="x" size={12} /></button>
              </div>
            ) : (
              <div className="upload-zone" onClick={() => setHasRef(true)}>
                <Icon name="upload" size={16} className="ico" />
                <div style={{ fontSize: 12, color: "var(--fg)" }}>Drop image or click to upload</div>
                <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>PNG · JPG · WEBP · ≤ 8MB</div>
              </div>
            )}
          </div>

          <div className="pg-field">
            <label className="label">Size</label>
            <select className="select" value={size} onChange={e => setSize(e.target.value)}>
              <option>1024×1024</option>
              <option>1536×1024</option>
              <option>1024×1536</option>
              <option>2048×2048</option>
            </select>
          </div>

          <div className="pg-field">
            <label className="label">Number of images <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{count}</span></label>
            <input className="pg-slider" type="range" min="1" max="4" step="1" value={count} onChange={e => setCount(parseInt(e.target.value))} />
          </div>

          <div className="pg-field">
            <label className="label">Style</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["none","photoreal","cinematic","illustration","3d"].map(s => (
                <button key={s} className={`filter-chip ${style === s ? "active" : ""}`} onClick={() => setStyle(s)} style={{ fontSize: 11.5, padding: "4px 8px" }}>{s}</button>
              ))}
            </div>
          </div>

          <div className="pg-field">
            <label className="label">Quality</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[["standard", "Standard"], ["hd", "HD (×1.5)"]].map(([v, l]) => (
                <button key={v} className={`btn sm ${quality === v ? "primary" : ""}`} onClick={() => setQuality(v)} style={{ flex: 1 }}>{l}</button>
              ))}
            </div>
          </div>

          <div className="pg-field">
            <label className="label">Output format</label>
            <div style={{ display: "flex", gap: 4 }}>
              {["png","webp","jpg"].map(f => (
                <button key={f} className={`btn sm ${format === f ? "primary" : ""}`} onClick={() => setFormat(f)} style={{ flex: 1 }}>{f.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {hasRef && (
            <div className="pg-field">
              <label className="label">Image strength <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{strength.toFixed(2)}</span></label>
              <input className="pg-slider" type="range" min="0" max="1" step="0.05" value={strength} onChange={e => setStrength(parseFloat(e.target.value))} />
            </div>
          )}

          <div className="pg-field">
            <label className="label">Seed</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input mono" value={seed} onChange={e => setSeed(e.target.value)} />
              <button className="btn sm" onClick={() => setSeed(String(Math.floor(Math.random() * 999999)))}>random</button>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER */}
      <div className="pg-panel">
        <div className="pg-panel-head">
          <span className="title">Prompt</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>
              {count} × ${m?.perImage.toFixed(2)}{qMult !== 1 && ` × ${qMult}`} = ${cost.toFixed(2)}
            </span>
            <button className="btn primary sm"><Icon name="sparkle" size={11} /> Generate</button>
          </div>
        </div>
        <div className="pg-panel-body">
          <textarea className="textarea" value={prompt} onChange={e => setPrompt(e.target.value)} style={{ minHeight: 70, fontFamily: "var(--font-sans)", fontSize: 13 }} />
          <div className="pg-field" style={{ marginTop: 10 }}>
            <label className="label">Negative prompt</label>
            <textarea className="textarea" value={negPrompt} onChange={e => setNegPrompt(e.target.value)} style={{ minHeight: 50, fontFamily: "var(--font-sans)", fontSize: 13 }} />
          </div>

          <div style={{ marginTop: 18, display: "flex", alignItems: "center", marginBottom: 8 }}>
            <label className="label" style={{ margin: 0 }}>Output</label>
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>
              {count} image{count > 1 ? "s" : ""} · 3.2s · ${cost.toFixed(4)} · <span style={{ color: "var(--success)" }}>200</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: count === 1 ? "1fr" : "1fr 1fr", gap: 10 }}>
            {samples.map((s, i) => (
              <div key={i} style={{ position: "relative" }}>
                <MediaPreview type="image" prompt={prompt} hue={s.hue} size={size} />
                <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
                  <button className="btn ghost sm" style={{ background: "rgba(0,0,0,0.4)" }} title="Download"><Icon name="download" size={11} /></button>
                  <button className="btn ghost sm" style={{ background: "rgba(0,0,0,0.4)" }} title="Copy URL"><Icon name="copy" size={11} /></button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="tabs">
              <span className={`tab ${rawTab === "request" ? "active" : ""}`}  onClick={() => setRawTab("request")}>Raw request</span>
              <span className={`tab ${rawTab === "response" ? "active" : ""}`} onClick={() => setRawTab("response")}>Raw response</span>
            </div>
            {rawTab === "request" ? (
              <Code lang="json" code={`{
  "model": "${model}",
  "prompt": "${prompt.slice(0,50)}…",
  "negative_prompt": "${negPrompt.slice(0,40)}…",
  "size": "${size}",
  "n": ${count},
  "style": "${style}",
  "quality": "${quality}",
  "output_format": "${format}"${hasRef ? `,
  "image": "https://…/reference.png",
  "strength": ${strength}` : ""}
}`} height={170} scroll />
            ) : (
              <Code lang="json" code={`{
  "id": "img_2x9pR4kL",
  "model": "${model}",
  "created": 1747497032,
  "data": [
    { "url": "https://relay.gateway/cdn/img/abc…1.${format}", "revised_prompt": "…", "seed": ${seed === "auto" ? 482917 : seed} }${count > 1 ? `,
    { "url": "https://relay.gateway/cdn/img/abc…2.${format}", "revised_prompt": "…", "seed": 482918 }` : ""}
  ],
  "usage": { "images": ${count}, "size": "${size}", "quality": "${quality}" },
  "cost": ${cost.toFixed(4)}
}`} height={170} scroll />
            )}
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="pg-panel">
        <div className="pg-panel-head"><span className="title">Reproduce</span></div>
        <div className="pg-panel-body">
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>cURL</div>
          <Code lang="curl" code={`curl https://api.relay.gateway/v1/images/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "prompt": "${prompt.slice(0,40)}…",
    "negative_prompt": "${negPrompt.slice(0,30)}…",
    "size": "${size}",
    "n": ${count},
    "quality": "${quality}",
    "output_format": "${format}"
  }'`} />
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Python (OpenAI SDK)</div>
          <Code lang="python" code={`client.images.generate(
    model="${model}",
    prompt="${prompt.slice(0,40)}…",
    size="${size}",
    n=${count},
    quality="${quality}",
)`} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Video mode (with async task state) ---------------- */
function PlaygroundVideo() {
  const [model, setModel] = useState("veo-3.1");
  const [apiKey, setApiKey] = useState("production-web");
  const [prompt, setPrompt] = useState("Drone flyover of a coastline at dawn, gentle push-in, cinematic teal-orange grade");
  const [negPrompt, setNegPrompt] = useState("");
  const [duration, setDuration] = useState(8);
  const [resolution, setResolution] = useState("1920\u00d71080");
  const [aspect, setAspect] = useState("16:9");
  const [audio, setAudio] = useState(true);
  const [hasRef, setHasRef] = useState(true);
  const [rawTab, setRawTab] = useState("response");

  // Animate the task through queued → running → succeeded (one-shot)
  const [taskState, setTaskState] = useState("succeeded");
  const [progress, setProgress] = useState(100);

  function startGeneration() {
    setTaskState("queued"); setProgress(0);
    setTimeout(() => setTaskState("running"), 700);
    let p = 0;
    const iv = setInterval(() => {
      p += 8;
      setProgress(Math.min(p, 99));
      if (p >= 100) { clearInterval(iv); setTaskState("succeeded"); setProgress(100); }
    }, 220);
  }

  const m = window.GW_DATA.VIDEO_MODELS.find(x => x.id === model);
  const cost = (m?.perSecond || 0) * duration;
  const eta = Math.round(duration * 5.4);
  const taskId = "task_2x9pR4kL";

  return (
    <div className="pg">
      {/* LEFT */}
      <div className="pg-panel">
        <div className="pg-panel-head">
          <span className="title">Request</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>POST /v1/videos/generations</span>
        </div>
        <div className="pg-panel-body">
          <div className="pg-field">
            <label className="label">Model</label>
            <select className="select" value={model} onChange={e => setModel(e.target.value)}>
              {window.GW_DATA.VIDEO_MODELS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <ProviderTag provider={m?.provider} /> · <PricingTag model={m} /> · up to {m?.maxDuration}s {m?.maxResolution}
            </div>
          </div>

          <div className="pg-field">
            <label className="label">API key</label>
            <select className="select" value={apiKey} onChange={e => setApiKey(e.target.value)}>
              {window.GW_DATA.KEYS.filter(k => k.status === "active").map(k => (
                <option key={k.id} value={k.name}>{k.name} — {k.prefix}</option>
              ))}
            </select>
          </div>

          <div className="pg-field">
            <label className="label">Reference image <span style={{ color: "var(--fg-faint)" }}>(image-to-video)</span></label>
            {hasRef ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div style={{ width: 60 }}><MediaPreview type="image" prompt="first_frame.png" hue={200} size="1920\u00d71080" aspect="aspect-16-9" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>first_frame.png</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>1920\u00d71080 · 2.1 MB</div>
                </div>
                <button className="btn ghost sm" onClick={() => setHasRef(false)}><Icon name="x" size={12} /></button>
              </div>
            ) : (
              <div className="upload-zone" onClick={() => setHasRef(true)}>
                <Icon name="upload" size={16} className="ico" />
                <div style={{ fontSize: 12, color: "var(--fg)" }}>Drop image or click to upload</div>
                <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>Used as the first frame for image-to-video</div>
              </div>
            )}
          </div>

          <div className="pg-field">
            <label className="label">Duration <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{duration}s</span></label>
            <input className="pg-slider" type="range" min="2" max={m?.maxDuration || 30} step="1" value={duration} onChange={e => setDuration(parseInt(e.target.value))} />
          </div>

          <div className="pg-field">
            <label className="label">Resolution</label>
            <select className="select" value={resolution} onChange={e => setResolution(e.target.value)}>
              <option>1280\u00d7720</option>
              <option>1920\u00d71080</option>
              <option>1080\u00d71920</option>
            </select>
          </div>

          <div className="pg-field">
            <label className="label">Aspect</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["16:9", "9:16", "1:1"].map(a => (
                <button key={a} className={`btn sm ${aspect === a ? "primary" : ""}`} style={{ flex: 1 }} onClick={() => setAspect(a)}>{a}</button>
              ))}
            </div>
          </div>

          <div className="pg-field">
            <label className="label">Negative prompt</label>
            <textarea className="textarea" value={negPrompt} onChange={e => setNegPrompt(e.target.value)} placeholder="things you don't want in the clip" style={{ minHeight: 50 }} />
          </div>

          <div className="pg-field">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <label className="label" style={{ margin: 0 }}>Generate audio</label>
              <Toggle on={audio} onChange={setAudio} />
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>Veo 3.1 only. Native audio adds ~10% cost.</div>
          </div>
        </div>
      </div>

      {/* CENTER */}
      <div className="pg-panel">
        <div className="pg-panel-head">
          <span className="title">Prompt</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>
              {duration}s × ${m?.perSecond.toFixed(2)} = ${cost.toFixed(2)}
            </span>
            <button className="btn primary sm" onClick={startGeneration}>
              <Icon name="sparkle" size={11} /> Generate
            </button>
          </div>
        </div>
        <div className="pg-panel-body">
          <textarea className="textarea" value={prompt} onChange={e => setPrompt(e.target.value)} style={{ minHeight: 80, fontFamily: "var(--font-sans)", fontSize: 13 }} />

          <div style={{ marginTop: 18, display: "flex", alignItems: "center", marginBottom: 10 }}>
            <label className="label" style={{ margin: 0 }}>Task</label>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{taskId}</span>
              <button className="btn ghost sm" title="Copy task id"><Icon name="copy" size={11} /></button>
            </div>
          </div>

          {/* Task panel — single state, no demo controls */}
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            {taskState === "queued" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <TaskState state="queued" />
                  <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>Queued — typical wait 8–15 s, then ~{eta}s to render.</span>
                  <button className="btn ghost sm" style={{ marginLeft: "auto" }}><Icon name="x" size={11} /> Cancel</button>
                </div>
                <div className="task-progress" style={{ marginTop: 12 }}><span style={{ width: "6%" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginTop: 8 }}>
                  <span>queued {Math.round(progress / 12)}s ago</span>
                  <span>ETA ~{eta + 10}s</span>
                </div>
              </>
            )}
            {taskState === "running" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <TaskState state="running" />
                  <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>Rendering — frame {Math.round(progress * 2.4)} / {duration * 30}</span>
                  <button className="btn ghost sm" style={{ marginLeft: "auto" }}><Icon name="x" size={11} /> Cancel</button>
                </div>
                <div className="task-progress" style={{ marginTop: 12 }}><span style={{ width: progress + "%" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginTop: 8 }}>
                  <span>started {Math.round(progress / 4)}s ago</span>
                  <span>~{Math.max(1, eta - Math.round(progress / 2))}s remaining</span>
                </div>
              </>
            )}
            {taskState === "succeeded" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <TaskState state="succeeded" />
                  <span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>Completed in {eta}s · {duration * 30} frames @ 30fps · 8.2 MB</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button className="btn sm"><Icon name="download" size={11} /> mp4</button>
                    <button className="btn sm ghost"><Icon name="copy" size={11} /> URL</button>
                    <button className="btn sm ghost" onClick={startGeneration} title="Generate again with same params"><Icon name="refresh" size={11} /> Retry</button>
                  </div>
                </div>
                <div style={{ maxWidth: aspect === "9:16" ? 280 : aspect === "1:1" ? 380 : "100%" }}>
                  <MediaPreview type="video" prompt={prompt} hue={195} size={resolution} duration={duration} aspect={aspect === "9:16" ? "aspect-9-16" : aspect === "1:1" ? "aspect-1-1" : "aspect-16-9"} />
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="tabs">
              <span className={`tab ${rawTab === "request" ? "active" : ""}`}  onClick={() => setRawTab("request")}>Raw request</span>
              <span className={`tab ${rawTab === "response" ? "active" : ""}`} onClick={() => setRawTab("response")}>Raw response</span>
            </div>
            {rawTab === "request" ? (
              <Code lang="json" code={`{
  "model": "${model}",
  "prompt": "${prompt.slice(0,50)}…",
  "negative_prompt": "${negPrompt}",
  "duration": ${duration},
  "resolution": "${resolution}",
  "aspect_ratio": "${aspect}",
  "audio": ${audio}${hasRef ? `,
  "image": "https://…/first_frame.png"` : ""}
}`} height={170} scroll />
            ) : (
              <Code lang="json" code={taskState === "succeeded" ? `{
  "id": "${taskId}",
  "object": "video.task",
  "model": "${model}",
  "status": "succeeded",
  "created": 1747497032,
  "finished": 1747497074,
  "result": {
    "url": "https://relay.gateway/cdn/vid/abc…1.mp4",
    "poster_url": "https://relay.gateway/cdn/img/abc…1.jpg",
    "duration": ${duration}, "fps": 30, "resolution": "${resolution}",
    "size_bytes": 8621042,
    "expires_at": 1747583468
  },
  "usage": { "seconds": ${duration} },
  "cost": ${cost.toFixed(4)}
}` : `{
  "id": "${taskId}",
  "status": "${taskState}",
  "progress": ${progress}
}`} height={170} scroll />
            )}
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="pg-panel">
        <div className="pg-panel-head"><span className="title">Reproduce</span></div>
        <div className="pg-panel-body">
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Create task</div>
          <Code lang="curl" code={`curl https://api.relay.gateway/v1/videos/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{
    "model": "${model}",
    "prompt": "${prompt.slice(0,40)}…",
    "duration": ${duration},
    "resolution": "${resolution}",
    "aspect_ratio": "${aspect}",
    "audio": ${audio}
  }'`} />
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Poll status</div>
          <Code lang="curl" code={`curl https://api.relay.gateway/v1/videos/tasks/${taskId} \\
  -H "Authorization: Bearer $RELAY_API_KEY"`} />
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Cancel</div>
          <Code lang="curl" code={`curl -X DELETE https://api.relay.gateway/v1/videos/tasks/${taskId} \\
  -H "Authorization: Bearer $RELAY_API_KEY"`} />
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Python (requests)</div>
          <Code lang="python" code={`# Video API is Relay HTTP — no OpenAI SDK helper.
import requests, time, os

base = "https://api.relay.gateway/v1"
h = {"Authorization": f"Bearer {os.environ['RELAY_API_KEY']}"}

task = requests.post(f"{base}/videos/generations", headers=h, json={
    "model": "${model}",
    "prompt": "${prompt.slice(0,30)}…",
    "duration": ${duration},
    "resolution": "${resolution}",
}).json()

while task["status"] not in ("succeeded", "failed"):
    time.sleep(2)
    task = requests.get(f"{base}/videos/tasks/{task['id']}", headers=h).json()

print(task["result"]["url"])`} />
          <div style={{ height: 12 }} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 8 }}>Node (fetch)</div>
          <Code lang="js" code={`const base = "https://api.relay.gateway/v1";
const h = { Authorization: \`Bearer \${process.env.RELAY_API_KEY}\`, "Content-Type": "application/json" };

let task = await fetch(\`\${base}/videos/generations\`, {
  method: "POST", headers: h,
  body: JSON.stringify({ model: "${model}", prompt: "…", duration: ${duration} }),
}).then(r => r.json());

while (!["succeeded", "failed"].includes(task.status)) {
  await new Promise(r => setTimeout(r, 2000));
  task = await fetch(\`\${base}/videos/tasks/\${task.id}\`, { headers: h }).then(r => r.json());
}

console.log(task.result.url);`} />
        </div>
      </div>
    </div>
  );
}

