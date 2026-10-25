import { Loader2 } from "lucide-react";

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status" aria-label="Loading">
      <Loader2 className="text-primary size-8 animate-spin" />
    </div>
  );
}
