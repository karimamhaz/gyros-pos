# Gyros POS

A fully offline point of sale for one Windows 10 restaurant computer. Arabic and English, USD and LBP.

- [Architecture and decisions](docs/SYSTEM_DESIGN_ARCHITECTURE.md)
- [Building plan](docs/BUILDING_PLAN.md)
- [Approved screen design](docs/design/Gyros_POS_Design.pdf)
- [Deployment, backup and recovery guide](docs/DEPLOYMENT_GUIDE.md)
- [Progress, rulings and what is not verified](HANDOFF.md)

## Parts

| Folder | What it is |
|---|---|
| `backend/` | FastAPI and SQLite. Owns every business rule |
| `frontend/` | React screens |
| `desktop/` | Electron shell, printing, Windows installer |

## Set up for development

Needs [uv](https://docs.astral.sh/uv/) and Node.js 24. uv installs Python 3.13 itself.

```bash
cd backend && uv sync
```

```bash
cd frontend && npm ci
```

```bash
cd desktop && npm ci
```

## Run

```bash
cd desktop && npm start
```

Development data is kept in Electron's user data folder. Set `POS_DATA_DIR` and `POS_BACKUP_DIR` to use other folders.

## Test

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

```bash
cd frontend && npm test && npm run lint
```

```bash
cd desktop && npm test
```

## Build the Windows installer

Run the **Windows installer** workflow on GitHub. It builds with 32-bit Python 3.13 and Electron 43.
