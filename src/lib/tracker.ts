import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ContentType = "film" | "tiktok";
export type PeriodStatus = "current" | "closed" | "paused";

export type Period = {
  id: string;
  status: PeriodStatus;
  startedAt: Date;
  endedAt: Date | null;
  filmCount: number;
  tiktokCount: number;
};

export type LinkEntry = {
  id: string;
  url: string;
  type: ContentType;
  createdAt: Date;
};

export type TrackerData = {
  currentPeriodId: string;
  periods: Period[];
  entries: LinkEntry[];
};

const ROOT = ["shared", "main"] as const;

function getDb() {
  if (!db) {
    throw new Error("Firebase nie jest skonfigurowany.");
  }
  return db;
}

function stateRef() {
  return doc(getDb(), ...ROOT, "meta", "state");
}

function periodsRef() {
  return collection(getDb(), ...ROOT, "periods");
}

function periodRef(periodId: string) {
  return doc(getDb(), ...ROOT, "periods", periodId);
}

function entriesRef(periodId: string) {
  return collection(getDb(), ...ROOT, "periods", periodId, "entries");
}

function periodFromDoc(id: string, data: DocumentData): Period {
  return {
    id,
    status: data.status as PeriodStatus,
    startedAt: (data.startedAt as Timestamp).toDate(),
    endedAt: data.endedAt ? (data.endedAt as Timestamp).toDate() : null,
    filmCount: Number(data.filmCount) || 0,
    tiktokCount: Number(data.tiktokCount) || 0,
  };
}

export async function ensureSharedData() {
  const firestore = getDb();
  const sharedStateRef = stateRef();
  const firstPeriodRef = doc(periodsRef());

  await runTransaction(firestore, async (transaction) => {
    const stateSnapshot = await transaction.get(sharedStateRef);
    if (stateSnapshot.exists()) return;

    transaction.set(firstPeriodRef, {
      status: "current",
      startedAt: Timestamp.now(),
      endedAt: null,
      filmCount: 0,
      tiktokCount: 0,
    });
    transaction.set(sharedStateRef, { currentPeriodId: firstPeriodRef.id });
  });
}

export async function loadTrackerData(): Promise<TrackerData> {
  await ensureSharedData();

  const stateSnapshot = await getDoc(stateRef());
  if (!stateSnapshot.exists()) {
    throw new Error("Nie udało się utworzyć wspólnego okresu.");
  }
  const currentPeriodId = stateSnapshot.data().currentPeriodId as string;
  const [periodsSnapshot, entriesSnapshot] = await Promise.all([
    getDocs(query(periodsRef(), orderBy("startedAt", "desc"))),
    getDocs(query(entriesRef(currentPeriodId), orderBy("createdAt", "desc"))),
  ]);

  return {
    currentPeriodId,
    periods: periodsSnapshot.docs.map((snapshot) =>
      periodFromDoc(snapshot.id, snapshot.data()),
    ),
    entries: entriesSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      url: snapshot.data().url as string,
      type: snapshot.data().type as ContentType,
      createdAt: (snapshot.data().createdAt as Timestamp).toDate(),
    })),
  };
}

export async function addLinks(type: ContentType, urls: string[]) {
  if (urls.length < 1 || urls.length > 100) {
    throw new Error("Dodaj od 1 do 100 linków naraz.");
  }

  const firestore = getDb();
  const sharedStateRef = stateRef();
  const entryIds = urls.map(() => crypto.randomUUID());

  await runTransaction(firestore, async (transaction) => {
    const stateSnapshot = await transaction.get(sharedStateRef);
    if (!stateSnapshot.exists()) {
      throw new Error("Brak bieżącego okresu.");
    }

    const currentPeriodId = stateSnapshot.data().currentPeriodId as string;
    const currentPeriodRef = periodRef(currentPeriodId);
    const periodSnapshot = await transaction.get(currentPeriodRef);
    if (
      !periodSnapshot.exists() ||
      periodSnapshot.data().status !== "current"
    ) {
      throw new Error("Bieżący okres jest niedostępny. Odśwież stronę.");
    }

    const countField = type === "film" ? "filmCount" : "tiktokCount";
    transaction.update(currentPeriodRef, {
      [countField]:
        (Number(periodSnapshot.data()[countField]) || 0) + urls.length,
    });
    urls.forEach((url, index) => {
      transaction.set(
        doc(getDb(), ...ROOT, "periods", currentPeriodId, "entries", entryIds[index]),
        { url, type, createdAt: Timestamp.now() },
      );
    });
  });
}

