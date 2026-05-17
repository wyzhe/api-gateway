/* Status page */

function StatusPage() {
  const providers = [
    { id: "openai",    name: "OpenAI",    state: "ok",   uptime: 99.97, latency: 612,  err: 0.4 },
    { id: "anthropic", name: "Anthropic", state: "ok",   uptime: 99.99, latency: 580,  err: 0.2 },
    { id: "gemini",    name: "Gemini",    state: "warn", uptime: 99.42, latency: 1840, err: 3.1 },
  ];

  const incidents = [
    { date: "2026-05-17 11:24 UTC", title: "Gemini: elevated latency on gemini-2.5-flash", status: "investigating", body: "We're observing p95 latencies > 4s on gemini-2.5-flash. Upstream incident reported. Other Gemini models unaffected." },
    { date: "2026-05-12 03:11 UTC", title: "OpenAI: brief 5xx burst on gpt-5", status: "resolved", body: "OpenAI returned 5xx for ~7 minutes. 142 requests affected. No tokens billed for failed calls." },
    { date: "2026-04-28 16:02 UTC", title: "Scheduled: pricing refresh", status: "completed", body: "Routine price-table refresh. Margins unchanged. No downtime." },
  ];

  function uptimeStrip(provider) {
    // 60 buckets, mostly green; a few warn/down based on provider
    const buckets = [];
    for (let i = 0; i < 60; i++) {
      if (provider === "gemini" && (i === 55 || i === 56 || i === 57 || i === 58)) buckets.push("warn");
      else if (provider === "openai" && i === 35) buckets.push("warn");
      else buckets.push("ok");
    }
    return buckets;
  }

  return (
    <div className="page-body">
      <PageHeader
        title="System status"
        sub="Live health of every provider Relay routes through. 90-day uptime history."
        right={
          <>
            <Badge tone="warn" dot>1 active incident</Badge>
            <button className="btn sm"><Icon name="refresh" size={12} /> Refresh</button>
          </>
        }
      />

      <div className="grid-3">
        {providers.map(p => (
          <div key={p.id} className={`status-tile ${p.state}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="prov-swatch" style={{ background: `var(--${p.id})`, width: 8, height: 8 }} />
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              <span style={{ marginLeft: "auto" }}>
                {p.state === "ok"   && <Badge tone="success" dot>operational</Badge>}
                {p.state === "warn" && <Badge tone="warn" dot>degraded</Badge>}
                {p.state === "down" && <Badge tone="danger" dot>down</Badge>}
              </span>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 14, fontSize: 12, color: "var(--fg-muted)" }}>
              <div><div style={{ color: "var(--fg-faint)", fontSize: 11 }}>UPTIME 90d</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--fg)" }}>{p.uptime.toFixed(2)}%</div></div>
              <div><div style={{ color: "var(--fg-faint)", fontSize: 11 }}>P50 LATENCY</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--fg)" }}>{p.latency} ms</div></div>
              <div><div style={{ color: "var(--fg-faint)", fontSize: 11 }}>ERROR RATE</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: p.err > 1 ? "var(--warn)" : "var(--fg)" }}>{p.err}%</div></div>
            </div>
            <div className="uptime-row">
              {uptimeStrip(p.id).map((s, i) => <span key={i} className={`u ${s !== "ok" ? s : ""}`} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-faint)", marginTop: 4 }}>
              <span>60 days ago</span><span>today</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <span className="title">Model availability</span>
            <span className="sub">routed through above providers</span>
          </div>
          <div className="card-body tight">
            <table className="table">
              <thead>
                <tr>
                  <th>Model</th><th>Provider</th><th className="num">P50</th><th className="num">P95</th><th className="num">Err</th><th>Status</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {window.GW_DATA.MODELS.map(m => (
                  <tr key={m.id}>
                    <td className="mono">{m.name}</td>
                    <td><ProviderTag provider={m.provider} /></td>
                    <td className="num">{m.provider === "gemini" ? "1.8s" : m.provider === "openai" ? "612ms" : "580ms"}</td>
                    <td className="num">{m.provider === "gemini" ? "4.4s" : m.provider === "openai" ? "1.8s" : "1.5s"}</td>
                    <td className="num">{m.status === "warn" ? "3.1%" : "0.3%"}</td>
                    <td>
                      {m.status === "ok"   && <Badge tone="success" dot>operational</Badge>}
                      {m.status === "warn" && <Badge tone="warn" dot>degraded</Badge>}
                      {m.status === "down" && <Badge tone="danger" dot>offline</Badge>}
                    </td>
                    <td className="dim" style={{ maxWidth: 320, whiteSpace: "normal" }}>
                      {m.status === "warn" ? "Elevated latency reported by provider — see incident below" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)", marginBottom: 10 }}>Recent incidents</div>
        <div className="col-stack">
          {incidents.map((it, i) => (
            <div key={i} className="card">
              <div style={{ padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 500 }}>{it.title}</span>
                  {it.status === "investigating" && <Badge tone="warn" dot>{it.status}</Badge>}
                  {it.status === "resolved" && <Badge tone="success" dot>resolved</Badge>}
                  {it.status === "completed" && <Badge tone="muted">completed</Badge>}
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{it.date}</span>
                </div>
                <div style={{ color: "var(--fg-muted)", fontSize: 13, marginTop: 6 }}>{it.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.StatusPage = StatusPage;
