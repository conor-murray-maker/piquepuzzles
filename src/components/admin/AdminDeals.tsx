import { useState, useMemo } from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { wilsonInterval } from "@/lib/wilsonConfidence";
import { DealFilters, DEFAULT_FILTERS, type DealFilterState } from "./deals/DealFilters";
import { DealSummaryCards } from "./deals/DealSummaryCards";
import { DealHistograms } from "./deals/DealHistograms";
import {
  applyFilters, computeSummaryStats, computeHealthStats,
  buildDdsHistogram, buildConfidenceHistogram, buildPathDiversityHistogram,
  buildWinRateHistogram, buildSimCountHistogram,
  type DealRow,
} from "./deals/dealFilterUtils";

export function AdminDeals() {
  const [filters, setFilters] = useState<DealFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const { data: allDeals, isLoading } = useAdminData("deals_all");

  const filtered = useMemo(() => applyFilters((allDeals || []) as DealRow[], filters), [allDeals, filters]);
  const healthStats = useMemo(() => computeHealthStats(filtered), [filtered]);
  const summaryStats = useMemo(() => computeSummaryStats(filtered), [filtered]);
  const ddsHist = useMemo(() => buildDdsHistogram(filtered), [filtered]);
  const confHist = useMemo(() => buildConfidenceHistogram(filtered), [filtered]);
  const pdHist = useMemo(() => buildPathDiversityHistogram(filtered), [filtered]);
  const wrHist = useMemo(() => buildWinRateHistogram(filtered), [filtered]);
  const simHist = useMemo(() => buildSimCountHistogram(filtered), [filtered]);

  const scatterData = useMemo(() =>
    filtered.filter(d => d.pool_attempts >= 1).map(d => ({
      ...d,
      winRate: d.pool_attempts > 0 ? Math.round((d.pool_wins / d.pool_attempts) * 100) : 0,
    })), [filtered]);

  const pageSize = 20;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const pagedDeals = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when filters change
  const handleFilterChange = (f: DealFilterState) => {
    setFilters(f);
    setPage(0);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading deal pool…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <DealFilters filters={filters} onChange={handleFilterChange} />

      {/* Summary Cards & Stats */}
      <DealSummaryCards health={healthStats} summary={summaryStats} />

      {/* Histograms */}
      <DealHistograms
        ddsHistogram={ddsHist}
        confidenceHistogram={confHist}
        pathDiversityHistogram={pdHist}
        winRateHistogram={wrHist}
        simCountHistogram={simHist}
      />

      {/* Scatter Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">DDS Drift: Initial vs Blended</CardTitle></CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dds_initial" name="Initial DDS" type="number" domain={[0, 100]} />
                <YAxis dataKey="dds_blended" name="Blended DDS" type="number" domain={[0, 100]} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                <RechartsTooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-background border rounded-lg p-2 text-xs shadow-lg">
                      <p>Seed: {d.seed}</p>
                      <p>Mode: {d.game_mode}</p>
                      <p>Initial: {d.dds_initial} → Blended: {d.dds_blended}</p>
                      <p>Attempts: {d.pool_attempts} | Win: {d.winRate}%</p>
                    </div>
                  );
                }} />
                <Scatter data={scatterData.filter(d => d.game_mode === "klondike")} fill="hsl(var(--primary))" name="Klondike" />
                <Scatter data={scatterData.filter(d => d.game_mode === "freecell")} fill="hsl(142, 71%, 45%)" name="FreeCell" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Deals Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deal Pool ({filtered.length} matching)</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seed</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Conf Band</TableHead>
                  <TableHead>DDS Init</TableHead>
                  <TableHead>DDS Blend</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Path Div</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Win%</TableHead>
                  <TableHead>Avg Moves</TableHead>
                  <TableHead>Avg Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedDeals.map((d) => {
                  const dds = d.dds_initial ?? 50;
                  const pd = d.path_diversity_score ?? 0;
                  const isEasy = dds <= 25;
                  const isMedium = dds > 25 && dds <= 55;
                  const lowPD = (isEasy && pd < 0.3) || (isMedium && pd < 0.15);
                  const simCount = d.simulation_count || 0;
                  const poolWinRate = d.pool_attempts > 0 ? d.pool_wins / d.pool_attempts : 0;
                  const estimatedWins = Math.round(poolWinRate * simCount) || 0;
                  const wi = wilsonInterval(estimatedWins, simCount);

                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{String(d.seed).slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="secondary">{d.game_mode}</Badge></TableCell>
                      <TableCell>{d.confidence > 0.85 ? 'High' : d.confidence >= 0.7 ? 'Med' : 'Low'}</TableCell>
                      <TableCell className="font-mono">{d.dds_initial?.toFixed(1)}</TableCell>
                      <TableCell className="font-mono">{d.dds_blended?.toFixed(1)}</TableCell>
                      <TableCell className="font-mono">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {d.confidence?.toFixed(2)}
                              {simCount > 0 && (
                                <span className="text-muted-foreground text-[10px] ml-1">
                                  [{(wi.lower * 100).toFixed(0)}–{(wi.upper * 100).toFixed(0)}%]
                                </span>
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Wilson 95% CI: [{(wi.lower * 100).toFixed(1)}% – {(wi.upper * 100).toFixed(1)}%] win rate</p>
                            <p className="text-xs">{simCount} simulations</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className={`font-mono ${lowPD ? 'text-yellow-600 font-semibold' : ''}`}>
                        {pd.toFixed(2)}
                        {lowPD && ' ⚠'}
                      </TableCell>
                      <TableCell>{d.pool_attempts}</TableCell>
                      <TableCell>{d.pool_attempts > 0 ? Math.round((d.pool_wins / d.pool_attempts) * 100) : 0}%</TableCell>
                      <TableCell>{d.pool_avg_moves?.toFixed(0)}</TableCell>
                      <TableCell>{d.pool_avg_time?.toFixed(0)}s</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length} deals matching</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm py-1 px-2">{page + 1} / {totalPages || 1}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
