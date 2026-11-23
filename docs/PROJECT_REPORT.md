# Offline Restaurant POS System --- Project Requirements & Technical Specification

**Document purpose:** This report is the project handoff specification
for Claude Code, Codex, or another coding agent. It describes the agreed
requirements, recommended architecture, implementation constraints, and
acceptance criteria.

**Project status:** Requirements gathered for the initial version. A few
implementation details are identified as recommendations or decisions
still to confirm; they must not be silently treated as confirmed
business requirements.

------------------------------------------------------------------------

## 1. Project vision

Build a reliable, lightweight, production-quality restaurant Point of
Sale (POS) application for a small restaurant.

The system must be:

-   **Fully offline:** It must work without an internet connection and
    must not depend on cloud services.
-   **Single-computer:** It runs on one Windows 10 computer, with no
    network or multi-terminal functionality.
-   **Simple to operate:** The cashier should be able to take orders and
    payments quickly, without unnecessary screens or complicated
    workflows.
-   **Reliable:** It must protect completed transactions, recover
    unfinished orders after crashes or power loss, and create local
    backups.
-   **Bilingual:** The application interface and receipts must support
    Arabic and English, including correct right-to-left and
    left-to-right layouts.
-   **Lightweight:** It must run smoothly on a computer with limited
    resources.
-   **Extensible:** Its architecture should allow optional inventory and
    expenses modules and possible future AI features, without making the
    core POS depend on them.

This is intended to be a real operational system, not just a
demonstration or portfolio mock-up. Code quality, maintainability,
security, testing, and deployment quality are important.

## 2. Operating environment and boundaries

### Confirmed environment

-   Operating system: Windows 10.
-   One computer only.
-   One screen only: the cashier's/admin's screen.
-   One active user at a time: either an Admin or one Cashier.
-   No local network, internet, cloud database, or remote terminal
    requirement.
-   The application and its data are stored locally.

### Out of scope for the initial version

-   Multiple computers or networked terminals.
-   Simultaneous users.
-   A second customer-facing display.
-   Cloud synchronization or mandatory online accounts.
-   Kitchen ticket printing. The required printed document is the
    customer receipt only.
-   Mandatory AI functionality. The POS must be fully useful without AI.

## 3. User roles, authentication, and permissions

### 3.1 Startup and login flow

When the application starts, show an initial screen with two choices:

1.  Admin
2.  Cashier

After selecting a role, the user enters the password for the
corresponding account and is taken to the appropriate dashboard.

When a user logs out, return to the initial screen where Admin or
Cashier can be selected again. Do not close the application merely
because a user logs out.

Only one user can be logged in at a time.

### 3.2 Admin

The Admin has access to all administrative and operational features,
including:

-   Product and category management.
-   Product prices and availability.
-   Currency exchange-rate settings.
-   Delivery-fee defaults.
-   Cashier account management.
-   Promo-code management.
-   Sales statistics and reports.
-   Optional inventory and expenses modules.
-   Table-count configuration.
-   Printer and receipt settings.
-   Backup creation settings and other application settings.

### 3.3 Cashier

Start with one or two cashier accounts. Each cashier must have a
separate username and password. The system should allow additional
cashier accounts to be created later by the Admin.

Cashiers can:

-   Create and manage orders.
-   Add products and item notes.
-   Process payments.
-   Print customer receipts.
-   Handle takeaway, delivery, and dine-in orders.
-   Open and manage table orders.
-   Enter valid promo codes.

Cashiers must not be able to:

-   View sales totals, revenue, profit, or sales reports.
-   View daily, weekly, monthly, or historical sales figures.
-   Manage products, categories, prices, or exchange rates.
-   Create or edit promo codes.
-   Access Admin settings or other Admin-only features.

**Important security requirement:** Permissions must be enforced in the
backend/service layer, not merely by hiding buttons in the user
interface. A cashier must not be able to retrieve restricted sales data
by invoking an internal API or manipulating the UI.

