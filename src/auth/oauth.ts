const AUTH_PARAM_RE =
  /^(code|state|scope|error|error_code|error_description|authuser|prompt|access_token|refresh_token|token_type|expires_in)$/i;

export interface OAuthError {
  /** Raw `error` param from the URL, e.g. "access_denied". */
  error: string;
  /** Raw `error_description` from the URL, for debugging. */
  description: string;
}

/**
 * Read OAuth failure params that Supabase/Google append on a failed redirect
 * (?error=…&error_description=… in query or hash). Returns null when the URL
 * carries no error.
 */
export function readOAuthErrorFromUrl(): OAuthError | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const error = search.get("error") ?? hash.get("error");
  const description = search.get("error_description") ?? hash.get("error_description");
  if (!error && !description) return null;
  return {
    error: error || "oauth_error",
    description: description || "Google sign-in failed. Please try again.",
  };
}

/**
 * Strip OAuth/PKCE leftovers (?code=…, #access_token=…, ?error=…) from the
 * address bar once the Supabase client has consumed them
 * (detectSessionInUrl: true), so a refresh or share never re-processes them.
 */
export function cleanOAuthUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let dirty = false;
  for (const key of [...url.searchParams.keys()]) {
    if (AUTH_PARAM_RE.test(key)) {
      url.searchParams.delete(key);
      dirty = true;
    }
  }
  const hashContent = url.hash.replace(/^#/, "");
  if (hashContent) {
    const firstKey = hashContent.split("&")[0]?.split("=")[0] ?? "";
    if (AUTH_PARAM_RE.test(firstKey)) {
      url.hash = "";
      dirty = true;
    }
  }
  if (dirty) {
    // Preserve React Router's history state while replacing the URL.
    window.history.replaceState(window.history.state, "", url.pathname + (url.searchParams.size ? `?${url.searchParams}` : "") + url.hash);
  }
}
