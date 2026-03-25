import { useState } from "react";
import { useAdminData } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { wilsonInterval } from "@/lib/wilsonConfidence";

export function AdminDeals() {
  const [page, setPage] = useState(0);
  const [gameMode, setGameMode] = useState("");
  const [tier, setTier] = useState("");
  const { data: health } = useAdminData("deals_health");
  const { data: scatter } = useAdminData("dds_scatter");
  const { data: listData } = useAdminData("deals_list", { page, gameMode: gameMode || undefined, tier: tier || undefined });

  const h = health || {};
  const deals = listData?.deals || [];
  const total = listData?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const scatterData = (scatter || []).map((d: any) => ({
    ...d,
    winRate: d.pool_attempts > 0 ? Math.round((d.pool_wins / d.pool_attempts) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Health Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Deals</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{h.total?.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">By Tier</CardTitle></CardHeader>
          <CardContent>
            {h.byTier && Object.entries(h.byTier).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{(v as number).toLocaleString()}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">By Difficulty</CardTitle></CardHeader>
          <CardContent>
            {h.byBand && Object.entries(h.byBand).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{(v as number).toLocaleString()}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">DDS Source</CardTitle></CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm"><span>Solver only (&lt;30)</span><span className="font-mono">{h.solverOnly}</span></div>
            <div className="flex justify-between text-sm"><span>Blending (30-100)</span><span className="font-mono">{h.blending}</span></div>
            <div className="flex justify-between text-sm"><span>Empirical (100+)</span><span className="font-mono">{h.empirical}</span></div>
            <div className="flex justify-between text-sm mt-2 pt-2 border-t"><span>Avg Confidence</span><span className="font-mono">{h.avgConfidence}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* DDS Drift Scatter */}
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
                <Scatter data={scatterData.filter((d: any) => d.game_mode === "klondike")} fill="hsl(var(--primary))" name="Klondike" />
                <Scatter data={scatterData.filter((d: any) => d.game_mode === "freecell")} fill="hsl(142, 71%, 45%)" name="FreeCell" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Deals Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base">Deal Pool</CardTitle>
            <Select value={gameMode} onValueChange={v => { setGameMode(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="All Modes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="klondike">Klondike</SelectItem>
                <SelectItem value="freecell">FreeCell</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tier} onValueChange={v => { setTier(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="All Tiers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="fresh">Fresh</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seed</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Tier</TableHead>
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
                {deals.map((d: any) => {
                  const dds = d.dds_initial ?? 50;
                  const pd = d.path_diversity_score ?? 0;
                  const isEasy = dds <= 25;
                  const isMedium = dds > 25 && dds <= 55;
                  const lowPD = (isEasy && pd < 0.3) || (isMedium && pd < 0.15);
                  
                  // Calculate Wilson interval for display
                  const simCount = d.simulation_count || 0;
                  const poolWinRate = d.pool_attempts > 0 ? d.pool_wins / d.pool_attempts : 0;
                  const estimatedWins = Math.round(poolWinRate * simCount) || 0;
                  const wi = wilsonInterval(estimatedWins, simCount);
                  
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{String(d.seed).slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="secondary">{d.game_mode}</Badge></TableCell>
                      <TableCell>{d.tier}</TableCell>
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
        <p className="text-sm text-muted-foreground">{total} deals total</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm py-1 px-2">{page + 1} / {totalPages || 1}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