### 3.4 Cashier shifts and closing verification

Each cashier has a separate account and shift history. Orders and
payments must be associated with the cashier who performed them.

At the end of a shift:

-   The cashier performs a shift-closing process.
-   The cashier enters/declares the actual cash amounts in the drawer,
    as required by the closing workflow.
-   The system generates a unique closing verification code/reference.
-   The cashier must not see the sales totals behind the closing record.
-   The Admin can open the relevant shift record, see the system's
    actual figures, and compare them with the cashier's declared amounts
    and closing reference.
-   The system should make discrepancies visible to the Admin.

The exact format and calculation of the closing code still need to be
designed. It should be a secure reference to a stored shift-closing
record, not a substitute for the financial data. The code itself must
not expose sales totals.

## 4. Order workflow

The basic workflow is:

1.  Customer tells the cashier what they want.
2.  Cashier selects the order type.
3.  Cashier adds the requested products.
4.  The system calculates the subtotal, any valid promo-code discount,
    delivery fee when applicable, and final total.
5.  Cashier enters the actual amount received from the customer in USD
    and/or LBP.
6.  The system calculates the remaining balance or change using the
    Admin-configured exchange rate.
7.  Cashier confirms the payment.
8.  The system saves the completed transaction safely.
9.  The system prints exactly one customer receipt by default.

An order must not be marked as paid until the payment transaction has
been successfully committed to the local database.

### 4.1 Order types

Support exactly these three initial order types:

-   Takeaway
-   Delivery
-   Dine-in

The order type must be stored with each order and available for Admin
reporting.

## 5. Products, categories, and menu management

### 5.1 Initial menu

The restaurant is expected to start with approximately 20--30 products,
although the number may change.

Keep product setup simple in the first version:

-   Each product has one standard price.
-   Do not build a complex product-variant or customization system
    initially.
-   A cashier can add a free-text note to an individual order item, for
    example "no sauce" or "extra sauce."
-   Add-ons can be represented as separate products managed by the
    Admin, rather than a complex modifier tree.

### 5.2 Admin product controls

Admin can:

-   Add, edit, and delete products.
-   Add, edit, and delete categories.
-   Change product prices.
-   Enable or disable a product.
-   Temporarily hide unavailable products so cashiers cannot sell them.

Cashiers cannot manage menu data or prices.

### 5.3 Menu import and export

Add an Admin-only **Menu Import / Export** feature.

Import requirements:

-   Support Excel `.xlsx` and CSV files.
-   Import fields should include product name, category, price, and
    availability.
-   Show a preview before applying the import.
-   Validate required fields and price values.
-   Detect likely duplicates.
-   Report invalid rows and import errors clearly.
-   Provide a safe choice between adding new products and updating
    matching existing products. Do not silently overwrite menu data.
-   The import should be transactional where practical: a failed import
    must not leave the menu in a partially corrupted state.

Export requirements:

-   Allow Admin to export the current menu to Excel and/or CSV.
-   The exported format should be suitable for editing and re-importing.

## 6. Currency and payment handling

### 6.1 Supported currencies

The POS must support:

-   USD
-   Lebanese Pound (LBP)

### 6.2 Exchange rate

-   Admin sets one fixed USD/LBP exchange rate manually.
-   The system does not fetch an automatic or live exchange rate.
-   The configured rate is used for payment calculations until Admin
    changes it.
-   Orders and payments should retain the exchange rate used at the time
    of the transaction, so historical records do not change when the
    Admin later updates the rate.

### 6.3 Mixed-currency payments

Customers may pay using USD, LBP, or a combination of both.

Example: If the total is USD 15, a customer may pay USD 10 plus LBP
450,000. The system converts the received amounts using the configured
exchange rate and calculates whether a balance remains or change is due.

