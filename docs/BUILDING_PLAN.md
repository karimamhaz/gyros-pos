# Gyros POS Building Plan

> **For agentic workers:** execute one phase at a time with superpowers:executing-plans or superpowers:subagent-driven-development. The owner asked for v1 to be built continuously (24 November 2026), so each phase ends with a summary in `HANDOFF.md` instead of a stop.

**Goal:** Deliver a fully offline Arabic/English restaurant POS for one Windows 10 computer.

**Architecture:** Electron hosts a React UI and starts a FastAPI backend bound to loopback, with a SQLite database. The backend owns every business rule.

**Spec:** [SYSTEM_DESIGN_ARCHITECTURE.md](SYSTEM_DESIGN_ARCHITECTURE.md) plus [PROJECT_REPORT.md](PROJECT_REPORT.md). D/A/O codes refer to the architecture document; § numbers refer to the project report.

**Status:** Approved, v1 in progress. Progress and rulings are in [HANDOFF.md](../HANDOFF.md).

Only Phase 1 is broken into tasks. Phases 2–9 state their deliverable, tests and gates; each gets its own task plan when it starts, once the code it builds on exists.

## Global constraints

- No internet or cloud dependency at run time; fonts and assets are bundled.
- Money is integers only, converted and rounded only in `core/money.py`.
- Permissions are enforced in backend services, never only in the UI.
- Cashiers never receive sales totals or expected cash.
- Nothing is marked paid before its database commit.
- Payment never closes a table. No kitchen tickets. No free-form discounts.
- Existing backups are never overwritten, changed or deleted.
- Every UI string exists in both Arabic and English.
- Each business rule has an automated test. Schema changes use migrations.
- **Git (D26):** commit and push each finished step to `main` with a message explaining it.

## Rules for calling a phase done

A phase is done when its tests pass, it has been run by hand, its limits are reported and its summary is in `HANDOFF.md`.

Work that needs Windows or real hardware has a second status: **"built, not verified on Windows/hardware"**. It cannot be marked done from the Mac. A GitHub Windows runner can build the installer and test file permissions, but it runs Windows Server rather than Windows 10, so it does not replace the final check.

## Overview

| Phase | Delivers | Blocked by |
|---|---|---|
| 1 | Running skeleton, CI, packaging trial | A3 for CI |
| 2 | Database, accounts, login | – |
| 3 | Menu, import and export | – |
| 4 | Orders, payments, promos, recovery of drafts | – |
| 5 | Dine-in and delivery | – |
| 6 | Shifts, receipts, printing | O2, O3, O4 to finish |
| 7 | Reports, inventory, expenses | – |
| 8 | Backups, restore, crash handling | O3, O6 |
| 9 | Installer and deployment | O1, O2, O3 |

Differences from the spec's order: transactions, autosave and duplicate-payment protection are in Phase 4 rather than Phase 8; basic shifts arrive in Phase 4 because payments must belong to one; a packaging trial is in Phase 1 because it is the biggest technical risk.

## Phase 1: Repository and architecture

### Task 1.1: Repository baseline

**Files:** modify `.gitignore`, `README.md`; create `.editorconfig`

- [ ] Change the `.gitignore` rules `lib/` and `lib64/` to `/lib/` and `/lib64/`, because they would hide any frontend `lib` folder.
- [ ] Remove the `*.spec` and `*.manifest` rules, or PyInstaller's spec file would never reach CI.
- [ ] Ignore `node_modules/`, `*.db`, `*.db-wal`, `*.db-shm`, `*.db.gz`, `logs/` and `desktop/release/`.
- [ ] Verify: `git check-ignore node_modules/x backend/data/pos.db x.db.gz` prints all three; `git check-ignore desktop/packaging/backend.spec` prints nothing; `git check-ignore frontend/src/lib/x.ts` prints nothing.

### Task 1.2: Backend skeleton

**Files:** create `backend/pyproject.toml`, `backend/app/main.py`, `backend/app/core/{config,logging,errors}.py`, `backend/tests/test_health.py`

