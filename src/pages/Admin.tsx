import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminDeals } from "@/components/admin/AdminDeals";
import { AdminGames } from "@/components/admin/AdminGames";
import { AdminStreaks } from "@/components/admin/AdminStreaks";
import { AdminSystem } from "@/components/admin/AdminSystem";
import { LayoutDashboard, Users, Database, Gamepad2, Flame, Settings } from "lucide-react";

const ADMIN_EMAILS = ["conor-murray@hotmail.com"];

export default function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!loading && (!user || !ADMIN_EMAILS.includes(user.email || ""))) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user || !ADMIN_EMAILS.includes(user.email || "")) return null;

  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "deals", label: "Deals & DDS", icon: Database },
    { id: "games", label: "Games", icon: Gamepad2 },
    { id: "streaks", label: "Streaks", icon: Flame },
    { id: "system", label: "System", icon: Settings },
  ];

  return (
    <div className="bg-muted/30 overflow-y-auto overscroll-contain" style={{ position: 'fixed', inset: 0, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', WebkitOverflowScrolling: 'touch' }}>
      <div className="border-b bg-background">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">P</span>
          </div>
          <h1 className="text-lg font-bold">Pique Admin</h1>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview"><AdminOverview /></TabsContent>
          <TabsContent value="users"><AdminUsers /></TabsContent>
          <TabsContent value="deals"><AdminDeals /></TabsContent>
          <TabsContent value="games"><AdminGames /></TabsContent>
          <TabsContent value="streaks"><AdminStreaks /></TabsContent>
          <TabsContent value="system"><AdminSystem /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
