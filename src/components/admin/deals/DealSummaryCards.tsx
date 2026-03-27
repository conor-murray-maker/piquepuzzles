import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HealthStats {
  total: number;
  byConfBand: Record<string, number>;
  byBand: Record<string, number>;
  avgConfidence: string;
  solverOnly: number;
  blending: number;
  empirical: number;
}

interface SummaryStats {
  count: number;
  avgDds: number;
  avgConfidence: number;
  avgPd: number;
  avgSimCount: number;
  empiricalPct: number;
}

interface Props {
  health: HealthStats;
  summary: SummaryStats;
}

export function DealSummaryCards({ health, summary }: Props) {
  return (
    <div className="space-y-4">
      {/* Top health cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Deals</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{health.total.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pool Depth (Confidence)</CardTitle></CardHeader>
          <CardContent>
            {Object.entries(health.byConfBand).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v.toLocaleString()}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">By Difficulty</CardTitle></CardHeader>
          <CardContent>
            {Object.entries(health.byBand).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v.toLocaleString()}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">DDS Source</CardTitle></CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm"><span>Solver only (&lt;30)</span><span className="font-mono">{health.solverOnly}</span></div>
            <div className="flex justify-between text-sm"><span>Blending (30–100)</span><span className="font-mono">{health.blending}</span></div>
            <div className="flex justify-between text-sm"><span>Empirical (100+)</span><span className="font-mono">{health.empirical}</span></div>
            <div className="flex justify-between text-sm mt-2 pt-2 border-t"><span>Avg Confidence</span><span className="font-mono">{health.avgConfidence}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Summary stats row for filtered set */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatPill label="Matching Deals" value={summary.count.toLocaleString()} />
        <StatPill label="Avg DDS" value={summary.avgDds.toFixed(1)} />
        <StatPill label="Avg Confidence" value={summary.avgConfidence.toFixed(2)} />
        <StatPill label="Avg Path Div" value={summary.avgPd.toFixed(2)} />
        <StatPill label="Avg Sim Count" value={summary.avgSimCount.toFixed(0)} />
        <StatPill label="% Empirical" value={`${summary.empiricalPct.toFixed(0)}%`} />
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-center">
      <div className="text-lg font-bold font-mono">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