Do not force the cashier to choose one exclusive payment currency. The
cashier should enter the actual amounts physically received in each
currency.

**Still to confirm during implementation:** How the cashier should
choose the currency or combination used to return change when the
customer overpays in mixed currencies. Until decided, design the payment
model so this can be handled without changing the database structure.

## 7. Promo codes and discounts

Do not provide a free-form discount percentage field to cashiers.

Instead:

-   Discounts are applied through promo codes.
-   Promo codes are created and controlled from the Admin panel.
-   Cashiers can only enter a promo code at checkout.
-   The system validates the code before applying the discount.
-   Cashiers cannot create, edit, or change the discount value.

The agreed discount type is a percentage discount.

Admin promo-code management should be designed to support controls such
as activation/deactivation, percentage value, validity dates, and usage
limits. The exact set of controls and rules should be confirmed with the
owner before finalizing the feature.

Every applied promo code and discount amount must be recorded with the
order for audit and reporting.

## 8. Takeaway orders

Takeaway orders use the standard order and payment flow. The customer
receives one printed receipt by default.

## 9. Delivery orders

Delivery orders must have a receipt format distinct from dine-in and
takeaway receipts.

Capture these delivery details:

-   Customer name.
-   Customer phone number.
-   Full delivery address.
-   Delivery fee.
-   Driver name/assignment.

Additional delivery timing information should be optional:

-   Time the customer requested delivery.
-   Promised delivery time.

### 9.1 Delivery fee

-   Admin configures a default delivery fee.
-   The default fee is automatically added to delivery orders.
-   Cashier can override the fee for an individual order.
-   An order-level override must not change the Admin's default delivery
    fee.
-   The applied delivery fee must be stored with the order.

### 9.2 Driver assignment

Allow the cashier to enter or select the driver associated with a
delivery. A more advanced driver-management system is not required
unless separately requested.

## 10. Dine-in tables

### 10.1 Table configuration

-   Admin enters the restaurant's number of tables once.
-   The system generates that number of tables on the dine-in screen.
-   Save the table count between application sessions.
-   Do not require the Admin to position tables or reproduce the
    restaurant's physical floor plan.
-   Display tables in a clean, attractive, easy-to-read visual layout.
    Their exact physical positions are not important.
-   The Admin should be able to change the table count if the
    restaurant's setup changes.

### 10.2 Table operation

-   Each table can have an open order/bill.
-   A table remains open until the cashier explicitly closes it.
-   Cashier can add more products to an existing table order.
-   The system must clearly show which tables are available and which
    have open orders.
-   A payment does not automatically close a dine-in table. The cashier
    controls when the table is closed, because customers may remain
    seated or order additional items after paying.
-   Table transfer/merging is not a required initial feature. Do not add
    it if it introduces unnecessary complexity.

## 11. Receipts and printing

### 11.1 General receipt requirements

-   Print one copy by default.
-   Print a customer receipt only; no kitchen ticket is required.
-   Support Arabic and English receipts.
-   Support correct RTL Arabic and LTR English text rendering.
-   Receipt layout should be clean and readable.
-   Receipt should show the relevant order details, items, quantities,
    prices, totals, payment information, and order type.
-   Delivery receipts must additionally show the delivery details.
-   Item notes such as "no sauce" or "extra sauce" must appear on the
    receipt.

### 11.2 Printer support

The application should support the restaurant's thermal receipt printer.
Prefer a printer abstraction so printer-specific logic is not spread
throughout the application.

ESC/POS support is a reasonable implementation option if the printer is
ESC/POS-compatible. Confirm the exact printer model, connection type,
paper width, and character/Arabic support before finalizing the printing
implementation.

Printer settings and test-print functionality should be available to
Admin. A printer failure must not cause an order or payment to be lost.

## 12. Sales dashboard and reports

Sales reporting is a priority and is Admin-only.

The Admin dashboard should show useful statistics with charts, summary
cards, and tables. This is an in-app dashboard, not a separate
report-generation workflow.

