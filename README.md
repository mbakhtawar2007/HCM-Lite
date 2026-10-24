# HCM Lite

AI-assisted Human Capital Management — Saylani Hackathon (24 October 2026,
Zaitoon Ashraf IT Park). A web-based HR system with three roles (Admin, HR,
Employee) that **starts empty**: no dummy data. Judges create the company,
accounts and activity live, then check that dashboards and AI answers match
those records.

Live deployment: frontend https://hcm-lite.netlify.app, backend
https://hcm-lite-gray.vercel.app (API under `/api`).

## Quick start (under 10 minutes)

### Prerequisites

- Node.js 20+ and npm
- MongoDB — local, or a free MongoDB Atlas cluster (see "Database setup")

### 1. Install

```bash
# From the repo root — installs both backend and frontend:
npm run install:all

# Or install each side yourself:
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Set at least these two in `backend/.env`:

- `MONGO_URI` — your MongoDB connection string (defaults to a local
  database, `mongodb://127.0.0.1:27017/hcm-lite`).
- `JWT_SECRET` — a long random secret. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

Changing `JWT_SECRET` later invalidates every existing login token, so
keep the same value everywhere you deploy it. **Never commit `.env`.**

### 3. Run it

```bash
# From the repo root — backend on :5000, frontend on :5173:
npm run dev

# Or run each side separately:
cd backend && npm run dev     # http://localhost:5000
cd frontend && npm run dev    # http://localhost:5173
```

### 4. First-run setup (the demo entry point)

1. Open http://localhost:5173 — the homepage offers **Set up HCM Lite**.
2. Enter a company name and the first Admin's name, email and password
   (at least 8 characters), then submit.
3. You land on the dashboard, signed in as Admin. Reopening `/setup` now
   shows "Setup already complete".
4. Check the backend is up at http://localhost:5000/api/health.

**Alternative — env auto-seed (optional):** instead of the `/setup` page,
set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (plus optional `ADMIN_NAME` and
`COMPANY_NAME`) in `backend/.env` before the first boot. The server creates
the first Admin on startup **only when no user exists yet** — it never
overwrites an existing account and never logs the password. Prefer the
`/setup` page when a human is doing first-run setup.

**Demo accounts:** there are none by design. Setup creates the first
Admin; every other account is created from inside the app. For a judge
run, start from an empty database and use the `/setup` page. There is no
public self-registration: `POST /api/auth/register` is 404 by design, so
setup can never be blocked by a stray public account.

## What is built

### Original build (P0–P5)

- **P0 — First-run setup + role-based auth** — the app starts with no
  users. Setup succeeds exactly once; afterwards `POST /api/setup`
  returns 403. JWT (Bearer) + bcrypt; roles `ADMIN`, `HR`, `EMPLOYEE`,
  plus `isActive` and `mustChangePassword`. Roles are enforced **on the
  server** (`requireRole` middleware); the frontend menu is only a
  convenience.
- **P0 — Organisation models** — `Setting` (one company row: name, office
  start 09:00, 15-minute grace, Sat–Sun weekends, office location +
  radius), `Department`, `Designation`, `LeaveType` (Annual 14, Sick 8,
  Casual 10, Unpaid unlimited — seeded at setup), `Holiday`.
- **P1 — Core HR flows** — Admin creates/deactivates/resets logins;
  temporary passwords must be changed on first sign-in. Org settings,
  departments, designations, leave types and holidays (Admin writes, HR
  reads). HR registers employees (login + job + salary), directory with
  server search/filter/paging, Employee 360 view, CSV export and CSV
  import (dry-run validation, then writing valid rows only). Attendance
  with server-stamped check-in/out (second check-in 409; late after
  09:15, half day under 5 h, absent, missing check-out), daily board
  and correction requests, plus an optional office geofence on check-in
  (enforced only when office location + radius are set). Leave on
  working days only (weekends + holidays skipped; overlap or
  over-balance 422; HR decisions with notifications). Payroll:
  gross = 1.5 × basic (HRA 40%, medical 10%), per-day deductions,
  joiner/leaver prorating, tax slabs, HR draft → Admin finalize →
  locked forever, payslip PDF (own only, finalized only).
- **P2 — Server-computed dashboards** — `/api/dashboards/admin|hr|employee`
  compute every KPI on the server (MongoDB aggregation + the shared
  attendance service), filterable by date range and department:
  headcount, attrition, payroll cost from finalized runs,
  attendance/late/absenteeism rates, leave utilization, top 5
  late-comers, tenure, audit feed. Rates with no denominator show
  "No data yet", never NaN.
