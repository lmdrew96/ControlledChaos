"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Pill,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  Check,
  Minus,
  Pause,
  Play,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Medication, MedicationSchedule } from "@/types";

const DEFAULT_SCHEDULE: MedicationSchedule = { type: "daily" };
const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MedForm {
  name: string;
  dosage: string;
  notes: string;
  reminderTimes: string[];
  schedule: MedicationSchedule;
}

const EMPTY_FORM: MedForm = {
  name: "",
  dosage: "",
  notes: "",
  reminderTimes: ["09:00"],
  schedule: { type: "daily" },
};

function formatSchedule(schedule: MedicationSchedule): string {
  if (schedule.type === "daily") return "Every day";
  if (schedule.type === "interval") return `Every ${schedule.everyDays} days`;
  if (schedule.type === "weekly") {
    const days = schedule.daysOfWeek.map((d) => DAYS_OF_WEEK[d]).join(", ");
    return days;
  }
  return "Every day";
}

interface AdherenceData {
  date: string;
  slots: Array<{ time: string; taken: boolean; takenAt: string | null }>;
}

export function MedicationSettings() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MedForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [adherenceData, setAdherenceData] = useState<Record<string, AdherenceData[]>>({});
  const [expandedMedId, setExpandedMedId] = useState<string | null>(null);

  const fetchMedications = useCallback(async () => {
    try {
      const res = await fetch("/api/medications");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMedications(data.medications ?? []);
    } catch {
      toast.error("Failed to load medications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const fetchAdherence = async (medId: string) => {
    try {
      const res = await fetch(`/api/medications/${medId}/adherence?days=7`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAdherenceData((prev) => ({ ...prev, [medId]: data.adherence }));
    } catch {
      toast.error("Failed to load adherence data");
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (med: Medication) => {
    setEditingId(med.id);
    setForm({
      name: med.name,
      dosage: med.dosage,
      notes: med.notes ?? "",
      reminderTimes: med.reminderTimes,
      schedule: med.schedule,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.dosage.trim() || form.reminderTimes.length === 0) {
      toast.error("Name, dosage, and at least one reminder time are required");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name,
        dosage: form.dosage,
        notes: form.notes || undefined,
        reminderTimes: form.reminderTimes,
        schedule: form.schedule,
      };

      const url = editingId ? `/api/medications/${editingId}` : "/api/medications";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        return;
      }
      toast.success(editingId ? "Medication updated!" : "Medication added!");
      setDialogOpen(false);
      fetchMedications();
    } catch {
      toast.error("Failed to save medication");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/medications/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      toast.success("Medication removed");
      fetchMedications();
    } catch {
      toast.error("Failed to delete medication");
    }
  };

  const handleToggleActive = async (med: Medication) => {
    try {
      const res = await fetch(`/api/medications/${med.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !med.isActive }),
      });
      if (!res.ok) {
        toast.error("Failed to update");
        return;
      }
      toast.success(med.isActive ? "Reminders paused" : "Reminders resumed");
      fetchMedications();
    } catch {
      toast.error("Failed to update medication");
    }
  };

  const handleLogTaken = async (medId: string, time: string, date: string) => {
    try {
      const res = await fetch("/api/medications/taken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "self", // The API will use the auth session
          medicationId: medId,
          scheduledDate: date,
          scheduledTime: time,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Dose logged!");
      fetchAdherence(medId);
    } catch {
      toast.error("Failed to log dose");
    }
  };

  const addReminderTime = () => {
    setForm((prev) => ({
      ...prev,
      reminderTimes: [...prev.reminderTimes, "12:00"],
    }));
  };

  const removeReminderTime = (index: number) => {
    setForm((prev) => ({
      ...prev,
      reminderTimes: prev.reminderTimes.filter((_, i) => i !== index),
    }));
  };

  const updateReminderTime = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      reminderTimes: prev.reminderTimes.map((t, i) => (i === index ? value : t)),
    }));
  };

  const toggleDayOfWeek = (day: number) => {
    setForm((prev) => {
      const current = prev.schedule.type === "weekly" ? prev.schedule.daysOfWeek : [];
      const updated = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort();
      return { ...prev, schedule: { type: "weekly", daysOfWeek: updated } };
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading medications...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Medications</CardTitle>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {medications.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Pill className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>No medications yet. Add one to get reminders!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {medications.map((med) => {
                const isExpanded = expandedMedId === med.id;
                return (
                  <div key={med.id} className="rounded-lg border p-4 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className={`text-sm font-medium ${!med.isActive ? "text-muted-foreground line-through" : ""}`}>
                            {med.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{med.dosage}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleActive(med)}
                          title={med.isActive ? "Pause reminders" : "Resume reminders"}
                        >
                          {med.isActive ? (
                            <Pause className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Play className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(med)}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {med.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove all reminders and adherence history for this medication.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(med.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Schedule + times */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {formatSchedule(med.schedule)}
                      </Badge>
                      {(med.reminderTimes as string[]).map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs gap-1">
                          <Clock className="h-3 w-3" />
                          {t}
                        </Badge>
                      ))}
                    </div>

                    {med.notes && (
                      <p className="text-xs text-muted-foreground">{med.notes}</p>
                    )}

                    {/* Adherence toggle */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedMedId(null);
                        } else {
                          setExpandedMedId(med.id);
                          if (!adherenceData[med.id]) fetchAdherence(med.id);
                        }
                      }}
                    >
                      {isExpanded ? "Hide" : "Show"} adherence (7 days)
                    </Button>

                    {/* Adherence grid */}
                    {isExpanded && adherenceData[med.id] && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="py-1 pr-2 text-left font-medium text-muted-foreground">Date</th>
                              {(med.reminderTimes as string[]).map((t) => (
                                <th key={t} className="py-1 px-2 text-center font-medium text-muted-foreground">
                                  {t}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {adherenceData[med.id].map((day) => {
                              const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              });
                              const isToday = day.date === new Date().toISOString().slice(0, 10);
                              return (
                                <tr key={day.date} className={`border-b ${isToday ? "bg-primary/5" : ""}`}>
                                  <td className="py-1.5 pr-2 text-muted-foreground">{dateLabel}</td>
                                  {day.slots.map((slot) => (
                                    <td key={slot.time} className="py-1.5 px-2 text-center">
                                      {slot.taken ? (
                                        <Check className="mx-auto h-4 w-4 text-green-500" />
                                      ) : isToday ? (
                                        <button
                                          onClick={() => handleLogTaken(med.id, slot.time, day.date)}
                                          className="mx-auto flex h-5 w-5 items-center justify-center rounded border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/10 transition-colors"
                                          title="Mark as taken"
                                        >
                                          <Plus className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                      ) : (
                                        <Minus className="mx-auto h-4 w-4 text-muted-foreground/30" />
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Medication" : "Add Medication"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Medication Name</label>
              <Input
                placeholder="e.g., Adderall XR"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* Dosage */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Dosage</label>
              <Input
                placeholder="e.g., 20mg"
                value={form.dosage}
                onChange={(e) => setForm((prev) => ({ ...prev, dosage: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g., Take with food"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {/* Reminder Times */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Reminder Times</label>
              {form.reminderTimes.map((time, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => updateReminderTime(i, e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  {form.reminderTimes.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeReminderTime(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addReminderTime}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add time
              </Button>
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Schedule</label>
              <div className="grid gap-2">
                {(["daily", "weekly", "interval"] as const).map((type) => {
                  const selected = form.schedule.type === type;
                  const labels = { daily: "Every day", weekly: "Specific days", interval: "Every X days" };
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        if (type === "daily") setForm((prev) => ({ ...prev, schedule: { type: "daily" } }));
                        else if (type === "weekly") setForm((prev) => ({ ...prev, schedule: { type: "weekly", daysOfWeek: [1, 2, 3, 4, 5] } }));
                        else setForm((prev) => ({ ...prev, schedule: { type: "interval", everyDays: 2, startDate: new Date().toISOString().slice(0, 10) } }));
                      }}
                      className={`rounded-md border p-2.5 text-left text-sm transition-colors ${
                        selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                      }`}
                    >
                      {labels[type]}
                    </button>
                  );
                })}
              </div>

              {/* Weekly day picker */}
              {form.schedule.type === "weekly" && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DAYS_OF_WEEK.map((day, i) => {
                    const active = form.schedule.type === "weekly" && form.schedule.daysOfWeek.includes(i);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOfWeek(i)}
                        className={`h-8 w-10 rounded-md text-xs font-medium transition-colors ${
                          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Interval input */}
              {form.schedule.type === "interval" && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-sm text-muted-foreground">Every</span>
                  <Input
                    type="number"
                    min={2}
                    max={90}
                    value={form.schedule.everyDays}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        schedule: {
                          type: "interval",
                          everyDays: parseInt(e.target.value) || 2,
                          startDate: (prev.schedule as { startDate?: string }).startDate ?? new Date().toISOString().slice(0, 10),
                        },
                      }))
                    }
                    className="h-9 w-20"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              )}
            </div>

            {/* Save */}
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingId ? (
                "Save Changes"
              ) : (
                "Add Medication"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
