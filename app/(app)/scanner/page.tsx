import type { Metadata } from "next";
import { ScannerView } from "@/components/scanner/scanner-view";

export const metadata: Metadata = { title: "QR Scanner" };
export default function ScannerPage() { return <ScannerView />; }
