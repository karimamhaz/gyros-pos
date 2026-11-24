# Changelog

## 1.2.0

**New**
- **Paid by Wish.** The payment screen has a *Cash / Wish* switch. Wish records that the customer paid by Wish and settles the whole amount left; no cash is counted and there is no change. The app does not talk to Wish. Admin sees the Wish total apart from cash in the sales report, the shift review, the order list and the Excel and printed reports; the receipt says "paid by Wish". Refunds give back only the cash part from the drawer and tell the cashier how much goes back by Wish.
- **One-tap cash payment.** The LBP box opens with the whole amount due. Typing dollars replaces it; amount boxes select their text when tapped.
- **Application icon** for the installer, the Windows app and the taskbar.
- **About box** in Settings (version, window size, screen scaling) for support.

**Interface**
- Larger margins and gaps on every screen, with a tighter set for small windows.
- Dropdowns, date boxes and text fields look the same on Windows as elsewhere.
- Smallest window is 1000 × 560, tested together with 1093 × 614 (a 1366 × 768 screen at 125% scaling).

**Database**
- `payments.method` (cash or Wish) added in place. Earlier payments become cash. The 1.1 backups still restore and are updated on opening.

**Cleanup and checks**
- Removed unused code, one unused text key and needless exports. Static analysis and library scans found no problems.

**Testing**
- 26 new backend tests for Wish (payment, refund, reports, shift review, receipt, migration), tests for the default amount and the Wish screens in the real app, icon file tests, and the audit now also covers the two smaller window sizes and the Wish screen.
- See [docs/TESTING.md](docs/TESTING.md).

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
