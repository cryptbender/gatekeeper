"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Badge, Button, Modal, Select } from "@/components/ui";
import { FIELD_LABELS, ISSUE_LABEL, autoMap, buildRows, looksLikeHeader, summarize, type Field, type Mapping } from "@/lib/importer";
import type { GuestInput } from "@/lib/types";
import type { ParseResponse } from "@/lib/parse.worker";
import { cn } from "@/lib/utils";

type Step = "pick" | "map" | "importing" | "done";
const MAX_BYTES = 15 * 1024 * 1024;
const FIELDS: Field[] = ["full_name", "phone", "email", "category"];

export function ImportModal({ open, onClose, existing, onImport }: {
  open: boolean; onClose: () => void; existing: GuestInput[];
  onImport: (guests: GuestInput[], onProgress: (done: number) => void) => Promise<number>;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState("");
  const [data, setData] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({ full_name: -1, phone: -1, email: -1, category: -1 });
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; total: number; duplicates: number; invalid: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);

  const reset = useCallback(() => {
    setStep("pick"); setFileName(""); setData([]); setError(null); setParsing(false); setProgress(0); setResult(null); setHasHeader(true);
  }, []);
  useEffect(() => { if (open) reset(); }, [open, reset]);
  useEffect(() => () => worker.current?.terminate(), []);

  const headers = useMemo(() => (hasHeader ? data[0] ?? [] : (data[0] ?? []).map((_, i) => `Column ${i + 1}`)), [data, hasHeader]);
  const rows = useMemo(() => (step === "map" ? buildRows(data, mapping, hasHeader, existing) : []), [step, data, mapping, hasHeader, existing]);
  const sum = useMemo(() => summarize(rows), [rows]);
  const problems = useMemo(() => rows.filter((r) => r.issue).slice(0, 50), [rows]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return setError("Unsupported file type. Upload a .csv, .xlsx or .xls file.");
    if (file.size > MAX_BYTES) return setError("File is larger than 15 MB.");
    setParsing(true); setFileName(file.name);
    file.arrayBuffer().then((buffer) => {
      worker.current?.terminate();
      const w = new Worker(new URL("../../lib/parse.worker.ts", import.meta.url));
      worker.current = w;
      w.onmessage = (e: MessageEvent<ParseResponse>) => {
        setParsing(false);
        const res = e.data;
        if (!res.ok) return setError(res.error);
        if (res.rows.length === 0) return setError("The file is empty.");
        const header = looksLikeHeader(res.rows[0]);
        const map = autoMap(header ? res.rows[0] : []);
        if (header && map.full_name === -1) map.full_name = 0; // sensible fallback: first column is the name
        if (!header) map.full_name = 0;
        setData(res.rows); setHasHeader(header); setMapping(map); setStep("map");
      };
      w.onerror = () => { setParsing(false); setError("Could not read this file."); };
      w.postMessage({ name: file.name, buffer }, [buffer]);
    }).catch(() => { setParsing(false); setError("Could not read this file."); });
  }

  async function confirm() {
    const valid = rows.filter((r) => !r.issue).map((r) => r.guest);
    if (!valid.length) return;
    setStep("importing"); setProgress(0);
    try {
      const imported = await onImport(valid, setProgress);
      setResult({ imported, total: sum.total, duplicates: sum.duplicates, invalid: sum.invalid });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed"); setStep("map");
    }
  }

  const footer = step === "map" ? (
    <>
      <Button onClick={reset}>Choose another file</Button>
      <Button variant="primary" disabled={sum.valid === 0 || mapping.full_name < 0} onClick={() => void confirm()}>Import {sum.valid.toLocaleString()} guest{sum.valid === 1 ? "" : "s"}</Button>
    </>
  ) : step === "done" ? <Button variant="primary" onClick={onClose}>Done</Button> : undefined;

  return (
    <Modal open={open} onClose={step === "importing" ? () => {} : onClose} wide title="Upload guest list" description="CSV, XLSX or XLS · first sheet is used" footer={footer}>
      <AnimatePresence mode="wait" initial={false}>
        {step === "pick" && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
              className={cn("flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition", drag ? "border-accent bg-accent/5" : "border-line bg-subtle/40")}>
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent"><UploadCloud className="h-6 w-6" /></div>
              <p className="text-sm font-medium">{parsing ? `Reading ${fileName}…` : "Drag and drop your guest list here"}</p>
              <p className="mt-1 text-sm text-muted">or</p>
              <Button className="mt-3" loading={parsing} onClick={() => input.current?.click()}>Browse files</Button>
              <input ref={input} type="file" hidden accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border text-[13px]">
              <table className="w-full min-w-[420px]"><thead className="bg-subtle text-left text-muted"><tr>{["Name", "Phone", "Email", "Category"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody><tr className="border-t"><td className="px-3 py-2">Rahul Kumar</td><td className="px-3 py-2">9876543210</td><td className="px-3 py-2">rahul@example.com</td><td className="px-3 py-2">VIP</td></tr></tbody></table>
            </div>
            <p className="mt-2 text-xs text-muted">Only Name is required. Columns are detected automatically and can be re-mapped next.</p>
            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          </motion.div>
        )}

        {step === "map" && (
          <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="flex items-center gap-2 text-sm"><FileSpreadsheet className="h-4 w-4 text-muted" /><span className="truncate font-medium">{fileName}</span></div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["Total records", sum.total, ""], ["Ready to import", sum.valid, "text-ok"], ["Duplicates", sum.duplicates, "text-warn"], ["Invalid", sum.invalid, "text-danger"]].map(([l, v, c]) => (
                <div key={l as string} className="rounded-xl border bg-subtle/40 px-3 py-2.5"><p className="text-xs text-muted">{l}</p><p className={cn("text-xl font-semibold tabular-nums", c as string)}>{(v as number).toLocaleString()}</p></div>
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Column mapping</h3>
                <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={hasHeader}
                  onChange={(e) => { const h = e.target.checked; setHasHeader(h); setMapping(autoMap(h ? data[0] ?? [] : [])); }} />First row is a header</label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <label key={f} className="block">
                    <span className="mb-1 block text-[13px] font-medium">{FIELD_LABELS[f]}{f === "full_name" && <span className="ml-1 text-danger">*</span>}</span>
                    <Select value={mapping[f]} onChange={(e) => setMapping((m) => ({ ...m, [f]: Number(e.target.value) }))}>
                      <option value={-1}>{f === "full_name" ? "Select a column…" : "Don’t import"}</option>
                      {headers.map((h, i) => <option key={i} value={i}>{String(h).trim() || `Column ${i + 1}`}</option>)}
                    </Select>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Preview</h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead className="bg-subtle text-left text-muted"><tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Phone</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2" /></tr></thead>
                  <tbody>
                    {rows.slice(0, 8).map((r) => (
                      <tr key={r.line} className="border-t">
                        <td className="px-3 py-2 font-medium">{r.guest.full_name || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2">{r.guest.phone ?? "—"}</td><td className="px-3 py-2">{r.guest.email ?? "—"}</td><td className="px-3 py-2">{r.guest.category ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{r.issue ? <Badge tone={r.issue.startsWith("duplicate") ? "warn" : "danger"}>{ISSUE_LABEL[r.issue]}</Badge> : <Badge tone="ok">OK</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <p className="mt-1.5 text-xs text-muted">Showing first 8 of {rows.length.toLocaleString()} rows.</p>}
            </div>

            {problems.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-warn" />Rows that will be skipped</h3>
                <ul className="max-h-40 divide-y overflow-y-auto rounded-xl border text-[13px]">
                  {problems.map((r) => (
                    <li key={r.line} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate"><span className="text-muted">Row {r.line}</span> · {r.guest.full_name || "(no name)"}</span>
                      <Badge tone={r.issue!.startsWith("duplicate") ? "warn" : "danger"}>{ISSUE_LABEL[r.issue!]}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </motion.div>
        )}

        {step === "importing" && (
          <motion.div key="importing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-10 text-center">
            <p className="text-sm font-medium">Importing guests and generating QR tickets…</p>
            <div className="mx-auto mt-5 h-2 max-w-xs overflow-hidden rounded-full bg-subtle">
              <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${sum.valid ? Math.min(100, (progress / sum.valid) * 100) : 0}%` }} />
            </div>
            <p className="mt-2 text-xs tabular-nums text-muted">{progress.toLocaleString()} / {sum.valid.toLocaleString()}</p>
          </motion.div>
        )}

        {step === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-4 text-center">
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-ok/10 text-ok"><CheckCircle2 className="h-7 w-7" /></motion.div>
            <h3 className="text-lg font-semibold">Import complete</h3>
            <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
              {[["Total records", result.total, ""], ["Imported", result.imported, "text-ok"], ["Duplicates", result.duplicates, "text-warn"], ["Invalid", result.invalid, "text-danger"]].map(([l, v, c]) => (
                <div key={l as string} className="rounded-xl border bg-subtle/40 px-3 py-2.5"><p className="text-xs text-muted">{l}</p><p className={cn("text-xl font-semibold tabular-nums", c as string)}>{v}</p></div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