- **P3 — AI assistant** — see "AI assistant" below: chat with 7 scoped
  tools, dashboard summary from supplied KPI JSON only, smart leave
  prefill (never auto-creates), policy Q&A from the brief's rules or
  "does not know", 15 s timeout, ~20 requests/user/hour, every call
  logged, every answer labelled "AI-generated".
- **P4 — Security, audit, comms** — every create/update/approve/finalize
  writes an audit entry (actor, action, entity, before/after JSON);
  audit entries are never editable or deletable, and Admin reads them
  paged and filtered. Announcements (Admin/HR post, all read, on every
  dashboard, Admin-only delete). Notifications for leave decisions and
  payslip availability, own only.

### Audit hardening (Phases 1–5, after P0–P5)

- **Phase 1 — Bugs and broken flows** — 13 fixes, incl. CSV import
  writing rows, office geofence wired into check-in, cross-year leave
  balances charged per year, draft payslips hidden from employees,
  payroll lines skipped for employees not employed that month,
  strict calendar-date validation (2026-02-30 rejected), double-submit
  guards, and stale-state fixes. New suite `backend/test-phase1.mjs`.
- **Phase 2 — Security and RBAC** — token-version invalidation (old
  JWTs die after a password change/reset or deactivation toggle),
  server-side must-change-password enforcement, per-account brute-force
  lock (5 failed logins → 15 min lock, self-clearing, no email
  enumeration), regex/query-operator injection fixes, explicit CSP via
  helmet, CORS restricted to the frontend origin, 100 KB body limit,
  global API rate limit (1000/15 min/IP, best-effort on serverless).
  New suite `backend/test-phase2.mjs`.
- **Phase 3 — AI hardening** — prompt-injection delimiters: user text,
  history, tool results and KPI JSON are wrapped as data-only and can
  never be followed as instructions; Roman Urdu support (language
  toggle + auto-detect, salary guard works in Roman Urdu too). The
  "payroll cost" chat phrasing is still refused by the broad salary
  guard by design (see "AI assistant"). New suite
  `backend/test-phase3.mjs`.
- **Phase 4 — UI/UX overhaul** — design tokens (CSS variables), calm
  teal accent, semantic status colours (always paired with text/icon,
  never colour alone), light + dark theme with a toggle (persisted,
  respects `prefers-color-scheme`, no flash on first paint via a
  same-origin `theme-init.js`, because the CSP blocks inline scripts),
  role-based sidebar + top bar (notifications bell with unread count,
  theme toggle, AI entry), skeletons/empty/error states on every
  screen, toasts, confirmation dialogs for destructive actions
  (including finalize payroll with a "locks the month" warning),
  proper tables with server paging + labelled client-side sorting,
  dependency-free SVG dashboard charts from real server data, an
  employee check-in widget with a live clock, AI chat bubbles with a
  typing indicator and per-role suggested questions, favicon,
  per-page titles, restyled 404, print-friendly payslip view, and a
  defensive PWA (manifest + service worker that never caches `/api/*`
  and uses network-first for navigations).
- **Phase 5 — Code quality and tests** — routes → controllers →
  services → data honoured, duplicated date/balance helpers
  consolidated into shared `yearBounds`/`monthBounds` helpers, dead
  code removed, one real bug fixed (AI leave balances now match
  REST/dashboard for cross-year leaves), central error handling and a
  consistent `{success: true/false, ...}` response shape verified,
  a single test command (`cd backend && npm test`), backend ESLint
  (clean) + Prettier configs. New suite `backend/test-phase5.mjs`.

## What is NOT done (honest limits)

- **Bonus (P6) — not built:** late penalty, absence anomaly flags,
  attrition risk score, camera attendance. (Roman Urdu AI and dark
  mode/PWA **are** built — Phase 3 and Phase 4 respectively — and are
  not in this list. CSV import writing rows **is** built — Phase 1.)
- **Approved-leave cancellation** — only pending leave can be cancelled
  via the API; cancelling approved leave would silently change balances
  and payroll.
- **Announcement editing** — announcements are post/delete only; there
  is no edit endpoint.
- **Employee payslips before finalization** — employees see payslips
  only for finalized runs, never drafts.
- **Gender breakdown** — employees have no gender field, so dashboards
  show "not collected" instead of invented numbers.
