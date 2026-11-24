"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authErrorMessage(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  if (
    code === "auth/configuration-not-found" ||
    code === "auth/operation-not-allowed"
  ) {
    return "Włącz logowanie anonimowe w Firebase Console: Authentication → Sign-in method (lub Sign-in providers) → Anonymous → Enable. Zapisz zmianę i odśwież aplikację.";
  }
  if (code === "auth/unauthorized-domain") {
    return "Dodaj domenę aplikacji do Firebase Console → Authentication → Settings → Authorized domains.";
  }
  if (code === "auth/api-key-not-valid") {
    return "Klucz Firebase API jest nieprawidłowy. Sprawdź NEXT_PUBLIC_FIREBASE_API_KEY w .env.local.";
  }

  return error instanceof Error
    ? error.message
    : "Nie udało się połączyć z Firebase.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const firebaseAuth = auth;
    let startedAnonymousSignIn = false;

    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        if (nextUser) {
          setLoading(false);
          setError(null);
          return;
        }

        if (startedAnonymousSignIn) return;
        startedAnonymousSignIn = true;
        signInAnonymously(firebaseAuth).catch((authError: unknown) => {
          setError(authErrorMessage(authError));
          setLoading(false);
        });
      },
      (authError) => {
        setError(authErrorMessage(authError));
        setLoading(false);
      },
    );
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured: isFirebaseConfigured,
      error,
    }),
    [user, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth musi być użyty wewnątrz AuthProvider.");
  }
  return value;
}