**Produces:** `create_app(settings: Settings) -> FastAPI`; `Settings(data_dir: Path, backup_dir: Path, launch_secret: str, port: int)`

- [ ] Use a pinned, supported Python (3.13 unless the packaging trial rejects it). The Mac's system Python is 3.9.6 and must not be used.
- [ ] Test first: `GET /health` returns 200 with `{"status": "ok"}`.
- [ ] Test first: an unexpected exception returns 500 with an error code and no stack trace, and is logged.
- [ ] Verify: `pytest` and `ruff check` pass.

### Task 1.3: Database foundation

**Files:** create `backend/app/core/database.py`, `backend/migrations/`, `backend/tests/test_database.py`

**Produces:** `make_engine(path: Path) -> Engine`; `transaction(engine) -> ContextManager[Session]`

- [ ] Test first: a new connection reports `foreign_keys=1`, `journal_mode=wal`, `synchronous=2`.
- [ ] Test first: an exception inside `transaction` leaves no rows.
- [ ] Test first: `transaction` starts with `BEGIN IMMEDIATE`.
- [ ] Verify: migrating an empty database up and down succeeds.

### Task 1.4: Money

**Files:** create `backend/app/core/money.py`, `backend/tests/test_money.py`

**Produces:**
- `usd_cents_to_lbp(cents: int, rate: int) -> int`
- `lbp_to_usd_cents(lbp: int, rate: int) -> int`
- `round_10000(lbp: int) -> int`
- `settles(total: int, due_after: int) -> bool`
- `order_total(gross: int, percent: int | None) -> Total` with fields `gross`, `discount`, `rounding`, `total`

- [ ] Test first: `usd_cents_to_lbp(500, 89500) == 447500`.
- [ ] Test first: `lbp_to_usd_cents(410000, 89500) == 459`.
- [ ] Test first: `round_10000` maps 4999→0, 5000→10000, 37500→40000, 0→0.
- [ ] Test first: `order_total(455000, 10)` is discount 45500, rounding 500, total 410000.
- [ ] Test first: `order_total(16000, 1).total == 16000`, because rounding up may not exceed gross.
- [ ] Test first: `order_total(455000, None).total == 455000`, and 100 percent gives 0.
- [ ] Test first: for 1 ≤ lbp ≤ 2,000,000 in steps of 997, paying the displayed USD is worth at least `lbp`.
- [ ] Test first: `settles(410000, 2000)` is true; `settles(410000, 5000)` and `settles(4000, 1)` are false; `settles(4000, 0)` is true.
- [ ] Test first: negative amounts and a rate of 0 or less raise `ValueError`.

### Task 1.5: Local API protection

**Files:** create `backend/app/core/security.py`, `backend/tests/test_local_api.py`

- [ ] Test first: requests with a missing or wrong `X-Launch-Secret` get 401, on every route including `/health`.
- [ ] Test first: the server refuses to start on any host other than `127.0.0.1`.
- [ ] Compare with `secrets.compare_digest`; never log the secret.

### Task 1.6: Frontend skeleton

**Files:** create `frontend/` (React, TypeScript, Vite, Tailwind, ESLint, Prettier), `frontend/src/i18n/{ar,en}.json`

- [ ] Test first: `ar.json` and `en.json` have identical keys.
- [ ] Test first: switching to Arabic sets `dir="rtl"`; English sets `dir="ltr"`.
- [ ] Bundle an openly licensed Arabic-capable font and its license.
- [ ] Verify: the build contains no `http://` or `https://` asset request, checked with the network disabled.

### Task 1.7: Electron shell

**Files:** create `desktop/{main,preload,backend-process}.ts`

- [ ] Tests run with Playwright's Electron support.
- [ ] Generate the secret, start the backend, wait for health, add the header to backend requests only, and stop the backend on exit.
- [ ] Test: killing the backend restarts it up to 3 times, then shows an error screen.
- [ ] Test: the renderer has no `require` or `process`, and outside navigation is blocked.
- [ ] Verify: a second launch focuses the first window; after exit no backend process remains.

