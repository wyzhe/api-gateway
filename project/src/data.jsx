/* Shared mock data + tiny helpers. Sits on window so other scripts see it. */

/* Text-completion models */
const TEXT_MODELS = [
  // OpenAI
  { id: "gpt-5", name: "gpt-5", provider: "openai", type: "text", pricingMode: "per_token", ctx: 256000, input: 5.0, output: 15.0, vision: true, tools: true, stream: true, status: "ok", desc: "General reasoning, agentic flows" },
  { id: "gpt-5-mini", name: "gpt-5-mini", provider: "openai", type: "text", pricingMode: "per_token", ctx: 256000, input: 0.5, output: 2.0, vision: true, tools: true, stream: true, status: "ok", desc: "Cheap & fast for routine tasks" },
  { id: "gpt-4o", name: "gpt-4o", provider: "openai", type: "text", pricingMode: "per_token", ctx: 128000, input: 2.5, output: 10.0, vision: true, tools: true, stream: true, status: "ok", desc: "Multimodal flagship" },
  { id: "o4-mini", name: "o4-mini", provider: "openai", type: "text", pricingMode: "per_token", ctx: 200000, input: 1.1, output: 4.4, vision: false, tools: true, stream: true, status: "ok", desc: "Reasoning, structured output" },
  // Anthropic
  { id: "claude-opus-4.5", name: "claude-opus-4.5", provider: "anthropic", type: "text", pricingMode: "per_token", ctx: 200000, input: 15.0, output: 75.0, vision: true, tools: true, stream: true, status: "ok", desc: "Flagship long-context analysis" },
  { id: "claude-sonnet-4.5", name: "claude-sonnet-4.5", provider: "anthropic", type: "text", pricingMode: "per_token", ctx: 200000, input: 3.0, output: 15.0, vision: true, tools: true, stream: true, status: "ok", desc: "Best price/quality balance" },
  { id: "claude-haiku-4.5", name: "claude-haiku-4.5", provider: "anthropic", type: "text", pricingMode: "per_token", ctx: 200000, input: 0.8, output: 4.0, vision: true, tools: true, stream: true, status: "ok", desc: "Low-latency, agent loops" },
  // Gemini
  { id: "gemini-2.5-pro", name: "gemini-2.5-pro", provider: "gemini", type: "text", pricingMode: "per_token", ctx: 1000000, input: 1.25, output: 10.0, vision: true, tools: true, stream: true, status: "ok", desc: "Massive context, long docs" },
  { id: "gemini-2.5-flash", name: "gemini-2.5-flash", provider: "gemini", type: "text", pricingMode: "per_token", ctx: 1000000, input: 0.3, output: 2.5, vision: true, tools: true, stream: true, status: "warn", desc: "Cheap & fast multimodal" },
  { id: "gemini-2.5-flash-lite", name: "gemini-2.5-flash-lite", provider: "gemini", type: "text", pricingMode: "per_token", ctx: 1000000, input: 0.075, output: 0.3, vision: false, tools: false, stream: true, status: "ok", desc: "Bulk classification, embeddings adjacent" },
];

/* Image-generation models */
const IMAGE_MODELS = [
  { id: "gpt-image-2",       name: "gpt-image-2",       provider: "openai", type: "image", pricingMode: "per_image",
    perImage: 0.04, capabilities: ["text-to-image", "image-to-image", "inpaint"], maxSize: "2048×2048",
    status: "ok", desc: "OpenAI flagship image model. Photoreal, accurate text rendering." },
  { id: "nano-banana",       name: "nano-banana",       provider: "gemini", type: "image", pricingMode: "per_image",
    perImage: 0.03, capabilities: ["text-to-image", "image-to-image"], maxSize: "1024×1024",
    status: "ok", desc: "Google's fast, low-cost image model. Good for batch and thumbnails." },
  { id: "nano-banana-pro",   name: "nano-banana-pro",   provider: "gemini", type: "image", pricingMode: "per_image",
    perImage: 0.06, capabilities: ["text-to-image", "image-to-image", "inpaint"], maxSize: "2048×2048",
    status: "ok", desc: "Higher fidelity Gemini image model. Crisper detail, supports inpainting." },
  { id: "grok-imagine",      name: "grok-imagine",      provider: "xai",    type: "image", pricingMode: "per_image",
    perImage: 0.05, capabilities: ["text-to-image", "image-to-image"], maxSize: "1536×1536",
    status: "ok", desc: "xAI image model. Strong stylization, fewer refusals." },
];