- **Live AI answer verification** — a live AI answer against the
  deployed instance has not been verified end to end with a real key
  and a signed-in account, because creating one would block first-run
  setup for judges. The AI code is verified with a mocked provider in
  `backend/test-p3.mjs`, `test-phase3.mjs` and the demo rehearsal; a
  deployed AI key must be present (see "AI assistant") for live
  answers.
- **`npm audit`** — blocked in the build environment by a registry
  policy (403 `policy_denied`); it is **not** a clean audit. Retry it
  from an unrestricted network before final submission. All direct
  dependencies are current minor/patch lines and a grep found no
  unused packages.
- **Logout token revocation by design** — JWTs are stateless, so logout
  alone cannot revoke a token server-side. Mitigation: the token
  version (Phase 2) invalidates old tokens on any password change,
  reset, or deactivation toggle, and deactivated users are rejected on
  the next request. A stolen token stays valid until its expiry or a
  password change.
- **JWT expiry is 7 days** (`JWT_EXPIRES_IN`, default `7d`) — left
  unchanged by decision; shortening it would narrow the stolen-token
  window but changes session UX.
- **Frontend ESLint pending** — backend ESLint is clean; frontend has a
  Prettier config but no React/JSX lint plugin set yet.
- **Full-repo Prettier reformat pending** — 15 untouched backend files
  (e.g. `announcementController`, `miscController`, `csvService`,
  `p1Validation`, several route files) still fail `prettier --check`.
  Only Phase 5-touched files were formatted, to avoid a giant diff.
  Run `cd backend && npm run format` (and the frontend equivalent)
  to apply it.
- **Concurrent first-run setup race** — two simultaneous setups with
  different emails could both pass the user-count check. Needs a
  lock/transaction; single-threaded setup is unaffected and the unique
  email index already blocks the same-email race.
- **Remote repo orphan** — the old `Navbar.jsx` deleted locally in
  Phase 4 remains on the remote branch, because snapshot pushes cannot
  delete files. It is unreferenced (nothing imports it) and harmless:
  the live frontend is built locally from the new Sidebar + TopBar,
  not from the repo tree.
- **Account recovery** — no email verification, self-service password
  reset, or refresh tokens; password resets are done by Admin
  (temporary password, must be changed on next sign-in).

## Tech stack

