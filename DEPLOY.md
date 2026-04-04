# Deploy Notes

## What works after `git clone`

- Backend can create its own schema and default admin on first start.
- `uploads/default.png` is created automatically if `uploads/` is missing.
- Web frontend no longer depends on hardcoded `http://localhost:8000`.

## Required server env

### Web

Create `sc-restaurant-front/.env`:

```env
VITE_API_BASE_URL=
VITE_YANDEX_MAPS_API_KEY=your_key_here
```

Notes:

- Leave `VITE_API_BASE_URL` empty if frontend and backend are served from the same domain through a reverse proxy.
- Set `VITE_API_BASE_URL=https://api.example.com` if backend is on a separate host.

### Mobile

Set `EXPO_PUBLIC_API_BASE_URL` only if you build mobile on the server.

## Data

These are intentionally not stored in git:

- `sc-restaurant.db`
- `uploads/`

For a fresh server you have two options:

1. Restore production `sc-restaurant.db` and `uploads/` from backup.
2. Start from scratch and initialize demo data with:

```bash
python init_db.py
```

## Minimal backend start

```bash
python -m venv .venv
.venv/bin/pip install fastapi "uvicorn[standard]" python-multipart
.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

## Minimal frontend build

```bash
cd sc-restaurant-front
npm ci
npm run build
```

Serve `sc-restaurant-front/dist` with nginx or another static server.
