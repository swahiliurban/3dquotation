import {
  ArrowRight,
  CircleDollarSign,
  FileCheck2,
  FileClock,
  Files,
  Receipt,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { StatCard } from "../components/dashboard/StatCard";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { formatCurrency, sortDocumentsByRecent, summarizeDashboard } from "../lib/documents";
import { formatDateLabel } from "../lib/utils";
import { useQuoteFlowStore } from "../store/useQuoteFlowStore";

export function DashboardPage() {
  const documents = useQuoteFlowStore((state) => state.documents);
  const clients = useQuoteFlowStore((state) => state.clients);
  const catalog = useQuoteFlowStore((state) => state.catalog);
  const stats = summarizeDashboard(documents);
  const recentDocuments = sortDocumentsByRecent(documents).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command center"
        title="Run quotes and invoices from one clean workspace."
        description="Create professional quotations on your phone, convert them into invoices on the spot, and share polished PDFs through WhatsApp in a few taps."
        actions={
          <>
            <Link className="action-link w-full sm:w-auto" to="/records">
              View records
            </Link>
            <Link className="action-link w-full sm:w-auto" to="/settings">
              Settings
            </Link>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          hint="All saved quotations"
          icon={<Files size={22} />}
          label="Total quotations"
          value={String(stats.totalQuotations)}
        />
        <StatCard
          hint="Invoices created so far"
          icon={<Receipt size={22} />}
          label="Total invoices"
          value={String(stats.totalInvoices)}
        />
        <StatCard
          hint="Invoices fully paid"
          icon={<FileCheck2 size={22} />}
          label="Paid invoices"
          value={String(stats.paidInvoices)}
        />
        <StatCard
          hint="Invoices still open"
          icon={<FileClock size={22} />}
          label="Pending invoices"
          value={String(stats.pendingInvoices)}
        />
        <StatCard
          hint="Collected from invoice payments"
          icon={<CircleDollarSign size={22} />}
          label="Total revenue"
          value={formatCurrency(stats.totalRevenue, "TZS")}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-5">
          <div>
            <h2 className="panel-title">Quick actions</h2>
            <p className="panel-subtitle">
              Use the shortcuts below to jump into the flows your team uses every day.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              className="rounded-[26px] border border-brand-200 bg-brand-50 p-5 transition hover:-translate-y-0.5 hover:border-brand-300 dark:border-brand-500/20 dark:bg-brand-500/10"
              to="/quotations/new"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-100">
                New quotation
              </p>
              <h3 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl">
                Create and preview a quote in minutes.
              </h3>
            </Link>
            <Link
              className="rounded-[26px] border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-brand-300 dark:border-white/10 dark:bg-white/5"
              to="/invoices/new"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                New invoice
              </p>
              <h3 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl">
                Bill clients and track payment status clearly.
              </h3>
            </Link>
            <Link
              className="rounded-[26px] border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-300 dark:border-white/10 dark:bg-white/5"
              to="/records"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                View records
              </p>
              <h3 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white">
                Search, duplicate, share, and manage your history.
              </h3>
            </Link>
            <Link
              className="rounded-[26px] border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-300 dark:border-white/10 dark:bg-white/5"
              to="/settings"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">
                Settings
              </p>
              <h3 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white">
                Update branding, banking details, signatures, and backup data.
              </h3>
            </Link>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="panel-title">Business snapshot</h2>
              <p className="panel-subtitle">A quick health check for your synced workspace.</p>
            </div>
            <Wallet className="text-brand-600 dark:text-brand-200" size={22} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Clients saved
              </p>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
                {clients.length}
              </p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Catalog items
              </p>
              <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
                {catalog.length}
              </p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Mobile ready
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                Sticky actions, touch targets, dark mode, and PWA support are already enabled.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="panel-title">Recent activity</h2>
            <p className="panel-subtitle">
              Jump back into recently edited quotations and invoices.
            </p>
          </div>
          <Link className="action-link w-full sm:w-auto" to="/records">
            Open records
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid gap-4">
          {recentDocuments.length > 0 ? (
            recentDocuments.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {document.number}
                    </h3>
                    <StatusBadge status={document.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {document.client.company || document.client.name || "No client"} -{" "}
                    {formatDateLabel(document.issueDate)}
                  </p>
                </div>
                <Link className="action-link w-full md:w-auto" to={`/records/${document.id}`}>
                  View document
                </Link>
              </div>
            ))
          ) : (
            <EmptyState
              action={
                <Link className="action-link w-full sm:w-auto" to="/quotations/new">
                  Create quotation
                </Link>
              }
              description="Create your first quotation or invoice to start filling this workspace with recent activity."
              title="No documents yet"
            />
          )}
        </div>
      </Card>
    </div>
  );
}
