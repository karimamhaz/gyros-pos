# Changelog

## 1.1.0

**Interface**
- Scrollbars look the same on every system, so Windows no longer shifts fields sideways.
- The menu fits any window from 1024 × 640 up to full screen: tiles never spill past the edge.
- Admin pages with a side panel (products, expenses, shifts, printer, quick Admin) wrap the panel under the table on small windows instead of cutting the table off.
- Payment amounts, settings and printer columns no longer get cut off on small windows.
- Dialogs and cards keep a margin from the window edge; the touch keyboard is more compact on short screens.

**Fixes**
- The displayed USD amount is now exactly the smallest amount that settles the bill; at unusual rates it could be one cent more.
- Going back from the payment screen picks up a price Admin changed meanwhile (before, every payment was refused).
- The backend starts in the Windows package (modules are imported plainly).
- Date fields on the expenses page follow the business day, which after midnight is still the previous date.

**Testing**
- New: layout audit (margins, field alignment, overlap, sideways clipping, keyboard) run on every screen at five window sizes in Arabic and English.
- New: randomised money tests, database constraint tests, garbage-input tests on every route, migration and model drift test, packaging regression test.
- New: performance tests with a year of history, and in the real app with a 600-product menu.
- New: system tests for a killed app, restoring a backup from its screen, running with no network, and a missing printer.
- Receipt, API client and order-autosave unit tests.
- See [docs/TESTING.md](docs/TESTING.md).

## 1.0.0

First release: every screen in the approved design, Arabic and English, USD and LBP, tables, delivery, shifts, receipts, reports, inventory, expenses, backups and restore.
