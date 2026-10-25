import { FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function AdminNotFoundPage() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <FileQuestion className="text-muted-foreground size-12" />
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground mt-2 text-sm">This admin page doesn't exist.</p>
      <Button asChild className="mt-6">
        <Link to="/system/inventory">Go to Inventory</Link>
      </Button>
    </div>
  );
}
