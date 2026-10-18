import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-primary text-sm font-semibold">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground mt-3">The page you're looking for doesn't exist or the product is no longer listed.</p>
      <Button asChild className="mt-8">
        <Link to="/products">Browse products</Link>
      </Button>
    </div>
  );
}
