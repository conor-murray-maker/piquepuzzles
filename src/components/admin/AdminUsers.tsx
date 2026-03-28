import { useState } from "react";
import { useAdminData, useAdminAction } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, Download, RotateCcw, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AdminUsers() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; type: string; name: string } | null>(null);
  const { toast } = useToast();
  const action = useAdminAction();

  const { data, isLoading, refetch } = useAdminData("users_list", { page, search, sortBy, sortDir, pageSize: 20 });
  const { data: userDetail } = useAdminData("user_detail", { userId: expandedUser }, { enabled: !!expandedUser });

  const users = data?.users || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
    setPage(0);
  };

  const handleAction = async () => {
    if (!confirmAction) return;
    try {
      await action.mutateAsync({ action: "user_action", params: { userId: confirmAction.userId, actionType: confirmAction.type } });
      toast({ title: "Success", description: `Action completed for ${confirmAction.name}` });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setConfirmAction(null);
  };

  const exportUserHistory = async (userId: string, name: string) => {
    try {
      const data = await action.mutateAsync({ action: "export_user_history", params: { userId } });
      const csv = arrayToCsv(data);
      downloadCsv(csv, `${name}_game_history.csv`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort(col)}>
      {children} {sortBy === col && (sortDir === "asc" ? "↑" : "↓")}
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <SortHeader col="rating">IQ</SortHeader>
                <SortHeader col="games_played">Games</SortHeader>
                <TableHead>Win%</TableHead>
                <SortHeader col="current_streak">Streak</SortHeader>
                <SortHeader col="best_streak">Best</SortHeader>
                <TableHead>Status</TableHead>
                <SortHeader col="created_at">Joined</SortHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">No users found</TableCell></TableRow>
              ) : users.map((u: any) => (
                <>
                  <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {(u.display_name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{u.display_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{u.rating}</TableCell>
                    <TableCell>{u.games_played}</TableCell>
                    <TableCell>{u.win_rate}%</TableCell>
                    <TableCell>{u.current_streak > 0 ? `🔥 ${u.current_streak}` : "—"}</TableCell>
                    <TableCell>{u.best_streak}</TableCell>
                    <TableCell>
                      <Badge variant={u.subscription_status === "premium" ? "default" : "secondary"}>
                        {u.subscription_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                  {expandedUser === u.id && (
                    <TableRow key={`${u.id}-detail`}>
                      <TableCell colSpan={8} className="bg-muted/30 p-4">
                        <div className="space-y-3">
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setConfirmAction({ userId: u.id, type: "reset_rating", name: u.display_name }); }}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Reset IQ
                            </Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setConfirmAction({ userId: u.id, type: "grant_premium", name: u.display_name }); }}>
                              <Crown className="h-3 w-3 mr-1" /> Grant Premium 30d
                            </Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); exportUserHistory(u.id, u.display_name || "user"); }}>
                              <Download className="h-3 w-3 mr-1" /> Export CSV
                            </Button>
                          </div>
                          {userDetail?.games?.length > 0 && (
                            <div className="overflow-x-auto">
                              <p className="text-sm font-medium mb-2">Recent Games</p>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Mode</TableHead>
                                    <TableHead>Result</TableHead>
                                    <TableHead>Moves</TableHead>
                                    <TableHead>Time</TableHead>
                                    <TableHead>Hints</TableHead>
                                    <TableHead>Before</TableHead>
                                    <TableHead>After</TableHead>
                                    <TableHead>Δ</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {userDetail.games.map((g: any) => (
                                    <TableRow key={g.id}>
                                      <TableCell className="text-xs">{new Date(g.played_at).toLocaleDateString()}</TableCell>
                                      <TableCell className="text-xs">{g.game_mode}</TableCell>
                                      <TableCell>
                                        <Badge variant={g.won ? "default" : "destructive"} className="text-xs">
                                          {g.won ? "Won" : "Lost"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>{g.moves}</TableCell>
                                      <TableCell>{Math.floor(g.time_seconds / 60)}:{(g.time_seconds % 60).toString().padStart(2, "0")}</TableCell>
                                      <TableCell>{g.hints_used}</TableCell>
                                      <TableCell className="font-mono text-xs">{g.rating_before}</TableCell>
                                      <TableCell className="font-mono text-xs">{g.rating_after}</TableCell>
                                      <TableCell className={`font-mono text-xs ${g.rating_change >= 0 ? "text-green-600" : "text-red-500"}`}>
                                        {g.rating_change >= 0 ? "+" : ""}{g.rating_change}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} users total</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm py-1 px-2">{page + 1} / {totalPages || 1}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {confirmAction?.type === "reset_rating"
              ? `Reset Pique IQ to 1000 for ${confirmAction?.name}?`
              : `Grant 30 days Premium to ${confirmAction?.name}?`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button onClick={handleAction} disabled={action.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function arrayToCsv(data: any[]) {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
