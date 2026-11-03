"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Modal, PageHeader, Switch } from "@/components/ui";
import { useApp } from "@/components/app-provider";
import { EventForm } from "@/components/event-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { fmtDate } from "@/lib/time";
import { primeAudio, playFeedback } from "@/lib/feedback";

export default function SettingsPage() {
  const { event, events, selectEvent, createEvent, updateEvent, deleteEvent, settings, setSettings, toast, mode, userEmail, signOut } = useApp();
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHeader title="Settings" description="Event details, entry validity and scanner preferences."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New event</Button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-5 text-base font-semibold">Event details &amp; validity</h2>
            {event ? (
              <EventForm key={event.id + event.valid_from + event.valid_until} initial={event} submitLabel="Save changes"
                onSubmit={async (v) => { await updateEvent(event.id, v); toast({ kind: "success", title: "Event updated", body: "Existing check-ins were not changed." }); }} />
            ) : <p className="text-sm text-muted">No event yet. Create one to get started.</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-base font-semibold">Scanner feedback</h2>
            <div className="space-y-4">
              <Switch label="Sound" description="Beeps on approve / reject" checked={settings.sound} onChange={(v) => { setSettings({ sound: v }); if (v) { primeAudio(); playFeedback("success", { sound: true, vibrate: false }); } }} />
              <Switch label="Vibration" description="Where the device supports it" checked={settings.vibrate} onChange={(v) => { setSettings({ vibrate: v }); if (v) playFeedback("success", { sound: false, vibrate: true }); }} />
              <div className="flex items-center justify-between"><span className="text-sm font-medium">Theme</span><ThemeToggle /></div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Events</h2>
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={e.id}>
                  <button onClick={() => selectEvent(e.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${e.id === event?.id ? "border-accent bg-accent/5" : "hover:bg-subtle"}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{e.name}</span><span className="block text-xs text-muted">{fmtDate(e.event_date)}</span></span>
                    {e.id === event?.id && <Badge tone="accent">Current</Badge>}
                  </button>
                </li>
              ))}
              {events.length === 0 && <li className="text-sm text-muted">No events.</li>}
            </ul>
            {event && <Button variant="ghost" className="mt-3 w-full text-danger hover:text-danger" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" />Delete this event</Button>}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Data &amp; account</h2>
            {mode === "supabase" ? (
              <div className="space-y-3 text-sm"><p className="text-muted">Connected to Supabase. Signed in as <span className="font-medium text-ink">{userEmail}</span>.</p><Button onClick={() => void signOut()}>Sign out</Button></div>
            ) : (
              <p className="text-sm text-muted"><Badge tone="warn" className="mr-1.5">Local dev</Badge>Supabase keys are not set, so data is kept in this browser only. Duplicate-entry protection is not enforced server-side in this mode.</p>
            )}
          </Card>
        </div>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} wide title="New event" description="Each event has its own guests, tickets and validity window.">
        <EventForm submitLabel="Create event" onCancel={() => setCreating(false)} onSubmit={async (v) => { await createEvent(v); setCreating(false); toast({ kind: "success", title: "Event created" }); }} />
      </Modal>

      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete event?" description={event?.name}
        footer={<><Button onClick={() => setConfirmDel(false)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={async () => { if (!event) return; setBusy(true); try { await deleteEvent(event.id); setConfirmDel(false); toast({ kind: "success", title: "Event deleted" }); } catch (e) { toast({ kind: "error", title: "Could not delete", body: e instanceof Error ? e.message : undefined }); } finally { setBusy(false); } }}>Delete event</Button></>}>
        <p className="text-sm text-muted">This permanently deletes the event, all guests, tickets and entry records. This cannot be undone.</p>
      </Modal>
    </>
  );
}
