import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Wheat,
} from "lucide-react";

import { loginUser } from "@/api/client";
import { useAuth } from "@/lib/auth";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as any).response?.data?.message === "string"
  ) {
    return (error as any).response.data.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Check username and password.";
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedMessage = sessionStorage.getItem("kam_grains_session_expired_message");

    if (storedMessage) {
      setSessionNotice(storedMessage);
      sessionStorage.removeItem("kam_grains_session_expired_message");
    }
  }, []);

  const from =
    typeof location.state === "object" &&
    location.state !== null &&
    "from" in location.state
      ? String((location.state as { from?: string }).from || "/")
      : "/";

  const loginMutation = useMutation({
  mutationFn: loginUser,
  onSuccess: (response) => {
    if (!response?.user) {
      return;
    }

    if (response?.token) {
      localStorage.setItem("token", response.token);
    }

    login(response.user);
    navigate(from, { replace: true });
  },
});

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password) return;

    loginMutation.mutate({
      username: username.trim(),
      password,
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-12 lg:flex">
          <div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <Wheat className="h-7 w-7 text-emerald-300" />
            </div>

            <h1 className="mt-8 text-5xl font-bold tracking-tight">
              KAM GRAINS
            </h1>

            <p className="mt-3 max-w-xl text-lg text-slate-300">
              Local web-based ERP for purchasing, inventory, production, sales,
              finance, reporting, and audit control.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard
              title="Inventory"
              text="Track stock, lots, movements, and counts."
            />
            <InfoCard
              title="Finance"
              text="Control invoices, receipts, payments, and journals."
            />
            <InfoCard
              title="Audit"
              text="Monitor changes and posting activity."
            />
          </div>
        </section>

        <section className="flex items-center justify-center bg-slate-100 p-6 text-slate-950">
          <Card className="w-full max-w-md rounded-3xl border-0 shadow-2xl">
            <CardHeader className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <LockKeyhole className="h-7 w-7" />
              </div>

              <div>
                <CardTitle className="text-2xl font-bold">
                  Sign in to KAM GRAINS
                </CardTitle>
                <p className="mt-2 text-sm text-slate-500">
                  Enter your username and password to continue.
                </p>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {sessionNotice && (
                  <Alert variant="default" className="border-amber-300 bg-amber-50 text-amber-900">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Session expired</AlertTitle>
                    <AlertDescription>{sessionNotice}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter username"
                    autoComplete="username"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>

                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="pr-11"
                    />

                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {loginMutation.isError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Login failed</AlertTitle>
                    <AlertDescription>
                      {getErrorMessage(loginMutation.error)}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    !username.trim() || !password || loginMutation.isPending
                  }
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>

                <p className="text-center text-xs text-slate-500">
                  Access is restricted to authorized KAM GRAINS users.
                </p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-300">{text}</p>
    </div>
  );
}
