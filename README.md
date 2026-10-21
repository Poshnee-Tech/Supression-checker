# Suppression Checker

Internal tool for call center agents. An agent signs in, enters a US phone
number, and immediately sees whether the number will **PASS** or **FAIL** the
buyer's suppression check — before transferring the call.

- **Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS
- **Auth:** bcrypt password verification + signed JWT in an httpOnly cookie
- **Rate limiting / audit log:** Upstash Redis
- **Hosting:** Vercel

---

## 1. Local setup

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run hash-password` | Generate a bcrypt hash for a user |

### Filling in `.env.local`

```bash
# 1. Session signing key (min 32 chars)
openssl rand -base64 48

# 2. A user's password hash
npm run hash-password -- --user agent1
```

> **⚠️ The one local-only gotcha: escape `$` in `.env.local`.**
> `.env` files are parsed with dotenv, which treats `$` as variable
> interpolation — so a raw bcrypt hash (`$2a$12$…`) gets silently mangled and
> every login fails. In **local `.env` files only**, escape each `$` as `\$`:
>
> ```
> APP_USERS=[{"username":"agent1","passwordHash":"\$2a\$12\$EXX5…","role":"agent"}]
> ```
>
> **Vercel environment variables are not interpolated** — paste the hash there
> exactly as printed, with no escaping. If a hash ever is mangled, the app
> refuses to start the login flow and logs a message naming this exact cause,
> rather than silently rejecting correct passwords.

---

## 2. Managing users

Users live in the `APP_USERS` environment variable as a single-line JSON array:

```json
[{"username":"agent1","passwordHash":"$2a$12$…","role":"agent"}]
```

To add or rotate a user:

```bash
npm run hash-password -- --user agent2
# Password: ********        (input is hidden, never echoed or written to disk)
# Confirm password: ********
#
# bcrypt hash (cost 12):
# $2a$12$…
#
# APP_USERS entry:
# [{"username":"agent2","passwordHash":"$2a$12$…","role":"agent"}]
```

Then append the new object to the `APP_USERS` array in Vercel and redeploy (or
redeploy the current build) so the new value is picked up.

- Passwords are hashed with **bcrypt, cost 12**, and are never stored, echoed,
  or logged in plain text.
- Removing a user from `APP_USERS` blocks future logins. Any session cookie they
  already hold stays valid until it expires (max 8 hours). To revoke
  immediately, rotate `AUTH_SECRET` — that invalidates **all** sessions.

---

## 3. Vercel environment variables

Set all of these under **Project → Settings → Environment Variables** (Production
and Preview). None is prefixed `NEXT_PUBLIC_`, so none is ever shipped to the
browser.

| Variable | Example / source | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | `openssl rand -base64 48` (min 32 chars) | Signs the session JWT |
| `APP_USERS` | `[{"username":"agent1","passwordHash":"$2a$12$…","role":"agent"}]` | User directory |
| `TLD_BASE_URL` | `https://enrollppi.tldcrm.com` | Buyer API base URL |
| `TLD_FPG` | `CLIENTS,ECLIENTS,BLOCK,EBLOCK,OCLIENTS` | Suppression groups to screen against (required, non-empty) |
| `UPSTASH_REDIS_REST_URL` | Upstash console → REST URL | Rate limiting + audit log |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console → REST token | Rate limiting + audit log |

**Upstash is required in production.** If the two Upstash variables are missing,
`/api/auth/login` returns 503 and logs the reason, rather than quietly serving
logins with no brute-force protection. A *transient* Redis outage fails open
instead, so a Redis blip can't lock every agent out mid-shift.

---

## 4. Deploying to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New → Project**, import the repo. Framework preset
   **Next.js** is detected automatically — no build-setting changes needed.
3. Add every variable from the table above **before** the first deploy.
4. Deploy. (Vercel runs `next build`; the middleware deploys to the Edge
   automatically.)
5. Smoke-test the deployment:
   - Visit `/` → should redirect to `/login`.
   - Sign in → the checker loads with your username in the header.
   - Check a number you expect to pass, and one you expect to fail.
   - Enter a wrong password 6 times → the 6th attempt returns the lockout
     message (this exercises the live Upstash path).
   - Click **Log out** → back to `/login`, and `/` redirects again.

After changing any environment variable, **redeploy** — values are baked into
the running deployment.

---

## 5. How it works

### Auth flow

