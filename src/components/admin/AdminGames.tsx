import { useAdminData, useAdminAction } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getRowClass(g: any) {
  if (g.final_delta === 0) return "bg-red-50 dark:bg-red-950/20";
  if (g.performance_modifier !== null && g.performance_modifier < 0.6) return "bg-amber-50 dark:bg-amber-950/20";
  if (g.performance_modifier !== null && g.performance_modifier > 1.4) return "bg-blue-50 dark:bg-blue-950/20";
  if (Math.abs(g.rating_change) > 50) return "bg-purple-50 dark:bg-purple-950/20";
  return "";
}

export function AdminGames() {
  const { data: feed } = useAdminData("games_feed", undefined, { refetchInterval: 30000 });
  const { data: aggs } = useAdminData("games_aggregates");
  const action = useAdminAction();
  const { toast } = useToast();

  const games = feed || [];

  // Aggregate charts from aggs data
  const aggData = aggs || [];
  const winByDiff: Record<string, { total: number; won: number }> = {};
  const perfByMode: Record<string, { total: number; sum: number }> = {};
  const deltaHist: Record<number, number> = {};

  for (const g of aggData) {
    const diff = g.difficulty || "unknown";
    if (!winByDiff[diff]) winByDiff[diff] = { total: 0, won: 0 };
    winByDiff[diff].total++;
    if (g.won) winByDiff[diff].won++;

    if (g.performance_modifier != null) {
      if (!perfByMode[g.game_mode]) perfByMode[g.game_mode] = { total: 0, sum: 0 };
      perfByMode[g.game_mode].total++;
      perfByMode[g.game_mode].sum += g.performance_modifier;
    }

    const bucket = Math.round((g.final_delta || 0) / 5) * 5;
    deltaHist[bucket] = (deltaHist[bucket] || 0) + 1;
  }

  const winRateChart = Object.entries(winByDiff).map(([k, v]) => ({ difficulty: k, winRate: Math.round((v.won / v.total) * 100) }));
  const perfChart = Object.entries(perfByMode).map(([k, v]) => ({ mode: k, avgPerf: (v.sum / v.total).toFixed(2) }));
  const deltaChart = Object.entries(deltaHist).map(([k, v]) => ({ delta: Number(k), count: v })).sort((a, b) => a.delta - b.delta);

  const exportGames = async () => {
    try {
      const data = await action.mutateAsync({ action: "export_games" });
      const headers = Object.keys(data[0] || {});
      const csv = [headers.join(","), ...data.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "games_export.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast({ title: "Export failed", variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Live Game Feed</h3>
        <Button size="sm" variant="outline" onClick={exportGames}><Download className="h-3 w-3 mr-1" /> Export 1000</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Moves</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Hints</TableHead>
                <TableHead>Perf</TableHead>
                <TableHead>Base Δ</TableHead>
                <TableHead>Final Δ</TableHead>
                <TableHead>Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.map((g: any) => (
                <TableRow key={g.id} className={getRowClass(g)}>
                  <TableCell className="text-xs">{new Date(g.played_at).toLocaleTimeString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                        {(g.display_name || "?")[0].toUpperCase()}
                      </div>
                      <span className="text-xs">{g.display_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{g.game_mode}</TableCell>
                  <TableCell>
                    <Badge variant={g.won ? "default" : "destructive"} className="text-xs">
                      {g.won ? "Won" : "Lost"}
                    </Badge>
                  </TableCell>
                  <TableCell>{g.moves}</TableCell>
                  <TableCell className="text-xs">{Math.floor(g.time_seconds / 60)}:{(g.time_seconds % 60).toString().padStart(2, "0")}</TableCell>
                  <TableCell>{g.hints_used}</TableCell>
                  <TableCell className="font-mono text-xs">{g.performance_modifier?.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs">{g.base_delta}</TableCell>
                  <TableCell className={`font-mono text-xs font-bold ${(g.final_delta || 0) >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {(g.final_delta || 0) >= 0 ? "+" : ""}{g.final_delta}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{g.rating_after}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Win Rate by Difficulty</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={winRateChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="difficulty" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="winRate" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Rating Delta Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deltaChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="delta" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
