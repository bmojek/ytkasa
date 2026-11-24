"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Nie udało się zalogować do panelu.");
        return;
      }
      router.refresh();
    } catch {
      setError("Nie udało się połączyć z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <Link className="brand" href="/">
          <span className="brand-mark">#</span>
          <span>Filmy i TikToki</span>
        </Link>
        <p className="eyebrow" style={{ marginTop: 32 }}>
          Dostęp prywatny
        </p>
        <h1>Panel rozliczeń</h1>
        <p className="page-description">
          Podaj hasło administratora, aby zobaczyć podsumowanie wspólnej bazy.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label className="field-label">
            Hasło administratora
            <input
              autoComplete="current-password"
              className="text-input"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <p className="feedback">{error}</p>}
          <button className="primary-button full-width" disabled={busy} type="submit">
            {busy ? "Sprawdzam..." : "Otwórz panel"}
          </button>
        </form>
      </section>
    </main>
  );
}