### 12.1 Date filters

Support:

-   Daily
-   Weekly
-   Monthly
-   Overall
-   Custom date range

The default weekly period is Monday through Sunday. Admin can change the
date range manually, for example Tuesday through Friday.

### 12.2 Suggested sales metrics

Include:

-   Total revenue.
-   Number of orders.
-   Best-selling products.
-   Least-selling products.
-   Quantity sold per product.
-   Sales trends over time.
-   Sales by order type: takeaway, delivery, and dine-in.
-   Sales by currency.
-   Cashier/shift performance.

Revenue and profit must be distinguished. Do not label revenue as
profit.

### 12.3 Profit and optional financial modules

Profit calculation requires product cost data and a clearly defined
treatment of expenses. Since inventory and expenses are optional, the
system must not display a misleading profit figure when required cost
data is unavailable.

Allow Admin to export relevant statistics/data to Excel and/or print
them.

Cashiers must not have access to these reports or sales totals.

## 13. Optional inventory and expenses

Inventory and expenses are optional modules. The core POS must work
normally when either module is disabled.

### 13.1 Inventory

-   Inventory tracking may be enabled or disabled by Admin.
-   If enabled, it can track stock quantities.
-   The system should support the restaurant's decision to track stock
    for relevant items.
-   Do not make inventory setup mandatory for creating menu items or
    completing normal sales.
-   Keep inventory operations simple in the first version.

### 13.2 Expenses

-   Expenses are an optional module.
-   The core checkout process must not depend on expense entry.
-   If enabled, Admin can record and review expenses.
-   Expense data may be used in financial reporting, but revenue and
    profit must remain clearly distinguished.

The exact inventory deduction rules, stock units, low-stock alerts,
expense categories, and expense workflows remain to be confirmed before
implementation.

## 14. Crash recovery and transaction safety

Reliability is a core requirement.

The system must:

-   Automatically save in-progress order changes.
-   Recover unfinished orders after an application crash or sudden power
    loss, where the data had already been saved.
-   Preserve completed orders and payments.
-   Distinguish clearly between draft/open, unpaid, partially paid if
    supported, and paid orders.
-   Use database transactions for order and payment operations.
-   Avoid marking an order as paid before its payment record is
    committed successfully.
-   Prevent duplicate payments if a user retries after an uncertain
    result.
-   Validate data before committing changes.
-   Provide clear error messages and useful diagnostic logs.
-   Recover safely after an interrupted write, using the database's
    supported recovery mechanisms.

No software can guarantee recovery of data that never reached persistent
storage. The implementation should minimize that risk through frequent
autosaving, database transactions, and appropriate local database
durability settings.

## 15. Backup requirements

The owner has specific requirements about backup ownership and
application permissions.

### 15.1 Backup creation

-   Create a separate compressed backup file for every completed
    login/logout session.
-   Use a unique filename containing a timestamp and, where useful, a
    session identifier.
-   Never overwrite an existing backup.
-   Save backup files in a dedicated folder on the local computer.
-   Backups should be compact, using compression and avoiding
    unnecessary data.
-   Do not impose an arbitrary 500 KB or 1 MB limit that could make a
    backup incomplete.
-   The owner will copy, move, or store backup files manually using
    Windows. The POS does not need a USB export workflow or
    backup-management interface.

### 15.2 Application access restrictions

The application is intended to be able to **create new backup files
only**. It must not delete, rename, move, overwrite, or manage existing
backup files. It should not provide a user-facing feature for deleting
backups.

This requirement must be enforced at the Windows filesystem permission
level, not only by omitting delete buttons from the UI. The
implementation should investigate an appropriate Windows account/service
and NTFS ACL design that allows creation of new files while denying
deletion and modification of existing backup files.

Do not claim this protection is achieved merely because the application
code does not call a delete function. Test the actual Windows
permissions.

