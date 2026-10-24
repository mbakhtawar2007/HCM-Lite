# HCM Lite

AI-assisted Human Capital Management — Saylani Hackathon (24 October 2026,
Zaitoon Ashraf IT Park). A web-based HR system with three roles (Admin, HR,
Employee) that **starts empty**: no dummy data. Judges create the company,
accounts and activity live, then check that dashboards and AI answers match
those records.

Live deployment: frontend https://hcm-lite.netlify.app, backend
https://hcm-lite-gray.vercel.app (API under `/api`).

## What is built (P0–P5)

- **P0 — First-run setup** — the app starts with no users. Open `/setup`,
  name the company and create the first Admin account. Setup succeeds
  exactly once; afterwards `POST /api/setup` returns 403.
- **P0 — Role-based auth** — JWT (Bearer) + bcrypt. User roles: `ADMIN`,
  `HR`, `EMPLOYEE`, plus `isActive` and `mustChangePassword` flags.
  Roles are enforced **on the server** (`requireRole` middleware); the
  frontend menu is only a convenience. There is no public
  self-registration: accounts come from setup, then from Admin/HR creation.
- **P0 — Organisation models** — `Setting` (one company row: name, office
  start 09:00, 15-minute grace, Sat–Sun weekends), `Department`,
  `Designation`, `LeaveType` (Annual 14, Sick 8, Casual 10, Unpaid
  unlimited — seeded at setup), `Holiday`.
- **P1 — Core HR flows** — Admin creates/deactivates/resets logins;
  temporary passwords must be changed on first sign-in. Org settings,
  departments, designations, leave types and holidays (Admin writes, HR
  reads). HR registers employees (login + job + salary), directory with
  server search/filter/paging, Employee 360 view, CSV export and CSV
  import dry-run. Attendance with server-stamped check-in/out (second
  check-in 409; late after 09:15, half day under 5 h, absent, missing
  check-out), daily board and correction requests. Leave on working days
  only (weekends + holidays skipped; overlap or over-balance 422; HR
  decisions with notifications). Payroll Lite: gross = 1.5 × basic
  (HRA 40%, medical 10%), per-day deductions, joiner/leaver prorating,
  tax slabs, HR draft → Admin finalize → locked forever, payslip PDF
  (own only, finalized only).
- **P2 — Server-computed dashboards** — `/api/dashboards/admin|hr|employee`
  compute every KPI on the server (MongoDB aggregation + the shared
  attendance service), filterable by date range and department: headcount,
  attrition, payroll cost from finalized runs, attendance/late/
  absenteeism rates, leave utilization, top 5 late-comers, tenure, audit
  feed. Rates with no denominator show "No data yet", never NaN.
- **P3 — AI assistant** — see "AI assistant (P3)" below: chat with 7
  scoped tools, dashboard summary from supplied KPI JSON only, smart
  leave prefill (never auto-creates), policy Q&A from the brief's rules
  or "does not know", 15 s timeout, ~20 requests/user/hour, every call
  logged, every answer labelled "AI-generated".
- **P4 — Security, audit, comms** — every create/update/approve/finalize
  writes an audit entry (actor, action, entity, before/after JSON);
  audit entries are never editable or deletable, and Admin reads them
  paged and filtered. Announcements (Admin/HR post, all read, on every
  dashboard, Admin-only delete). Notifications for leave decisions and
  payslip availability, own only.
- **P5 — Demo, docs, polish** — this README, a loading/empty/error-state
  pass over every page, and a fresh-database demo rehearsal script
  (`backend/test-demo.mjs`, see "5-minute demo" below).

## What is NOT done (honest limits)

- **Actual CSV import (writing rows)** — the import endpoint is a dry-run
  only: it validates and reports row + field + reason errors, but writes
  nothing. Export works.
- **Announcement editing** — announcements are post/delete only; there
  is no edit endpoint.
- **Approved-leave cancellation** — only pending leave can be cancelled
  via the API; cancelling approved leave would silently change balances
  and payroll.
