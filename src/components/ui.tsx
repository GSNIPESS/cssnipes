import Link from "next/link";
import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-edge bg-surface">
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-edge px-4 py-3">
          {title && (
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageTitle({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold">{children}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-muted">{children}</p>
  );
}

const BADGE_STYLES: Record<string, string> = {
  LIVE: "bg-live/15 text-live",
  SCHEDULED: "bg-surface-2 text-muted",
  COMPLETED: "bg-surface-2 text-muted",
  CANCELLED: "bg-loss/15 text-loss",
  S: "bg-accent/15 text-accent",
  A: "bg-win/15 text-win",
  B: "bg-surface-2 text-muted",
  C: "bg-surface-2 text-muted",
  QUALIFIER: "bg-surface-2 text-muted",
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
        BADGE_STYLES[value] ?? "bg-surface-2 text-muted"
      }`}
    >
      {value}
    </span>
  );
}

export function TeamLink({
  slug,
  name,
  className = "",
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={`/cs2/teams/${slug}`}
      className={`font-medium hover:text-accent ${className}`}
    >
      {name}
    </Link>
  );
}

export function PlayerLink({
  slug,
  nickname,
  className = "",
}: {
  slug: string;
  nickname: string;
  className?: string;
}) {
  return (
    <Link
      href={`/cs2/players/${slug}`}
      className={`font-medium hover:text-accent ${className}`}
    >
      {nickname}
    </Link>
  );
}

const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={`border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted ${ALIGN[align]}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = false,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
}) {
  return (
    <td
      className={`border-b border-edge/50 px-3 py-2.5 ${ALIGN[align]} ${
        mono ? "font-mono tabular-nums" : ""
      }`}
    >
      {children}
    </td>
  );
}
