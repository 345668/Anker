import type { ReactNode } from "react";

/** Shared editorial headings for the working platform. */

export function PageShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  accent = "var(--platform-link, #12618f)",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={`mb-6 flex flex-wrap items-start justify-between gap-4 ${className}`}
    >
      <div className="min-w-0 flex-1 basis-72">
        {eyebrow ? (
          <div className="flex items-center gap-2.5 mb-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span
              className="w-2.5 h-2.5"
              style={{
                backgroundColor: "var(--platform-link, " + accent + ")",
              }}
              aria-hidden="true"
            />
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-3xl lg:text-4xl font-serif tracking-tight leading-[1.05]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2.5 text-sm text-muted-foreground max-w-2xl">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