export async function removeLink(periodId: string, entryId: string) {
  const firestore = getDb();
  const entryRef = doc(getDb(), ...ROOT, "periods", periodId, "entries", entryId);
  const currentPeriodRef = periodRef(periodId);

  await runTransaction(firestore, async (transaction) => {
    const [entrySnapshot, periodSnapshot] = await Promise.all([
      transaction.get(entryRef),
      transaction.get(currentPeriodRef),
    ]);
    if (!entrySnapshot.exists() || !periodSnapshot.exists()) {
      throw new Error("Nie znaleziono tego wpisu.");
    }

    const type = entrySnapshot.data().type as ContentType;
    const countField = type === "film" ? "filmCount" : "tiktokCount";
    const count = Number(periodSnapshot.data()[countField]) || 0;
    transaction.update(currentPeriodRef, {
      [countField]: Math.max(0, count - 1),
    });
    transaction.delete(entryRef);
  });
}

export async function closeCurrentPeriod() {
  const firestore = getDb();
  const sharedStateRef = stateRef();
  const nextPeriodRef = doc(periodsRef());

  await runTransaction(firestore, async (transaction) => {
    const stateSnapshot = await transaction.get(sharedStateRef);
    if (!stateSnapshot.exists()) {
      throw new Error("Brak bieżącego okresu.");
    }

    const currentPeriodId = stateSnapshot.data().currentPeriodId as string;
    const currentPeriodRef = periodRef(currentPeriodId);
    const currentPeriodSnapshot = await transaction.get(currentPeriodRef);
    if (
      !currentPeriodSnapshot.exists() ||
      currentPeriodSnapshot.data().status !== "current"
    ) {
      throw new Error("Nie udało się zamknąć bieżącego okresu.");
    }

    const now = Timestamp.now();
    transaction.update(currentPeriodRef, { status: "closed", endedAt: now });
    transaction.set(nextPeriodRef, {
      status: "current",
      startedAt: now,
      endedAt: null,
      filmCount: 0,
      tiktokCount: 0,
    });
    transaction.update(sharedStateRef, {
      currentPeriodId: nextPeriodRef.id,
    });
  });
}

export async function resumePeriod(periodId: string) {
  const firestore = getDb();
  const sharedStateRef = stateRef();

  await runTransaction(firestore, async (transaction) => {
    const stateSnapshot = await transaction.get(sharedStateRef);
    if (!stateSnapshot.exists()) {
      throw new Error("Brak bieżącego okresu.");
    }

    const currentPeriodId = stateSnapshot.data().currentPeriodId as string;
    if (currentPeriodId === periodId) return;

    const targetRef = periodRef(periodId);
    const currentRef = periodRef(currentPeriodId);
    const [targetSnapshot, currentSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(currentRef),
    ]);
    if (!targetSnapshot.exists() || !currentSnapshot.exists()) {
      throw new Error("Nie znaleziono wybranego okresu.");
    }
    if (targetSnapshot.data().status === "current") return;

    const now = Timestamp.now();
    transaction.update(currentRef, {
      status: "paused",
      endedAt: null,
      pausedAt: now,
    });
    transaction.update(targetRef, {
      status: "current",
      endedAt: null,
      resumedAt: now,
    });
    transaction.update(sharedStateRef, { currentPeriodId: periodId });
  });
}
