"use client";
import { CalendarPlus } from "lucide-react";
import { Card } from "./ui";
import { EventForm } from "./event-form";
import { useApp } from "./app-provider";

export function EventGate() {
  const { createEvent, toast } = useApp();
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-accent text-accent-ink"><CalendarPlus className="h-5 w-5" /></div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your event</h1>
        <p className="mt-1 text-sm text-muted">Set the event details and when wristband QR codes are valid. You can add guests next.</p>
      </div>
      <Card className="p-5 sm:p-6">
        <EventForm submitLabel="Create event" onSubmit={async (v) => { await createEvent(v); toast({ kind: "success", title: "Event created" }); }} />
      </Card>
    </div>
  );
}
