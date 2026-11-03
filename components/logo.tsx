import { cn } from "@/lib/utils";
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-bg">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <span className="text-[15px] font-semibold tracking-tight">Gatekeeper</span>
    </div>
  );
}
