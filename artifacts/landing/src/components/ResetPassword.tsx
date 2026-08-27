import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export function ResetPassword() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
    [],
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token)
      return setError(
        "This reset link is incomplete. Request a new link from the app.",
      );
    if (password.length < 8)
      return setError("Use at least 8 characters for your new password.");
    if (password !== confirm) return setError("The passwords do not match.");

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error ?? "This link is invalid or has expired.");
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reset your password.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-md rounded-[2rem] border border-border bg-white p-7 shadow-[0_24px_80px_rgba(15,34,26,0.12)] sm:p-10">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft size={16} /> MOVE Apayao
        </a>
        {complete ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto text-primary" size={54} />
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
              Password updated
            </h1>
            <p className="mt-3 leading-7 text-muted-foreground">
              Your password has been changed. You can now return to the
              passenger or driver app and sign in.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
              <KeyRound size={26} />
            </div>
            <p className="eyebrow text-primary">Account security</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
              Create a new password
            </h1>
            <p className="mt-3 leading-7 text-muted-foreground">
              This secure link can be used once and expires after one hour.
            </p>
            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block text-sm font-semibold">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:border-primary"
                />
              </label>
              <label className="block text-sm font-semibold">
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="mt-2 w-full rounded-xl border bg-background px-4 py-3 outline-none focus:border-primary"
                />
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-primary px-5 py-3.5 font-bold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