### 15.3 Backup timing and crash edge case

The agreed backup trigger is tied to session logout: create a backup for
each login/logout session. The application returns to the initial
role-selection screen after logout.

The implementation must also consider abnormal termination. If the
application crashes or the computer loses power before logout, it cannot
rely on a normal logout event to create that session's final backup. Use
database recovery and the next safe startup/session boundary to handle
this case without overwriting prior backups. The exact recovery-backup
timing should be documented and tested.

### 15.4 Backup restoration

The owner wants control over backup files outside the application. A
restore workflow is not yet fully specified. Do not add a complex
backup-management screen by assumption. Propose a safe Admin-only
restore process for approval before implementing it.

## 16. Language and localization

-   Support English and Arabic throughout the application.
-   Provide a language selector or setting.
-   English layout must use LTR direction.
-   Arabic layout must use RTL direction.
-   Ensure forms, navigation, tables, charts, dialogs, numbers, and
    receipt layouts remain usable in both directions.
-   Use proper Arabic-capable fonts and printer rendering.
-   Avoid hard-coded interface strings; use a localization system so
    future translations can be added.

## 17. Recommended technology stack

The following stack is recommended for the initial implementation. It is
a proposed technical decision based on the offline, single-machine,
Windows, lightweight, and portfolio-quality requirements.

### Frontend

-   **React**
-   **TypeScript**
-   **Vite** for development and frontend builds.
-   **Tailwind CSS** for styling and responsive layouts.
-   A lightweight charting library for the Admin statistics dashboard.
-   A localization library or structured translation system for
    Arabic/English and RTL/LTR.

### Backend

-   **Python**
-   **FastAPI** for a locally hosted application API.
-   **Pydantic** for request/data validation.
-   A service/repository architecture to keep business logic separate
    from HTTP routes and UI code.

### Database

-   **SQLite** as the local embedded database.
-   Use SQLAlchemy 2.x for database access and migrations.
-   Use Alembic for schema migrations.
-   Enable appropriate SQLite durability settings, including foreign-key
    enforcement and a carefully configured journal mode.
-   Use explicit transactions for checkout, payment, shift closing, and
    other financial operations.

SQLite is a good fit for one computer and one active user. Do not put
the SQLite database file on a network share. If multi-terminal/network
use is ever requested, revisit the architecture rather than assuming the
single-machine design can simply be shared.

### Desktop application and packaging

-   **Electron** as the Windows desktop shell, hosting the React
    interface.
-   Bundle the FastAPI backend as a packaged executable or otherwise
    package and launch it as a managed local process.
-   Build a Windows installer so the destination computer does not need
    Python, Node.js, npm, Docker, or an internet connection installed.
-   Manage backend startup, shutdown, health checks, and crash recovery
    from the desktop application.
-   Bind the local backend to loopback only; do not expose it to the
    local network.
-   Apply a restrictive Content Security Policy and secure Electron
    settings. Do not enable Node integration in the renderer.

**Architecture trade-off:** Electron plus a packaged Python/FastAPI
service is suitable if retaining Python/FastAPI is important for the
portfolio and future AI work. It has more packaging and
process-management complexity and may use more memory than a simpler
native desktop architecture. Measure startup time and memory on the
actual POS computer. Do not add Docker to the deployed application.

### Printing

-   Use a printer abstraction.
-   Use ESC/POS where compatible with the actual thermal printer.
-   Test Arabic shaping, text direction, font rendering, paper width,
    cutting, and connection handling on the real printer.

### Development and quality tools

-   **Git and GitHub** for version control.
-   **Docker Compose** may be used for development/testing convenience
    only if useful; it is not required on the restaurant computer.
-   **pytest** for backend tests.
-   **Postman** or equivalent for API testing.
-   **ESLint and Prettier** for frontend code quality.
-   Automated build and test scripts.
-   Structured local logs for troubleshooting.

