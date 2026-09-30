import type { ReactNode } from "react";
import { Card } from "./Card";

interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  title: string;
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
  return (
    <Card className="flex min-h-64 flex-col items-center justify-center text-center">
      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-300">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}