- **Employee payslips before finalization** — employees see payslips
  only for finalized runs, never drafts.
- **Gender breakdown** — employees have no gender field, so dashboards
  show "not collected" instead of invented numbers.
- **Live AI answer verification** — a live AI answer against the
  deployed instance has not been verified end to end without a
  signed-in account, because creating one would block first-run setup
  for judges. The AI code is verified with a mocked provider in
  `backend/test-p3.mjs` and in the demo rehearsal; a deployed AI key
  must be present (see "AI assistant (P3)") for live answers.
- **Bonus (P6)** — late penalty, anomaly flags, attrition risk, camera
  attendance, Roman Urdu, dark mode/PWA are not built.
- **Account recovery** — no email verification, password reset, or
  refresh tokens; password resets are done by Admin (temporary
  password, must be changed on next sign-in).

## Tech stack

| Layer | Choice |
| ----- | ------ |
| Frontend | React 19 + Vite + React Router + Axios, plain CSS |
| Backend | Node.js + Express + Mongoose + Zod + JWT/bcrypt |
| Database | MongoDB (local, or a free MongoDB Atlas M0 cluster) |
| Validation | Zod schemas on the backend, one central error handler |
| Auth routes | Rate-limited (100 attempts / 15 min / IP) |

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

Open `backend/.env` and set at least these two:

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
Admin; every other account is created from inside the app (P1). For a
judge run, start from an empty database and use the `/setup` page.

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
| `AI_API_KEY` | No (P3) | — | Backend-only LLM key (see "AI assistant (P3)" below); the browser never calls the AI provider |
| `AI_BASE_URL` | No | `https://api.groq.com/openai/v1/chat/completions` | OpenAI-compatible provider endpoint |
| `AI_MODEL` | No | `openai/gpt-oss-120b` | Groq free-tier model (llama-3.3-70b is no longer on Groq's free plans) |
| `AI_RATE_LIMIT_PER_HOUR` | No | `20` | Max AI requests per user per hour, counted from `AiLog` rows |

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `VITE_API_URL` | No in dev, yes in production | Leave empty in dev: Vite proxies `/api` to `http://localhost:5000`. In production set it to your deployed backend, e.g. `https://your-api.example.com/api` |

## Database setup

### Option A — Local MongoDB (fastest)

Install MongoDB Community on your machine, start it, and leave `MONGO_URI`
at the default. The database `hcm-lite` is created on first use.

### Option B — MongoDB Atlas (no local install)

1. Create a free account at mongodb.com and a free (M0) cluster.
2. Database Access → add a database user (username + password).
3. Network Access → add your IP, or `0.0.0.0/0` for a hackathon demo
   (widen access only temporarily — it allows connections from anywhere).
4. Database → Connect → Drivers, and copy the connection string. It looks
   like: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/hcm-lite`
5. Put it in `backend/.env` as `MONGO_URI`. If your password contains
   special characters (`@`, `/`, `?`, …), URL-encode them first.

On networks whose DNS refuses SRV lookups, use the non-SRV form instead
(list the shard hosts, `ssl=true`, `replicaSet=...`, `authSource=admin`)
— see the Atlas "Drivers" connection string with the SRV part expanded.

If the backend cannot reach MongoDB it exits immediately with a clear
message instead of starting a server whose routes can never work.

## API reference

Base URL: `/api` (dev proxy) or `$VITE_API_URL`. All responses are JSON
with `success: true/false`. Errors return `message`, and validation errors
also return `errors: [{ field, message }]`.

| Method | Endpoint | Auth | Notes |
| ------ | -------- | ---- | ----- |
| GET | `/api/health` | No | Server health check |
| GET | `/api/setup/status` | No | `{ needsSetup: true/false }` — true while no user exists |
| POST | `/api/setup` | No | Creates company + first ADMIN + default leave types. 403 once a user exists |
| POST | `/api/auth/login` | No | Same error for unknown user / wrong password. Returns `{ token, user }` |
| POST | `/api/auth/logout` | Yes | JWTs are stateless; the frontend also deletes its token |
| POST | `/api/auth/change-password` | Yes | Own password; clears `mustChangePassword` |
| GET | `/api/users/me` | Yes | Logged-in user's profile (password never included) |
| GET/POST | `/api/users` | ADMIN | List / create logins (temporary password on create) |
| PATCH | `/api/users/:id` | ADMIN | Update / deactivate (cannot deactivate self) |
| POST | `/api/users/:id/reset-password` | ADMIN | Set a temporary password |
| GET/PATCH | `/api/org/settings` | HR read, ADMIN write | Company settings (office start, grace, weekends, location/radius) |
| CRUD | `/api/org/departments`, `/designations`, `/leave-types`, `/holidays` | HR read, ADMIN write | Delete blocked with 409 if in use |
| GET/POST | `/api/employees` | HR/ADMIN | Directory: server search, filters, paging; HR registers (creates login) |
| GET | `/api/employees/me`, `/api/employees/:id`, `/api/employees/:id/360` | Scope-checked | Employee edits only own phone/address; 360 = details + attendance + leave + payslips |
| GET | `/api/employees/export/csv` | HR/ADMIN | CSV export |
| POST | `/api/employees/import/dry-run` | HR/ADMIN | Validation only — row + field + reason errors, writes nothing |
| POST | `/api/attendance/check-in`, `/check-out` | Yes | Server-stamped times; second check-in 409 |
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
| POST | `/api/ai/chat`, `/api/ai/dashboard-summary`, `/api/ai/smart-leave` | Auth + scope | See "AI assistant (P3)"; 503 without a key, 429 over ~20/hour |
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
│   ├── package.json
│   ├── .env.example
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
│       ├── middleware/           # auth (JWT), requireRole, validate (Zod), errorHandler, rateLimit
│       ├── validation/           # Zod schemas per resource
│       ├── utils/                # asyncHandler, ApiError, generateToken, scope
│       └── test-p1.mjs, test-p2.mjs, test-p3.mjs, test-p4.mjs, test-demo.mjs  # In-memory MongoDB suites (see "Tests")
└── frontend/
    ├── package.json
    ├── vite.config.js            # Dev proxy: /api → http://localhost:5000
    ├── .env.example
    └── src/
        ├── main.jsx              # Router + AuthProvider bootstrap
        ├── App.jsx               # All routes (role-guarded)
        ├── index.css             # Plain CSS, no framework
        ├── api/                  # client.js (axios + token), auth.js, setup.js, p1.js, dashboards.js, ai.js
        ├── context/AuthContext.jsx  # user, login, logout
        ├── components/           # Layout, Navbar, ProtectedRoute, DashboardFilters, DashboardAiSummary, Rate, ui/*
        ├── pages/                # Home, Setup, Login, ChangePassword, Dashboard, Admin/HR/Employee dashboards, Users, Settings, Employees, Employee360, Attendance, Leaves, Payroll, Notifications, Announcements, Audit, AiChat, NotFound
        └── utils/errors.js       # One readable message from any API error
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
5. Logout calls `POST /api/auth/logout` (best effort) and deletes the
   token locally. Because JWTs are stateless, there is nothing to revoke
   server-side — deleting the token *is* the logout.

## Security notes (and what this does not do yet)

- Passwords are hashed with bcrypt before saving, and only re-hashed when
  the password itself changes.
- Auth routes are rate-limited (100 attempts / 15 min / IP).
- Helmet sets secure headers; CORS only allows your frontend origin;
  request bodies are capped at 100 KB.
- Login returns the same message for an unknown email and a wrong
  password, so attackers cannot probe which emails are registered.
- This app has **no** email verification, self-service password reset,
  or refresh tokens (see "What is NOT done"). Roles and data scope are
  enforced on the server on every route, not just in the UI.

## AI assistant (P3)

- **Chat (`/ai`, all roles):** `POST /api/ai/chat` with `{ message, history? }`.
  The model answers policy questions only from the brief's rules
  (summarised in the system prompt) or says it does not know, and answers
  data questions only through tools — `get_headcount`,
  `get_attendance_summary`, `get_late_comers`, `get_leave_summary`,
  `get_my_leave_balance`, `get_payroll_summary`, `search_employees` —
  which reuse the same services and role scope as the REST API (max 2
  tool rounds). Every AI answer in the UI is labelled "AI-generated",
  and every call is logged in `AiLog` (user, endpoint, tools used,
  success/error, latency — never salary data or the key).
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
  employee's tools only ever see their own record. Provider calls have a
  15 s timeout with a friendly fallback, and a ~20/hour per-user limit
  counted from `AiLog` rows.
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
- **Not yet done:** P6 bonus features (camera attendance, late penalty,
  anomaly flags, attrition risk, Roman Urdu, dark mode/PWA) are still
  open; the AI provider is Groq by default and any other
  OpenAI-compatible endpoint needs its own key and model name. A live
  AI answer against the deployed instance has not been verified end
  to end without a signed-in account (see "What is NOT done").

## Deployment (live instance)

- **Frontend:** https://hcm-lite.netlify.app (Netlify site `hcm-lite`),
  built with `VITE_API_URL=https://hcm-lite-gray.vercel.app/api`.
- **Backend:** https://hcm-lite-gray.vercel.app (Vercel project
  `hcm-lite`, Root Directory `backend`, serverless adapter in
  `backend/api/index.js` + `backend/vercel.json`).
