import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { FinanceForm } from "@/components/dashboard/FinanceForm";
import { RunwayCard } from "@/components/dashboard/RunwayCard";
import { MONTH_NAMES, netMonthly, totalExpenses } from "@/lib/database";
import { listFinances } from "@/lib/repo";
import { getInsight } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Finances",
  robots: { index: false, follow: false }
};

export default async function FinancesPage() {
  const history = await listFinances();

  return (
    <div>
      <PageHead
        title="Finances"
        sub="Monthly snapshots. Enough visibility to make smart decisions, not a full ledger."
      />

      <RunwayCard history={history} insight={getInsight("runway", "runway")} />

      <div className="mt-6">
        <Card label="Log a month" labelAccent>
          <FinanceForm />
        </Card>
      </div>

      {history.length > 0 && (
        <Card label={`History · ${history.length} months`}>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[0.82rem]">
              <thead>
                <tr className="text-left font-mono text-[0.58rem] uppercase tracking-[0.14em] text-text-dim">
                  <th className="px-2 py-2">Month</th>
                  <th className="px-2 py-2 text-right">Income</th>
                  <th className="px-2 py-2 text-right">Side</th>
                  <th className="px-2 py-2 text-right">Expenses</th>
                  <th className="px-2 py-2 text-right">Net</th>
                  <th className="px-2 py-2 text-right">Savings</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const net = netMonthly(row);
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-border/60 font-mono text-text-med"
                    >
                      <td className="border-t border-border/60 px-2 py-2.5 text-text">
                        {MONTH_NAMES[row.month - 1].slice(0, 3)} {row.year}
                      </td>
                      <td className="border-t border-border/60 px-2 py-2.5 text-right">
                        {formatMoney(row.income)}
                      </td>
                      <td className="border-t border-border/60 px-2 py-2.5 text-right">
                        {formatMoney(row.side_income)}
                      </td>
                      <td className="border-t border-border/60 px-2 py-2.5 text-right">
                        {formatMoney(totalExpenses(row))}
                      </td>
                      <td
                        className={`border-t border-border/60 px-2 py-2.5 text-right ${net >= 0 ? "text-emerald" : "text-danger"}`}
                      >
                        {formatMoney(net)}
                      </td>
                      <td className="border-t border-border/60 px-2 py-2.5 text-right text-text">
                        {formatMoney(row.savings)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function formatMoney(n: number | string): string {
  const num = Number(n);
  const sign = num < 0 ? "−" : "";
  const abs = Math.abs(num);
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
