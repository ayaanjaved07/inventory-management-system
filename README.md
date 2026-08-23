# Inventory Management System

Django + React inventory system with role-based access, an append-only stock
ledger, project part allocation, sales tracking, and a Gemini-powered assistant.

## Running locally

Two terminals. No Docker, no database server, no Redis.

**Backend** (http://127.0.0.1:8000)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_roles
python manage.py seed_demo
python manage.py runserver
```

**Frontend** (http://localhost:5173)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Demo accounts

All use password `demo12345`. Log in as different roles to see permissions change.

| Username  | Role        | Can do                                        |
|-----------|-------------|-----------------------------------------------|
| `admin`   | Admin       | Everything, plus Django admin and Settings    |
| `manager` | Manager     | Manage items, projects and sales              |
| `store`   | Storekeeper | Record stock movements; read-only on items    |
| `viewer`  | Viewer      | Read-only everywhere                          |

## How stock works

**On-hand quantity is never stored.** Every change — receipt, issue,
adjustment, sale, project issue/return — appends an immutable row to
`StockMovement`, and current stock is summed from that ledger.

This is deliberate. It means the movement log *is* the source of truth rather
than a side-effect log that can drift, historical questions ("what did we hold
in March?") are answerable, and a wrong entry is corrected by recording a
compensating `ADJUSTMENT` rather than by editing history. The API exposes no
update or delete for movements, and the Django admin blocks both.

All writes go through `record_movement()` in `backend/stock/services.py`. That
is the only place stock can change.

### Reserved is not available

Allocating parts to a project **reserves** them without moving stock:

```
available = on_hand - (allocated - issued)
```

`on_hand` only drops when parts are actually issued. Showing `on_hand` where
`available` belongs is how the same unit gets promised to two projects at once.

## Testing

```bash
cd backend && python -m pytest
```

22 tests covering ledger arithmetic, the negative-stock guard, the
reserved-vs-available distinction, role permissions, append-only enforcement
at the API surface, and the activity log (including that passwords never reach
it).

## Deployment

Frontend to GitHub Pages, backend to Render's free tier.

**Backend (Render):** connect the repo, use `backend/render.yaml` as a
blueprint, or configure manually with root directory `backend`, build command
`./build.sh`, start command `gunicorn config.wsgi:application`. Set
`CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` to your Pages origin
(`https://<username>.github.io`).

**Frontend (GitHub Pages):** set repository variable `VITE_API_URL` to your
Render API URL (including `/api`), enable Pages with source "GitHub Actions",
then push to `main`.

Three things about the free tier worth knowing before demo day:

- **The web service sleeps when idle.** The first request after a quiet period
  takes ~50 seconds. Load the API once before presenting.
- **The filesystem is ephemeral.** Postgres is required (the blueprint provisions
  it); SQLite would be wiped on every redeploy. Uploaded item images are also
  disposable — that was a deliberate scope cut rather than an oversight.
- **The Gemini key stays server-side.** The frontend bundle is public, so the
  browser calls `/api/agent/chat/` and Django calls Gemini. Never put the key in
  a `VITE_` variable — anything prefixed `VITE_` is compiled into the bundle.
- **The assistant is optional.** With no `GEMINI_API_KEY` set it reports itself
  unavailable and every other screen works unchanged. Nothing depends on it.

## Layout

```
backend/
  core/       shared base models, currency, activity log
  accounts/   custom user, roles, JWT auth
  catalog/    categories, items, images
  stock/      locations + the append-only ledger  <- services.py is the gateway
  projects/   projects, members, allocations
  sales/      customers, sales, sale lines
  agent/      Gemini assistant  <- tools.py is read-only by construction
frontend/
  src/lib/         api client, auth context, UI strings
  src/components/  app shell + owned UI primitives
  src/pages/       screens
```

## Build status

The original seven-phase plan was trimmed to three remaining sittings.

| Stage | Scope                                            | Status |
|-------|--------------------------------------------------|---------|
| 0     | Project scaffold, JWT auth                       | Done    |
| 1     | Catalog, stock ledger, items + stock screens     | Done    |
| 1.5   | Deploy walking skeleton to Pages + Render        | Next    |
| 2     | RBAC screens + activity log page                 | Done    |
| A     | Item images, CSV import/export                   | Done    |
| B     | Projects and sales APIs + screens, statistics    | Done    |
| C     | Gemini assistant                                 | Done    |

RBAC, the ledger, allocations and currency handling exist in the backend and
are tested; the stages above refer to the remaining UI and workflows.

**Cut from scope:** Hindi/multi-language support, QR code labels, XLSX import
(CSV only), and Cloudinary image hosting. These were removed deliberately to
keep the project small.

Only deployment (stage 1.5) is outstanding.

## Notes

- **The app is English-only.** UI strings still route through i18next
  (`frontend/src/i18n/en.json`) with a single resource bundle, which costs
  nothing and keeps the strings in one place.
- **Uploaded images are disposable.** Render's free tier has an ephemeral
  filesystem, so item images do not survive a redeploy. Adding object storage
  is the fix; it was left out to avoid another service.
- **Currency conversions are frozen at transaction time** via
  `Sale.exchange_rate_used`. Recomputing historical sales at today's rate would
  make reported revenue drift month to month.
- **The refresh token is in `localStorage`**, which is XSS-exposed. The access
  token is kept in memory only. This is the pragmatic tradeoff for a project
  without a backend session cookie, and is called out rather than hidden.
- **`HashRouter`, not `BrowserRouter`.** GitHub Pages has no SPA fallback, so
  `BrowserRouter` deep links would 404 on refresh.
