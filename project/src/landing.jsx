/* Landing page */

function LandingNav({ onNavigate }) {
  return (
    <div className="landing-nav">
      <div className="brand">
        <span className="brand-mark" />
        <span>Relay</span>
        <span className="landing-version">v0.4 · private beta</span>
      </div>
      <div className="links">
        <a onClick={() => onNavigate("public-models")}>Models</a>
        <a onClick={() => onNavigate("public-docs")}>Docs</a>
        <a onClick={() => onNavigate("status")}>Status</a>
        <a href="#pricing">Pricing</a>
      </div>
      <div className="right">
        <button className="btn ghost" onClick={() => onNavigate("dashboard")}>Sign in</button>
        <button className="btn primary">Request access <Icon name="arrow" /></button>
      </div>
    </div>
  );
}

/* Console preview shown in the hero — a faithful, miniaturized rendering of the Logs page */
function HeroPreview() {
  const rows = window.GW_DATA.LOGS.slice(0, 8);
  return (
    <div className="hero-preview">
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", height: 440 }}>
        {/* mini sidebar */}
        <div style={{ background: "var(--surface)", borderRight: "1px solid var(--border)", padding: "10px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 12px", borderBottom: "1px solid var(--border-soft)", marginBottom: 8 }}>
            <span className="brand-mark" style={{ width: 18, height: 18 }} />
            <span style={{ fontWeight: 600, fontSize: 12 }}>Relay</span>
          </div>
          {[
            ["dashboard", "Dashboard"],
            ["key", "API Keys"],
            ["logs", "Usage / Logs", true],
            ["play", "Playground"],
            ["billing", "Billing"],
            ["models", "Models"],
            ["docs", "Docs"],
          ].map(([ic, lbl, active], i) => (
            <div key={i} className={`nav-item ${active ? "active" : ""}`} style={{ fontSize: 12, padding: "4px 8px" }}>
              <Icon name={ic} className="nav-ico" size={12} />
              <span>{lbl}</span>
            </div>
          ))}
        </div>
        {/* mini logs */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", gap: 10, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>workspace</span>
            <span style={{ color: "var(--fg-dim)" }}>/</span>
            <span style={{ fontSize: 12 }}>Usage / Logs</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <span className="badge muted">Last 24h</span>
              <span className="badge muted">3 filters</span>
            </div>
          </div>
          <div style={{ padding: 14, display: "grid", gap: 10 }}>
            <div className="grid-4" style={{ gap: 8 }}>
              {[
                ["Requests", "12,418", "+8.2%", "up"],
                ["Tokens", "48.2M", "+12%", "up"],
                ["Cost", "$48.91", "+6.4%", "up"],
                ["Errors", "0.42%", "−0.1%", "down"],
              ].map((t, i) => (
                <div key={i} className="kpi" style={{ padding: "10px 12px" }}>
                  <div className="k-label" style={{ fontSize: 10 }}>{t[0]}</div>
                  <div className="k-value" style={{ fontSize: 17 }}>{t[1]}</div>
                  <div className="k-sub" style={{ fontSize: 10 }}><span className={`k-delta ${t[3]}`}>{t[3] === "up" ? "↑" : "↓"} {t[2]}</span></div>
                </div>
              ))}
            </div>
            <div className="table-wrap" style={{ maxHeight: 220, overflow: "hidden" }}>
              <table className="table" style={{ fontSize: 11.5 }}>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>TIME</th>
                    <th>MODEL</th>
                    <th>KEY</th>
                    <th className="num">TOK</th>
                    <th className="num">COST</th>
                    <th className="num">MS</th>
                    <th style={{ width: 50 }}>STAT</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="mono dim" style={{ padding: "6px 14px" }}>{typeof r.time === "string" && r.time.includes(":") ? r.time : r.time}</td>
                      <td style={{ padding: "6px 14px" }}><span className="mono" style={{ fontSize: 11 }}>{r.model}</span></td>
                      <td className="dim" style={{ padding: "6px 14px" }}>{r.key}</td>
                      <td className="num" style={{ padding: "6px 14px" }}>{r.total.toLocaleString()}</td>
                      <td className="num" style={{ padding: "6px 14px" }}>${r.cost.toFixed(4)}</td>
                      <td className="num" style={{ padding: "6px 14px" }}>{r.latency}</td>
                      <td style={{ padding: "6px 14px" }}><StatusBadge status={r.status} ok={r.ok} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueCard({ icon, tag, title, body }) {
  return (
    <div className="value-card">
      <div className="vc-ico"><Icon name={icon} size={14} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="tag">{tag}</div>
    </div>
  );
}

function ConsoleScreenshot({ label, children }) {
  return (
    <div className="console-shot">
      <div className="label"><Icon name="layers" size={12} />{label}</div>
      <div className="preview">{children}</div>
    </div>
  );
}

function LandingPage({ onNavigate }) {
  const quickstartCode = `# 1. Install the OpenAI SDK (no Relay SDK needed)
pip install openai

# 2. Point base_url at Relay; use your Relay key
export RELAY_API_KEY="rl_live_4xK…9aT2"`;

  const sdkPython = `from openai import OpenAI

client = OpenAI(
    base_url="https://api.relay.gateway/v1",
    api_key=os.environ["RELAY_API_KEY"],
)

resp = client.chat.completions.create(
    model="claude-sonnet-4.5",     # any provider, one shape
    messages=[{"role": "user", "content": "Hello, world."}],
)
print(resp.choices[0].message.content)`;

  const sdkJs = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.relay.gateway/v1",
  apiKey: process.env.RELAY_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "gemini-2.5-pro",
  messages: [{ role: "user", content: "Hello, world." }],
});

console.log(resp.choices[0].message.content);`;

  const sdkCurl = `curl https://api.relay.gateway/v1/chat/completions \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5-mini",
    "messages": [{"role":"user","content":"Hello, world."}]
  }'`;

  const groups = {
    openai:     window.GW_DATA.TEXT_MODELS.filter(m => m.provider === "openai"),
    anthropic:  window.GW_DATA.TEXT_MODELS.filter(m => m.provider === "anthropic"),
    gemini:     window.GW_DATA.TEXT_MODELS.filter(m => m.provider === "gemini"),
  };

  return (
    <div className="landing-page">
      <LandingNav onNavigate={onNavigate} />

      <section className="hero">
        <div className="landing-grid" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <span className="hero-eyebrow">
            <span className="tag">PRIVATE BETA</span>
            Invite-only · request access below
          </span>
          <h1>
            One <span className="accent">API gateway</span> for text,<br/>
            image, and video models.
          </h1>
          <p className="lede">
            Relay is a hosted, private-access API gateway that unifies chat completions, image generation, and video generation
            across OpenAI, Anthropic, Gemini, xAI, and Google Veo. Issue keys to engineers, run on an admin-managed balance,
            and watch every request, image, and clip in one place.
          </p>
          <div className="hero-ctas">
            <button className="btn primary lg">Request access <Icon name="arrow" /></button>
            <button className="btn lg" onClick={() => onNavigate("public-docs")}>View docs</button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-faint)", marginLeft: 8 }}>
              No public sign-up.
            </span>
          </div>
          <div className="hero-meta">
            <span className="item"><Icon name="check" size={12} /> 1 base URL · 3 APIs · 17 models · 5 providers</span>
            <span className="item"><Icon name="check" size={12} /> Chat · Image · Video</span>
            <span className="item"><Icon name="check" size={12} /> Per-key spend caps</span>
          </div>
        </div>
        <HeroPreview />
      </section>

      {/* Quickstart */}
      <section className="section" id="quickstart">
        <div className="section-eyebrow">QUICKSTART</div>
        <h2>Three endpoints. One key. One ledger.</h2>
        <p className="lede">Chat and image generation use the OpenAI request shape (drop-in for the OpenAI SDK). Video generation is async — create a task, poll until ready.</p>
        <div style={{ marginTop: 32, display: "grid", gap: 14, gridTemplateColumns: "1fr 1.4fr" }}>
          <Code code={quickstartCode} lang="bash" filename="setup.sh" />
          <Code
            tabs={[
              { lang: "python", label: "chat", code: sdkPython },
              { lang: "js", label: "image", code: `await client.images.generate({
  model: "gpt-image-2",
  prompt: "editorial portrait of a marathon runner, golden hour",
  size: "1024x1024",
  n: 2,
});` },
              { lang: "curl", label: "video", code: `# 1) create the async task
curl https://api.relay.gateway/v1/videos/generations \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{
    "model": "veo-3.1",
    "prompt": "drone flyover of a coastline at dawn",
    "duration": 8
  }'

# 2) poll until task.status in {succeeded, failed}
curl https://api.relay.gateway/v1/videos/tasks/task_2x9pR4kL \\
  -H "Authorization: Bearer $RELAY_API_KEY"` },
            ]}
          />
        </div>
      </section>

      {/* Value */}
      <section className="section" id="value">
        <div className="section-eyebrow">CAPABILITIES</div>
        <h2>One ledger across every modality.</h2>
        <p className="lede">Everything you'd build yourself if you stitched text, image, and video providers together for an internal team.</p>
        <div className="value-grid">
          <ValueCard icon="globe"   tag="3 endpoints · 5 providers" title="Unified text + image + video API" body="Chat completions, image generation, and async video tasks behind one base URL with one key format." />
          <ValueCard icon="layers"  tag="OpenAI · Anthropic · Gemini · xAI · Veo" title="Five providers, one schema" body="Models from every major lab are routed through one shape. Switching providers is a single string change." />
          <ValueCard icon="key"     tag="rl_live_… / rl_test_…" title="Per-engineer API keys" body="Each developer gets their own key with a monthly spend cap. Revoke, rotate, or rename from the dashboard." />
          <ValueCard icon="status"  tag="per token · per image · per second" title="Mixed-unit metering" body="Text billed per token, image per generation, video per second — priced and reported in one consolidated ledger." />
          <ValueCard icon="logs"    tag="14-day retention" title="Searchable request logs" body="Full request, response, and generated assets. Filter by type, model, key, provider, or task status." />
          <ValueCard icon="billing" tag="Admin-managed balance" title="Admin-controlled credit" body="No surprise overages. Admin credits the team balance; requests are refused at $0.00. Spend is fully visible." />
        </div>
      </section>

      {/* Models */}
      <section className="section" id="models">
        <div className="section-eyebrow">MODELS</div>
        <h2>17 production-grade models across three modalities.</h2>
        <p className="lede">Text models are billed per million tokens; image models per generation; video per second. Prices pass through with a transparent, configurable margin (default: 0%).</p>

        <h3 style={{ marginTop: 36, marginBottom: 12, fontSize: 13, fontWeight: 500, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: 0.08, fontFamily: "var(--font-mono)" }}>Text models · chat completions</h3>
        <div className="model-strip">
          {Object.entries(groups).map(([prov, list]) => {
            const meta = {
              openai:    { mark: "OA", name: "OpenAI",    sub: "api.openai.com" },
              anthropic: { mark: "AN", name: "Anthropic", sub: "api.anthropic.com" },
              gemini:    { mark: "GE", name: "Gemini",    sub: "googleapis.com" },
            }[prov];
            return (
              <div key={prov} className={`model-col ${prov}`}>
                <div className="model-col-head">
                  <span className="pl-mark">{meta.mark}</span>
                  <div>
                    <div className="name">{meta.name}</div>
                    <div className="sub">{meta.sub}</div>
                  </div>
                  <Badge tone="success" dot style={{ marginLeft: "auto" }}>live</Badge>
                </div>
                {list.map(m => (
                  <div key={m.id} className="model-col-row">
                    <div>
                      <div className="m-name">{m.name}</div>
                      <div className="m-meta">{(m.ctx/1000).toLocaleString()}k ctx · {[m.vision && "vision", m.tools && "tools", m.stream && "stream"].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="m-price">
                      <div>${m.input.toFixed(2)} <span style={{ color: "var(--fg-dim)" }}>in</span></div>
                      <div>${m.output.toFixed(2)} <span style={{ color: "var(--fg-dim)" }}>out</span></div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <h3 style={{ marginTop: 40, marginBottom: 12, fontSize: 13, fontWeight: 500, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: 0.08, fontFamily: "var(--font-mono)" }}>Image models · per generation</h3>
        <div className="model-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {window.GW_DATA.IMAGE_MODELS.map(m => {
            const meta = m.provider === "openai" ? { mark: "OA", cls: "openai" }
                       : m.provider === "gemini" ? { mark: "GE", cls: "gemini" }
                       : { mark: "xAI", cls: "" };
            return (
              <div key={m.id} className={`model-col ${meta.cls}`}>
                <div className="model-col-head">
                  <span className="pl-mark" style={meta.cls ? {} : { background: "rgba(184,184,184,0.12)", color: "var(--xai)" }}>{meta.mark}</span>
                  <div>
                    <div className="name">{m.name}</div>
                    <div className="sub">≤ {m.maxSize}</div>
                  </div>
                  <Badge tone="success" dot style={{ marginLeft: "auto" }}>live</Badge>
                </div>
                <div className="model-col-row">
                  <div>
                    <div className="m-meta" style={{ marginTop: 0 }}>{m.capabilities.join(" · ")}</div>
                  </div>
                  <div className="m-price">
                    <div>${m.perImage.toFixed(2)} <span style={{ color: "var(--fg-dim)" }}>/ image</span></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <h3 style={{ marginTop: 40, marginBottom: 12, fontSize: 13, fontWeight: 500, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: 0.08, fontFamily: "var(--font-mono)" }}>Video models · per second</h3>
        <div className="model-strip">
          {window.GW_DATA.VIDEO_MODELS.map(m => {
            const mark = m.provider === "veo" ? "VEO" : "xAI";
            const swatchColor = m.provider === "veo" ? "var(--veo)" : "var(--xai)";
            const swatchBg = m.provider === "veo" ? "rgba(232,197,71,0.14)" : "rgba(184,184,184,0.12)";
            return (
              <div key={m.id} className="model-col">
                <div className="model-col-head">
                  <span className="pl-mark" style={{ background: swatchBg, color: swatchColor }}>{mark}</span>
                  <div>
                    <div className="name">{m.name}</div>
                    <div className="sub">≤ {m.maxDuration}s · {m.maxResolution}</div>
                  </div>
                  <Badge tone={m.status === "warn" ? "warn" : "success"} dot style={{ marginLeft: "auto" }}>{m.status === "warn" ? "degraded" : "live"}</Badge>
                </div>
                <div className="model-col-row">
                  <div>
                    <div className="m-meta" style={{ marginTop: 0 }}>{m.capabilities.join(" · ")}</div>
                  </div>
                  <div className="m-price">
                    <div>${m.perSecond.toFixed(2)} <span style={{ color: "var(--fg-dim)" }}>/ second</span></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 18, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>
          Prices in USD · updated daily from upstream · see <a onClick={() => onNavigate("public-models")} style={{ color: "var(--accent)", cursor: "pointer" }}>full catalog</a>
        </div>
      </section>

      {/* Console preview */}
      <section className="section" id="console">
        <div className="section-eyebrow">CONSOLE</div>
        <h2>A real workspace, not a marketing screenshot.</h2>
        <p className="lede">Every page in the app, available the moment you log in.</p>
        <div className="console-strip">
          <ConsoleScreenshot label="workspace · Dashboard">
            <div className="grid-4" style={{ gap: 8 }}>
              {[["Balance", "$184.22"], ["Today req", "1,284"], ["Today cost", "$3.92"], ["Errors", "0.42%"]].map((t, i) => (
                <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: 0.06 }}>{t[0]}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500, marginTop: 4 }}>{t[1]}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <MiniArea data={[20, 42, 38, 60, 75, 58, 72, 80, 95, 88, 110, 130, 122, 145, 168]} height={120} />
            </div>
          </ConsoleScreenshot>
          <ConsoleScreenshot label="workspace · API Keys">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {window.GW_DATA.KEYS.slice(0, 4).map(k => (
                <div key={k.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{k.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{k.prefix}</div>
                  </div>
                  <span className="badge muted" style={{ marginLeft: "auto" }}>${k.monthUsage.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </ConsoleScreenshot>
        </div>
      </section>

      {/* Use cases */}
      <section className="section" id="use-cases">
        <div className="section-eyebrow">USE CASES</div>
        <h2>What teams are actually using it for.</h2>
        <div className="use-grid">
          {[
            ["01", "Internal AI tools", "PR summarizers, support triage, doc-Q&A — all the small jobs that don't justify a vendor account each."],
            ["02", "Per-engineer keys", "Each developer gets a key with a spend cap. Revoke when they leave; no shared credentials."],
            ["03", "Multi-model A/B", "Run the same prompt against gpt-5, claude-sonnet-4.5, and gemini-2.5-pro to pick the cheapest one that still passes evals."],
            ["04", "Product experimentation", "Ship a feature against one model; switch providers in a config change without redeploying."],
            ["05", "Cost containment", "Manual top-ups + per-key limits = no $9,000 surprise from a runaway script."],
          ].map((u, i) => (
            <div key={i} className="use-card">
              <span className="num">{u[0]}</span>
              <div className="t">{u[1]}</div>
              <div className="d">{u[2]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="section" id="trust">
        <div className="section-eyebrow">TRUST</div>
        <h2>You can see exactly what we did with your money.</h2>
        <p className="lede">No magic routing, no opaque margins, no "AI optimization" that quietly downgrades your model.</p>
        <div className="trust-list">
          {[
            ["check",  "Transparent usage",       "Every request logged with token counts, provider response, and cost — visible to you and admin."],
            ["shield", "Manual access control",   "No public sign-up. New users are created by an admin. Disabled users can't make any request."],
            ["billing","Admin-managed balance",   "Balance only goes up when an admin tops it up. Requests are refused at $0.00. No hidden credit lines."],
            ["logs",   "Full request payloads",   "Logs include the raw request and the raw provider response. Diff your client output against the source."],
            ["alert",  "Provider error visibility","When OpenAI 5xx's, you see it. We surface upstream errors verbatim, with provider name and request_id."],
            ["zap",    "No automatic fallback",   "You picked claude-opus-4.5, we call claude-opus-4.5. If it fails, you get an honest 502 — not a silent downgrade."],
          ].map((t, i) => (
            <div key={i} className="trust-item">
              <Icon name={t[0]} className="ico" size={20} />
              <h4>{t[1]}</h4>
              <p>{t[2]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="footer-cta">
        <h2>Want to try it on your team?</h2>
        <p>Relay is invite-only while we onboard early teams hand-on-hand. Tell us about your stack and we'll get back within a day.</p>
        <div className="ctas">
          <button className="btn primary lg">Request access</button>
          <button className="btn lg">Contact us</button>
        </div>
      </section>

      <footer className="landing-foot">
        <span className="brand-mark" style={{ width: 16, height: 16 }} />
        <span>Relay — unified text · image · video API gateway</span>
        <span style={{ color: "var(--fg-dim)" }}>·</span>
        <span>© 2026</span>
        <div className="right">
          <a onClick={() => onNavigate("public-docs")}>Docs</a>
          <a onClick={() => onNavigate("status")}>Status</a>
          <a href="#">Changelog</a>
          <a href="#">Security</a>
        </div>
      </footer>
    </div>
  );
}
window.LandingPage = LandingPage;
window.LandingNav = LandingNav;
