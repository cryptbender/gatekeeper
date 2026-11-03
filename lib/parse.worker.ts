/// <reference lib="webworker" />
// Parses CSV / XLS / XLSX off the main thread so large files never freeze the UI.
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParseRequest { name: string; buffer: ArrayBuffer }
export type ParseResponse = { ok: true; rows: string[][] } | { ok: false; error: string };

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  try {
    const { name, buffer } = e.data;
    const lower = name.toLowerCase();
    let rows: string[][];
    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
      const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
      rows = res.data.map((r) => r.map((c) => String(c ?? "")));
    } else {
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("The workbook has no sheets");
      const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
      rows = raw.map((r) => r.map((c) => String(c ?? "")));
    }
    const msg: ParseResponse = { ok: true, rows };
    (self as DedicatedWorkerGlobalScope).postMessage(msg);
  } catch (err) {
    const msg: ParseResponse = { ok: false, error: err instanceof Error ? err.message : "Could not read file" };
    (self as DedicatedWorkerGlobalScope).postMessage(msg);
  }
};