### Why SQLite instead of PostgreSQL?

For this specific first version, the application runs on one Windows
computer, has one active user, and must be offline and lightweight.
SQLite avoids running and maintaining a separate database server.
PostgreSQL would add operational overhead without a clear benefit for
the confirmed single-computer requirement.

If the project later expands to multiple terminals or concurrent network
users, reassess PostgreSQL or another server database at that time.

## 18. Suggested application architecture

Use a modular monolith rather than microservices. The application is
local and small enough that a distributed architecture would add
unnecessary operational complexity.

Suggested logical modules:

1.  Authentication and authorization.
2.  User and cashier account management.
3.  Products and categories.
4.  Menu import/export.
5.  Order management.
6.  Payments and currency conversion.
7.  Promo codes.
8.  Takeaway workflow.
9.  Delivery workflow.
10. Dine-in tables.
11. Shift management and closing verification.
12. Receipts and printer integration.
13. Sales dashboard and reporting.
14. Optional inventory.
15. Optional expenses.
16. Backup creation and recovery.
17. Settings and localization.

Keep business rules in backend services. The React interface must not be
the authority for prices, totals, discounts, payment status, user
permissions, or shift closing.

Suggested high-level data entities:

-   User
-   Role
-   CashierShift
-   ShiftClosing
-   Product
-   Category
-   Order
-   OrderItem
-   Payment
-   ExchangeRateHistory or transaction-level exchange-rate snapshot
-   PromoCode
-   PromoCodeRedemption
-   DiningTable
-   DeliveryDetails
-   Driver (or a simple driver name field initially)
-   Expense (optional module)
-   InventoryItem / StockMovement (optional module)
-   ApplicationSetting
-   BackupSessionRecord (metadata only; backup files remain outside
    application management)

The exact schema should be designed after reviewing the workflows. Do
not create unnecessary tables just to follow this list literally.

## 19. User interface expectations

The interface should be attractive but practical. Speed and clarity
matter more than decorative animation.

Suggested screens:

-   Initial Admin/Cashier selection.
-   Admin password screen.
-   Cashier password screen.
-   Admin dashboard.
-   Cashier POS screen.
-   Product/category management.
-   Menu import/export.
-   Promo-code management.
-   Dine-in table screen.
-   Delivery order details.
-   Payment and change calculation.
-   Shift closing.
-   Admin sales dashboard.
-   Optional inventory and expenses screens.
-   Printer and application settings.

The cashier workflow should minimize clicks and typing. Use large, clear
product controls and a visible order summary. Do not show sales
analytics or revenue totals in the cashier interface.

## 20. Non-functional requirements

### Performance

-   Launch quickly on the target Windows 10 computer.
-   Keep memory and CPU use low.
-   Avoid unnecessary background services and heavy animations.
-   Keep checkout responsive with a menu larger than the initial 20--30
    products.
-   Test on the actual POS hardware, not only a powerful development
    machine.

### Security

-   Store passwords using a modern password-hashing algorithm such as
    Argon2id or bcrypt with appropriate parameters.
-   Never store plaintext passwords.
-   Enforce role permissions in backend services.
-   Validate all imported files and user input.
-   Restrict the local API to loopback.
-   Protect sensitive configuration and backup folder permissions.
-   Avoid exposing secrets in logs.

### Data integrity

-   Use database transactions for financial operations.
-   Use stable unique IDs for orders, payments, and shifts.
-   Preserve historical prices and exchange rates as transaction
    snapshots.
-   Record who performed each order/payment/action where relevant.
-   Do not silently overwrite financial or menu data.
-   Provide audit records for important Admin changes.

### Maintainability

-   Use clear module boundaries.
-   Keep UI, business logic, persistence, printing, and operating-system
    integration separate.
-   Document setup, build, release, backup, and recovery procedures.
-   Use database migrations.
-   Add automated tests for important business rules.