/* Video-generation models */
const VIDEO_MODELS = [
  { id: "veo-3.1",           name: "veo-3.1",           provider: "veo",  type: "video", pricingMode: "per_second",
    perSecond: 0.35, capabilities: ["text-to-video", "image-to-video"], maxDuration: 60, maxResolution: "1080p",
    status: "ok",   desc: "Google's Veo 3.1. Up to 60s 1080p, native audio track." },
  { id: "veo-3.1-fast",      name: "veo-3.1-fast",      provider: "veo",  type: "video", pricingMode: "per_second",
    perSecond: 0.18, capabilities: ["text-to-video", "image-to-video"], maxDuration: 30, maxResolution: "720p",
    status: "ok",   desc: "Cheaper, faster Veo. 720p, no audio." },
  { id: "grok-imagine-video",name: "grok-imagine-video",provider: "xai",  type: "video", pricingMode: "per_second",
    perSecond: 0.40, capabilities: ["text-to-video", "image-to-video"], maxDuration: 30, maxResolution: "1080p",
    status: "warn", desc: "xAI video model. Image-to-video is stable; pure text-to-video is in preview." },
];

const MODELS = [...TEXT_MODELS, ...IMAGE_MODELS, ...VIDEO_MODELS];

const KEYS = [
  { id: "k_01", name: "production-web",    prefix: "rl_live_4xK…9aT2", created: "2026-03-04", lastUsed: "2 min ago",  monthUsage: 184.22, limit: 500, status: "active" },
  { id: "k_02", name: "production-worker", prefix: "rl_live_7vM…b1C9", created: "2026-03-04", lastUsed: "14 min ago", monthUsage: 96.31,  limit: 250, status: "active" },
  { id: "k_03", name: "staging",           prefix: "rl_test_2hL…q8R4", created: "2026-02-19", lastUsed: "1 day ago",  monthUsage: 8.04,   limit: 50,  status: "active" },
  { id: "k_04", name: "local-dev (anna)",  prefix: "rl_test_9dN…m3X1", created: "2026-01-30", lastUsed: "3 days ago", monthUsage: 1.42,   limit: 20,  status: "active" },
  { id: "k_05", name: "old-cli",           prefix: "rl_live_5pQ…z7B6", created: "2025-11-12", lastUsed: "21 days ago",monthUsage: 0,      limit: 100, status: "disabled" },
];

const STATUSES = ["200", "200", "200", "200", "200", "200", "200", "200", "429", "500", "400"];
function pick(arr, i){ return arr[i % arr.length]; }
function nowMinusMin(min){
  const d = new Date(Date.UTC(2026, 4, 17, 14, 32) - min * 60000);
  const hh = String(d.getUTCHours()).padStart(2,"0");
  const mm = String(d.getUTCMinutes()).padStart(2,"0");
  const ss = String(d.getUTCSeconds()).padStart(2,"0");
  return `14:${mm}:${ss}`;
}
function genLog(i){
  const m = TEXT_MODELS[(i*3) % TEXT_MODELS.length];
  const status = pick(STATUSES, i*7+3);
  const ok = status === "200";
  const key = KEYS[i % 3];
  const pt = ok ? 320 + ((i*53) % 4200) : Math.floor(120 + (i*17)%800);
  const ct = ok ? 80 + ((i*37) % 1800) : 0;
  const cost = ok ? +((pt * m.input + ct * m.output) / 1e6).toFixed(4) : 0;
  const lat = 280 + ((i*19) % 2400);
  const error = ok ? "" : (status === "429" ? "rate_limit_exceeded" : status === "500" ? "upstream_timeout" : "invalid_request");
  return {
    id: `req_${(1700000 + i).toString(36)}`,
    time: i === 0 ? "just now" : i < 3 ? `${i} min ago` : nowMinusMin(i*2),
    key: key.name, keyPrefix: key.prefix,
    model: m.name, provider: m.provider,
    status, ok,
    pt, ct, total: pt + ct,
    cost, latency: lat,
    error
  };
}
const LOGS = Array.from({ length: 42 }, (_, i) => genLog(i));

