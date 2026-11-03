"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Modal } from "@/components/ui";
import type { GuestInput, GuestRow } from "@/lib/types";
import { isEmail } from "@/lib/importer";

export function GuestFormModal({ open, onClose, guest, categories, onSave }: {
  open: boolean; onClose: () => void; guest: GuestRow | null; categories: string[]; onSave: (g: GuestInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(guest?.full_name ?? ""); setPhone(guest?.phone ?? ""); setEmail(guest?.email ?? ""); setCategory(guest?.category ?? "");
    setErr(null); setBusy(false);
  }, [open, guest]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Full name is required.");
    if (email.trim() && !isEmail(email.trim())) return setErr("Enter a valid email address.");
    setBusy(true); setErr(null);
    try { await onSave({ full_name: name, phone, email, category }); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : "Could not save guest"); setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={guest ? "Edit guest" : "Add guest"} description={guest ? undefined : "A unique QR code is generated automatically when you save."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{guest ? "Save changes" : "Save guest"}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} placeholder="Rahul Kumar" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" optional><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" /></Field>
          <Field label="Guest category" optional>
            <Input list="guest-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="VIP" maxLength={40} />
            <datalist id="guest-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <Field label="Email address" optional><Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@example.com" /></Field>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
