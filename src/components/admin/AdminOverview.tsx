import { useAdminData } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Users, Gamepad2, Brain, Crown, CalendarCheck, Database, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function StatCard({ label, value, icon: Icon, delta }: { label: string; value: string | number; icon: any; delta?: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div>
        {delta !== undefined && (
          <div className={`flex items-center text-xs mt-1 ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {delta >= 0 ? "+" : ""}{delta}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminOverview() {
  const { data: stats, isLoading } = useAdminData("overview_stats", undefined, { refetchInterval: 30000 });
  const { data: dauChart } = useAdminData("dau_chart");
  const { data: gamesChart } = useAdminData("games_chart");
  const { data: poolHealth } = useAdminData("pool_health_check");

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const s = stats || {};
  const lowPools: Array<{ mode: string; difficulty: string; remaining: number; severity: string }> = poolHealth?.lowPools || [];

  return (
    <div className="space-y-6">
      {/* Low pool warnings */}
      {lowPools.length > 0 && (
        <div className="space-y-2">
          {lowPools.map((lp) => (
            <Alert key={`${lp.mode}-${lp.difficulty}`} variant={lp.severity === 'critical' ? "destructive" : "default"} className={lp.severity === 'critical' ? '' : 'border-amber-500/50 bg-amber-500/10 text-foreground'}>
              <AlertTriangle className={`h-4 w-4 ${lp.severity === 'critical' ? '' : 'text-amber-600'}`} />
              <AlertTitle className="text-amber-700 dark:text-amber-400">Low Pool Warning</AlertTitle>
              <AlertDescription>
                {lp.mode} {lp.difficulty} pool low — {lp.remaining} unplayed deals remaining for current users. Run the generator.
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Users" value={s.totalUsers} icon={Users} />
        <StatCard label="DAU" value={s.dau} icon={Users} />
        <StatCard label="WAU" value={s.wau} icon={Users} />
        <StatCard label="MAU" value={s.mau} icon={Users} />
        <StatCard label="Total Games" value={s.totalGames} icon={Gamepad2} />
        <StatCard label="Games Today" value={s.gamesToday} icon={Gamepad2} />
        <StatCard label="Avg Pique IQ" value={s.avgRating} icon={Brain} />
        <StatCard label={`Premium (${s.premiumPct}%)`} value={s.premiumCount} icon={Crown} />
        <StatCard label="Daily Completed Today" value={s.dailyCompleted} icon={CalendarCheck} />
        <StatCard label="Deal Pool Size" value={s.dealPoolSize} icon={Database} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">DAU — Last 30 Days</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dauChart || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="dau" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Games Per Day — Last 30 Days</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gamesChart || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="games" fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