1. `POST /api/auth/login` validates the body with zod, then verifies the
   password with bcrypt (one bcrypt comparison always runs, even for unknown
   usernames, so response timing can't be used to enumerate users).
2. On success it issues an HS256 JWT (`jose`) with an 8-hour expiry and sets it
   in a cookie: `httpOnly`, `Secure` (production), `SameSite=Strict`, `Path=/`.
3. `src/middleware.ts` verifies that JWT on **every** request except `/login`
   and `/api/auth/login`. Pages redirect to `/login?next=…`; API routes get a
   `401` JSON body. Pages and `/api/check` re-verify the session independently,
   so no route depends on middleware alone.
4. Failed logins are rate-limited to **5 per username and 5 per IP per 15
   minutes**, then locked out with a clear message. Only *failed* attempts
   consume a token, and a successful login resets the counters.
5. Every failure returns the same generic `Invalid username or password`.

### Phone validation

`src/lib/phone.ts` is the single source of truth, imported by both the browser
and the server — the server always re-validates and never trusts the client.
After stripping non-digits, a number is valid only if:

- it is 10 digits, or 11 digits starting with `1` (the leading `1` is dropped);
- the area code does not start with `0` or `1`;
- the area code is not an N11 service code (`211`, `311`, … `911`);
- the exchange does not start with `0` or `1`;
- the 10 digits are not all identical.

Valid numbers are normalized to `1XXXXXXXXXX` before being sent upstream.

### The check

`POST /api/check` (POST only — other methods get `405`) is limited to **30
checks per user per minute** and calls:

```
GET {TLD_BASE_URL}/api/public/dialer/ready/{phone11}?fpg={TLD_FPG}
```

with a **5-second `AbortController` timeout**. The upstream response is mapped
to a client-safe result — the URL, the filter groups, and the raw upstream body
are never returned to the browser:

| Upstream | Result |
| --- | --- |
| `{"ready":1}` | `PASS` — "Clear to transfer" |
| `{"ready":0,"reason":"NUM"}` | `INVALID` — "Buyer rejected this number as invalid" |
| `{"ready":0,"reason":"PAR"}` | `ERROR` — misconfiguration, see below |
| `{"ready":0}` (any other reason) | `FAIL` — "Do not transfer — number will be rejected" |
| timeout / network error / non-JSON / non-2xx | `ERROR` — "Couldn't verify right now — do not transfer, try again" |

**Why `PAR` is special.** If the request carries no usable filter groups, the
upstream answers `{"ready":0,"reason":"PAR"}` for *every* number — which would
otherwise render as a universal "do not transfer" and quietly take the whole
floor offline. The app reports that as `ERROR` and logs the cause, so a config
mistake can never masquerade as a suppression result. `TLD_FPG` is validated as
required and non-empty for the same reason.

`ERROR` results are returned with HTTP `502` so they show up in monitoring; the
UI renders the gray ERROR banner either way.

### Audit log

Every check is recorded server-side in Upstash Redis under the key
`suppression:checks` (a list, newest first, trimmed to the **last 1,000
entries**):

```json
{"ts":"2026-02-11T18:22:04.512Z","username":"agent1","last4":"7404","status":"PASS"}
```

Only the **last 4 digits** are stored — never the full number, and never the
post key. An audit-write failure is logged but never blocks the agent's result.
Read it from the Upstash console with `LRANGE suppression:checks 0 99`, or in
code via `readRecentChecks()` in `src/lib/audit.ts`.

### Security headers

`next.config.js` sets `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `no-store` on `/api/*`.
`X-Powered-By` is disabled.

**The Content-Security-Policy is set in `src/middleware.ts`, not
`next.config.js`** — deliberately. It carries a per-request nonce, which a
static header cannot do; a static CSP would have to allow `'unsafe-inline'` for
`script-src` to keep Next.js' hydration scripts working, which defeats most of
the policy's value. Setting it in both places would emit two CSP headers and
break the app. Everything that does not need a nonce stays in `next.config.js`
so it also covers static assets.

---

## 6. Project layout

```
src/
  middleware.ts              Auth gate for all routes + nonce CSP
  app/
    page.tsx                 Checker page (server component, verifies session)
    login/                   Login page + client form
    api/auth/login/          POST login: zod → bcrypt → JWT cookie
    api/auth/logout/         POST logout: clears the cookie
    api/check/               POST check: zod → validate → upstream → audit log
  components/
    AppHeader.tsx            App name, username, logout
    CheckerCard.tsx          Input and result banner
    StatusIcon.tsx           PASS / FAIL / INVALID / ERROR icons
  lib/
    phone.ts                 Shared validation + formatting (client & server)
    suppression.ts           Buyer API client and response mapping
    session.ts               JWT sign/verify, cookie options
    users.ts                 APP_USERS parsing + bcrypt verification
    redis.ts                 Upstash client and rate limiters
    audit.ts                 Capped audit log
    env.ts                   Server-only env access and validation
    types.ts                 Types shared with client components
scripts/
  hash-password.ts           bcrypt hash generator (cost 12)
```

---

## 7. Notes and conventions

- **`bcryptjs`, not `bcrypt`.** Pure JS, no native build step, so it works on
  Vercel's serverless runtime without platform-specific binaries. Hashes are
  interchangeable with the native `bcrypt` package.
- **The UI shows one result at a time.** There is no on-screen history: the
  result banner is replaced by each new check, so the page never grows and the
  agent always sees exactly one verdict. The durable record is the server-side
  audit log in Redis.
- **Keyboard flow:** the phone field autofocuses, `Enter` submits, and after
  each check the field is refocused and selected so the next number can be
  typed straight over it.
- **Error messages to the client are generic**; detail stays in the server logs
  (visible in Vercel → Deployment → Logs).
