import { useState, useEffect } from "react";
import { useAdminData, useAdminAction } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, Play, RefreshCw, Shield, Download, Copy, Loader2, AlertCircle, Info } from "lucide-react";
import { StarterPoolGenerator } from "./StarterPoolGenerator";

interface Alert {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
  affectedCount: number;
  detectedAt: string;
}

function AlertCard({ alert }: { alert: Alert }) {
  const config = {
    critical: { bg: "bg-destructive/10 border-destructive/30", icon: AlertCircle, iconColor: "text-destructive", label: "CRITICAL" },
    warning: { bg: "bg-amber-500/10 border-amber-500/30", icon: AlertTriangle, iconColor: "text-amber-600", label: "WARNING" },
    info: { bg: "bg-blue-500/10 border-blue-500/30", icon: Info, iconColor: "text-blue-600", label: "INFO" },
  }[alert.severity];

  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${config.bg}`}>
      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-bold ${config.iconColor}`}>{config.label}</span>
          <span className="text-xs text-muted-foreground font-mono">{alert.code}</span>
        </div>
        <p className="text-sm">{alert.message}</p>
        {alert.affectedCount > 0 && (
          <p className="text-xs text-muted-foreground mt-1">Affected: {alert.affectedCount}</p>
        )}
      </div>
    </div>
  );
}

export function AdminSystem() {
  const { data: tables } = useAdminData("system_tables");
  const { data: daily } = useAdminData("system_daily", undefined, { refetchInterval: 30000 });
  const action = useAdminAction();
  const { toast } = useToast();
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotData, setSnapshotData] = useState<string | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  // Fetch alerts on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await action.mutateAsync({ action: "diagnostic_snapshot" });
        if (result?.alerts) setAlerts(result.alerts);
      } catch {
        // silently fail — alerts are best-effort
      } finally {
        setAlertsLoading(false);
      }
    })();
  }, []);

  const exportSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      const result = await action.mutateAsync({ action: "diagnostic_snapshot" });
      if (result?.alerts) setAlerts(result.alerts);
      const jsonStr = JSON.stringify(result, null, 2);
      setSnapshotData(jsonStr);
      setSnapshotOpen(true);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setSnapshotLoading(false);
    }
  };

  const downloadSnapshot = () => {
    if (!snapshotData) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([snapshotData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pique-diagnostic-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySnapshot = async () => {
    if (!snapshotData) return;
    await navigator.clipboard.writeText(snapshotData);
    toast({ title: "Copied to clipboard" });
  };

  const triggerAction = async (act: string, label: string) => {
    try {
      const result = await action.mutateAsync({ action: act });
      toast({ title: "Success", description: `${label}: ${JSON.stringify(result).slice(0, 100)}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const challenge = daily?.challenge;
  const completions = daily?.completions || [];

  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  const warningAlerts = alerts.filter(a => a.severity === "warning");
  const infoAlerts = alerts.filter(a => a.severity === "info");

  return (
    <div className="space-y-6">
      {/* System Health Alerts */}
      {!alertsLoading && alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              System Health
              {criticalAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-2">{criticalAlerts.length} Critical</Badge>
              )}
              {warningAlerts.length > 0 && (
                <Badge className="ml-1 bg-amber-500/20 text-amber-700 hover:bg-amber-500/30">{warningAlerts.length} Warning</Badge>
              )}
              {alerts.length === 0 && <Badge className="ml-2 bg-emerald-500/20 text-emerald-700">All OK</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {criticalAlerts.map(a => <AlertCard key={a.code} alert={a} />)}
            {warningAlerts.map(a => <AlertCard key={a.code} alert={a} />)}
            {infoAlerts.map(a => <AlertCard key={a.code} alert={a} />)}
          </CardContent>
        </Card>
      )}

      {alertsLoading && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading system health...
          </CardContent>
        </Card>
      )}

      {/* Diagnostic Export */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Button onClick={exportSnapshot} disabled={snapshotLoading} className="gap-2">
              {snapshotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Diagnostic Snapshot
            </Button>
            <p className="text-xs text-muted-foreground pt-2">Generates a full system snapshot for external analysis.</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={snapshotOpen} onOpenChange={setSnapshotOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Diagnostic Snapshot</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 pb-2">
            <Button size="sm" variant="outline" onClick={copySnapshot} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copy to clipboard
            </Button>
            <Button size="sm" variant="outline" onClick={downloadSnapshot} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Download as JSON
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0 rounded border bg-muted/50 p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">{snapshotData}</pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Daily Challenge Status */}
      <Card>
        <CardHeader><CardTitle className="text-base">Today's Daily Challenge</CardTitle></CardHeader>
        <CardContent>
          {challenge ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><p className="text-xs text-muted-foreground">Date</p><p className="font-mono">{challenge.date}</p></div>
                <div><p className="text-xs text-muted-foreground">Game Mode</p><p>{challenge.game_mode}</p></div>
                <div><p className="text-xs text-muted-foreground">DDS Range</p><p className="font-mono">{challenge.target_dds_min}–{challenge.target_dds_max}</p></div>
                <div><p className="text-xs text-muted-foreground">Day of Week</p><p>{challenge.day_of_week}</p></div>
              </div>
              {challenge.deals && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t">
                  <div><p className="text-xs text-muted-foreground">Seed</p><p className="font-mono">{challenge.deals.seed}</p></div>
                  <div><p className="text-xs text-muted-foreground">DDS Blended</p><p className="font-mono">{challenge.deals.dds_blended}</p></div>
                  <div><p className="text-xs text-muted-foreground">Confidence</p><p className="font-mono">{challenge.deals.confidence}</p></div>
                  <div><p className="text-xs text-muted-foreground">Pool Attempts</p><p>{challenge.deals.pool_attempts}</p></div>
                </div>
              )}
              {completions.length > 0 && (
                <div className="pt-3">
                  <p className="text-sm font-medium mb-2">Completions ({completions.length})</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Moves</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completions.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell>{c.profiles?.display_name || "—"}</TableCell>
                          <TableCell><Badge variant={c.result === "won" ? "default" : "destructive"}>{c.result}</Badge></TableCell>
                          <TableCell>{c.actual_moves}</TableCell>
                          <TableCell>{Math.floor(c.actual_time / 60)}:{(c.actual_time % 60).toString().padStart(2, "0")}</TableCell>
                          <TableCell className="font-mono">{c.final_delta >= 0 ? "+" : ""}{c.final_delta}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <span>No daily challenge seeded for today</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table Row Counts */}
      <Card>
        <CardHeader><CardTitle className="text-base">Table Row Counts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables && Object.entries(tables).sort(([, a], [, b]) => (b as number) - (a as number)).map(([table, count]) => (
                <TableRow key={table}>
                  <TableCell className="font-mono text-sm">{table}</TableCell>
                  <TableCell className="text-right font-mono">{(count as number).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manual Actions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Manual Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => triggerAction("trigger_seed", "Seed daily")} disabled={action.isPending}>
              <Play className="h-4 w-4 mr-2" /> Seed Today's Challenge
            </Button>
            <Button variant="outline" onClick={() => triggerAction("trigger_refill", "Refill queues")} disabled={action.isPending}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refill All Deal Queues
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Starter Pool Generator */}
      <StarterPoolGenerator />
    </div>
  );
}
