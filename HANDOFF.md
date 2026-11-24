# Handoff

Where the project stands, what was decided and why, and what is still unproven. Git history has the detail; [CHANGELOG.md](CHANGELOG.md) lists what changed in each version.

**Current version: 1.2.0** (24 November 2026)

## What 1.2.0 added

| Change | Where to look |
|---|---|
| **Paid by Wish.** An order can be recorded as paid by Wish. The app only records it: no gateway, no cash in the drawer, no change. It settles whatever is left of the order. Admin sees Wish apart from cash in the sales report, the shift review, the order list and Excel/print exports. The receipt says it was paid by Wish. Refunds return only the cash part from the drawer; the Wish part is paid back outside the app and recorded | `backend/app/modules/payments/service.py`, `migrations/versions/0006_payment_method.py`, `frontend/src/features/payment/PaymentScreen.tsx`, `backend/tests/test_wish.py`, `desktop/tests/wish.spec.ts` |
| **Faster cash payment.** The LBP box opens already filled with the whole amount due, so the usual sale is one tap. Typing dollars swaps the suggestion for dollars (clearing them brings it back). Typing LBP yourself keeps what you typed. Amount boxes select their whole text when tapped, so typing replaces it | `PaymentScreen.tsx`, `shared/ui.tsx` (`selectAll`) |
| **Roomier interface.** Margins and gaps are larger everywhere. They come from a handful of spacing variables at the top of `frontend/src/styles.css`, with a tighter set for small windows (under 1150 px wide or 700 px tall, e.g. a 1366 × 768 screen at 125% scaling) | `styles.css` |
| **Controls that look the same on Windows.** Dropdowns and text fields no longer use the system's own look; date and number boxes keep one height. Scrollbars are styled the same everywhere (since 1.1) | `styles.css` |
| **Smaller minimum window.** 1000 × 560 instead of 1024 × 640, to fit Windows scaling | `desktop/src/main.ts` |
| **About box** in Settings: version, window size and screen scaling. If a screen looks wrong on the restaurant PC, a photo of this box plus the screen tells us exactly what to test | `SettingsPage.tsx` |
| **Application icon.** The installer, the Windows app and the taskbar now use a Gyros icon (the skewer in its red ring, from the logo) instead of Electron's default. `desktop/packaging/make-icon.py` regenerates it; give it a better original logo file when there is one | `desktop/packaging/icon.*`, `electron-builder.yml` |
| **Cleanup.** Removed an empty function, two needless exports and an unused text key; no unused code, files, CSS classes or packages remain (checked with knip, vulture, ruff) | |
| **Security checks.** Static analysis of the backend (bandit) and a scan of every library (pip-audit, npm audit) found nothing | |

## Running and testing

```bash
cd desktop && npm start      # run the app (needs backend, frontend and desktop installed, see README)
scripts/test-all.sh          # every test; add "quick" to skip the real-app tests
```

What each test group proves is in [docs/TESTING.md](docs/TESTING.md). The decisions and assumptions are numbered in [docs/SYSTEM_DESIGN_ARCHITECTURE.md](docs/SYSTEM_DESIGN_ARCHITECTURE.md) (D = owner decision, A = assumption, O = open question).

## Progress

| Area | State |
|---|---|
| Accounts, login, permissions, quick Admin screen | Built and tested |
| Menu, categories, Excel/CSV import and export | Built and tested (`docs/gyros_menu.xlsx` is the restaurant's menu) |
| Orders, payments (cash and Wish), promos, refunds | Built and tested |
| Tables, delivery | Built and tested |
| Shifts, receipts, printer page | Built and tested; **not verified on a real printer** |
| Reports, inventory, expenses | Built and tested |
| Backups, restore, crash recovery | Built and tested; **Windows permissions not verified** |
| Installer | Written; built once on GitHub; **never installed on Windows 10** |

## Decisions made while building

Where the plan or the owner's notes left a choice. Most of the earlier ones were also written up as rulings in the architecture document.

1. Electron serves the page and forwards `/api` itself, so the page never learns the backend's port or secret.
2. The backend stops when its standard input closes, so it cannot outlive the app, even after a crash.
3. No library without a 32-bit Windows build (no greenlet, no native uvicorn extras).
4. The displayed USD amount is the smallest amount in cents that settles the bill (A6).
5. Cash always belongs to a shift: opening cash, refunds and cancelling need a shift open in the acting person's name.
6. The delivery driver is required when a delivery is confirmed, prepaid or not.
7. Closing an unpaid table leaves the debt on record for Admin.
8. Profit shows only when something was logged in the period and no type, product or cashier filter is on.
9. Cashier passwords need 4 characters, Admin 8. Backups are not encrypted (D37).
10. Every window from 1000 × 560 upwards is supported. Windows display scaling counts: 125% on a 1920 × 1080 screen is 1536 × 864.
11. **Wish pays the whole amount left on an order.** A table can pay part in cash and the rest by Wish, but one Wish payment is never partial.
12. **A Wish refund is recorded, not performed.** The refund dialog tells the cashier how much goes back by Wish outside the app; only the cash part is counted out of the drawer.
13. **Wish payments belong to the shift that took them** but are never part of expected cash.
14. Payments made before 1.2 are treated as cash (the migration adds the column with that default).

## Risks to know about

- **The app cannot check a Wish transfer.** A cashier could mark a cash sale as paid by Wish and keep the cash. The protections are transparency: every Wish payment carries the cashier and shift, Admin sees "Paid by Wish" per shift, per period and per order, and cashiers see none of these totals. **The owner should compare the Wish totals with the Wish account statement regularly.**
- **Windows layout is only tested here.** The audit measures margins, alignment, overlap and clipping at nine window sizes in Arabic and English, but on a Mac. If fields still look misplaced on the restaurant PC, send a screenshot with the About box (Settings) visible.
- **Electron 43 stops receiving security fixes in January 2027.** Move to 64-bit and a newer Electron if the PC allows it.
- **Memory** is about 590 MB for the app and backend together on a Mac (shared memory counted in every process, so private memory is lower). Measure on the real computer.

## Not verified

- Nothing has run on Windows 10, on the POS computer, or with a real printer or touch screen.
- The GitHub workflows named *System tests* and the 32-bit installer's first-run behaviour, the NSIS script and `desktop/packaging/backup-acl-test.ps1`.
- Silent printing was tested up to a missing printer; receipts were checked as rendered pages.
- The icon was checked as files and as a picture; how Windows shows it in the taskbar is not seen yet.
- No independent reviewer has read the code; it was self-reviewed.

## Assumptions still to confirm

A11–A14 and A16–A24 in the architecture document. The money rules A4–A10 and A15 were confirmed on 24 November 2026.

## Next steps

1. Build the installer (GitHub → Actions → *Windows installer*), install it on the Windows 10 PC, and run the checklist in [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md), including `backup-acl-test.ps1`.
2. Look at every screen on that PC. Report anything off together with the About box.
3. Connect the real printer; check Arabic text, width, cutting and the Wish line on a printed receipt.
4. Replace the logo files with a high-quality original when there is one (`docs/design/logo.png`, `logo_mono.png`, then `desktop/packaging/make-icon.py`).
