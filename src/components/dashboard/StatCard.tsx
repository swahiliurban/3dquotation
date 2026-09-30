import type { ReactNode } from "react";
import { Card } from "../ui/Card";

interface StatCardProps {
  hint: string;
  icon: ReactNode;
  label: string;
  value: string;
}

export function StatCard({ hint, icon, label, value }: StatCardProps) {
  return (
    <Card className="space-y-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">{label}</p>
        <p className="mt-2 break-words text-2xl font-extrabold text-slate-950 dark:text-white">
          {value}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
    </Card>
  );
}
