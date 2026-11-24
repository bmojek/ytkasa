import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  createAdminSession,
  isAdminPasswordValid,
} from "@/lib/admin-session";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Nieprawidłowe żądanie." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("password" in body) ||
    typeof body.password !== "string" ||
    body.password.length > 256
  ) {
    return Response.json(
      { error: "Wpisz hasło administratora." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isAdminPasswordValid(body.password)) {
    return Response.json(
      { error: "Nieprawidłowe hasło." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = createAdminSession();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, session.token, {
    ...cookieOptions,
    maxAge: session.maxAge,
  });

  return Response.json(
    { authenticated: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
  return Response.json(
    { authenticated: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
