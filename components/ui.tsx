import Link from "next/link";
import type { ClientProfile } from "@/lib/clients";
import { initials } from "@/lib/clients";
import type { SaveStatus } from "@/lib/useClientMemory";

// Small shared building blocks for Sorted's screens.

export function PageHeader(props: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {props.eyebrow && <div className="mb-2 text-[13px] text-muted">{props.eyebrow}</div>}
        <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-tight text-ink sm:text-[42px]">
          {props.title}
        </h1>
      </div>
      {props.children}
    </header>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="rise mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</div>;
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-line bg-card ${className}`}>{children}</section>;
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[19px] font-bold tracking-tight">{children}</h2>
      {aside && <div className="text-[13px] text-muted">{aside}</div>}
    </div>
  );
}

// Marks something the AI did, without shouting about it.
export function AiTag({ children = "AI" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2 py-0.5 text-[11px] font-semibold text-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "dark" | "ghost" },
) {
  const { variant = "primary", className = "", ...rest } = props;
  const styles = {
    primary: "bg-accent text-card hover:bg-accent-deep",
    dark: "bg-ink text-paper hover:bg-ink/85",
    ghost: "text-muted hover:bg-soft hover:text-ink",
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function ClientAvatar({ client, size = 48 }: { client: ClientProfile; size?: number }) {
  // No real logos yet, so an initials monogram in the brand's own colours.
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-display font-bold"
      style={{ width: size, height: size, background: client.colors[0], color: client.monogramText ?? client.colors[1], fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(client.name)}
    </span>
  );
}

export function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "unknown") return null;
  const map: Record<Exclude<SaveStatus, "unknown">, [string, string]> = {
    idle: ["Saved to GitHub", "bg-ok"],
    saving: ["Saving…", "bg-warn"],
    saved: ["Saved to GitHub", "bg-ok"],
    error: ["Couldn't save. Changes are only on this page", "bg-alert"],
    off: ["Saved in this browser", "bg-ok"],
  };
  const [text, dot] = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" title={status === "off" ? "Saved on this computer only. Connect GitHub in Settings to share it with the team." : undefined}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="rise mt-3 rounded-lg border border-alert/20 bg-alert-soft px-3 py-2.5 text-[13px] text-alert-ink">{children}</p>;
}

export function EmptyState(props: { title: string; children?: React.ReactNode; href?: string; action?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper/60 px-5 py-8 text-center">
      <p className="font-display text-[16px] font-bold">{props.title}</p>
      {props.children && <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{props.children}</p>}
      {props.href && props.action && (
        <Link href={props.href} className="mt-4 inline-flex text-[13px] font-semibold underline decoration-accent decoration-2 underline-offset-4">
          {props.action}
        </Link>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
