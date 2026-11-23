# Deployment, backup and recovery guide

**Not yet verified on Windows 10.** Follow the checklist at the end before real use.

## Build and install

1. On GitHub open **Actions → Windows installer → Run workflow**, then download `GyrosPOS-Setup`.
2. Copy the `.exe` to the POS computer by USB. Internet is not needed.
3. Use a **standard Windows user** for daily work. Run the installer and approve it once as administrator.
4. Open Gyros POS: create the Admin account, set the exchange rate and **write down the recovery key**.
5. Admin → Products → Import → choose `gyros_menu.csv` (from `docs/`).
6. Admin → Settings: tables, delivery fee, business-day end, cash counting.
7. Install the receipt printer's Windows driver. Admin → Printer and receipts: choose it, set the width, print a test.
8. Admin → Cashiers: add each cashier.

An unsigned installer may show a Windows SmartScreen warning.

## Where things are

| What | Folder |
|---|---|
| Database and logs | `C:\ProgramData\GyrosPOS\Data` |
| Backups | `C:\ProgramData\GyrosPOS\Backups` |

Uninstalling leaves both. Copy the backups to USB regularly: a backup on the same disk does not survive disk failure.

## Backups

One is made when each login ends, after a crash (at the next start), before an update and before a restore. The app never overwrites, renames or deletes one.

**Normal restore:** Admin → Backups → Restore. No shift may be open.

## If the app says the database is damaged

A Windows administrator does this:

1. Close Gyros POS. Copy the whole `Data` folder to USB and keep it.
2. In `Data`, move `pos.db`, `pos.db-wal` and `pos.db-shm` (those that exist) to another folder. Never leave an old `-wal` beside a restored database.
3. Extract the newest good `.db.gz` from `Backups` with 7-Zip.
4. Rename the extracted file to `pos.db` and put it in `Data`.
5. Open the app and check the latest orders.

After a normal restore the replaced database is also kept as `Data\pos.before-restore.db`.

## Checklist before real use

- [ ] Installs on a reset Windows 10 machine with the network off and no Python, Node.js or Docker
- [ ] Sale, restart, sale still there
- [ ] `desktop/packaging/backup-acl-test.ps1` passes, run as the standard user
- [ ] API not reachable from another computer
- [ ] Printer: Arabic, width, cutting, notes, no paper, unplugged
- [ ] Power cut during an order and during a payment
- [ ] Touch keyboard on the real screen
- [ ] Startup time, memory and checkout speed measured
- [ ] Restore a backup on a test machine
- [ ] Reinstall keeps data and backups
