import { ArrowRight, Check, CircleDollarSign, Image as ImageIcon, Key, Layers, Shield, Type as TypeIcon, Video as VideoIcon, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

const CURL_SNIPPET = `curl https://your-relay.example.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4.6",
    "messages": [{"role": "user", "content": "Hello, world."}]
  }'`;

const PY_SNIPPET = `from openai import OpenAI

client = OpenAI(
    base_url="https://your-relay.example.com/v1",
    api_key="sk-YOUR_KEY",
)

resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello, world."}],
)
print(resp.choices[0].message.content)`;

function PrimaryCta({
  size = "default",
  iconClass = "h-3.5 w-3.5",
  className,
}: {
  size?: "default" | "lg";
  iconClass?: string;
  className?: string;
}) {
  const t = useT();
  const { user } = useAuth();
  const to = user ? "/dashboard" : "/login";
  const label = user ? t("landing.nav.openDashboard") : t("landing.nav.signIn");
  return (
    <Button asChild size={size} className={className}>
      <Link to={to}>{label} <ArrowRight className={iconClass} /></Link>
    </Button>
  );
}

export function LandingPage() {
  const t = useT();

  const modalities = [
    { Icon: TypeIcon, label: t("landing.modalities.text.label"), desc: t("landing.modalities.text.desc") },
    { Icon: ImageIcon, label: t("landing.modalities.image.label"), desc: t("landing.modalities.image.desc") },
    { Icon: VideoIcon, label: t("landing.modalities.video.label"), desc: t("landing.modalities.video.desc") },
  ];

  const capabilities = [
    { Icon: Layers,           title: t("landing.capabilities.items.unified.title"),    body: t("landing.capabilities.items.unified.body") },
    { Icon: Key,              title: t("landing.capabilities.items.keys.title"),       body: t("landing.capabilities.items.keys.body") },
    { Icon: CircleDollarSign, title: t("landing.capabilities.items.billing.title"),    body: t("landing.capabilities.items.billing.body") },
    { Icon: Shield,           title: t("landing.capabilities.items.access.title"),     body: t("landing.capabilities.items.access.body") },
    { Icon: Zap,              title: t("landing.capabilities.items.nofallback.title"), body: t("landing.capabilities.items.nofallback.body") },
    { Icon: TypeIcon,         title: t("landing.capabilities.items.logs.title"),       body: t("landing.capabilities.items.logs.body") },
  ];

  const heroBullets = [
    t("landing.hero.bullets.endpoint"),
    t("landing.hero.bullets.modalities"),
    t("landing.hero.bullets.caps"),
    t("landing.hero.bullets.billing"),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="font-semibold text-sm">{t("landing.nav.brand")}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
            <a href="#quickstart" className="hover:text-foreground">{t("landing.nav.quickstart")}</a>
            <a href="#capabilities" className="hover:text-foreground">{t("landing.nav.capabilities")}</a>
            <a href="#modalities" className="hover:text-foreground">{t("landing.nav.modalities")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <PrimaryCta className="min-w-[96px]" />
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, color-mix(in oklch, var(--accent) 18%, transparent), transparent 40%), radial-gradient(circle at 80% 0%, color-mix(in oklch, var(--veo) 12%, transparent), transparent 40%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mono">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            {t("landing.hero.eyebrow")}
          </span>
          <h1 className="mt-5 text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
            {t("landing.hero.title1")}<span className="text-accent">{t("landing.hero.titleAccent")}</span>{t("landing.hero.title2")}<br className="hidden md:block" />
            {t("landing.hero.title3")}
          </h1>
          <p className="mt-5 max-w-2xl text-base md:text-lg text-muted-foreground">
            {t("landing.hero.lede")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryCta size="lg" iconClass="h-4 w-4" className="min-w-[160px]" />
            <Button asChild variant="outline" size="lg" className="min-w-[160px]">
              <a href="#quickstart">{t("landing.hero.ctaQuickstart")}</a>
            </Button>
            <span className="text-xs text-muted-foreground mono">{t("landing.hero.ctaNoSignup")}</span>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {heroBullets.map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-accent" /> {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="quickstart" className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mono">{t("landing.quickstart.eyebrow")}</div>
          <h2 className="mt-2 text-2xl md:text-3xl font-semibold">{t("landing.quickstart.title")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("landing.quickstart.lede")}</p>
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-2">{t("landing.quickstart.curlLabel")}</div>
              <CodeBlock lang="bash" code={CURL_SNIPPET} maxHeight="20rem" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-2">{t("landing.quickstart.pythonLabel")}</div>
              <CodeBlock lang="python" code={PY_SNIPPET} maxHeight="20rem" />
            </div>
          </div>
        </div>
      </section>

      <section id="modalities" className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mono">{t("landing.modalities.eyebrow")}</div>
          <h2 className="mt-2 text-2xl md:text-3xl font-semibold">{t("landing.modalities.title")}</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
            {modalities.map(({ Icon, label, desc }) => (
              <div key={label} className="rounded-md border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4 text-accent" />
                  {label}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="capabilities" className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mono">{t("landing.capabilities.eyebrow")}</div>
          <h2 className="mt-2 text-2xl md:text-3xl font-semibold">{t("landing.capabilities.title")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("landing.capabilities.lede")}</p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {capabilities.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-md border border-border bg-surface p-4">
                <div
                  className="h-7 w-7 rounded-md flex items-center justify-center mb-3"
                  style={{ background: "color-mix(in oklch, var(--accent) 12%, transparent)" }}
                >
                  <Icon className="h-4 w-4 text-accent" />
                </div>
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <BrandMark className="h-4 w-4 rounded-sm" />
            <span>{t("landing.footer.tagline")}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-foreground">{t("landing.footer.signIn")}</Link>
            <a href="#quickstart" className="hover:text-foreground">{t("landing.footer.quickstart")}</a>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
