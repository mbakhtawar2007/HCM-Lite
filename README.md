# Hackathon Boilerplate

A reusable full-stack starter for 12-hour hackathons: clone it, install, and
start building your feature instead of setting up auth, routing, validation,
and database wiring for the tenth time.

## Tech stack

| Layer    | Choice | Why for a hackathon |
| -------- | ------ | ------------------- |
| Frontend | React 19 + Vite + React Router | Fast dev server, tiny build, familiar routing |
| Backend  | Node.js + Express + Mongoose | One language end to end, minimal ceremony |
| Database | MongoDB (local or Atlas) | No schema migrations to slow you down |
| Auth     | bcrypt + JWT (Bearer token) | Stateless, works across any frontend host |
| Validation | Zod (backend) | One schema per route, clear field-level errors |
| HTTP     | Axios (frontend) | One client, token attached automatically |

No TypeScript, no CSS framework, no test runner, no extra services — every
dependency in the two `package.json` files is used by the code.

## What is already working

- Signup, login, logout, password hashing (bcrypt), JWT auth, protected routes
- A working example CRUD feature (items on the dashboard) to copy per feature
- Central error handling, input validation, rate limiting on auth routes
- Helmet headers, CORS restricted to your frontend origin, JSON body limits
- A preconfigured frontend → backend connection (Vite proxy in dev,
  `VITE_API_URL` in production)

## Quick start

### Prerequisites

- Node.js 20+ and npm
- MongoDB — either local, or a free MongoDB Atlas cluster (see below)

### 1. Install

```bash
# From the repo root — installs both frontend and backend:
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

- `MONGO_URI` — your MongoDB connection string (defaults to a local database)
- `JWT_SECRET` — a long random secret. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

Changing `JWT_SECRET` later invalidates every existing login token, so keep
the same value everywhere you deploy it. Never commit `.env`.

### 3. Run it

```bash
# From the repo root — backend on :5000, frontend on :5173:
npm run dev

# Or run each side separately:
cd backend && npm run dev     # http://localhost:5000
cd frontend && npm run dev    # http://localhost:5173
```

Open http://localhost:5173, register an account, and you should land on the
dashboard. Check the backend is up at http://localhost:5000/api/health.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Default | Notes |
| -------- | -------- | ------- | ----- |
| `PORT` | No | `5000` | Backend port |
| `NODE_ENV` | No | `development` | `production` requires `JWT_SECRET` and hides stack traces |
| `MONGO_URI` | No* | `mongodb://127.0.0.1:27017/hackathon-boilerplate` | *Required in practice unless you run local MongoDB |
| `JWT_SECRET` | Yes in production | insecure dev fallback (with a warning) | Long random string; never commit it |
| `JWT_EXPIRES_IN` | No | `7d` | e.g. `1d`, `12h`, `7d` |
| `CLIENT_URL` | No | `http://localhost:5173` | CORS origin(s), comma-separated if several |

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `VITE_API_URL` | No in dev, yes in production | Leave empty in dev: Vite proxies `/api` to `http://localhost:5000`. In production set it to your deployed backend, e.g. `https://your-api.example.com/api` |

## Database setup

### Option A — Local MongoDB (fastest for a hackathon)

Install MongoDB Community on your machine, start it, and leave `MONGO_URI`
at the default. The database `hackathon-boilerplate` is created on first use.

### Option B — MongoDB Atlas (no local install)

1. Create a free account at mongodb.com and a free (M0) cluster.
2. Database Access → add a database user (username + password).
3. Network Access → add your IP, or `0.0.0.0/0` for a hackathon demo
   (widen access only temporarily — it allows connections from anywhere).
4. Database → Connect → Drivers, and copy the connection string. It looks like:
   `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/hackathon-boilerplate`
5. Put it in `backend/.env` as `MONGO_URI`. If your password contains
   special characters (`@`, `/`, `?`, …), URL-encode them first.

If the backend cannot reach MongoDB it exits immediately with a clear
message instead of starting a server whose auth routes can never work.

## API reference

Base URL: `/api` (dev proxy) or `$VITE_API_URL`. All responses are JSON
with `success: true/false`. Errors return `message`, and validation errors
also return `errors: [{ field, message }]`.

