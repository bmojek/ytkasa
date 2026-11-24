"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  addLinks,
  closeCurrentPeriod,
  loadTrackerData,
  removeLink,
  resumePeriod,
  type ContentType,
  type LinkEntry,
  type Period,
  type TrackerData,
} from "@/lib/tracker";

type TrackerAppProps = { view: "tracker" | "admin" };

const RATES: Record<ContentType, number> = { film: 100, tiktok: 30 };

function formatMoney(amount: number) {
  return `${amount.toLocaleString("pl-PL")} zł`;
}

function formatDate(timestamp: Period["startedAt"] | LinkEntry["createdAt"]) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(timestamp);
}

function periodEarnings(period: Period) {
  return period.filmCount * RATES.film + period.tiktokCount * RATES.tiktok;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("permission-denied")) {
      return "Brak dostępu do wspólnej bazy. Sprawdź reguły Firestore i logowanie anonimowe w Firebase.";
    }
    return error.message;
  }
  return "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.";
}

function parseLinks(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    try {
      const url = new URL(line);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        invalid.push(line);
      } else {
        valid.push(url.toString());
      }
    } catch {
      invalid.push(line);
    }
  }
  return { valid, invalid };
}

function AppHeader({ view }: TrackerAppProps) {
  const router = useRouter();
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <span className="brand-mark">#</span>
        <span>Filmy i TikToki</span>
      </Link>
      <div className="topbar-right">
        <nav className="nav-links" aria-label="Nawigacja">
          <Link className={`nav-link ${view === "tracker" ? "active" : ""}`} href="/">
            Licznik
          </Link>
        </nav>
        {view === "admin" && (
          <button
            className="subtle-button"
            onClick={async () => {
              try {
                const response = await fetch("/api/admin/session", {
                  method: "DELETE",
                });
                if (!response.ok) {
                  window.alert("Nie udało się wylogować z panelu.");
                  return;
                }
                router.refresh();
              } catch {
                window.alert("Nie udało się wylogować z panelu.");
              }
            }}
            type="button"
          >
            Wyloguj z panelu
          </button>
        )}
      </div>
    </header>
  );
}