- **Database:** MongoDB Atlas M0, Network Access Allow Access from
  Anywhere (`0.0.0.0/0`, needed because Vercel's IPs are dynamic).
- **Backend env vars in hosting:** `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`,
  `CLIENT_URL` (the Netlify origin), plus `AI_API_KEY` for P3 (see
  above). Never commit any of these values.
- If the frontend build talks to `localhost` in production, the build
  went out without `VITE_API_URL` — rebuild with it set. The backend
  reads only the exact variable name `MONGO_URI`; an `@` (or `/ ? # [`)
  in an Atlas password breaks the connection-string URL unless it is
  URL-encoded — use a letters-and-numbers password to avoid that trap.

## 5-minute demo (fresh database, in order)

This is the rehearsed script, and it is also automated — see "Tests".

1. **Admin setup** — open the frontend, `/setup`: company name + first
   Admin. Setup succeeds once; a second attempt is 403.
2. **HR login created** — Admin creates an HR login (temporary
   password); HR signs in and changes it.
3. **HR registers 2–3 employees** — Employees page: job details +
   salary; each registration creates the employee's login.
4. **Employee signs in, changes temp password, checks in** — the
   employee's own check-in is stamped by the server; a second check-in
   is 409.
5. **Smart leave** — on the Leaves page, type plain words ("need next
   Monday and Tuesday off for a wedding") and confirm the pre-filled
   form. It never auto-creates.
6. **HR approves** — the employee gets a notification; HR's approved
   list shows who is on leave.
7. **Dashboard summary** — Admin/HR dashboards show the real KPIs;
   "Summarize" returns AI bullets from those numbers only.
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
mocked in `test-p3.mjs` and `test-demo.mjs`).

```bash
cd backend
node test-p1.mjs    # Core flows: 56 checks
node test-p2.mjs    # Dashboards/formulas: 44 checks
node test-p3.mjs    # AI tools/guards (mocked LLM): 27 checks
node test-p4.mjs    # Audit/announcements/notifications/security: 60 checks
node test-demo.mjs  # The 5-minute demo, end to end: 40 checks
```

## Commands

| Command | Where | What it does |
| ------- | ----- | ------------ |
| `npm run dev` | Root | Backend + frontend together |
| `npm run install:all` | Root | Installs backend and frontend deps |
| `npm run dev` | `backend/` | Backend with auto-reload (`node --watch`) |
| `npm start` | `backend/` | Backend in production mode |
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
