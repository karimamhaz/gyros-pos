# Handoff

State of v1, updated with every step. Git history has the detail.

## Progress

| Phase | State |
|---|---|
| 1 Skeleton, money, shell, CI | Built and tested on macOS |
| 2 Accounts and login | Built and tested |
| 3 Menu | Built and tested |
| 4 Orders, payments, promos | Built and tested |
| 5 Tables and delivery | Built and tested |
| 6 Shifts, receipts, printer | Built and tested; **not verified on a real printer** |
| 7 Reports, inventory, expenses | Built and tested |
| 8 Backups and recovery | Built and tested; **Windows permissions not verified** |
| 9 Installer and deployment | Written; **installer never built or run** |

## Rulings

Decisions made while building, where the plan or spec left a choice.

1. Electron proxies `/api` through its own `app://` address instead of the page calling the port directly. The page never learns the port or secret, and no CORS is needed.
2. The backend stops when its standard input closes, so it cannot outlive the app, even after a crash.
3. Uvicorn runs without native extras and SQLAlchemy without greenlet, because those have no 32-bit Windows builds.
4. At very low exchange rates the plain ceiling could fall a few pounds short, so the displayed USD is raised until it settles.

5. The owner asked for continuous building, so the plan's approval stops became this file.
6. Phase task lists were not written into the plan; the tests named there are the acceptance list.
7. The driver is required when a delivery is confirmed, whether prepaid or not.
8. Opening cash, refunds and cancelling need a shift open in the acting person's name, so cash always belongs to a shift.
9. Closing an unpaid table leaves the debt on record for Admin.
10. Category names have one language, like products (D2).
11. Profit appears only when something was logged in the period and no type, product or cashier filter is on.
12. Reports filtered by product count whole orders containing it; quantities are for that product only.
13. Cashier passwords need 4 characters, Admin 8.
14. Admin's extra copies setting applies to the automatic receipt only.
15. The menu is not preloaded; `docs/gyros_menu.csv` is imported by Admin.
16. Dates default to the business day, which after midnight is the previous date until the cutoff.

## Assumptions still to confirm

A11-A14 and A16-A20 in the architecture document. The money rules A4-A10 and A15 were confirmed on 24 November 2026. Backups are not encrypted, by the owner's decision (D37).

## Not verified

- Nothing has run on Windows, on the POS computer or with a real printer.
- The GitHub workflows, the 32-bit build, the NSIS installer script and `backup-acl-test.ps1` have never run.
- Silent printing was tested only up to a missing printer; receipts were checked as rendered pages.
- Electron 43 stops receiving fixes in January 2027. Move to 64-bit if the PC allows it.
- No independent reviewer has read the code; it was self-reviewed.
