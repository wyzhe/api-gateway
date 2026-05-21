import {
  ArrowRight,
  CircleDollarSign,
  FileText,
  Image as ImageIcon,
  Key,
  MessageSquare,
  ShieldCheck,
  Video as VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PY_SNIPPET = `from openai import OpenAI

client = OpenAI(
    base_url="https://relay.example.com/v1",
    api_key="sk-YOUR_KEY",
)

resp = client.chat.completions.create(
    model="claude-sonnet-4.6",
    messages=[
        {"role": "user", "content": "Summarize this request."}
    ],
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

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mono">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

function ConsolePreview() {
  const rows = [
    ["POST", "/v1/chat/completions", "200 · $0.0184"],
    ["POST", "/v1/images/generations", "queued"],
    ["GET", "/v1/tasks/img_92k", "done · $0.0400"],
    ["POST", "/v1/messages", "200 · $0.0061"],
  ];

  return (
    <aside className="rounded-lg border border-border bg-surface shadow-2xl shadow-black/30 overflow-hidden">
      <div className="h-10 px-3 border-b border-border flex items-center justify-between text-xs text-muted-foreground mono">
        <span>relay://requests/live</span>
        <span>production</span>
      </div>
      <div className="p-3 mono">
        {rows.map(([method, path, status]) => (
          <div
            key={`${method}-${path}-${status}`}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] gap-3 items-center min-h-11 border-b border-border last:border-b-0 text-xs"
          >
            <span className="text-accent">{method}</span>
            <span className="text-foreground truncate">{path}</span>
            <span className="text-right text-muted-foreground truncate">{status}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-border">
        {[
          ["38ms", "gateway latency"],
          ["$128.40", "monthly cap"],
          ["audit", "payload + price snapshot"],
        ].map(([value, label]) => (
          <div key={value} className="p-4 border-b sm:border-b-0 sm:border-r border-border last:border-r-0 last:border-b-0">
            <div className="text-lg font-semibold mono">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ModelCard({
  Icon,
  label,
  tag,
  desc,
}: {
  Icon: LucideIcon;
  label: string;
  tag: string;
  desc: string;
}) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-accent" />
          {label}
        </div>
        <span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground mono">{tag}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{desc}</p>
    </article>
  );
}

function CapabilityCard({
  Icon,
  index,
  title,
  body,
}: {
  Icon: LucideIcon;
  index: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-accent mono">{index}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}

function ProofCard({
  value,
  label,
  mono,
}: {
  value: string;
  label: string;
  mono?: boolean;
}) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className={cn("text-base font-semibold", mono && "mono")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </article>
  );
}

export function LandingPage() {
  const t = useT();

  const proofs = [
    { value: t("landing.hero.proof.endpoint.value"), label: t("landing.hero.proof.endpoint.label"), mono: true },
    { value: t("landing.hero.proof.modalities.value"), label: t("landing.hero.proof.modalities.label") },
    { value: t("landing.hero.proof.caps.value"), label: t("landing.hero.proof.caps.label") },
    { value: t("landing.hero.proof.logs.value"), label: t("landing.hero.proof.logs.label") },
  ];

  const modalities = [
    { Icon: MessageSquare, tag: "chat", label: t("landing.modalities.text.label"), desc: t("landing.modalities.text.desc") },
    { Icon: ImageIcon, tag: "image", label: t("landing.modalities.image.label"), desc: t("landing.modalities.image.desc") },
    { Icon: VideoIcon, tag: "video", label: t("landing.modalities.video.label"), desc: t("landing.modalities.video.desc") },
  ];

  const capabilities = [
    { Icon: Key, index: "01", title: t("landing.capabilities.items.keys.title"), body: t("landing.capabilities.items.keys.body") },
    { Icon: CircleDollarSign, index: "02", title: t("landing.capabilities.items.billing.title"), body: t("landing.capabilities.items.billing.body") },
    { Icon: FileText, index: "03", title: t("landing.capabilities.items.logs.title"), body: t("landing.capabilities.items.logs.body") },
    { Icon: ShieldCheck, index: "04", title: t("landing.capabilities.items.nofallback.title"), body: t("landing.capabilities.items.nofallback.body") },
  ];

  const steps = [
    { title: t("landing.quickstart.steps.model.title"), body: t("landing.quickstart.steps.model.body") },
    { title: t("landing.quickstart.steps.key.title"), body: t("landing.quickstart.steps.key.body") },
    { title: t("landing.quickstart.steps.call.title"), body: t("landing.quickstart.steps.call.body") },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="font-semibold text-sm">{t("landing.nav.brand")}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
            <a href="#models" className="hover:text-foreground">{t("landing.nav.modalities")}</a>
            <a href="#capabilities" className="hover:text-foreground">{t("landing.nav.capabilities")}</a>
            <a href="#quickstart" className="hover:text-foreground">{t("landing.nav.quickstart")}</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
            <PrimaryCta className="min-w-[96px]" />
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.04fr)_minmax(380px,0.96fr)] gap-10 lg:gap-12 items-center">
            <div>
              <Eyebrow>{t("landing.hero.eyebrow")}</Eyebrow>
              <h1 className="mt-5 max-w-4xl text-4xl md:text-6xl font-semibold leading-tight tracking-normal">
                {t("landing.hero.title1")}<span className="text-accent">{t("landing.hero.titleAccent")}</span>{t("landing.hero.title2")}
                {t("landing.hero.title3") && (
                  <>
                    <br className="hidden md:block" />
                    {t("landing.hero.title3")}
                  </>
                )}
              </h1>
              <p className="mt-5 max-w-2xl text-base md:text-lg leading-8 text-muted-foreground">
                {t("landing.hero.lede")}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <PrimaryCta size="lg" iconClass="h-4 w-4" className="min-w-[160px]" />
                <Button asChild variant="outline" size="lg" className="min-w-[160px]">
                  <a href="#quickstart">{t("landing.hero.ctaQuickstart")}</a>
                </Button>
                <span className="text-xs text-muted-foreground mono">{t("landing.hero.ctaNoSignup")}</span>
              </div>
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {proofs.map((proof) => (
                  <ProofCard key={proof.value} {...proof} />
                ))}
              </div>
            </div>
            <ConsolePreview />
          </div>
        </div>
      </section>

      <section id="models" className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <Eyebrow>{t("landing.modalities.eyebrow")}</Eyebrow>
              <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-normal">{t("landing.modalities.title")}</h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">{t("landing.modalities.lede")}</p>
          </div>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
            {modalities.map((item) => (
              <ModelCard key={item.label} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section id="capabilities" className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <Eyebrow>{t("landing.capabilities.eyebrow")}</Eyebrow>
              <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-normal">{t("landing.capabilities.title")}</h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">{t("landing.capabilities.lede")}</p>
          </div>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {capabilities.map((item) => (
              <CapabilityCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section id="quickstart" className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-[0.72fr_1.28fr] gap-8 items-start">
            <div>
              <Eyebrow>{t("landing.quickstart.eyebrow")}</Eyebrow>
              <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-normal">{t("landing.quickstart.title")}</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">{t("landing.quickstart.lede")}</p>
              <div className="mt-6 grid gap-2">
                {steps.map((step, index) => (
                  <div key={step.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-md border border-border bg-surface p-3">
                    <span className="h-7 w-7 rounded-md bg-surface-2 text-accent text-xs mono flex items-center justify-center">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-medium">{step.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-2">{t("landing.quickstart.pythonLabel")}</div>
              <CodeBlock lang="python" code={PY_SNIPPET} maxHeight="24rem" />
            </div>
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
