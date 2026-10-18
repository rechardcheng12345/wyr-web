import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Changing this (e.g. the route path) clears the error, so navigating away recovers. */
  resetKey?: unknown;
}

/** Catches render errors in a page so the header, footer and cart keep working instead of a blank screen. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center" role="alert">
        <AlertTriangle className="text-muted-foreground size-10" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Something went wrong on this page</h1>
        <p className="text-muted-foreground mt-3">
          Sorry about that. Reloading usually fixes it. Your cart is saved on this device, so nothing is lost.
        </p>
        <div className="mt-8 flex gap-3">
          <Button onClick={() => window.location.reload()}>Reload page</Button>
          <Button variant="outline" asChild>
            {/* Plain link: a full page load also clears whatever broke. */}
            <a href="/">Go to home page</a>
          </Button>
        </div>
      </div>
    );
  }
}
