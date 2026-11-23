# Handoff

State of v1, updated with every step. Git history has the detail.

## Progress

| Phase | State |
|---|---|
| 1 Skeleton, money, shell, CI | Done on macOS. Windows build not run yet |
| 2 Accounts and login | Not started |
| 3 Menu | Not started |
| 4 Orders, payments, promos | Not started |
| 5 Tables and delivery | Not started |
| 6 Shifts, receipts, printer | Not started |
| 7 Reports, inventory, expenses | Not started |
| 8 Backups and recovery | Not started |
| 9 Installer and deployment | Not started |

## Rulings

Decisions made while building, where the plan or spec left a choice.

1. Electron proxies `/api` through its own `app://` address instead of the page calling the port directly. The page never learns the port or secret, and no CORS is needed.
2. The backend stops when its standard input closes, so it cannot outlive the app, even after a crash.
3. Uvicorn runs without native extras and SQLAlchemy without greenlet, because those have no 32-bit Windows builds.
4. At very low exchange rates the plain ceiling could fall a few pounds short, so the displayed USD is raised until it settles.

## Not verified

- Nothing has run on Windows, on the POS computer or with a real printer.
- The GitHub workflows have not been observed.
