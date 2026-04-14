"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DisplayNameSettings() {
  const [name, setName] = useState("");
  const [original, setOriginal] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const displayName = data.displayName ?? "";
        setName(displayName);
        setOriginal(displayName);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const isDirty = name !== original;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      if (!res.ok) throw new Error();
      setOriginal(name.trim());
      toast.success("Name updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-10 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="display-name">Display Name</Label>
      <div className="flex gap-2">
        <Input
          id="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="max-w-xs"
        />
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