| Layer | Choice |
| ----- | ------ |
| Frontend | React 19 + Vite + React Router + Axios, plain CSS (no chart/icon packages — charts are hand-rolled SVG) |
| Backend | Node.js + Express + Mongoose + Zod + JWT/bcrypt |
| Database | MongoDB (local, or a free MongoDB Atlas M0 cluster) |
| Validation | Zod schemas on the backend, one central error handler |
| Auth protection | Per-IP auth limiter (100/15 min) + per-account lock (5 fails → 15 min) + global API limiter (1000/15 min) |

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Default | Notes |
| -------- | -------- | ------- | ----- |
| `PORT` | No | `5000` | Backend port |
| `NODE_ENV` | No | `development` | `production` requires `JWT_SECRET` and hides stack traces |
| `MONGO_URI` | No* | `mongodb://127.0.0.1:27017/hcm-lite` | *Required in practice unless you run local MongoDB |
| `JWT_SECRET` | Yes in production | insecure dev fallback (with a warning) | Long random string; never commit it |
| `JWT_EXPIRES_IN` | No | `7d` | e.g. `1d`, `12h`, `7d` |
| `CLIENT_URL` | No | `http://localhost:5173` | CORS origin(s), comma-separated if several |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | — | Optional first-Admin auto-seed; only when no user exists |
| `ADMIN_NAME` / `COMPANY_NAME` | No | `Admin` / `HCM Lite` | Used by the auto-seed only |
| `LOGIN_MAX_FAILED_ATTEMPTS` | No | `5` | Failed logins before the per-account lock |
| `LOGIN_LOCK_MS` | No | `900000` (15 min) | Lock duration; self-clearing, never permanent |
| `AI_API_KEY` | No (P3) | — | Backend-only LLM key (see "AI assistant" below); the browser never calls the AI provider |
| `AI_BASE_URL` | No | `https://api.groq.com/openai/v1/chat/completions` | OpenAI-compatible provider endpoint |
| `AI_MODEL` | No | `openai/gpt-oss-120b` | Groq free-tier model (llama-3.3-70b is no longer on Groq's free plans) |
| `AI_RATE_LIMIT_PER_HOUR` | No | `20` | Max AI requests per user per hour, counted from `AiLog` rows |

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `VITE_API_URL` | No in dev, yes in production | Leave empty in dev: Vite proxies `/api` to `http://localhost:5000`. In production set it to your deployed backend, e.g. `https://hcm-lite-gray.vercel.app/api` |

## Database setup

### Option A — Local MongoDB (fastest)

Install MongoDB Community on your machine, start it, and leave `MONGO_URI`
at the default. The database `hcm-lite` is created on first use.

### Option B — MongoDB Atlas (no local install)

1. Create a free account at mongodb.com and a free (M0) cluster.
2. Database Access → add a database user (username + password).
3. Network Access → add your IP, or `0.0.0.0/0` for a hackathon demo
   (widen access only temporarily — it allows connections from anywhere).
   `0.0.0.0/0` is required for the Vercel deployment, because Vercel's
   IPs are dynamic.
4. Database → Connect → Drivers, and copy the connection string. It looks
   like: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/hcm-lite`
5. Put it in `backend/.env` as `MONGO_URI`. If your password contains
   special characters (`@`, `/`, `?`, …), URL-encode them first — an
   unencoded `@` breaks the connection-string URL. A
   letters-and-numbers password avoids that trap entirely.

On networks whose DNS refuses SRV lookups, use the non-SRV form instead
(list the shard hosts, `ssl=true`, `replicaSet=...`, `authSource=admin`)
— see the Atlas "Drivers" connection string with the SRV part expanded.

If the backend cannot reach MongoDB it exits immediately with a clear
message instead of starting a server whose routes can never work.

## API reference

Base URL: `/api` (dev proxy) or `$VITE_API_URL`. All responses are JSON
with `success: true/false`. Errors return `message`, and validation errors
also return `errors: [{ field, message }]`. The two non-JSON exceptions
are CSV export (`text/csv`) and the payslip PDF (`application/pdf`).

| Method | Endpoint | Auth | Notes |
| ------ | -------- | ---- | ----- |
| GET | `/api/health` | No | Server health check |
| GET | `/api/setup/status` | No | `{ needsSetup: true/false }` — true while no user exists |
| POST | `/api/setup` | No | Creates company + first ADMIN + default leave types. 403 once a user exists |
| POST | `/api/auth/login` | No | Same error for unknown user / wrong password. Returns `{ token, user }` |
| POST | `/api/auth/logout` | Yes | JWTs are stateless; the frontend also deletes its token |
| POST | `/api/auth/change-password` | Yes | Own password; clears `mustChangePassword` and invalidates old tokens (token version) |
| GET | `/api/users/me` | Yes | Logged-in user's profile (password never included) |
| GET/POST | `/api/users` | ADMIN | List / create logins (temporary password on create) |
| PATCH | `/api/users/:id` | ADMIN | Update / deactivate (cannot deactivate self) |
| POST | `/api/users/:id/reset-password` | ADMIN | Set a temporary password (invalidates old tokens) |
| GET/PATCH | `/api/org/settings` | HR read, ADMIN write | Company settings (office start, grace, weekends, location/radius) |
| CRUD | `/api/org/departments`, `/designations`, `/leave-types`, `/holidays` | HR read, ADMIN write | Delete blocked with 409 if in use |
| GET/POST | `/api/employees` | HR/ADMIN | Directory: server search, filters, paging; HR registers (creates login) |
| GET | `/api/employees/me`, `/api/employees/:id`, `/api/employees/:id/360` | Scope-checked | Employee edits only own phone/address; 360 = details + attendance + leave + payslips (employees see finalized payslips only) |
| GET | `/api/employees/export/csv` | HR/ADMIN | CSV export |
| POST | `/api/employees/import/dry-run` | HR/ADMIN | Validation only — row + field + reason errors, writes nothing |
| POST | `/api/employees/import` | HR/ADMIN | Writes valid rows only, reports per-row created/failed, reuses dry-run validation |
| POST | `/api/attendance/check-in`, `/check-out` | Yes | Server-stamped times; second check-in 409; geofence enforced only when office location + radius are set |
| GET | `/api/attendance/me`, `/api/attendance`, `/api/attendance/board` | Scope-checked | Own calendar; staff daily board (incl. on-leave/absent) |
| POST/PATCH | `/api/attendance/corrections` | Request: employee; decide: HR | Correction requests with reason, HR approves/rejects |
| GET/POST | `/api/leaves`, `/api/leaves/balances` | Scope-checked | Apply (EMPLOYEE only), balances, history; working days only |
| PATCH | `/api/leaves/:id/cancel` | EMPLOYEE | Pending leave only |
| PATCH | `/api/leaves/:id/decision` | HR/ADMIN | Approve/reject with comment; creates employee notification |
| GET/POST | `/api/payroll/runs` | HR/ADMIN | Create/review drafts |
| POST | `/api/payroll/runs/:id/finalize` | ADMIN only | Finalizes and locks the run forever |
| POST/DELETE | `/api/payroll/runs/:id/recompute`, `/api/payroll/runs/:id` | HR/ADMIN | Draft only; finalized runs return 409 |
| GET | `/api/payroll/runs/:id/payslip/:employeeId`, `.../pdf` | Scope-checked | Own only, finalized only (403 otherwise); PDF via PDFKit |
| GET | `/api/payroll/my-payslips` | EMPLOYEE | Finalized payslips only |
| GET | `/api/dashboards/admin`, `/hr`, `/employee` | Role + scope | Server-computed KPIs; `?from=&to=&department=` filters |
| POST | `/api/ai/chat`, `/api/ai/dashboard-summary`, `/api/ai/smart-leave` | Auth + scope | See "AI assistant"; 503 without a key, 429 over ~20/hour; chat accepts `language: 'en' | 'ur'` |
| GET/POST | `/api/announcements` | Read: all; post: ADMIN/HR | Active announcements, newest first |
| DELETE | `/api/announcements/:id` | ADMIN only | Audit-logged |
| GET/PATCH | `/api/notifications`, `/api/notifications/:id/read` | Own only | Leave decisions + payslip availability; another user's notification is 403 |
| GET | `/api/audit-logs` | ADMIN only | Paged, filterable by actor/action/entity/date; never editable or deletable |

Authenticated requests send `Authorization: Bearer <token>`. The frontend
does this automatically (see `frontend/src/api/client.js`); on a 401 the
token is cleared and the user is treated as logged out.

## Project structure

```text
hcm-lite/
├── README.md
├── package.json                  # Root scripts only (dev, install:all)
├── backend/
│   ├── package.json              # test (single command), lint, format scripts
│   ├── .env.example
│   ├── eslint.config.js, .prettierrc.json
│   ├── api/index.js              # Vercel serverless entry (deployment only)
│   ├── vercel.json
│   └── src/
│       ├── server.js             # Entry point: connects DB, optional auto-seed, then listens
│       ├── app.js                # Express app: middleware, routes, errors
│       ├── config/               # env.js (loads + validates env), db.js (Mongoose)
│       ├── models/               # User, Setting, Department, Designation, LeaveType, Holiday, Employee, Attendance, AttendanceCorrection, LeaveRequest, PayrollRun, AuditLog, Notification, Announcement, AiLog
│       ├── controllers/          # auth, setup, user, org, employee, attendance, leave, payroll, dashboard, ai, announcement, misc (audit/notifications)
│       ├── routes/               # auth, setup, user, org, employee, attendance, leave, payroll, dashboard, ai, announcement, misc
│       ├── services/             # setupService, settingsService, attendanceService (shared status rules), payrollService, csvService, dashboardService, aiService, aiTools
│       ├── middleware/           # auth (JWT + token version + must-change-password), requireRole, validate (Zod), errorHandler, rateLimit
│       ├── validation/           # Zod schemas per resource
│       ├── utils/                # asyncHandler, ApiError, generateToken, scope, escapeRegExp, queryGuard
│       └── test-p1.mjs, test-p2.mjs, test-p3.mjs, test-p4.mjs, test-demo.mjs, test-phase1.mjs, test-phase2.mjs, test-phase3.mjs, test-phase5.mjs
└── frontend/
    ├── package.json              # build, dev, preview, format scripts
    ├── vite.config.js            # Dev proxy: /api → http://localhost:5000
    ├── .env.example
    ├── .prettierrc.json
    ├── index.html                # Loads theme-init.js before React (no flash, CSP-safe)
    ├── public/                   # theme-init.js, favicon.svg, manifest.webmanifest, sw.js (PWA)
    └── src/
        ├── main.jsx              # Router + AuthProvider bootstrap + defensive SW registration
        ├── App.jsx               # All routes (role-guarded)
        ├── index.css             # Design tokens (CSS variables), light + dark themes
        ├── api/                  # client.js (axios + token), auth.js, setup.js, p1.js, dashboards.js, ai.js
        ├── context/AuthContext.jsx  # user, login, logout
        ├── components/           # Layout, Sidebar, TopBar, ThemeToggle, ProtectedRoute, DashboardFilters, DashboardAiSummary, Charts, Rate, ui/* (Button, Card, Input, Select, Badge, Skeleton, EmptyState, ErrorState, ConfirmDialog, DataTable, Toast, PageHeader, KpiCard)
        ├── pages/                # Home, Setup, Login, ChangePassword, Dashboard, Admin/HR/Employee dashboards, Users, Settings, Employees, Employee360, Attendance, Leaves, Payroll, Notifications, Announcements, Audit, AiChat, NotFound
        └── utils/                # errors.js (one readable message from any API error), theme.js
```

## How auth works

1. Setup (or login) returns a JWT (`{ token, user }`). Passwords are never
   returned: the schema marks `password` as `select: false` and strips it
   from JSON output.
2. The frontend stores the token in `localStorage` under `hcm_lite_token`
   and the axios interceptor attaches it to every request.
3. On app load, `AuthContext` calls `GET /api/users/me` to restore the
   session from the stored token. If the token expired, it is cleared.
4. `ProtectedRoute` renders a loader while that check runs, redirects to
   `/login` when there is no user, redirects a wrong-role user to
   `/dashboard`, and otherwise renders the page.
5. A user with `mustChangePassword` is blocked server-side from every
   route except change-password, logout, and `GET /api/users/me` — the
   UI redirect is not the enforcement. After a password change the
   frontend forces a fresh sign-in, because the old token is dead
   (token version).
6. Logout calls `POST /api/auth/logout` (best effort) and deletes the
   token locally. Because JWTs are stateless, there is nothing to revoke
   server-side — deleting the token *is* the logout, with the
   token-version mitigation described in "What is NOT done".

## Security notes

- Passwords are hashed with bcrypt before saving, and only re-hashed when
  the password itself changes. Failed-login fields are stripped from JSON.
- Auth routes are rate-limited per IP (100/15 min), per account
  (5 fails → 15 min lock, self-clearing), and globally (1000/15 min).
- Helmet sets secure headers incl. an explicit CSP; CORS only allows
  your frontend origin; request bodies are capped at 100 KB; query
  operators are blocked (`query parser: simple` + `queryGuard`).
- Login returns the same message for an unknown email and a wrong
  password, so attackers cannot probe which emails are registered.
- Roles and data scope are enforced on the server on every route, not
  just in the UI. Employees can only read rows with their own
  `employee_id`.
- This app has **no** email verification, self-service password reset,
  or refresh tokens (see "What is NOT done").

## AI assistant

- **Chat (`/ai`, all roles):** `POST /api/ai/chat` with
  `{ message, history?, language? }` (`language: 'en' | 'ur'`, or
  auto-detected Roman Urdu). The model answers policy questions only
  from the brief's rules (summarised in the system prompt) or says it
  does not know, and answers data questions only through tools —
  `get_headcount`, `get_attendance_summary`, `get_late_comers`,
  `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`,
  `search_employees` — which reuse the same services and role scope as
  the REST API (max 2 tool rounds). Every AI answer in the UI is
  labelled "AI-generated", and every call is logged in `AiLog` (user,
  endpoint, tools used, success/error, latency — never salary data or
  the key).
- **Prompt-injection hardening (Phase 3):** user text, history, tool
  results and KPI JSON are wrapped in data-only markers
  (`<user-data>`, `<tool-data>`, `<kpi-data>`, …) and the system prompt
  states they are data, never instructions — even if they say "ignore
  previous instructions". Normal text is delimited, not censored.
  The server-side salary guard runs before any LLM call and does not
  depend on the model behaving.
- **Roman Urdu (Phase 3):** toggle English / Roman Urdu in the chat
  (persisted in `localStorage`), or just write Roman Urdu — e.g.
  "mujhe kal chutti chahiye" is auto-detected and answered in Roman
  Urdu. The salary guard works in Roman Urdu too (a colleague's salary
  is politely refused in Roman Urdu, with no figure leaked).
- **Dashboard summary (Admin/HR dashboards, "Summarize" button):**
  `POST /api/ai/dashboard-summary` sends only the KPI numbers already
  displayed for the current filters; the model returns 3–5 bullets from
  those numbers alone. If AI is unavailable, no bullets are fabricated —
  the UI shows the unavailable state.
- **Smart leave (Leave page):** `POST /api/ai/smart-leave` turns plain
  words ("next Monday and Tuesday off for a wedding") into JSON
  `{ type, start, end, reason }` using the server's current date,
  validated against leave types and working days (retried once on bad
  JSON, then the normal form is shown). It never creates a leave
  request — the user checks the pre-filled form and presses Apply.
- **Guardrails:** before any LLM call, a salary/pay request that is not
  clearly about the requester's own pay is refused politely, logged, and
  never sent to the model; tools never return salary fields, and an
  employee's tools only ever see their own record. One deliberate
  consequence: a chat question phrased with a salary word and no "my"
  (e.g. "What is the payroll cost …?") is refused by that broad guard,
  even though the payroll tool itself is aggregate-only — the guard was
  not weakened, because weakening it would risk individual-salary
  questions slipping through. Provider calls have a 15 s timeout with a
  friendly fallback, and a ~20/hour per-user limit counted from `AiLog`
  rows.
- **Adding the key (the last step, done by you, never in chat or in a
  file):** for the deployed backend, open the hosting provider's
  environment settings (e.g. Vercel project → Settings → Environment
  Variables), add `AI_API_KEY` with your own Groq key (free tier, no
  card, from console.groq.com), and redeploy. For a local run, put it in
  `backend/.env` instead. `AI_BASE_URL` and `AI_MODEL` are optional
  overrides; the defaults above work with Groq's free tier.
- **Without a key:** AI routes return a friendly `503 "AI not
  configured"` and the frontend shows that state; dashboards, leave,
  attendance and payroll all work normally.
- **Not yet verified live:** a live AI answer against the deployed
  instance has not been verified end to end with a real key and a
  signed-in account (see "What is NOT done").

## Deployment (live instance)

- **Frontend:** https://hcm-lite.netlify.app (Netlify site `hcm-lite`),
  built with `VITE_API_URL=https://hcm-lite-gray.vercel.app/api`.
  Deploy manually from a local build (the frontend does **not**
  auto-deploy from GitHub): build with `VITE_API_URL` set, grep the
  bundle for the Vercel URL, then deploy the `dist/` directory. The
  Netlify site has an SPA fallback, and `dist/` includes the PWA files
  (`manifest.webmanifest`, `sw.js`, `theme-init.js`, `favicon.svg`).
  If the frontend build talks to `localhost` in production, the build
  went out without `VITE_API_URL` — rebuild with it set.
- **Backend:** https://hcm-lite-gray.vercel.app (Vercel project
  `hcm-lite`, Root Directory `backend`, serverless adapter in
  `backend/api/index.js` + `backend/vercel.json`). Vercel auto-deploys
  from GitHub pushes to `main`; a new commit produces a new deployment
  that must be checked as Ready/Latest/Current before it is claimed
  live.
