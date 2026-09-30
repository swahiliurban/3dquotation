import type { ReactNode } from "react";

interface PageHeaderProps {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}

export function PageHeader({ actions, description, eyebrow, title }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-card backdrop-blur dark:border-white/10 dark:bg-slate-900/70 sm:p-6 md:flex-row md:items-start md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-2xl font-extrabold leading-tight text-slate-950 dark:text-white sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-[15px] leading-6 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions}</div> : null}
    </div>
  );
}
