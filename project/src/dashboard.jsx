/* Dashboard page */

function Dashboard({ onNavigate }) {
  const recent = (window.GW_DATA.LOGS_ALL || window.GW_DATA.LOGS).slice(0, 10);
  const spendData = [22, 28, 35, 30, 40, 52, 48, 55, 62, 58, 70, 88, 76, 82, 95, 110, 124, 115, 138, 142, 158, 168, 184, 190, 175, 196, 212, 224, 218, 240];

  return (
    <div className="page-body">
      <PageHeader
        title="Dashboard"
        sub="Welcome back, Anna. Here's how the gateway is doing today."
        right={
          <>
            <Badge tone="muted">Last 24 hours</Badge>
            <button className="btn sm"><Icon name="refresh" size={12} /> Refresh</button>
          </>
        }
      />

      <Banner tone="warn" title="Balance dipping below your alert threshold"
        action={<button className="btn sm" onClick={() => onNavigate("billing")}>Request top-up</button>}>
        You're at <strong>$184.22</strong>. At today's burn rate (≈ $4.20/day) you have about 44 days left.
      </Banner>

      <div className="kpi-grid" style={{ marginTop: 14 }}>
        <KpiTile
          label="Balance"
          value="$184.22"
          sub="≈ 44 days at current burn"
          spark={spendData.slice(-12).reverse()}
          sparkColor="#5BE08F"
        />
        <KpiTile
          label="Requests today"
          value="1,318"
          delta="9.1%" deltaDir="up"
          sub="1,284 text · 28 img · 6 vid"
          spark={[40, 50, 38, 60, 75, 58, 72, 80, 95, 88, 110, 130]}
        />
        <KpiTile
          label="Tokens today"
          value="4.82M"
          delta="12%" deltaDir="up"
          sub="3.91M in · 0.91M out"
          spark={[30, 42, 38, 50, 60, 55, 68, 70, 82, 88, 105, 124]}
        />
        <KpiTile
          label="Cost today"
          value="$11.86"
          delta="14%" deltaDir="up"
          sub="$94.04 month-to-date"
          spark={[10, 14, 18, 16, 22, 20, 24, 28, 30, 33, 36, 41]}
        />
      </div>

      {/* By-type strip */}
      <div className="grid-3" style={{ marginTop: 14 }}>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TypeBadge type="text" />
            <span style={{ fontSize: 11, color: "var(--fg-faint)", marginLeft: "auto", fontFamily: "var(--font-mono)" }}>1,284 req</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500 }}>$3.92</span>
            <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>4.82M tokens</span>
          </div>
          <BarChart data={[2,3,2,4,3,5,4,6,5,7,8,9,7,8,9,11]} height={36} color="#9097A1" />
        </div>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TypeBadge type="image" />
            <span style={{ fontSize: 11, color: "var(--fg-faint)", marginLeft: "auto", fontFamily: "var(--font-mono)" }}>28 generations</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500 }}>$5.14</span>
            <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>avg $0.18 / image</span>
          </div>
          <BarChart data={[0,1,0,2,1,3,2,1,3,4,2,5,3,4,5,4]} height={36} color="var(--info)" />
        </div>
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TypeBadge type="video" />
            <span style={{ fontSize: 11, color: "var(--fg-faint)", marginLeft: "auto", fontFamily: "var(--font-mono)" }}>6 generations · 42s avg</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500 }}>$2.80</span>
            <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>avg $0.47 / clip</span>
          </div>
          <BarChart data={[0,0,0,0,1,0,1,0,0,1,0,1,1,0,1,1]} height={36} color="var(--admin)" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="card">
          <div className="card-header">
            <span className="title">Spend, last 30 days</span>
            <span className="sub">$94.04 month-to-date</span>
            <div className="right">
              <Badge tone="muted">cost</Badge>
              <Badge tone="muted">requests</Badge>
              <Badge tone="muted">tokens</Badge>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>$94.04</div>
                <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>month-to-date · projected $164 by month-end</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 24, fontSize: 12, color: "var(--fg-muted)" }}>
                <div><span style={{ color: "var(--fg)" }}>$5.53</span> · avg/day</div>
                <div><span style={{ color: "var(--fg)" }}>$8.20</span> · 7d avg</div>
                <div><span style={{ color: "var(--success)" }}>↑ 32%</span> · vs last month</div>
              </div>
            </div>
            <MiniArea data={spendData} height={180} />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>
              <span>Apr 18</span><span>Apr 25</span><span>May 2</span><span>May 9</span><span>May 17</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="title">Quickstart</span>
            <span className="sub">Drop-in for the OpenAI SDK</span>
          </div>
          <div className="card-body">
            <Code
              tabs={[
                { lang: "python", label: "py",
                  code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.relay.gateway/v1",
    api_key=RELAY_API_KEY,
)

resp = client.chat.completions.create(
    model="claude-sonnet-4.5",
    messages=[{"role":"user","content":"hi"}],
)`},
                { lang: "js", label: "node",
                  code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.relay.gateway/v1",
  apiKey: process.env.RELAY_API_KEY,
});

await client.chat.completions.create({
  model: "claude-sonnet-4.5",
  messages: [{role:"user",content:"hi"}],
});`},
                { lang: "curl", label: "curl",
                  code: `curl https://api.relay.gateway/v1/chat/completions \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -d '{"model":"claude-sonnet-4.5",
       "messages":[{"role":"user","content":"hi"}]}'`}
              ]}
            />
            <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
              <button className="btn sm" onClick={() => onNavigate("docs")}>Open docs <Icon name="external" size={12} /></button>
              <button className="btn sm ghost" onClick={() => onNavigate("playground")}>Try in Playground</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="card">
          <div className="card-header">
            <span className="title">Recent requests</span>
            <span className="sub">last 10</span>
            <div className="right">
              <button className="btn sm" onClick={() => onNavigate("logs")}>View all <Icon name="arrow" size={12} /></button>
            </div>
          </div>
          <div className="card-body tight">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Time</th>
                  <th>Type</th>
                  <th>Model</th>
                  <th>Key</th>
                  <th className="num">Usage</th>
                  <th className="num">Cost</th>
                  <th className="num">Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => {
                  const t = r.type || "text";
                  return (
                    <tr key={i} className="clickable" onClick={() => onNavigate("logs")}>
                      <td className="mono dim">{r.time}</td>
                      <td><TypeBadge type={t} /></td>
                      <td className="mono">{r.model}</td>
                      <td className="dim">{r.key}</td>
                      <td className="num">
                        {t === "text"  && <>{r.total.toLocaleString()} <span style={{ color: "var(--fg-faint)" }}>tok</span></>}
                        {t === "image" && <>{r.count} <span style={{ color: "var(--fg-faint)" }}>img</span></>}
                        {t === "video" && <>{r.duration} <span style={{ color: "var(--fg-faint)" }}>sec</span></>}
                      </td>
                      <td className="num">${r.cost.toFixed(4)}</td>
                      <td className="num">{r.latency >= 1000 ? `${(r.latency/1000).toFixed(1)}s` : `${r.latency}ms`}</td>
                      <td><StatusBadge status={r.status} ok={r.ok} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-stack">
          <div className="card">
            <div className="card-header">
              <span className="title">Recent generations</span>
              <div className="right"><button className="btn sm" onClick={() => onNavigate("generations")}>View all <Icon name="arrow" size={12} /></button></div>
            </div>
            <div className="card-body" style={{ padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {window.GW_DATA.GENERATIONS.slice(0, 4).map(g => (
                  <MediaPreview key={g.id} type={g.type} prompt={g.prompt} hue={g.hue} size={g.size} duration={g.duration} status={g.status} aspect={g.type === "video" ? "aspect-16-9" : "aspect-1-1"} />
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="title">API keys</span>
              <div className="right"><button className="btn sm" onClick={() => onNavigate("keys")}>Manage</button></div>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {window.GW_DATA.KEYS.slice(0, 3).map(k => (
                <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="key" size={14} className="" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{k.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{k.prefix}</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>${k.monthUsage.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>of ${k.limit}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="title">Top models by cost</span>
              <span className="sub">today</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {[
                { n: "claude-sonnet-4.5", t: "text", c: 1.84 },
                { n: "gpt-image-2",       t: "image", c: 1.20 },
                { n: "veo-3.1",           t: "video", c: 2.80 },
                { n: "gpt-5-mini",        t: "text", c: 0.92 },
              ].map((m, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px", gap: 8, alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border-soft)" }}>
                  <span className="mono" style={{ fontSize: 12.5 }}>{m.n}</span>
                  <TypeBadge type={m.t} />
                  <span className="mono" style={{ fontSize: 12.5, textAlign: "right" }}>${m.c.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.Dashboard = Dashboard;