- **Database:** MongoDB Atlas M0, Network Access Allow Access from
  Anywhere (`0.0.0.0/0`, needed because Vercel's IPs are dynamic).
- **Backend env vars in hosting:** `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`,
  `CLIENT_URL` (the Netlify origin), plus `AI_API_KEY` for P3 (see
  above). Never commit any of these values. **Scope warning:**
  `AI_API_KEY` is set for Production only — a Preview deployment would
  not have it, and its AI routes would return 503.
- **Current deployment state (Phase 6, 24 Oct 2026):** repo head
  `8e4d0c1` (Phase 5). The live database is **currently kept as-is
  for user testing** (`needsSetup: false` by the user's choice) — it is
  **not** in judge-ready clean state. Before final submission, clean it
  back to `needsSetup: true` by deleting only the app accounts in Atlas
  Browse Collections → `HCM-Lite` → `users` (Database Access untouched,
  no setup submitted, no Vercel change), then re-verify
  `/api/setup/status` returns `needsSetup: true`.
- The backend reads only the exact variable name `MONGO_URI`; an `@`
  (or `/ ? # [`) in an Atlas password breaks the connection-string URL
  unless it is URL-encoded — use a letters-and-numbers password to
  avoid that trap. Never delete a Database Access user to remove an app
  account — app accounts live only in Browse Collections.

## 5-minute demo (fresh database, in order)

This is the rehearsed script, and it is also automated — see "Tests".
It is verified by `backend/test-demo.mjs` (40 checks, all passing)
against a fresh in-memory database with a mocked LLM.

1. **Admin setup** — open the frontend, `/setup`: company name + first
   Admin. Setup succeeds once; a second attempt is 403. Leave types
   (Annual 14, Sick 8, Casual 10, Unpaid unlimited) are seeded at setup.
2. **Admin sets up the org, then creates an HR login** — Admin creates
   a department and designation (office hours 09:00 / grace 15 min are
   the seeded defaults; office location/radius are optional and only
   enforced when set), then creates an HR login (temporary password);
   HR signs in and changes it.
3. **HR registers 2–3 employees** — Employees page: job details +
   salary; each registration creates the employee's login.
4. **Employee signs in, changes temp password, checks in** — the
   employee's own check-in is stamped by the server; a second check-in
   is 409; check-out completes the day.
5. **Smart leave** — on the Leaves page, type plain words ("need next
   Monday and Tuesday off for a wedding") and confirm the pre-filled
   form. It never auto-creates.
6. **HR approves** — the employee gets a notification; HR's approved
   list shows who is on leave.
7. **Dashboard + AI** — Admin/HR dashboards show the real KPIs;
   "Summarize" returns AI bullets from those numbers only; the
   assistant answers "who is on leave" from the same data.
8. **Payroll run** — HR creates the month's draft; Admin finalizes it
   (locked forever after that).
9. **Employee downloads payslip, asks a colleague's salary (refused)**
   — own payslip PDF only after finalization; a colleague's salary is
   politely refused with no data leaked.
10. **Admin shows the audit log** — every step above appears with
    actor, action, entity and before/after JSON.

## Tests

All suites run against in-memory MongoDB (`mongodb-memory-server`);
they need no live database and no real AI key (the AI provider is
mocked in `test-p3.mjs`, `test-phase3.mjs` and `test-demo.mjs`).

```bash
cd backend
npm test   # Single command, fail-fast: P1, P2, P3, P4, demo, Phase 1, Phase 2, Phase 3, Phase 5
# Individual suites, if you want one only:
node test-p1.mjs    # Core flows: 56 checks
node test-p2.mjs    # Dashboards/formulas: 44 checks
node test-p3.mjs    # AI tools/guards (mocked LLM): 27 checks
node test-p4.mjs    # Audit/announcements/notifications/security: 60 checks
node test-demo.mjs  # The 5-minute demo, end to end: 40 checks
node test-phase1.mjs  # Bugs/broken flows: 85 checks
node test-phase2.mjs  # Security/RBAC: 84 checks
node test-phase3.mjs  # AI hardening: 40 checks
node test-phase5.mjs  # Code quality gaps (tax slabs, proration, AI balances): 35 checks
# Total: 471 checks, all passing at Phase 6.
```

Lint/format:

```bash
cd backend && npm run lint        # ESLint, clean
cd backend && npm run format:check  # Prettier — 15 untouched files still pending (see "What is NOT done")
cd frontend && npm run format:check
```

## Commands

| Command | Where | What it does |
| ------- | ----- | ------------ |
| `npm run dev` | Root | Backend + frontend together |
| `npm run install:all` | Root | Installs backend and frontend deps |
| `npm run dev` | `backend/` | Backend with auto-reload (`node --watch`) |
| `npm start` | `backend/` | Backend in production mode |
| `npm test` | `backend/` | All suites, fail-fast, exit non-zero on first failure |
| `npm run lint` / `npm run format` | `backend/` | ESLint / Prettier |
| `npm run dev` | `frontend/` | Vite dev server on :5173 |
| `npm run build` | `frontend/` | Production build into `frontend/dist/` |
| `npm run preview` | `frontend/` | Serve the production build locally |

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| Backend exits with a MongoDB error | MongoDB is not running, or `MONGO_URI` is wrong — see Database setup |
| Frontend shows "Cannot reach the backend" | Backend is not running on :5000, or you are on a page that calls the API before it started |
| CORS error in the browser console | `CLIENT_URL` in `backend/.env` does not match the frontend origin |
| Logged out after refresh / "token is invalid or expired" | `JWT_SECRET` changed, or the token passed `JWT_EXPIRES_IN` — log in again |
| Setup returns 403 | A user already exists — setup runs exactly once. To re-run it, use an empty database |
| Port already in use | Another dev server is running — stop it, or change `PORT` / Vite's port |