const USERS = [
  { id: "u_01", email: "anna@northpole.io",     balance: 184.22, total: 1240.55, keys: 4, status: "active",  created: "2026-01-08", lastActive: "2 min ago"   },
  { id: "u_02", email: "ben@spinedge.com",      balance: 12.04,  total: 487.30,  keys: 2, status: "active",  created: "2026-01-22", lastActive: "1 hour ago"  },
  { id: "u_03", email: "claire@usefigment.ai",  balance: 0.00,   total: 920.18,  keys: 3, status: "active",  created: "2025-12-04", lastActive: "yesterday"   },
  { id: "u_04", email: "dev@redacre.studio",    balance: 305.00, total: 162.40,  keys: 1, status: "active",  created: "2026-03-19", lastActive: "5 min ago"   },
  { id: "u_05", email: "evan@quietcompany.co",  balance: 50.00,  total: 14.10,   keys: 1, status: "active",  created: "2026-04-02", lastActive: "12 min ago"  },
  { id: "u_06", email: "felix@halfmoon.dev",    balance: 88.42,  total: 502.61,  keys: 5, status: "active",  created: "2025-10-30", lastActive: "3 days ago"  },
  { id: "u_07", email: "george@deprecated.dev", balance: 0.00,   total: 18.05,   keys: 1, status: "disabled",created: "2025-09-15", lastActive: "21 days ago" },
];

const PROVIDERS = [
  { id: "openai",    name: "OpenAI",         key: "configured", status: "ok",   errRate: 0.4, latency: 612,  endpoint: "https://api.openai.com/v1",                                supports: ["text", "image"] },
  { id: "anthropic", name: "Anthropic",      key: "configured", status: "ok",   errRate: 0.2, latency: 580,  endpoint: "https://api.anthropic.com/v1",                             supports: ["text"] },
  { id: "gemini",    name: "Google Gemini",  key: "configured", status: "warn", errRate: 3.1, latency: 1840, endpoint: "https://generativelanguage.googleapis.com/v1beta",          supports: ["text", "image"] },
  { id: "xai",       name: "xAI · Grok",     key: "configured", status: "ok",   errRate: 0.8, latency: 980,  endpoint: "https://api.x.ai/v1",                                      supports: ["text", "image", "video"] },
  { id: "veo",       name: "Google Veo",     key: "configured", status: "ok",   errRate: 1.2, latency: 24000,endpoint: "https://aiplatform.googleapis.com/v1/videos",              supports: ["video"] },
];

/* ---------- Generations (image/video task history) ---------- */
const GEN_PROMPTS = [
  { p: "Crisp product shot of a brushed-aluminum espresso machine on a concrete plinth, soft window light, 35mm, shallow depth of field", hue: 32 },
  { p: "Editorial portrait of a marathon runner mid-stride, golden hour, photoreal, Kodak Portra grain", hue: 18 },
  { p: "Isometric SaaS dashboard illustration, line art, single accent color, light background", hue: 150 },
  { p: "Top-down flat lay of vintage developer keyboards on white seamless paper", hue: 220 },
  { p: "Architectural render of a brutalist library at dusk, volumetric light, cinematic", hue: 260 },
  { p: "Macro photograph of green moss on a basalt rock, water droplets, 100mm", hue: 145 },
  { p: "Looping b-roll of city traffic at night, motion blur, neon reflections, vertical 9:16", hue: 280 },
  { p: "Drone flyover of a coastline at dawn, mist, gentle camera push-in, cinematic teal-orange", hue: 195 },
  { p: "Slow-motion macro of ink dispersing in water, white background, soft key light", hue: 240 },
  { p: "Cozy animated cabin interior, lo-fi loop, cat sleeping by fireplace, hand-drawn", hue: 30 },
  { p: "Studio shot of running shoes, 360° turntable, soft rim light, packshot for ecommerce", hue: 0 },
  { p: "Hand-drawn storyboard frames of a coffee being poured, monochrome, 6-panel sheet", hue: 50 },
];