### Task 1.8: CI and packaging trial

**Files:** create `.github/workflows/ci.yml`, `desktop/packaging/`

- [ ] CI runs backend and frontend tests and lint on every push.
- [ ] Try PyInstaller for the backend and electron-builder for the installer; record a different choice if either fails.
- [ ] A manual Windows job builds the backend executable and installer, starts it, and checks `/health`.
- [ ] Record installer size, startup time and idle memory, labelled as CI figures rather than POS-computer figures.
- [ ] Build with 32-bit Python 3.13 and Electron 43 (`ia32`). Verify both executables are 32-bit and that no dependency pulls in greenlet.
- [ ] If packaging fails or is too heavy, stop and discuss the stack before Phase 2.

### Task 1.9: Developer guide

**Files:** modify `README.md`

- [ ] Document setup, run, test and build commands. Verify by following them from a fresh clone.

**Phase 1 gate:** the app opens on the Mac and shows backend health in both languages; CI passes; the owner reviews the packaging result.

## Phase 2: Database and authentication

**Deliver:** users, sessions, recovery key, settings, audit log; first-run Admin setup; role-selection, login and logout screens; cashier account management; single-use Admin approval.

**Tests**
- Passwords are Argon2id hashes; repeated failures are delayed.
- Only one session is active; logout needs the right password and returns to role selection.
- Role entry paths reject the other role's account.
- Route test covers every route for both roles and fails if one has no declared permission.
- The quick Admin screen changes only availability and rate, expires, is audited, leaves the shift open and cannot reach reports.
- An Admin approval works once, for its action and target only, and is audited.
- A recovery key works once and is replaced.
- The audit log rejects update and delete.
- The last active Admin cannot be disabled.

## Phase 3: Menu

**Deliver:** categories and products, availability, archiving, exchange rate with history, Excel/CSV import and export.

**Tests**
- Cashier cannot read or write Admin menu operations and sees only available products.
- Archiving keeps history.
- Import: preview writes nothing; bad rows are listed; a forced failure leaves the menu unchanged; stale previews are rejected; add-only never changes existing products.
- Export then re-import changes nothing, including Arabic names and names starting with `=`.
- Oversized files and unpacked content are rejected.

## Phase 4: Orders, payments and promos

**Deliver:** cashier screen, takeaway flow, drafts with autosave, basic open/close shift, mixed-currency payment and change, promos, cancellation and refund.

**Tests**
- USD, LBP and mixed payments; every change combination; wrong change is rejected.
- A 410,000 bill paid with $4 + 50,000 LBP at 89,500 settles and stores a 2,000 shortfall; a small first payment never triggers it.
- The worked example in architecture section 4 gives exactly its figures.
- Payments across a rate change keep their own rates.
- Same idempotency key and body pays once, including two simultaneous requests; a different body gets 409.
- A failure injected before commit leaves no payment, promo use or print job.
- Killing the backend mid-draft keeps the last saved change.
- Promo: valid, inactive, not started, expired, limit reached, last use requested twice, deactivated between entry and payment.
- Promo applies to the delivery fee.
- Draft cancel works without approval; void, cancel and refund do not.
- Refund is written once and pays from the current shift.
- Order numbers restart by business day, before and after the cutoff; a clock moved back creates no duplicate.

## Phase 5: Dine-in and delivery

**Deliver:** generated table screen, sittings and bills, manual close, delivery details, fees, unpaid deliveries.

**Tests**
- Table count persists; lowering it under an open table is refused.
- Payment leaves the table open; new items start a new bill; a paid bill cannot change.
- Closing with money owed is refused without approval.
- Voiding an item below the amount already paid is refused.
- Fee override leaves the default unchanged; optional times can be blank; required fields are enforced.
- Unpaid deliveries appear to the next cashier, whose shift receives the payment.

## Phase 6: Shifts, receipts and printing

**Deliver:** three count methods, closing reference, Admin comparison, abandoned-shift closing, Arabic receipts, reprints, order lookup, printer settings and test print.

