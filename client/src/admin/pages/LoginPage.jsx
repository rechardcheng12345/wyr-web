import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "../components/FormField";
import { FullPageSpinner } from "../components/FullPageSpinner";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { user, login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const target = location.state?.from && location.state.from !== "/system/login" ? location.state.from : "/system/inventory";

  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to={target} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.status === 401 ? "Invalid username or password." : "Could not sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <title>Sign in · WYR Admin</title>
      <div className="bg-card w-full max-w-sm rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="bg-primary text-primary-foreground mx-auto flex size-11 items-center justify-center rounded-lg">
          <Lock className="size-5" />
        </div>
        <h1 className="mt-4 text-center text-xl font-bold">WYR Admin</h1>
        <p className="text-muted-foreground mt-1 text-center text-sm">Sign in to manage the store</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <FormField label="Username or email" htmlFor="username">
            <Input id="username" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
          </FormField>
          <FormField label="Password" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          {error && (
            <p role="alert" className="text-destructive rounded-md bg-red-50 px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
