/* Reusable building blocks: Code block, Badge, Sparkline, Modal, Drawer, EmptyState, BannerAlert, KpiTile, ToggleSwitch */

const { useState, useEffect, useRef } = React;

function Badge({ tone = "muted", dot, children, className = "", style }) {
  return (
    <span className={`badge ${tone} ${dot ? "dot" : ""} ${className}`} style={style}>{children}</span>
  );
}
window.Badge = Badge;

function ProviderTag({ provider }) {
  const label = {
    openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini",
    xai: "xAI · Grok", veo: "Google Veo",
  }[provider] || provider;
  return (
    <span className={`prov ${provider}`}><span className="prov-swatch" />{label}</span>
  );
}
window.ProviderTag = ProviderTag;

function TypeBadge({ type }) {
  const icon = type === "image" ? "image" : type === "video" ? "video" : "logs";
  const label = type === "image" ? "IMG" : type === "video" ? "VID" : "TXT";
  return (
    <span className={`type-badge ${type}`}>
      <span className="glyph"><Icon name={icon} size={9} /></span>
      {label}
    </span>
  );
}
window.TypeBadge = TypeBadge;

function TaskState({ state }) {
  return (
    <span className={`task-state ${state}`}>
      <span className="dot" />
      {state}
    </span>
  );
}
window.TaskState = TaskState;

/* MediaPreview — a tasteful placeholder for generated assets.
   Renders a tinted, striped block with mono metadata.
   Never draws "real" AI output. */
function MediaPreview({ type = "image", prompt = "", hue = 200, size, duration, status = "succeeded", aspect, className = "" }) {
  const a = aspect ||
    (type === "video"
      ? (size && size.startsWith("1280")) || (size && size.startsWith("1920")) ? "aspect-16-9" : "aspect-9-16"
      : "aspect-1-1");
  return (
    <div className={`media ${a} ${status === "running" ? "loading" : ""} ${status === "failed" ? "failed" : ""} ${className}`} style={{ "--media-hue": hue }}>
      <div className="media-corner">
        {type === "video" ? <>VID · {duration ? `${duration}s` : "—"}</> : <>IMG · {size || "1024×1024"}</>}
      </div>
      {type === "video" && status === "succeeded" && (
        <div className="media-play">
          <svg viewBox="0 0 40 40" fill="rgba(255,255,255,0.92)">
            <circle cx="20" cy="20" r="18" fill="rgba(0,0,0,0.45)" />
            <path d="M16 12l13 8-13 8z" />
          </svg>
        </div>
      )}
      {(status === "running" || status === "queued" || status === "failed") && (
        <div className="media-state">
          <TaskState state={status} />
        </div>
      )}
      <div className="media-meta">
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prompt.slice(0, 64)}{prompt.length > 64 ? "…" : ""}</span>
        <span className="size">{size}</span>
      </div>
    </div>
  );
}
window.MediaPreview = MediaPreview;

function PricingTag({ model }) {
  if (!model) return null;
  if (model.pricingMode === "per_token")     return <span className="mono" style={{ fontSize: 12 }}>${model.input.toFixed(2)} / ${model.output.toFixed(2)} <span style={{ color: "var(--fg-dim)" }}>per 1M tok</span></span>;
  if (model.pricingMode === "per_image")     return <span className="mono" style={{ fontSize: 12 }}>${model.perImage.toFixed(2)} <span style={{ color: "var(--fg-dim)" }}>/ image</span></span>;
  if (model.pricingMode === "per_second")    return <span className="mono" style={{ fontSize: 12 }}>${model.perSecond.toFixed(2)} <span style={{ color: "var(--fg-dim)" }}>/ second</span></span>;
  return null;
}
window.PricingTag = PricingTag;

function StatusBadge({ status, ok }) {
  if (ok || status === "200") return <Badge tone="success" dot>200</Badge>;
  if (status === "429") return <Badge tone="warn" dot>429</Badge>;
  if (status === "400") return <Badge tone="danger" dot>400</Badge>;
  return <Badge tone="danger" dot>{status}</Badge>;
}
window.StatusBadge = StatusBadge;