| Method | Endpoint | Auth | Body | Notes |
| ------ | -------- | ---- | ---- | ----- |
| GET | `/api/health` | No | — | Server health check |
| POST | `/api/auth/register` | No | `{ name, email, password }` | Password ≥ 8 chars. Returns `{ token, user }` |
| POST | `/api/auth/login` | No | `{ email, password }` | Same error for unknown user / wrong password |
| POST | `/api/auth/logout` | Yes | — | JWTs are stateless; the frontend also deletes its token |
| GET | `/api/users/me` | Yes | — | Logged-in user's profile |
| GET | `/api/items` | Yes | — | Only the caller's own items, newest first |
| POST | `/api/items` | Yes | `{ title, description?, completed? }` | |
| PUT | `/api/items/:id` | Yes | Any of `{ title, description, completed }` | At least one field; only the owner's items |
| DELETE | `/api/items/:id` | Yes | — | Only the owner's items |

Authenticated requests send `Authorization: Bearer <token>`. The frontend
does this automatically (see `frontend/src/api/client.js`); on a 401 the
token is cleared and the user is treated as logged out.

## Project structure

```text
hackathon-boilerplate/
├── README.md
├── package.json                  # Root scripts only (dev, install:all)
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js             # Entry point: connects DB, then listens
│       ├── app.js                # Express app: middleware, routes, errors
│       ├── config/
│       │   ├── env.js            # Loads + validates environment variables
│       │   └── db.js             # Mongoose connection
│       ├── models/               # Mongoose schemas (User, Item)
│       ├── controllers/          # One file per resource, no route logic
│       ├── routes/               # One file per resource, no business logic
│       ├── middleware/           # auth (JWT), validate (Zod), errorHandler, rateLimit
│       ├── validation/           # Zod schemas per resource
│       └── utils/                # asyncHandler, ApiError, generateToken
└── frontend/
    ├── package.json
    ├── vite.config.js            # Dev proxy: /api → http://localhost:5000
    ├── .env.example
    └── src/
        ├── main.jsx              # Router + AuthProvider bootstrap
        ├── App.jsx               # All routes (add yours here)
        ├── index.css             # Plain CSS, no framework to configure
        ├── api/                  # client.js (axios + token), auth.js, items.js
        ├── context/AuthContext.jsx  # user, login, register, logout
        ├── components/           # Layout, Navbar, ProtectedRoute, ui/*
        ├── pages/                # Home, Login, Register, Dashboard, NotFound
        └── utils/errors.js       # One readable message from any API error
```

## Adding a feature (the pattern to copy)

The `Item` resource is a complete template. To add, say, a `Project`:

1. **Backend model** — copy `backend/src/models/Item.js` → `Project.js`
   and change the fields. Keep an `owner` field if it belongs to a user.
2. **Backend validation** — add a Zod schema in
   `backend/src/validation/projectValidation.js`.
3. **Backend controller + route** — copy `itemController.js` /
   `itemRoutes.js`, rename, and keep every query scoped to
   `req.user._id` (see `findOwnedItem` for the pattern).
4. **Wire the route** — in `backend/src/app.js`, add
   `app.use('/api/projects', projectRoutes)`.
5. **Frontend API module** — copy `frontend/src/api/items.js` →
   `projects.js` and change the path.
6. **Frontend page + route** — copy a page in `frontend/src/pages/`,
   add a `<Route>` in `App.jsx`, and wrap it in `<ProtectedRoute>` if it
   needs a login (see the dashboard route).

Delete `Item` and its dashboard demo once your real features replace it —
they are scaffolding, not part of your product.

## How auth works

1. Register/login returns a JWT (`{ token, user }`). Passwords are never
   returned: the schema marks `password` as `select: false` and strips it
   from JSON output.
2. The frontend stores the token in `localStorage` under `hackathon_token`
   and the axios interceptor attaches it to every request.
3. On app load, `AuthContext` calls `GET /api/users/me` to restore the
   session from the stored token. If the token expired, it is cleared.
4. `ProtectedRoute` renders a loader while that check runs, redirects to
   `/login` when there is no user, and otherwise renders the page.
5. Logout calls `POST /api/auth/logout` (best effort) and deletes the
   token locally. Because JWTs are stateless, there is nothing to revoke
   server-side — deleting the token *is* the logout.

## Security notes (and what this does not do)

- Passwords are hashed with bcrypt before saving, and only re-hashed when
  the password itself changes.
- Auth routes are rate-limited (100 attempts / 15 min / IP).
- Helmet sets secure headers; CORS only allows your frontend origin;
  request bodies are capped at 100 KB.
- Login returns the same message for an unknown email and a wrong
  password, so attackers cannot probe which emails are registered.
- This template has **no** email verification, password reset, refresh
  tokens, or roles — add them only if your hackathon project needs them.
  In production, always serve the backend over HTTPS, set a real
  `JWT_SECRET`, and restrict Atlas network access to your server's IP.

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
| Register returns field errors | The Zod schema rejected the input — the response lists every bad field |
| Port already in use | Another dev server is running — stop it, or change `PORT` / Vite's port |
