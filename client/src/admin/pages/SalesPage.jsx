import { DollarSign, Receipt, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { formatDate, formatNumber, formatRM, localISODate } from "../format";
import { getSalesSummary } from "../services/salesService";

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
];

const SERIES = "var(--primary)";
const GRID = "var(--border)";
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localISODate(d);
}

const shortRM = (v) => (v >= 1000 ? `RM${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `RM${v}`);

function ChartTooltip({ active, payload, label, labelFormat = (l) => l }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{labelFormat(label)}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatRM(payload[0].value)}</p>
    </div>
  );
}

export function SalesPage() {
  const [range, setRange] = useState({ from: isoDaysAgo(29), to: isoDaysAgo(0) });
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getSalesSummary(range).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const activePreset = PRESETS.find((p) => range.from === isoDaysAgo(p.days - 1) && range.to === isoDaysAgo(0));

  return (
    <>
      <PageHeader title="Sales Performance" description={`${formatDate(range.from)} – ${formatDate(range.to)}`} />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="bg-card inline-flex w-fit rounded-lg border p-1">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setRange({ from: isoDaysAgo(p.days - 1), to: isoDaysAgo(0) })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activePreset === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} className="w-40 bg-white" aria-label="From date" />
          <span className="text-muted-foreground">to</span>
          <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} className="w-40 bg-white" aria-label="To date" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Revenue" hint="Paid orders, incl. shipping" icon={DollarSign} value={data ? formatRM(data.revenue) : "…"} />
        <StatCard label="Orders" icon={ShoppingBag} value={data ? formatNumber(data.orders) : "…"} />
        <StatCard label="Avg order value" icon={Receipt} value={data ? formatRM(data.avgOrderValue) : "…"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardContent className="p-5">
            <h2 className="font-semibold">Revenue over time</h2>
            <p className="text-muted-foreground text-xs">Daily revenue (RM)</p>
            <div className="mt-4 h-72">
              {data && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={SERIES} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis
                      dataKey="date"
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                      tickFormatter={(d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                    />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={shortRM} />
                    <Tooltip content={<ChartTooltip labelFormat={formatDate} />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                    <Area type="monotone" dataKey="revenue" stroke={SERIES} strokeWidth={2} fill="url(#revFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardContent className="p-5">
            <h2 className="font-semibold">Top products</h2>
            <p className="text-muted-foreground text-xs">By revenue in this period</p>
            <div className="mt-4 h-72">
              {data && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProducts} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={10}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={shortRM} />
                    <YAxis
                      type="category"
                      dataKey="product"
                      tick={AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={140}
                      tickFormatter={(name) => (name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name)}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="revenue" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