## 21. Testing and acceptance criteria

The project is not ready for real restaurant use until the following
scenarios have been tested.

### Authentication and permissions

-   Admin and Cashier can log in through their separate entry paths.
-   Logout returns to the initial role-selection screen.
-   Only one user can be active at a time.
-   Cashier cannot access sales totals or Admin-only operations through
    either UI or backend.
-   Different cashier accounts are tracked separately.

### Orders and payments

-   Create takeaway, delivery, and dine-in orders.
-   Add multiple products and item notes.
-   Apply a valid promo code.
-   Reject invalid, inactive, expired, or otherwise ineligible promo
    codes according to the configured rules.
-   Calculate USD, LBP, and mixed-currency payments correctly.
-   Preserve the exchange rate used for historical transactions.
-   Do not mark a payment complete until its database transaction
    succeeds.
-   Prevent accidental duplicate payment recording.

### Delivery

-   Required customer and delivery details are captured.
-   Default delivery fee is applied.
-   Per-order delivery fee override does not alter the default.
-   Driver information is stored.
-   Optional requested/promised delivery times can be left blank.

### Dine-in

-   Admin can configure the number of tables.
-   Table count persists after application restart.
-   Tables display in a clean generated layout.
-   Cashier can open a table, add items, take payment, and manually
    close the table.
-   Payment alone does not automatically close the table.

### Receipts and printing

-   Exactly one copy prints by default.
-   English and Arabic receipts render correctly.
-   Delivery receipt contains delivery information.
-   Item notes are printed.
-   Printer disconnection or failure does not lose the order/payment.

### Reporting

-   Admin can view daily, weekly, monthly, overall, and custom-range
    statistics.
-   Weekly default is Monday--Sunday.
-   Sales are filterable by order type, product, cashier, and relevant
    dimensions.
-   Revenue is not mislabeled as profit.
-   Admin can export data to Excel and/or print reports.
-   Cashier cannot view reports.

### Recovery and backups

-   An unfinished order is recoverable after an application crash if its
    latest changes were persisted.
-   Completed orders and payments remain intact after restart.
-   A separate compressed backup is created for each normal login/logout
    session.
-   Backup names are unique; existing backups are never overwritten.
-   The application cannot delete, rename, move, or modify existing
    backup files under the tested Windows permission configuration.
-   Backup creation failure is logged and reported to Admin.
-   Abnormal shutdown is handled safely and does not corrupt the
    database.
-   Backup/restore procedures are tested on a separate test database
    before real deployment.

### Offline and deployment

-   Install and run on a clean Windows 10 machine without internet.
-   No separate Python, Node.js, or Docker installation is required on
    the target machine.
-   The application continues working after internet access is
    disconnected.
-   Local API is not reachable from other computers on a network.
-   Printer works with the actual hardware.

## 22. Implementation plan for the coding agent

Build incrementally. Do not generate the entire application in one
unreviewed step.

### Phase 1 --- Repository and architecture

-   Inspect the target environment and available hardware.
-   Create the repository structure.
-   Set up React, TypeScript, Vite, FastAPI, SQLite, SQLAlchemy, and
    Alembic.
-   Add configuration management, logging, linting, and test
    foundations.
-   Define the API and module boundaries.
-   Document how to run the development version.

### Phase 2 --- Database and authentication

-   Design and migrate the initial schema.
-   Implement Admin and Cashier accounts.
-   Implement secure password handling.
-   Implement role-based authorization in backend services.
-   Implement login/logout and the initial role-selection screen.

### Phase 3 --- Menu management

-   Implement products and categories.
-   Implement availability controls.
-   Implement item notes.
-   Implement menu Excel/CSV import and export with preview and
    validation.

### Phase 4 --- Core POS and payments

-   Implement order creation and order types.
-   Implement USD/LBP exchange-rate configuration.
-   Implement mixed-currency payment entry and calculations.
-   Implement transaction-safe payment completion.
-   Implement promo-code validation and Admin management.

