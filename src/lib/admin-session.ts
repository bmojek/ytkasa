import "server-only";

export const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_PASSWORD = "user";
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

export function isAdminPasswordValid(password: string) {
  return password.length <= 256 && password === ADMIN_PASSWORD;
}

export function createAdminSession() {
  return {
    token: ADMIN_PASSWORD,
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export function verifyAdminSession(token: string | undefined) {
  return token === ADMIN_PASSWORD;
}
