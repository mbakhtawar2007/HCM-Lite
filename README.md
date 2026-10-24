# HCM Lite

AI-assisted Human Capital Management — Saylani Hackathon (24 October 2026,
Zaitoon Ashraf IT Park). A web-based HR system with three roles (Admin, HR,
Employee) that **starts empty**: no dummy data. Judges create the company,
accounts and activity live, then check that dashboards and AI answers match
those records.

## What is built (P0)

- **First-run setup** — the app starts with no users. Open `/setup`, name the
  company and create the first Admin account. Setup succeeds exactly once;
  afterwards `POST /api/setup` returns 403.
- **Role-based auth** — JWT (Bearer) + bcrypt. User roles: `ADMIN`, `HR`,
  `EMPLOYEE`, plus `isActive` and `mustChangePassword` flags. Roles are
  enforced **on the server** (`requireRole` middleware); the frontend menu
  is only a convenience. There is no public self-registration: accounts
  come from setup, then from Admin/HR creation (P1).
- **Organisation models** — `Setting` (one company row: name, office start
  09:00, 15-minute grace, Sat–Sun weekends), `Department`, `Designation`,
  `LeaveType` (Annual 14, Sick 8, Casual 10, Unpaid unlimited — seeded at
  setup), `Holiday`.
- **Role dashboard shells** — `/admin`, `/hr`, `/employee` plus a role-aware
  `/dashboard` hub. Empty states only; no fake headcount or payroll numbers.

Not yet built (later phases): employees, attendance, leave, payroll (P1),
server-computed dashboards (P2), AI assistant (P3), audit log (P4),
demo/docs polish (P5), bonus features (P6).

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

| Method | Endpoint | Auth | Body | Notes |
| ------ | -------- | ---- | ---- | ----- |
| GET | `/api/health` | No | — | Server health check |
| GET | `/api/setup/status` | No | — | `{ needsSetup: true/false }` — true while no user exists |
| POST | `/api/setup` | No | `{ companyName, adminName, adminEmail, adminPassword }` | Creates company + first ADMIN + default leave types. 403 once a user exists |
| POST | `/api/auth/login` | No | `{ email, password }` | Same error for unknown user / wrong password. Returns `{ token, user }` |
| POST | `/api/auth/logout` | Yes | — | JWTs are stateless; the frontend also deletes its token |
| GET | `/api/users/me` | Yes | — | Logged-in user's profile (password never included) |
| GET | `/api/users` | Yes, ADMIN only | — | All users (no passwords). Other roles get 403 |

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
│       ├── models/               # User, Setting, Department, Designation, LeaveType, Holiday
│       ├── controllers/          # auth, setup, user
│       ├── routes/               # authRoutes, setupRoutes, userRoutes
│       ├── services/             # setupService (shared by /setup and env auto-seed)
│       ├── middleware/           # auth (JWT), requireRole, validate (Zod), errorHandler, rateLimit
│       ├── validation/           # Zod schemas per resource
│       └── utils/                # asyncHandler, ApiError, generateToken
└── frontend/
    ├── package.json
    ├── vite.config.js            # Dev proxy: /api → http://localhost:5000
    ├── .env.example
    └── src/
        ├── main.jsx              # Router + AuthProvider bootstrap
        ├── App.jsx               # All routes (role-guarded dashboard shells)
        ├── index.css             # Plain CSS, no framework
        ├── api/                  # client.js (axios + token), auth.js, setup.js
        ├── context/AuthContext.jsx  # user, login, logout
        ├── components/           # Layout, Navbar, ProtectedRoute, ui/*
        ├── pages/                # Home, Setup, Login, Dashboard, Admin/HR/Employee dashboards, NotFound
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
- This phase has **no** email verification, password reset, refresh
  tokens, employee management, attendance, leave, payroll, dashboards
  with real data, AI assistant, or audit log — those arrive in P1–P4.

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
- **Not yet done:** P5 demo/docs polish and P6 bonus (camera
  attendance) are still open; the AI provider is Groq by default and
  any other OpenAI-compatible endpoint needs its own key and model name.

## Deployment (sketch)

- **Frontend:** deploy the `frontend/` folder to Netlify or Vercel, and
  set `VITE_API_URL` to your deployed backend URL before building.
- **Backend:** deploy `backend/` to any Node host, and set the backend
  environment variables there — especially `MONGO_URI`, `JWT_SECRET`,
  `NODE_ENV=production`, and `CLIENT_URL` to your deployed frontend origin.
- If the frontend build talks to `localhost` in production, the build
  went out without `VITE_API_URL` — rebuild with it set.

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
