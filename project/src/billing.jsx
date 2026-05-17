/* Billing / Balance */

function Billing() {
  const recharges = [
    { date: "2026-05-02", amount: 200.00, by: "admin@relay", method: "manual", note: "May top-up" },
    { date: "2026-04-04", amount: 200.00, by: "admin@relay", method: "manual", note: "April top-up" },
    { date: "2026-03-01", amount: 500.00, by: "admin@relay", method: "manual", note: "Q2 prepay" },
    { date: "2026-02-08", amount: 100.00, by: "admin@relay", method: "manual", note: "Top-up" },
    { date: "2026-01-08", amount: 50.00,  by: "admin@relay", method: "manual", note: "Initial credit" },
  ];

  const byModel = [
    { name: "claude-sonnet-4.5",  type: "text",  cost: 18.42, pct: 18 },
    { name: "gpt-image-2",        type: "image", cost: 14.80, pct: 14 },
    { name: "veo-3.1",            type: "video", cost: 12.60, pct: 12 },
    { name: "gpt-5-mini",         type: "text",  cost: 11.20, pct: 11 },
    { name: "nano-banana",        type: "image", cost: 9.45,  pct: 9 },
    { name: "gpt-5",              type: "text",  cost: 8.84,  pct: 9 },
    { name: "veo-3.1-fast",       type: "video", cost: 6.48,  pct: 6 },
    { name: "gemini-2.5-flash",   type: "text",  cost: 4.92,  pct: 5 },
    { name: "grok-imagine",       type: "image", cost: 4.15,  pct: 4 },
    { name: "claude-haiku-4.5",   type: "text",  cost: 3.18,  pct: 3 },
  ];
  const byKey = [
    { name: "production-web",    cost: 28.42, pct: 58 },
    { name: "production-worker", cost: 14.18, pct: 29 },
    { name: "staging",           cost: 4.92,  pct: 10 },
    { name: "local-dev (anna)",  cost: 1.39,  pct: 3 },
  ];

  return (
    <div className="page-body">
      <PageHeader
        title="Billing"
        sub="Your team balance, recharge history, and spend breakdown."
        right={
          <>
            <button className="btn sm"><Icon name="download" size={12} /> Statement</button>
            <button className="btn primary sm"><Icon name="plus" size={12} /> Request top-up</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "20px 22px" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)" }}>Current balance</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 500, letterSpacing: -0.01, marginTop: 6 }}>$184.22</div>
            <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>
              <span>≈ <strong style={{ color: "var(--fg)" }}>44 days</strong> at current burn</span>
              <span>·</span>
              <span>Last top-up <strong style={{ color: "var(--fg)" }}>May 2</strong> for $200</span>
            </div>
          </div>
          <div style={{ padding: "16px 22px", borderTop: "1px solid var(--border-soft)" }}>
            <MiniArea
              data={[500, 478, 460, 432, 410, 380, 360, 350, 320, 300, 285, 260, 245, 232, 218, 210, 198, 186, 184, 184, 184]}
              height={100}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginTop: 6 }}>
              <span>Mar 1</span><span>Mar 15</span><span>Apr 1</span><span>Apr 15</span><span>May 17</span>
            </div>
          </div>
        </div>

        <KpiTile label="Spend this month" value="$94.04" delta="32%" deltaDir="up" sub="vs. April"
          spark={[2, 4, 8, 7, 12, 14, 15, 18, 22, 26, 32, 38, 48, 62, 78, 94]} />
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--fg-faint)" }}>Spend by type · MTD</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {[
              ["text",  "Text",  46.54, 49, "#9097A1"],
              ["image", "Image", 28.40, 30, "#7AB7FF"],
              ["video", "Video", 19.10, 21, "#C77DFF"],
            ].map(([k, l, c, p, col]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "60px 1fr 60px", gap: 10, alignItems: "center" }}>
                <TypeBadge type={k} />
                <div style={{ height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${p}%`, height: "100%", background: col }} />
                </div>
                <span className="mono" style={{ fontSize: 12, textAlign: "right" }}>${c.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Banner tone="info" title="Balance is admin-managed">
          Relay does not auto-charge. To increase your balance, request a top-up and your admin will credit your account manually.
        </Banner>
      </div>

      {/* Recharge + spend ledgers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="card">
          <div className="card-header">
            <span className="title">Recharge history</span>
            <span className="sub">5 transactions</span>
            <div className="right"><Badge tone="muted">manual</Badge></div>
          </div>
          <div className="card-body tight">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>By</th><th>Note</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recharges.map((r, i) => (
                  <tr key={i}>
                    <td className="dim">{r.date}</td>
                    <td className="dim">{r.by}</td>
                    <td>{r.note}</td>
                    <td className="num" style={{ color: "var(--success)" }}>+${r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="title">Spend, last 30 days</span>
            <div className="right"><Badge tone="muted">by day</Badge></div>
          </div>
          <div className="card-body">
            <BarChart
              data={[1.2, 1.8, 2.4, 1.9, 2.2, 2.8, 2.1, 1.6, 1.9, 2.4, 2.9, 3.2, 2.8, 3.4, 4.1, 3.8, 4.4, 3.9, 4.6, 5.2, 4.8, 5.4, 5.9, 6.2, 6.8, 7.2, 8.4, 7.9, 9.1, 3.92]}
              height={140}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginTop: 8 }}>
              <span>Apr 18</span><span>Apr 25</span><span>May 2</span><span>May 9</span><span>May 17</span>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdowns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="card">
          <div className="card-header">
            <span className="title">Spend by model</span>
            <span className="sub">month-to-date</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {byModel.map(m => (
              <div key={m.name} style={{ display: "grid", gridTemplateColumns: "170px 50px 1fr 80px", gap: 14, alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border-soft)" }}>
                <span className="mono" style={{ fontSize: 12.5 }}>{m.name}</span>
                <TypeBadge type={m.type} />
                <div style={{ height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${m.pct * 4}%`, height: "100%", background: m.type === "text" ? "var(--accent)" : m.type === "image" ? "var(--info)" : "var(--admin)" }} />
                </div>
                <span className="mono" style={{ fontSize: 12.5, textAlign: "right" }}>${m.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="title">Spend by API key</span>
            <span className="sub">month-to-date</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {byKey.map(k => (
              <div key={k.name} style={{ display: "grid", gridTemplateColumns: "180px 1fr 80px", gap: 14, alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border-soft)" }}>
                <span style={{ fontSize: 13 }}>{k.name}</span>
                <div style={{ height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${k.pct}%`, height: "100%", background: "var(--info)" }} />
                </div>
                <span className="mono" style={{ fontSize: 12.5, textAlign: "right" }}>${k.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
window.Billing = Billing;
