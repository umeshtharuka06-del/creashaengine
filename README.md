# Royal 1 — Provably-Fair Virtual-Coin Gaming Platform

A premium, mobile-first gaming platform with two provably-fair games — **Color
Prediction** and **Crash** — built on Next.js 15, TypeScript, Prisma and
TailwindCSS. Blue / red / yellow brand theme on a dark glassmorphism UI.

> ⚠️ **Real-money / crypto disclaimer.** This project ships with a **virtual-coin
> economy only**. Real-money deposits and withdrawals (USDT or otherwise) are
> intentionally *not* wired to a live processor — see
> [Real money & compliance](#real-money--compliance). Operating a real-money
> gambling service is heavily regulated and requires licensing, KYC/AML and a
> regulated payment provider in every jurisdiction you serve. Do not enable real
> funds until that is in place.

---

## ✨ Features

| Area | What's included |
| --- | --- |
| **Color Prediction** | Red / Green / Violet, 60 s rounds, live countdown, provably-fair digit, round + bet history, mobile UI |
| **Crash** | Live climbing multiplier, manual & auto cashout, provably-fair crash point, recent-rounds strip |
| **Auth** | Email/password, bcrypt hashing (cost 12), JWT session in an httpOnly cookie, profile page |
| **Wallet** | Integer "coin-cent" balances, immutable transaction ledger for every change |
| **Admin** | User management (ban / promote / credit / debit), platform analytics, GGR, announcements, live config |
| **Security** | Zod input validation, rate limiting, httpOnly+SameSite cookies, route middleware, security headers, audit log |

---

## 🧱 Tech stack

- **Next.js 15** (App Router, Route Handlers, middleware)
- **TypeScript**, **TailwindCSS**
- **Prisma** ORM — **MongoDB** (Atlas; replica set required for transactions)
- **jose** (JWT), **bcryptjs** (hashing), **zod** (validation)

---

## 🚀 Quick start

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env        # then edit JWT_SECRET / FAIR_SECRET / ADMIN_*

# 3. create the DB, generate the client, seed the admin user
npm run setup               # = prisma generate + db push + seed

# 4. run
npm run dev                 # http://localhost:3000
```

Default admin (from `.env`): **admin@royal1.local / ChangeMe!2026** — change it.

New players get the welcome bonus (default 1000 coins) automatically on
registration.

---

## 📁 Project structure

```
royal1/
├── prisma/
│   ├── schema.prisma          # Users, Wallet, Transaction, GameRound, Bet,
│   │                          # Announcement, Setting, AuditLog
│   └── seed.ts                # bootstrap admin + welcome announcement
├── src/
│   ├── middleware.ts          # auth gate for /profile /wallet /admin + headers
│   ├── lib/
│   │   ├── db.ts              # Prisma singleton
│   │   ├── auth.ts            # hashing, session cookie, requireUser/requireAdmin
│   │   ├── jwt.ts             # sign/verify session (jose)
│   │   ├── fair.ts            # provably-fair: seeds, color result, crash point
│   │   ├── wallet.ts          # atomic balance changes + ledger
│   │   ├── color-game.ts      # round lifecycle + lazy settlement
│   │   ├── crash-game.ts      # round lifecycle + lazy settlement + cashout
│   │   ├── settings.ts        # admin-editable platform config
│   │   ├── ratelimit.ts       # in-memory fixed-window limiter
│   │   ├── validation.ts      # zod schemas
│   │   ├── telegram.ts        # Telegram notification helpers
│   │   ├── crypto/            # deposit wallets, assignment, TronGrid poller
│   │   ├── audit.ts           # audit-log writer
│   │   ├── http.ts            # JSON response helpers
│   │   └── client.ts          # client-side fetch helper
│   ├── components/            # NavBar, Logo, AuthForm, admin/* tabs
│   └── app/
│       ├── page.tsx           # lobby
│       ├── login, register, profile, wallet
│       ├── games/color, games/crash
│       ├── admin/             # tabbed console
│       └── api/               # see API map below
└── tailwind.config.ts         # royal blue/red/yellow palette
```

---

## 🔌 API map

```
POST /api/auth/register        # create account (+ welcome bonus)
POST /api/auth/login           # start session
POST /api/auth/logout
GET  /api/auth/me              # current user + balance
GET  /api/wallet               # balance + transaction ledger

GET  /api/games/color/current  # current round + history (lazy-settles due rounds)
POST /api/games/color/bet      # { selection, amount }
GET  /api/games/color/history  # caller's color bets

GET  /api/games/crash/current  # current round + history + my bet
POST /api/games/crash/bet      # { amount, autoCashoutX }
POST /api/games/crash/cashout  # manual cashout
GET  /api/games/crash/history

GET  /api/announcements        # public active announcements

GET/POST        /api/admin/stats            # platform analytics
GET/POST        /api/admin/users            # list + ban/promote/credit/debit
GET/POST/DELETE /api/admin/announcements    # CRUD
GET/POST        /api/admin/config           # platform settings
```

All amounts in API payloads are **coin-cents** (1 coin = 100), so the integer
ledger never suffers floating-point drift.

---

## 🎲 Provably fairness

For every round the server:

1. generates a random `serverSeed`,
2. **publishes `SHA-256(serverSeed)` before betting locks**,
3. reveals the raw `serverSeed` after the round settles.

Outcomes are `HMAC-SHA256(serverSeed, "<clientSeed>:<period>")`:

- **Color** → first bytes → digit 0-9. Green = odd, Red = even, Violet = 0 or 5.
- **Crash** → bustabit-style mapping with a configurable house edge (instant-bust
  slice). Crash point is committed via the hash and revealed on bust.

Because the seed hash is committed first and the per-user client seed is mixed
in, the operator cannot alter a result or target a specific player. Anyone can
recompute the result from the revealed seed (see `src/lib/fair.ts`).

### How rounds settle (serverless-friendly)

There is no always-on game daemon. Rounds are **time-anchored** and settled
**lazily**: whenever `/current` is polled or a bet is placed, any round whose
time has passed is settled inside a DB transaction (idempotent — safe under
concurrency). For higher-traffic production you can additionally run a tiny cron
hitting `/current` every few seconds to settle empty rounds promptly.

---

## 🔐 Security

- Passwords hashed with **bcrypt (cost 12)**; login does a constant-ish compare
  to blunt user-enumeration timing.
- Sessions are **JWT in an httpOnly, SameSite=Lax, Secure (prod)** cookie.
- **Zod** validates every request body.
- **Rate limiting** on auth and betting endpoints (in-memory; swap for Redis on
  multi-node — see `src/lib/ratelimit.ts`).
- **Middleware** gates `/profile`, `/wallet`, `/admin` and sets baseline security
  headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, …).
- **Audit log** records registrations, logins, and every admin action.
- SameSite cookies plus same-origin JSON requests mitigate CSRF; if you add
  cross-site forms, layer in a double-submit CSRF token.

---

## 💵 Deposits & withdrawals (USDT TRC20)

Deposits use admin-managed receive wallets (**Admin → Deposit Wallets**). Each
user is randomly assigned one active wallet, **locked** to them until their
deposit completes. The flow is request-based:

1. The user enters an amount, sends USDT to the assigned wallet, and clicks
   **"I Have Paid"** — this creates a `PENDING` deposit request.
2. The TronGrid poller (`/api/crypto/cron/poll`) then watches that wallet and
   matches the incoming transfer by amount, attaching the on-chain TXID and
   auto-crediting once confirmed (when `crypto_auto_credit` is on).
3. An admin can also **approve / reject** any request manually
   (**Admin → Deposits**).

Withdrawals are manual: the user requests, coins are held, and an admin sends
USDT and marks the request complete with the TXID.

> Operating a real-money platform requires a gambling licence, KYC/AML, and
> geo-fencing in the jurisdictions you serve — out of scope for this codebase.

---

## 🛠 Production deployment

1. **Database** — create a free **MongoDB Atlas** cluster (it's a replica set by
   default, which the betting transactions require). Copy its connection string
   into `DATABASE_URL` (append `/royal1` as the db name). Then run
   `npm run setup` (`prisma generate && prisma db push && db:seed`). MongoDB
   uses `db push`, not SQL migrations. Whitelist your IP / `0.0.0.0` in Atlas
   Network Access.
2. **Secrets** — set strong `JWT_SECRET` and `FAIR_SECRET`
   (`openssl rand -base64 48`). Never reuse the dev values.
3. **Build & run**
   ```bash
   npm run build
   npm start
   ```
   Or deploy to **Vercel** (set the env vars in the dashboard; the lazy
   settlement model works on serverless). For prompt settlement of idle rounds,
   add a Vercel Cron hitting `/api/games/color/current` and
   `/api/games/crash/current` every few seconds.
4. **Rate limiting** — replace the in-memory limiter with Redis/Upstash for
   multi-instance correctness.
5. **HTTPS** — required; cookies are `Secure` in production.

---

## 📜 License & responsible use

Provided as-is for educational and free-to-play use. You are responsible for
legal compliance if you adapt it for real-money operation. Gambling can be
addictive — build in deposit limits, self-exclusion and responsible-gaming
messaging before going live.