const GEN_MODELS = [
  { id: "gpt-image-2",        type: "image", size: "2048×2048", duration: null, secs: 3.2,  cost: 0.04 },
  { id: "nano-banana",        type: "image", size: "1024×1024", duration: null, secs: 1.4,  cost: 0.03 },
  { id: "nano-banana-pro",    type: "image", size: "2048×2048", duration: null, secs: 4.1,  cost: 0.06 },
  { id: "grok-imagine",       type: "image", size: "1536×1536", duration: null, secs: 2.6,  cost: 0.05 },
  { id: "veo-3.1",            type: "video", size: "1920×1080", duration: 8,    secs: 78,   cost: 2.80 },
  { id: "veo-3.1-fast",       type: "video", size: "1280×720",  duration: 6,    secs: 42,   cost: 1.08 },
  { id: "grok-imagine-video", type: "video", size: "1920×1080", duration: 5,    secs: 64,   cost: 2.00 },
];

const GEN_STATUSES = ["succeeded", "succeeded", "succeeded", "succeeded", "succeeded", "running", "queued", "failed"];

function genAsset(i) {
  const gm = GEN_MODELS[i % GEN_MODELS.length];
  const gp = GEN_PROMPTS[i % GEN_PROMPTS.length];
  const status = i < 2 ? GEN_STATUSES[5 + (i % 3)] : pick(GEN_STATUSES, i + 4);
  const ago = i === 0 ? "just now" : i === 1 ? "2 min ago" : i < 5 ? `${i * 4} min ago` : `${Math.floor(i / 2)} hr ago`;
  return {
    id: `gen_${(2_300_000 + i).toString(36)}`,
    requestId: `req_${(1_700_500 + i).toString(36)}`,
    model: gm.id,
    type: gm.type,
    prompt: gp.p,
    hue: gp.hue,
    size: gm.size,
    duration: gm.duration,
    secs: gm.secs,
    cost: status === "succeeded" ? gm.cost * (gm.type === "video" ? (gm.duration || 1) : 1) : 0,
    status,
    progress: status === "running" ? 38 : status === "queued" ? 0 : 100,
    created: ago,
    user: i % 3 === 0 ? "anna@northpole.io" : i % 3 === 1 ? "ben@spinedge.com" : "claire@usefigment.ai",
    key: i % 2 === 0 ? "production-web" : "staging",
  };
}
const GENERATIONS = Array.from({ length: 18 }, (_, i) => genAsset(i));

