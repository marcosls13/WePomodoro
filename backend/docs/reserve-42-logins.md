# Backend guide: what is left (reserved 42 logins, guests, pending signups)

Everything else from the earlier guide is implemented, tested (`npm run test:api`
passes) and documented in `backend.md`. Only these items remain.

## 1. Probe the real 42 API by hand (never run yet)

Type the secret with `read -rs` to keep it out of shell history:

```bash
export UID42=<your 42 app UID>; read -rs SECRET42; export SECRET42
TOKEN=$(curl -s -X POST https://api.intra.42.fr/oauth/token \
  -d grant_type=client_credentials -d client_id="$UID42" \
  -d client_secret="$SECRET42" | jq -r .access_token)
echo "${TOKEN:0:8}…"   # something, not "null"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  https://api.intra.42.fr/v2/users/<a real login>      # expect 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  https://api.intra.42.fr/v2/users/zzzz-not-a-login    # expect 404
curl -si -H "Authorization: Bearer $TOKEN" \
  https://api.intra.42.fr/v2/users/<a real login> | grep -i ratelimit
```

- Token `null`: try `https://api.intra.42.fr/v2/oauth/token` and change the URL in `fortyTwoLoginLookup`.
- A missing login answering `200` (empty body) instead of `404`: change the check there.
- `401`/`403` on `/v2/users/<login>`: check the app's scopes on profile.intra.42.fr.
- One IP can do 20 signups per minute, each an uncached 42 request; compare with
  the hourly limit in the headers and lower `authPerMinute` in `router.ts` if needed.

## 2. Try it by hand (42 credentials in `backend/.env`, backend restarted)

1. Password signup with your own 42 login: `409 That name belongs to a 42 account…`.
2. Signup with a random name: works.
3. "Continue with 42": account created with your login as username.
4. Google/GitHub with a login equal to a real 42 login: username gets a `_xxxx` suffix.
5. Wrong 42 secret or no network, signup with a random name: still works, log shows `42 login lookup failed`.

## 3. Open items

- **Repeated 42 login:** problems were seen when signing in with 42 more than
  once (cause unknown). Try: sign in, log out, sign in again; a second 42
  account; wait out the 10 minute window unverified, then sign in again. Note the
  exact error (`?error=state`, `email_taken`, 401 on `/auth/oauth/exchange`) and
  the backend log, then read `oauthCallback` and `resolveUser`.
- **Fail open:** if 42 is down or rate limited the check is skipped. Decide
  whether that is acceptable for the evaluation.
- **Admin-created users** are not checked against 42 logins (admins are trusted).

## 4. Optional, not implemented

- **A 42 sign-in takes its login from a password user who holds it** (rename the
  holder to `<login>_xxxx`). Only matters for leftovers: the database is emptied
  before the evaluation. In `resolveUser` (`oauth.service.ts`), before
  `tx.user.create`, for `found.id === "42"`: find the user with
  `username: candidate(profile.login, 0)` and no `FORTY_TWO` OAuth account, rename
  it with `candidate(holder.username, 1)`, and create the new user with attempt 0.
  Add a test where a password user holds the login, then a 42 sign-in gets it.
- **Redirect 42 emails to "Continue with 42"** (`@student.<campus domain>`
  regex, applied in `signup` and the email change in `updateProfile`). A nicer
  message only, and needs the real campus domain confirmed from a 42 email first.
  Skip unless the team wants it.
- **Guest to account upgrade** (`POST /auth/upgrade`): repoint the guest's
  `RoomMember`, `Message` and `SessionParticipant` rows to the new user in one
  transaction, skipping unique-key clashes, cancel the guest's live solo timer,
  delete the guest session. Not now; wait until games and schema settle.