export function TrackerApp({ view }: TrackerAppProps) {
  const { user, loading, configured, error: authError } = useAuth();
  const [data, setData] = useState<TrackerData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<ContentType>("film");
  const [linkText, setLinkText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    success: boolean;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await loadTrackerData());
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    loadTrackerData()
      .then((loadedData) => {
        if (active) {
          setData(loadedData);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [user]);

  const currentPeriod = useMemo(
    () => data?.periods.find((period) => period.id === data.currentPeriodId) ?? null,
    [data],
  );
  const totals = useMemo(
    () =>
      (data?.periods ?? []).reduce(
        (sum, period) => ({
          filmCount: sum.filmCount + period.filmCount,
          tiktokCount: sum.tiktokCount + period.tiktokCount,
          earnings: sum.earnings + periodEarnings(period),
        }),
        { filmCount: 0, tiktokCount: 0, earnings: 0 },
      ),
    [data],
  );

  async function saveLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { valid, invalid } = parseLinks(linkText);
    if (invalid.length > 0) {
      setFeedback({
        text: `Popraw linki w tych liniach (wymagany pełny adres https:// lub http://): ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? ` i ${invalid.length - 3} kolejnych` : ""}`,
        success: false,
      });
      return;
    }
    if (valid.length === 0) {
      setFeedback({ text: "Wklej co najmniej jeden link, po jednym w linii.", success: false });
      return;
    }
    if (valid.length > 100) {
      setFeedback({ text: "Możesz dodać maksymalnie 100 linków naraz.", success: false });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      await addLinks(type, valid);
      setLinkText("");
      setFeedback({
        text: `Dodano ${valid.length} ${type === "film" ? (valid.length === 1 ? "film" : "filmów") : (valid.length === 1 ? "TikToka" : "TikToki")}.`,
        success: true,
      });
      await refresh();
    } catch (error) {
      setFeedback({ text: errorMessage(error), success: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleClosePeriod() {
    if (!currentPeriod) return;
    if (!window.confirm("Zamknąć bieżący okres i rozpocząć nowy? Dotychczasowe wpisy zostaną w historii.")) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await closeCurrentPeriod();
      await refresh();
      setFeedback({ text: "Okres zamknięty. Rozpoczął się nowy okres.", success: true });
    } catch (error) {
      setFeedback({ text: errorMessage(error), success: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(entry: LinkEntry) {
    if (!currentPeriod) return;
    if (!window.confirm("Usunąć ten link i skorygować licznik?")) return;
    setBusy(true);
    setFeedback(null);
    try {
      await removeLink(currentPeriod.id, entry.id);
      await refresh();
    } catch (error) {
      setFeedback({ text: errorMessage(error), success: false });
    } finally {
      setBusy(false);
    }
  }

  async function handleResume(period: Period) {
    if (!currentPeriod) return;
    if (
      !window.confirm(
        "Wznowić ten okres? Bieżący okres zostanie wstrzymany i będzie można do niego wrócić później.",
      )
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await resumePeriod(period.id);
      await refresh();
      setFeedback({ text: "Wybrany okres jest teraz bieżący.", success: true });
    } catch (error) {
      setFeedback({ text: errorMessage(error), success: false });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <span className="loading-dot" />
        Ładowanie...
      </div>
    );
  }
  if (!configured || !user) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <Link className="brand" href="/">
            <span className="brand-mark">#</span>
            <span>Filmy i TikToki</span>
          </Link>
          <p className="eyebrow" style={{ marginTop: 32 }}>
            Wspólny licznik materiałów
          </p>
          <h1>{configured ? "Nie można połączyć z bazą" : "Skonfiguruj Firebase"}</h1>
          <p className="page-description">
            {!configured
              ? "Uzupełnij konfigurację Firebase, aby zapisywać linki w jednej wspólnej bazie."
              : authError || "Włącz logowanie anonimowe w Firebase Authentication."}
          </p>
          {!configured && (
            <div className="setup-card">
              Dodaj wartości z Firebase do pliku <code>.env.local</code> na serwerze.
              Instrukcje znajdują się w <code>README.md</code>.
            </div>
          )}
        </section>
      </main>
    );
  }

  if (loadError && !data) {
    return (
      <main className="app-frame">
        <div className="app-container">
          <AppHeader view={view} />
          <div className="feedback">{loadError}</div>
          <button className="outline-button" onClick={() => void refresh()} type="button">
            Spróbuj ponownie
          </button>
        </div>
      </main>
    );
  }
  if (!data || !currentPeriod) {
    return (
      <div className="loading-state">
        <span className="loading-dot" />
        Przygotowuję Twoje okresy...
      </div>
    );
  }

  const recentEntries = data.entries.slice(0, view === "tracker" ? 8 : 0);

  return (
    <main className="app-frame">
      <div className="app-container">
        <AppHeader view={view} />
        <section className="page-heading">
          <div>
            <p className="eyebrow">{view === "tracker" ? "Centrum linków" : "Panel rozliczeń"}</p>
            <h1>{view === "tracker" ? "Licznik materiałów" : "Twoje rozliczenia"}</h1>
            <p className="page-description">
              {view === "tracker"
                ? "Wklej linki, wybierz typ materiału i miej liczniki zawsze pod ręką."
                : "Stawki, suma zarobków i podsumowanie każdego okresu w jednym miejscu."}
            </p>
          </div>
          <div className="period-pill">
            <span className="status-dot" />
            Bieżący okres · od {formatDate(currentPeriod.startedAt)}
          </div>
        </section>

        <section className="stats-grid" aria-label="Podsumowanie">
          <StatCard
            label={view === "tracker" ? "Filmy w tym okresie" : "Wszystkie filmy"}
            value={view === "tracker" ? currentPeriod.filmCount : totals.filmCount}
            caption={view === "tracker" ? "w bieżącym okresie" : "100 zł za film"}
            icon="F"
          />
          <StatCard
            label={view === "tracker" ? "TikToki w tym okresie" : "Wszystkie TikToki"}
            value={view === "tracker" ? currentPeriod.tiktokCount : totals.tiktokCount}
            caption={view === "tracker" ? "w bieżącym okresie" : "30 zł za TikToka"}
            icon="T"
            orange
          />
          <StatCard
            label={view === "tracker" ? "Materiały w okresie" : "Łączne zarobki"}
            value={
              view === "tracker"
                ? currentPeriod.filmCount + currentPeriod.tiktokCount
                : formatMoney(totals.earnings)
            }
            caption={
              view === "tracker" ? "Filmy i TikToki razem" : "Ze wszystkich okresów"
            }
            icon={view === "tracker" ? "#" : "zł"}
          />
        </section>

        {view === "tracker" ? (
          <div className="main-grid">
            <section>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Dodaj linki</h2>
                    <p>Wklej jeden lub kilka linków — każdy w osobnej linii.</p>
                  </div>
                </div>
                <form onSubmit={saveLinks}>
                  <div className="type-toggle" role="group" aria-label="Typ materiału">
                    <button
                      className={type === "film" ? "selected" : ""}
                      onClick={() => setType("film")}
                      type="button"
                    >
                      Film
                    </button>
                    <button
                      className={type === "tiktok" ? "selected" : ""}
                      onClick={() => setType("tiktok")}
                      type="button"
                    >
                      TikTok
                    </button>
                  </div>
                  <textarea
                    className="link-input"
                    onChange={(event) => setLinkText(event.target.value)}
                    placeholder={"https://...\nhttps://..."}
                    value={linkText}
                  />
                  <div className="form-footer">
                    <span className="helper-text">
                      Maksymalnie 100 linków naraz. Linki można usuwać z listy poniżej.
                    </span>
                    <button className="primary-button" disabled={busy} type="submit">
                      {busy ? "Zapisywanie..." : "＋ Dodaj linki"}
                    </button>
                  </div>
                  {feedback && (
                    <p className={`feedback ${feedback.success ? "success" : ""}`}>
                      {feedback.text}
                    </p>
                  )}
                  {loadError && <p className="feedback">{loadError}</p>}
                </form>
              </div>

              <div className="section-row">
                <h2>Ostatnio dodane</h2>
                <span className="section-count">
                  {data.entries.length} {data.entries.length === 1 ? "wpis" : "wpisów"} w okresie
                </span>
              </div>
              {recentEntries.length > 0 ? (
                <div className="entry-list">
                  {recentEntries.map((entry) => (
                    <EntryRow
                      entry={entry}
                      key={entry.id}
                      onRemove={() => void handleRemove(entry)}
                      removing={busy}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  W tym okresie nie ma jeszcze linków. Dodaj pierwszy powyżej.
                </div>
              )}
              {data.entries.length > 8 && (
                <p className="helper-text" style={{ marginTop: 10 }}>
                  Pokazano 8 najnowszych wpisów. Łączna liczba w okresie: {data.entries.length}.
                </p>
              )}
            </section>

            <aside className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Bieżący okres</h2>
                  <p>Liczniki wyzerują się po zamknięciu, historia zostanie zachowana.</p>
                </div>
              </div>
              <div className="period-summary">
                <div className="period-summary-title">Materiały dodane w okresie</div>
                <div className="period-summary-value">
                  {currentPeriod.filmCount + currentPeriod.tiktokCount}
                </div>
                <div className="summary-lines">
                  <SummaryLine label="Filmy" value={String(currentPeriod.filmCount)} />
                  <SummaryLine label="TikToki" value={String(currentPeriod.tiktokCount)} />
                  <SummaryLine label="Okres rozpoczęty" value={formatDate(currentPeriod.startedAt)} />
                </div>
              </div>
              <div className="panel-divider" />
              <div className="stack">
                <button
                  className="danger-button full-width"
                  disabled={busy}
                  onClick={() => void handleClosePeriod()}
                  type="button"
                >
                  Zamknij okres i zacznij kolejny
                </button>
                <Link className="outline-button full-width" href="#historia">
                  Historia okresów
                </Link>
              </div>
              {feedback && (
                <p className={`feedback ${feedback.success ? "success" : ""}`}>
                  {feedback.text}
                </p>
              )}
            </aside>
            <section id="historia" style={{ gridColumn: "1 / -1" }}>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Historia okresów</h2>
                    <p>Wspólna historia jest widoczna dla wszystkich.</p>
                  </div>
                </div>
                <div className="archive-list">
                  {data.periods.map((period, index) => (
                    <PeriodRow
                      index={data.periods.length - index}
                      key={period.id}
                      onResume={() => void handleResume(period)}
                      period={period}
                      resumeDisabled={busy || period.status === "current"}
                      showEarnings={false}
                    />
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : (
          <section>
            <div className="panel" style={{ marginBottom: 18 }}>
              <div className="panel-heading">
                <div>
                  <h2>Podsumowanie okresów</h2>
                  <p>Okres można wznowić — obecny zostanie wtedy wstrzymany, nie usunięty.</p>
                </div>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => void handleClosePeriod()}
                  type="button"
                >
                  Zamknij bieżący okres
                </button>
              </div>
              {feedback && (
                <p className={`feedback ${feedback.success ? "success" : ""}`}>
                  {feedback.text}
                </p>
              )}
              {loadError && <p className="feedback">{loadError}</p>}
              <div className="archive-list">
                {data.periods.map((period, index) => (
                  <PeriodRow
                    index={data.periods.length - index}
                    key={period.id}
                    onResume={() => void handleResume(period)}
                    period={period}
                    resumeDisabled={busy || period.status === "current"}
                    showEarnings
                  />
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Stawki</h2>
                  <p>Kwoty są szacunkowe i bazują na ustalonych stawkach za materiał.</p>
                </div>
              </div>
              <div className="summary-lines">
                <SummaryLine label="Film" value="100 zł" />
                <SummaryLine label="TikTok" value="30 zł" />
                <SummaryLine label="Zarobki łącznie" value={formatMoney(totals.earnings)} />
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  caption,
  icon,
  orange = false,
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: string;
  orange?: boolean;
}) {
  return (
    <article className="stat-card">
      <div className="stat-topline">
        <span>{label}</span>
        <span className={`stat-icon ${orange ? "orange" : ""}`}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-caption">{caption}</div>
    </article>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EntryRow({
  entry,
  onRemove,
  removing,
}: {
  entry: LinkEntry;
  onRemove: () => void;
  removing: boolean;
}) {
  let hostname = entry.url;
  try {
    hostname = new URL(entry.url).hostname.replace(/^www\./, "");
  } catch {
    hostname = entry.url;
  }
  return (
    <div className="entry-row">
      <div className="entry-main">
        <span className={`entry-badge ${entry.type === "tiktok" ? "tiktok" : ""}`}>
          {entry.type === "film" ? "F" : "T"}
        </span>
        <div className="entry-copy">
          <a
            className="entry-title"
            href={entry.url}
            rel="noreferrer"
            target="_blank"
            title={entry.url}
          >
            {hostname}
          </a>
          <div className="entry-subtitle">
            {entry.type === "film" ? "Film" : "TikTok"} · {formatDate(entry.createdAt)}
          </div>
        </div>
      </div>
      <div className="entry-actions">
        <button
          aria-label="Usuń link"
          className="icon-button"
          disabled={removing}
          onClick={onRemove}
          title="Usuń i skoryguj licznik"
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function PeriodRow({
  period,
  index,
  onResume,
  resumeDisabled,
  showEarnings,
}: {
  period: Period;
  index: number;
  onResume: () => void;
  resumeDisabled: boolean;
  showEarnings: boolean;
}) {
  const statusLabel =
    period.status === "current"
      ? "Bieżący"
      : period.status === "paused"
        ? "Wstrzymany"
        : "Zamknięty";
  return (
    <article className={`archive-card ${showEarnings ? "" : "public"}`}>
      <div>
        <span className={`status-label ${period.status === "current" ? "current" : ""}`}>
          {statusLabel}
        </span>
        <div className="archive-period-title" style={{ marginTop: 8 }}>
          Okres {index}
        </div>
        <div className="archive-period-date">
          {formatDate(period.startedAt)}
          {period.endedAt ? ` – ${formatDate(period.endedAt)}` : ""}
        </div>
      </div>
      <div>
        <div className="archive-metric-label">Filmy</div>
        <div className="archive-metric-value">{period.filmCount}</div>
      </div>
      <div>
        <div className="archive-metric-label">TikToki</div>
        <div className="archive-metric-value">{period.tiktokCount}</div>
      </div>
      {showEarnings && (
        <div>
          <div className="archive-metric-label">Kwota</div>
          <div className="archive-metric-value">{formatMoney(periodEarnings(period))}</div>
        </div>
      )}
      <button
        className="outline-button"
        disabled={resumeDisabled}
        onClick={onResume}
        type="button"
      >
        {period.status === "current" ? "Aktywny" : "Wznów okres"}
      </button>
    </article>
  );
}