/* ---------- Mixed logs (text + image + video) ---------- */
function genMediaLog(i, type) {
  const m = type === "image"
    ? IMAGE_MODELS[i % IMAGE_MODELS.length]
    : VIDEO_MODELS[i % VIDEO_MODELS.length];
  const status = i % 7 === 5 ? "500" : i % 11 === 8 ? "429" : "200";
  const ok = status === "200";
  const key = KEYS[i % 3];
  const duration = type === "video" ? [4, 6, 8, 10][i % 4] : null;
  const count = type === "image" ? [1, 1, 2, 4][i % 4] : 1;
  const cost = ok
    ? type === "image" ? +(m.perImage * count).toFixed(4) : +(m.perSecond * duration).toFixed(4)
    : 0;
  const lat = type === "video" ? 18000 + ((i * 137) % 30000) : 1200 + ((i * 83) % 3800);
  return {
    id: `req_${(1_710_000 + i).toString(36)}`,
    time: i < 3 ? `${i + 1} min ago` : nowMinusMin(i * 3 + 5),
    key: key.name, keyPrefix: key.prefix,
    model: m.name, provider: m.provider,
    type,
    status, ok,
    count, duration,
    pt: 0, ct: 0, total: 0,
    cost, latency: lat,
    error: ok ? "" : status === "429" ? "rate_limit_exceeded" : "upstream_error",
  };
}
const MEDIA_LOGS = [
  ...Array.from({ length: 8 }, (_, i) => genMediaLog(i, "image")),
  ...Array.from({ length: 4 }, (_, i) => genMediaLog(i, "video")),
];
/* Tag the original LOGS as text so columns work uniformly, then interleave. */
LOGS.forEach(l => { l.type = "text"; l.count = 1; l.duration = null; l.taskStatus = null; });
MEDIA_LOGS.forEach((l, idx) => {
  if (l.type === "video") {
    // The 4 video rows live at MEDIA_LOGS[8..11]. Vary their task state.
    const v = idx - 8; // 0..3
    if (!l.ok)        { l.taskStatus = "failed"; }
    else if (v === 0) { l.taskStatus = "running"; }
    else if (v === 1) { l.taskStatus = "queued"; }
    else if (v === 2) { l.taskStatus = "failed"; l.ok = false; l.status = "500"; l.cost = 0; l.error = "content_policy_violation"; }
    else              { l.taskStatus = "succeeded"; }
  } else {
    l.taskStatus = null;
  }
});
const LOGS_ALL = [...MEDIA_LOGS, ...LOGS].sort((a, b) => {
  // place "just now" / N min ago entries near the top, then time-strings
  const rank = s => /just now/.test(s) ? -1 : /min ago/.test(s) ? parseInt(s) : 1000;
  return rank(a.time) - rank(b.time);
});

window.GW_DATA = { MODELS, TEXT_MODELS, IMAGE_MODELS, VIDEO_MODELS, KEYS, LOGS, LOGS_ALL, USERS, PROVIDERS, GENERATIONS };

/* ---------- inline SVG icon set (one consistent stroke) ---------- */
const I = {
  dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 11h7v10h-7zM3 14h7v7H3z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>,
  key: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="14" r="3.5"/><path d="M10.5 12L20 4M16 6l2 2M18 4l2 2"/></g>,
  logs: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></g>,
  models: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></g>,
  docs: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h11l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v5h5M8 13h8M8 17h5"/></g>,
  play: <path d="M7 4l13 8-13 8z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>,
  billing: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></g>,
  status: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></g>,
  admin: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><path d="M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7l8-4z"/></g>,
  users: <g stroke="currentColor" strokeWidth="1.5" fill="none"><circle cx="9" cy="9" r="3.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M15 20c0-2 2-3 4-3s4 1 4 3" strokeOpacity=".5"/></g>,
  copy: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></g>,
  check: <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
  x: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>,
  alert: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/></g>,
  info: <g stroke="currentColor" strokeWidth="1.5" fill="none"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8v.5" strokeLinecap="round"/></g>,
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>,
  arrow: <path d="M5 12h14M14 5l7 7-7 7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
  search: <g stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></g>,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>,
  chevron: <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>,
  trash: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></g>,
  edit: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><path d="M5 19h4l10-10-4-4L5 15v4z"/><path d="M14 5l4 4"/></g>,
  power: <g stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"><path d="M12 4v8"/><path d="M7 7a7 7 0 1 0 10 0"/></g>,
  download: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M6 10l6 6 6-6M4 20h16"/></g>,
  refresh: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/></g>,
  zap: <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>,
  shield: <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>,
  layers: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/></g>,
  globe: <g stroke="currentColor" strokeWidth="1.5" fill="none"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></g>,
  bolt: <path d="M13 2L4 14h6v8l9-12h-6V2z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>,
  external: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></g>,
  image: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M3 17l5-5 4 4 3-3 6 6"/></g>,
  video: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10l4-2v8l-4-2z"/></g>,
  upload: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 18v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/></g>,
  sparkle: <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></g>,
  film: <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></g>,
};

function Icon({ name, size = 14, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>
  );
}
window.Icon = Icon;