/* Tiny syntax tinting — not a real parser, just regex passes for visual feel */
function tint(code, lang) {
  // Escape HTML
  let s = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (lang === "python" || lang === "py") {
    s = s.replace(/(#[^\n]*)/g, '<span class="tok-com">$1</span>');
    s = s.replace(/("[^"\n]*"|'[^'\n]*')/g, '<span class="tok-str">$1</span>');
    s = s.replace(/\b(from|import|as|def|class|return|if|else|for|in|with|None|True|False)\b/g, '<span class="tok-kw">$1</span>');
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
    s = s.replace(/\b([A-Za-z_]\w*)(?=\()/g, '<span class="tok-fn">$1</span>');
  } else if (lang === "javascript" || lang === "js" || lang === "typescript" || lang === "ts") {
    s = s.replace(/(\/\/[^\n]*)/g, '<span class="tok-com">$1</span>');
    s = s.replace(/(`[^`]*`|"[^"\n]*"|'[^'\n]*')/g, '<span class="tok-str">$1</span>');
    s = s.replace(/\b(import|from|const|let|var|function|return|if|else|for|of|new|await|async|export|default|true|false|null|undefined)\b/g, '<span class="tok-kw">$1</span>');
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
    s = s.replace(/\b([A-Za-z_]\w*)(?=\()/g, '<span class="tok-fn">$1</span>');
  } else if (lang === "bash" || lang === "sh" || lang === "curl") {
    s = s.replace(/(#[^\n]*)/g, '<span class="tok-com">$1</span>');
    s = s.replace(/("[^"\n]*"|'[^'\n]*')/g, '<span class="tok-str">$1</span>');
    s = s.replace(/(--?[A-Za-z][\w-]*)/g, '<span class="tok-prop">$1</span>');
    s = s.replace(/\b(curl|export|echo)\b/g, '<span class="tok-kw">$1</span>');
  } else if (lang === "json") {
    s = s.replace(/("[^"\n]*")(\s*:)/g, '<span class="tok-prop">$1</span>$2');
    s = s.replace(/:\s*("[^"\n]*")/g, ': <span class="tok-str">$1</span>');
    s = s.replace(/\b(true|false|null)\b/g, '<span class="tok-kw">$1</span>');
    s = s.replace(/(:\s*)(\d+(?:\.\d+)?)/g, '$1<span class="tok-num">$2</span>');
  }
  return s;
}

function Code({ code, lang = "bash", tabs, filename, copyable = true, scroll = false, height }) {
  const [active, setActive] = useState(tabs ? tabs[0].lang : lang);
  const [copied, setCopied] = useState(false);
  const current = tabs ? tabs.find(t => t.lang === active) : { lang, code };
  function doCopy() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(current.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="code">
      {(tabs || filename || copyable) && (
        <div className="code-head">
          {tabs ? (
            <div className="tabs">
              {tabs.map(t => (
                <span key={t.lang} className={`code-tab ${active === t.lang ? "active" : ""}`} onClick={() => setActive(t.lang)}>{t.label || t.lang}</span>
              ))}
            </div>
          ) : (
            <span className="lang">{filename || lang}</span>
          )}
          {copyable && (
            <button className="copy" onClick={doCopy} type="button">
              <Icon name={copied ? "check" : "copy"} size={12} />
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      )}
      <div className="code-body" style={{ maxHeight: height, overflow: scroll ? "auto" : "auto" }}>
        <pre dangerouslySetInnerHTML={{ __html: tint(current.code, current.lang) }} />
      </div>
    </div>
  );
}
window.Code = Code;

function Sparkline({ data, w = 80, h = 26, color = "var(--accent)", fill = true }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = "M" + pts.join(" L");
  const area = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
window.Sparkline = Sparkline;

function Modal({ open, onClose, title, sub, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog">
        {title && (
          <div className="modal-head">
            <div className="title">{title}</div>
            {sub && <div className="sub">{sub}</div>}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
window.Modal = Modal;

function Drawer({ open, onClose, title, sub, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className={`drawer ${wide ? "wide" : ""}`}>
        <div className="drawer-head">
          <div>
            <div className="title">{title}</div>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="btn ghost sm close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}
window.Drawer = Drawer;

function EmptyState({ icon = "logs", title, desc, actions }) {
  return (
    <div className="empty">
      <div className="ico"><Icon name={icon} size={16} /></div>
      <div className="title">{title}</div>
      {desc && <div className="desc">{desc}</div>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
window.EmptyState = EmptyState;

function Banner({ tone = "info", title, children, action }) {
  return (
    <div className={`banner ${tone}`}>
      <Icon name={tone === "warn" || tone === "danger" ? "alert" : tone === "success" ? "check" : "info"} size={16} className="ico" />
      <div>
        <div className="title">{title}</div>
        {children && <div className="body">{children}</div>}
      </div>
      {action && <div className="right">{action}</div>}
    </div>
  );
}
window.Banner = Banner;

function KpiTile({ label, value, sub, delta, deltaDir, spark, sparkColor }) {
  return (
    <div className="kpi">
      <div className="k-label">{label}</div>
      <div className="k-value">{value}</div>
      <div className="k-sub">
        {delta && <span className={`k-delta ${deltaDir}`}>{deltaDir === "up" ? "↑" : "↓"} {delta}</span>}
        {sub && <span>{sub}</span>}
      </div>
      {spark && <div className="k-spark"><Sparkline data={spark} color={sparkColor} /></div>}
    </div>
  );
}
window.KpiTile = KpiTile;

function Toggle({ on, onChange, label }) {
  return (
    <label className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span className="sw" />
      {label && <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{label}</span>}
    </label>
  );
}
window.Toggle = Toggle;

function PageHeader({ title, sub, right, crumbs }) {
  return (
    <div className="page-header">
      <div>
        {crumbs && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--fg-faint)", marginBottom: 8 }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "var(--fg-dim)" }}>/</span>}
                <span style={{ color: i === crumbs.length - 1 ? "var(--fg-muted)" : "var(--fg-faint)" }}>{c}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right && <div className="right">{right}</div>}
    </div>
  );
}
window.PageHeader = PageHeader;

/* Mini area chart */
function MiniArea({ data, color = "var(--accent)", height = 140 }) {
  const w = 600, h = height;
  if (!data || !data.length) return null;
  const max = Math.max(...data), min = 0;
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 8 - ((v - min) / span) * (h - 20);
    return [x, y];
  });
  const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  const area = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mini-area" style={{ height }}>
      <defs>
        <linearGradient id="ma-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[0.25, 0.5, 0.75].map((r, i) => (
        <line key={i} x1="0" x2={w} y1={h - 8 - r * (h - 20)} y2={h - 8 - r * (h - 20)} stroke="var(--border-soft)" strokeDasharray="2 4" />
      ))}
      <path d={area} fill="url(#ma-fill)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
window.MiniArea = MiniArea;

function BarChart({ data, height = 60, color = "var(--accent)" }) {
  const max = Math.max(...data, 1);
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((v, i) => (
        <span key={i} className="b" style={{ height: `${(v / max) * 100}%`, background: color, opacity: 0.4 + 0.5 * (v/max) }} />
      ))}
    </div>
  );
}
window.BarChart = BarChart;
