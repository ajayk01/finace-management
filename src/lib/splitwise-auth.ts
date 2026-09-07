import { NextResponse } from "next/server";

const SPLITWISE_COOKIE_HEADER = "x-splitwise-cookie";
const SPLITWISE_CSRF_TOKEN_HEADER = "x-splitwise-csrf-token";

export function getSplitwiseCookie(request: Request): string | null {
  const cookie = request.headers.get(SPLITWISE_COOKIE_HEADER)?.trim();
  return cookie || null;
}

export function getSplitwiseCsrfToken(request: Request): string | null {
  const csrfToken = request.headers.get(SPLITWISE_CSRF_TOKEN_HEADER)?.trim();
  return csrfToken || null;
}

export function missingSplitwiseCookieResponse() {
  return NextResponse.json(
    { error: "A Splitwise cookie is required." },
    { status: 401 }
  );
}

export function splitwiseCookieHeaders(cookie: string, contentType?: string) {
  return {
    Cookie: cookie,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

export function splitwiseMutationHeaders(
  cookie: string,
  csrfToken: string,
  contentType?: string
) {
  const cookieCsrfToken = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => /^(?:csrf|xsrf)(?:[_-]?token)?=/i.test(part))
    ?.split("=")
    .slice(1)
    .join("=");

  return {
    ...splitwiseCookieHeaders(cookie, contentType),
    Accept: "application/json, text/javascript, */*; q=0.01",
    Origin: "https://secure.splitwise.com",
    Referer: "https://secure.splitwise.com/",
    "X-CSRF-Token": csrfToken || (cookieCsrfToken ? decodeURIComponent(cookieCsrfToken) : ""),
    "X-Requested-With": "XMLHttpRequest",
  };
}