**Tests**
- Expected cash matches a scripted shift with mixed payments, change and a refund, in both currencies.
- Changing the count method does not affect an open shift.
- No cashier response contains expected cash or the difference.
- Lookup needs the right number and code, in the current shift only, and is rate-limited.
- One payment creates one printed copy; failed jobs retry as original; reprints show `نسخة`.
- Unpaid bill and delivery receipts are marked unpaid; taking payment later does not print by itself.
- Arabic, mixed Arabic/English, long names and notes render at 58 and 80 mm without clipping.
- Printer failure leaves the order paid.

**Hardware gate:** Arabic shaping, width, cutting and disconnection on the real printer.

## Phase 7: Reports, inventory and expenses

**Deliver:** sales dashboard, filters, Excel export, printing, manual inventory, expenses and costs.

**Tests**
- Sales over time, order count, best and least sellers, and sales by order type match the same data set.
- Every metric matches a hand-calculated data set including partial payment, refund, promo, delivery and a rate change.
- Weeks run Monday–Sunday; custom ranges work; the business-day cutoff is respected.
- The exact D21 note is on screen, in Excel and in print.
- Sales never change stock; low stock warns without blocking.
- Expenses never change expected cash.
- With both modules off, checkout works unchanged.
- Cashier receives 403 on every report, expense and inventory route.

## Phase 8: Backups and recovery

**Deliver:** session, recovery, pre-migration and pre-restore backups; restore screen; Windows permissions; manual recovery procedure.

**Before starting:** owner decides O6.

**Tests**
- Each session creates one verified backup; names never collide, even with the clock moved back.
- Backup failure does not block logout and is shown to Admin.
- Killing the app during payment, backup and restore leaves a usable database.
- Crash start: recovery backup, then only that cashier or Admin can log in.
- Restore brings back a known data set; corrupt, truncated and newer-schema files are refused and change nothing.

**Windows gate:** the permission test in architecture section 10, on Windows 10. Until then, backup protection is not claimed.

## Phase 9: Packaging and deployment

**Deliver:** offline installer, deployment guide, backup and recovery guide, owner checklist.

**Windows gate**
- **Release rule:** every release installs from one file on a freshly reset Windows 10 machine with the network off and no Python, Node.js or Docker; then starts, logs in, completes a sale, restarts and still has the sale. A CI runner does not count, because it has developer tools installed.
- An unsupported Windows version, architecture or full disk is refused with a clear message and no changes.
- Works after the network is disconnected; the API is unreachable from another computer.
- The 64-bit installer, when built, upgrades a 32-bit installation and keeps data and backups.
- Upgrade keeps data and existing backups. Uninstall leaves both.
- Startup, memory and checkout speed measured on the POS computer.
- Full §21 run on the real computer and printer.

## Coverage of the spec's acceptance criteria (§21)

| §21 group | Phase |
|---|---|
| Authentication and permissions | 2; report access in 7; separate cashier tracking in 4 and 6 |
| Orders and payments | 4; dine-in and delivery orders in 5 |
| Delivery | 5; receipt details in 6 |
| Dine-in | 5 |
| Receipts and printing | 6 (Arabic only, D17) |
| Reporting | 7 |
| Recovery and backups | Draft recovery in 4; the rest in 8 |
| Offline and deployment | Trial in 1; final in 9 |

## Risks

| Risk | Response |
|---|---|
| Electron + Python too heavy for the PC | Trial in Phase 1; measure on the POS computer as soon as O1 and O3 allow |
| Electron 43 reaches end of life in January 2027 | Move to 64-bit if the PC allows it; otherwise owner accepts no further Electron fixes |
| No Windows access | CI covers builds; Windows gates stay open |
| Unknown printer | Print through the Windows driver; both widths |
| Backup permissions do not work as designed | Test option A on a Windows runner early; option B is the fallback |
| A wrong assumption in the money rules | Owner confirms A4–A10 and A15 before Phase 4 |

## Next step

Owner reviews both documents, confirms or corrects A3–A19, then approves Phase 1.
