import { useAdminData } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Flame, AlertTriangle } from "lucide-react";

export function AdminStreaks() {
  const { data: active } = useAdminData("streaks_active", undefined, { refetchInterval: 30000 });
  const { data: distribution } = useAdminData("streaks_distribution");
  const { data: milestones } = useAdminData("streaks_milestones");
  const { data: atRisk } = useAdminData("streaks_at_risk");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Streaks (≥2)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Flame className="h-5 w-5 text-orange-500" />{(active || []).length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">At Risk Today</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />{(atRisk || []).length}</div></CardContent>
        </Card>
        {milestones && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Milestone Reached</CardTitle></CardHeader>
            <CardContent>
              {Object.entries(milestones).map(([m, c]) => (
                <div key={m} className="flex justify-between text-sm"><span>{m}+ days</span><span className="font-mono">{c as number}</span></div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Distribution Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Streak Length Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(distribution || []).filter((d: any) => d.streak > 0)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="streak" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(25, 95%, 53%)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Active Streaks Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Active Streaks</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Best</TableHead>
                <TableHead>Last Date</TableHead>
                <TableHead>Freezes</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(active || []).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                  <TableCell><span className="flex items-center gap-1">🔥 {u.current_streak}</span></TableCell>
                  <TableCell>{u.best_streak}</TableCell>
                  <TableCell className="text-xs">{u.last_streak_date || "—"}</TableCell>
                  <TableCell>{u.streak_freezes_remaining}</TableCell>
                  <TableCell><Badge variant={u.subscription_status === "premium" ? "default" : "secondary"}>{u.subscription_status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* At Risk */}
      {(atRisk || []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> At Risk (streak ≥3, no activity today)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Streak</TableHead>
                  <TableHead>Last Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(atRisk || []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                    <TableCell>🔥 {u.current_streak}</TableCell>
                    <TableCell className="text-xs">{u.last_streak_date || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{u.subscription_status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
