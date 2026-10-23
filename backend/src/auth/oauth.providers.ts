import { ApiError } from "../api/common.js";

// What the service needs to know about a user, whichever provider they came from.
// `emailVerified` means the provider vouches for the email; `login` seeds the username.
export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  login: string;
}

// One enabled provider: where to send the browser, and how to get a profile
// from the code it sends back.
export interface OAuthProviderConfig {
  id: "google" | "github" | "42";
  dbValue: "GOOGLE" | "GITHUB" | "FORTY_TWO";
  authorizeUrl: (state: string) => string;
  profile: (code: string) => Promise<OAuthProfile>;
}

type Json = Record<string, unknown>;

// The error for any provider failure: a timeout, a non-2xx or a malformed answer.
const unusable = () => new ApiError(502, "The sign-in provider failed");

// Fetches JSON with a 5 second timeout; any failure becomes a 502.
async function getJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  } catch {
    throw unusable();
  }
  if (!response.ok) throw unusable();
  return response.json().catch(() => {
    throw unusable();
  });
}

// Narrows an unknown JSON value to an object, or fails with a 502.
function asObject(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw unusable();
  return value as Json;
}

// Headers for the providers' profile calls; GitHub rejects requests without a User-Agent.
const bearer = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/json",
  "User-Agent": "WePomodoro",
});

// Reads the Google profile: `sub` is the stable id, and Google says whether the
// email is verified.
async function googleProfile(accessToken: string): Promise<OAuthProfile> {
  const user = asObject(
    await getJson("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: bearer(accessToken),
    }),
  );
  if (typeof user.sub !== "string") throw unusable();
  const email = typeof user.email === "string" ? user.email : null;
  return {
    providerUserId: user.sub,
    email,
    emailVerified: user.email_verified === true,
    login: email?.split("@")[0] ?? "user",
  };
}

// Reads the GitHub profile and its emails; prefers the primary verified email,
// then any verified one, then the primary.
async function githubProfile(accessToken: string): Promise<OAuthProfile> {
  const user = asObject(
    await getJson("https://api.github.com/user", {
      headers: bearer(accessToken),
    }),
  );
  const emails = await getJson("https://api.github.com/user/emails", {
    headers: bearer(accessToken),
  });
  if (
    typeof user.id !== "number" ||
    typeof user.login !== "string" ||
    !Array.isArray(emails)
  )
    throw unusable();
  const list = emails
    .map((entry) => asObject(entry))
    .filter((entry) => typeof entry.email === "string");
  const best =
    list.find((entry) => entry.primary === true && entry.verified === true) ??
    list.find((entry) => entry.verified === true) ??
    list.find((entry) => entry.primary === true);
  return {
    providerUserId: String(user.id),
    email: typeof best?.email === "string" ? best.email : null,
    emailVerified: best?.verified === true,
    login: user.login,
  };
}

// Reads the 42 profile. 42 has no verified flag, so the email is reported as
// unverified and the user confirms it with the emailed code.
async function fortyTwoProfile(accessToken: string): Promise<OAuthProfile> {
  const user = asObject(
    await getJson("https://api.intra.42.fr/v2/me", {
      headers: bearer(accessToken),
    }),
  );
  if (typeof user.id !== "number" || typeof user.login !== "string")
    throw unusable();
  return {
    providerUserId: String(user.id),
    email: typeof user.email === "string" ? user.email : null,
    emailVerified: false,
    login: user.login,
  };
}

// Static settings per provider; `envPrefix` names its CLIENT_ID and CLIENT_SECRET variables.
const table = [
  {
    id: "google",
    dbValue: "GOOGLE",
    envPrefix: "GOOGLE",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    fetchProfile: googleProfile,
  },
  {
    id: "github",
    dbValue: "GITHUB",
    envPrefix: "GITHUB",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    fetchProfile: githubProfile,
  },
  {
    id: "42",
    dbValue: "FORTY_TWO",
    envPrefix: "FORTY_TWO",
    authorizeUrl: "https://api.intra.42.fr/oauth/authorize",
    tokenUrl: "https://api.intra.42.fr/oauth/token",
    scope: "public",
    fetchProfile: fortyTwoProfile,
  },
] as const;

// Builds the providers whose client id and secret are both set in the
// environment; the others stay disabled.
export function providersFromEnv(env: NodeJS.ProcessEnv) {
  const base = new URL(env.OAUTH_REDIRECT_BASE ?? "http://localhost:3000");
  const providers = new Map<string, OAuthProviderConfig>();
  for (const entry of table) {
    const clientId = env[`${entry.envPrefix}_CLIENT_ID`];
    const clientSecret = env[`${entry.envPrefix}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) continue;
    const redirectUri = `${base.origin}/api/auth/oauth/${entry.id}/callback`;
    providers.set(entry.id, {
      id: entry.id,
      dbValue: entry.dbValue,
      authorizeUrl: (state) =>
        `${entry.authorizeUrl}?${new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: entry.scope,
          state,
        }).toString()}`,
      profile: async (code) => {
        const token = asObject(
          await getJson(entry.tokenUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
            }),
          }),
        );
        if (typeof token.access_token !== "string") throw unusable();
        return entry.fetchProfile(token.access_token);
      },
    });
  }
  return providers;
}