### Phase 5 --- Dine-in and delivery

-   Implement generated table layout and saved table count.
-   Implement open table orders and manual table closure.
-   Implement delivery details, delivery fee defaults/overrides, driver
    assignment, and optional delivery times.

### Phase 6 --- Shifts and receipts

-   Implement cashier shifts and closing verification.
-   Implement bilingual receipts.
-   Integrate and test the actual thermal printer.
-   Ensure printer failures do not compromise transaction records.

### Phase 7 --- Admin reporting and optional modules

-   Implement sales dashboard and date filters.
-   Implement exports and printing.
-   Add inventory and expenses as independently enabled optional
    modules.
-   Ensure no optional module blocks normal checkout.

### Phase 8 --- Reliability and backups

-   Implement autosave and crash recovery.
-   Implement unique per-session compressed backups.
-   Implement and test Windows filesystem permissions for backup
    immutability.
-   Define and test abnormal-shutdown handling.
-   Validate database recovery and backup restoration procedures.

### Phase 9 --- Packaging and deployment

-   Package the backend and desktop shell.
-   Create the Windows installer.
-   Test installation on a clean Windows 10 machine.
-   Test offline operation, startup/shutdown, printer integration, and
    resource usage.
-   Prepare a deployment and recovery guide.

## 23. Important instructions to the coding agent

1.  Treat this report as the source of truth for the agreed initial
    scope.
2.  Do not add cloud dependencies, network features, subscriptions, or
    mandatory internet access.
3.  Do not build multi-terminal support unless explicitly requested
    later.
4.  Do not give cashiers access to sales totals or reports.
5.  Do not implement arbitrary cashier-entered discounts; use
    Admin-controlled promo codes.
6.  Do not make inventory or expenses mandatory.
7.  Do not automatically close a dine-in table just because payment was
    received.
8.  Do not print kitchen tickets.
9.  Do not overwrite or delete backup files.
10. Do not claim backup immutability without testing actual Windows
    permissions.
11. Do not mark orders paid before successful database commit.
12. Keep the application lightweight and test on the real target
    hardware.
13. Ask the owner before making decisions where this document explicitly
    says a detail is still to be confirmed.
14. Implement one phase at a time, with tests and a clear explanation of
    completed work before moving to the next phase.
15. Prefer simple, maintainable solutions over unnecessary abstractions
    or microservices.

## 24. Decisions still to confirm

These are not reasons to delay the initial repository and architecture
work, but they must be resolved before the relevant feature is
finalized:

-   Exact CPU, RAM, storage, and Windows 10 edition/build of the POS
    computer.
-   Exact thermal printer model, connection type, paper width, and
    Arabic-printing capabilities.
-   Whether change for a mixed-currency overpayment should be returned
    in USD, LBP, or a cashier-selected combination.
-   Exact promo-code rules: expiration, usage limits, per-customer
    limits, and whether codes can be combined.
-   Exact inventory behavior and which products, if any, should affect
    stock.
-   Expense categories and expense-entry workflow.
-   Exact shift cash-counting fields and closing-code format.
-   Safe restore workflow for backups, given that the application must
    not manage or delete existing backup files.
-   How to handle a session backup if power fails before a normal
    logout.
-   Whether receipt language is selected per order, follows the
    application language, or is configurable separately.
-   Whether Admin should be able to reprint an old receipt and how such
    reprints should be marked.

------------------------------------------------------------------------

**Final objective:** Deliver a dependable, fully offline restaurant POS
for one Windows 10 computer, with secure Admin/Cashier separation, fast
order entry, mixed-currency payments, bilingual receipts, dine-in and
delivery workflows, Admin-only reporting, optional inventory/expenses,
robust local data handling, and per-session compressed backups. The
finished installer must run on the restaurant computer without requiring
development tools or internet access.
