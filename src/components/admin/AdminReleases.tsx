import { useState } from "react";
import { useAdminData, useAdminAction } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Tag, Loader2 } from "lucide-react";

interface Release {
  id: string;
  version: string;
  title: string;
  notes: string[];
  released_at: string;
}

export function AdminReleases() {
  const { data: releases, refetch } = useAdminData("list_releases");
  const action = useAdminAction();
  const { toast } = useToast();

  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [notesText, setNotesText] = useState("");
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const handleCreate = async () => {
    const notes = notesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!version || !title || notes.length === 0) {
      toast({ title: "Missing fields", description: "Version, title, and at least one note are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await action.mutateAsync({ action: "create_release", params: { version, title, notes } });
      toast({ title: "Release created" });
      setVersion("");
      setTitle("");
      setNotesText("");
      setFormOpen(false);
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* New Release Form */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Release
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFormOpen(!formOpen)}
            >
              {formOpen ? "Cancel" : "Add Release"}
            </Button>
          </div>
        </CardHeader>
        {formOpen && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Version</label>
                <Input
                  placeholder="v0.4.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                <Input
                  placeholder="Feature Name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes (one per line)</label>
              <Textarea
                placeholder={"Added new feature X\nFixed bug Y\nImproved performance of Z"}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={5}
              />
            </div>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
              Save Release
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Release List */}
      {(releases as Release[] | undefined)?.map((release) => (
        <Card key={release.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono text-xs">
                {release.version}
              </Badge>
              <CardTitle className="text-base">{release.title}</CardTitle>
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDate(release.released_at)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {release.notes.map((note, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-1.5 shrink-0">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {!releases && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading releases...
          </CardContent>
        </Card>
      )}
    </div>
  );
}
