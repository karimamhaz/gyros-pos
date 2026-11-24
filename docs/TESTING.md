# Testing

Run everything with one command from the project folder:

```bash
scripts/test-all.sh
```

Add `quick` to skip the real-app tests (about 2 minutes instead of 6).

## What is tested, and where

| Kind | What it proves | Where |
|---|---|---|
| **Unit** | Small pieces alone: money rules (including 20,000 random orders per rule), text matching, business day, passwords, codes, receipts, API client, amount parsing, order autosave, keyboard | `backend/tests/test_money.py`, `test_units.py`; `frontend/src/**/*.test.ts(x)` |
| **Integration** | Parts working together: database refuses bad rows, migrations go up and down and match the models, every route survives 16 kinds of garbage as anonymous, cashier and Admin, one API call chain per feature | `backend/tests/test_integration.py`, `test_auth.py`, `test_menu.py`, `test_orders.py`, `test_tables_delivery.py`, `test_shifts.py`, `test_printing.py`, `test_reports.py`, `test_backups.py` |
| **System** | The whole installed-style app: killed app keeps sales, numbers and the open shift; restore a backup from its screen; works with no network; a missing printer never loses a sale | `desktop/tests/system.spec.ts`, `shell.spec.ts` |
| **End to end** | A full working day, by touch keyboard and mouse, in Arabic and in English | `desktop/tests/flow.spec.ts` |
| **Compatibility** | Every cashier and Admin screen, including the Wish payment screen and Settings, at 1000×560, 1093×614 (a 1366×768 screen at 125% scaling), 1024×640, 1280×720, 1366×768, 1536×864 and 1920×1080, and in English; receipts on 58 and 80 mm paper at small and large text | `desktop/tests/compat.spec.ts`, `print.spec.ts` |
| **Layout** | Margins, label-to-field alignment, equal heights in a row, no overlap, nothing cut off or scrolling sideways, nothing hidden under the keyboard | `desktop/tests/layout.ts`, run by the compatibility tests and `fits()` in the flow test |
| **Performance** | Speed with a year of history (10,000 orders) and a 600-product menu; start-up; memory | `backend/tests/test_performance.py`, `desktop/tests/performance.spec.ts` |
| **Regression** | Every bug found so far has a test (list below) | various |
| **Wish and default amount** | Wish payment, retry, refund (cash and Wish parts), reports, shift review, receipt, migration of old payments; the LBP box is pre-filled and typing dollars swaps it | `backend/tests/test_wish.py`, `desktop/tests/wish.spec.ts` |
| **Application icon** | Valid Windows icon with every size, square picture, used by the app, installer and uninstaller | `desktop/tests/icon.spec.ts` |
| **Security** | Permissions on every route, single-use approvals, guess slowing, secret on every request, sandboxed page, no web access, HTML in names cannot run | `test_auth.py`, `shell.spec.ts`, `receipt.test.ts` |

## Regression tests (bug → test that keeps it fixed)

| Bug | Test |
|---|---|
| Windows package crashed: modules loaded by name | `test_packaging.py` (no run-time imports, every router and model registered) |
| Pressing a key on the touch keyboard missed its button | `shared.test.tsx` "does not move the page while a button is being pressed" |
| Price changed by Admin made every payment fail | `flow.spec.ts` "a price changed during payment…" |
| Displayed USD could be one cent too high at odd rates | `test_units.py`, `test_money.py` |
| Expense date was a day behind after midnight | `test_reports.py::test_expenses` |
| Fields cut off or misaligned at small windows, scrollbars shifting layout | `compat.spec.ts` (all sizes) |
| Count badge crowding the price on narrow tiles | `layout.ts` badge rule |
| Stale payment quote could enable the button | covered by `flow.spec.ts` payment steps |
| Receipt dialog closed before it loaded | `flow.spec.ts` waits for dialogs |
| A Wish payment must never add cash to the drawer or be partial | `test_wish.py` |
| Cash buttons that no longer appear because the LBP box is pre-filled | `flow.spec.ts`, `system.spec.ts` follow the one-tap path |

## Figures from this machine (development Mac, not the POS computer)

| Measure | Result | Limit in the test |
|---|---|---|
| One whole sale with a year of history | median 35 ms, worst 50 ms | median 250 ms |
| Menu of 1,000 products | 27 ms | 500 ms |
| Sales report: day / week / month / overall | 30 / 26 / 26 / 265 ms | 0.5 / 1 / 1.5 / 3 s |
| Order list of 500 | 31 ms | 800 ms |
| Backup of a 17.7 MB database | 0.9 s (6 MB file) | 8 s |
| Start-up with integrity check | 0.2 s | 4 s |
| Password check, real strength | 25 ms | 1 s |
| App start to first screen (development) | about 4 s | 10 s |
| 617-product menu shown | 111 ms | 2 s |
| Tap to updated total | median 50 ms, worst 70 ms | 500 ms |
| Search among 617 products | 29 ms | 500 ms |
| Memory, app and backend together | about 590 MB | 900 MB |

Memory counts shared system memory in every process, so private memory is lower. **None of these figures replaces measuring on the POS computer.**

## Not covered here

- Windows 10, the 32-bit build, the installer, and backup permissions: `desktop/packaging/backup-acl-test.ps1` and the checklist in `docs/DEPLOYMENT_GUIDE.md`.
- A real receipt printer and a real touch screen.
- The **System tests** workflow (Linux and Windows) is written but has not been run.
