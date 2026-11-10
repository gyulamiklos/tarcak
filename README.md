# Tarcak

**Repository:** [github.com/Gyulaa/Tarcak](https://github.com/Gyulaa/Tarcak)

Local-first personal finance app: **pockets** (budget segments), **multi-currency balances**, and a **unified ledger** for income, expenses, and transfers between pockets. All data stays on the device and is stored **encrypted**; unlocking the data uses a **password** you choose (not biometrics as the primary secret).

**App version (native):** `1.3.0` in [`app.json`](app.json) (`android.versionCode` `5`, auto-incremented by EAS on `preview` / `production` builds — see [`eas.json`](eas.json)).

## Current project setup

| Item | Notes |
|------|--------|
| **Runtime** | Expo SDK `~55`, React Native `0.83`, React `19`, TypeScript `strict` |
| **Entry** | `index.ts` → `App.tsx` (fonts) → `AppBoot.tsx` (vault gate + main UI) |
| **Architecture** | New Architecture enabled (`newArchEnabled: true` in `app.json`) |
| **Implemented** | **Vault** (PBKDF2 + AES-GCM wrapped DEK, SQLCipher, lock on background). **Schema** migrations **`0001`–`0008`** (auto-applied on unlock). **Repositories:** `pockets`, `transactions`, `settings`, `assetTypes`, `categories`, `jar`, `jarAdvanced`, `statistics`. **UI:** Home (balances by currency, Jar shortcut), Pockets + pocket detail, **History** (collapsible multi-filter panel — Type / Asset / Pocket / **Category**, tap-to-toggle, summary chips when collapsed), **Statistics** (month-based: 12-month income/expense bars and a month list, a **month screen** with income/expense tiles, the 12-month average, the month-end balance and a ranked breakdown by category or pocket that opens the matching transactions in History; balance-over-time at the bottom), **Settings** (appearance, Jar toggles, archived pockets, **screenshot block**, **categories**, **encrypted backup**), asset-type catalog, **category catalog** (optional per-transaction tag), transaction editor. **Jar:** Record income, Distribute (basic or Advanced rules), Jar split screen, recent Jar transactions. **Advanced Jar:** hub + per-asset **visual editor** (Balance Chart, split preview bar, milestone knots). **`ModalSelectField`** everywhere including **multi-select** filter sheets (tap toggles a checkmark and keeps the sheet open; tapping "All" clears and closes). **Themes:** six accent palettes + dark mode; **unlock screen** uses cached appearance. **Support:** BTC donation address on Home. **Encrypted `.tarcak` backup** export/import. |
| **Still to add** | Polish (**editable** `occurred_at` in the transaction editor; pocket rename UX), automated tests beyond CI typecheck + `test:jar` checklist, optional FX / converted home total |

## Support / donations

Addresses live in [`src/constants/donations.ts`](src/constants/donations.ts) and the Home support strip (`DonationFooter`).

| Asset | Address |
|-------|---------|
| **Bitcoin (BTC)** | `bc1q7ztcxrnc5hlkms02m79rxsv4mqxmuh8f8tjsrk` |
| **Monero (XMR)** | Placeholder (`soon`) in UI |

---

## Appearance (themes)

**Settings → Appearance**

- **Color palette** — `terracotta` (default), `ocean`, `forest`, `slate`, `red`, `yellow` ([`src/theme/colorThemes.ts`](src/theme/colorThemes.ts)). Each id has light + dark `AppColors`.
- **Black theme** — dark surfaces and light text app-wide.

Choices are persisted in **`user_settings`** while unlocked and mirrored to **SecureStore** via [`src/theme/appearanceCache.ts`](src/theme/appearanceCache.ts) (`tarcak_ui_dark_theme`, `tarcak_ui_color_theme_id`) so the **password / unlock screen** matches the last palette before the database opens. Backups optionally include this snapshot.

Semantic colors (not raw hex in screens) come from **`useAppTheme()`** in [`src/theme/ThemeContext.tsx`](src/theme/ThemeContext.tsx).

---

## Encrypted backup & restore

**Settings → Backup & restore** (native only; disabled on web).

| Password | Role |
|----------|------|
| **Vault password** | Unlocks the app after restore (unchanged). |
| **Backup password** | Encrypts the `.tarcak` file at rest (cloud, USB, email). |

**Export:** flushes WAL (`PRAGMA wal_checkpoint(FULL)`), then reads the **on-disk SQLCipher-encrypted file directly** (raw encrypted bytes — not `serializeAsync`, which returns decrypted in-memory pages and was the root cause of the historic import bug), bundles vault metadata (salt, wrapped DEK, PBKDF2 iteration count), appearance, and a **contents manifest** (pockets, transactions, asset types, categories, Jar basic + Advanced rules, settings) → JSON → AES-GCM with the backup password (file format 2: the PBKDF2 iteration count sits in the GCM-authenticated header, so the default can rise without breaking old files; format 1 files still open) → file `tarcak-backup-YYYY-MM-DD.tarcak` in cache, then **share** sheet ([`expo-sharing`](https://docs.expo.dev/versions/latest/sdk/sharing/)). While the share sheet is open, automatic **lock-on-background is suspended** (depth counter in `session.ts`) so the session stays alive. The whole SQLCipher file is copied as-is, so new tables (e.g. `categories`) are always included automatically — the contents manifest in [`backupFormat.ts`](src/security/backupFormat.ts) is just the human-readable description shown in Settings, not a per-table registration list.

**Import:** document picker ([`expo-document-picker`](https://docs.expo.dev/versions/latest/sdk/document-picker/)) with the same **lock suspension** while the picker is open (so choosing a file does not kick you to the password screen; it ends before the password prompt) → `content://` URIs are copied to cache first (Android, deleted after reading) → decrypt and validate while unlocked → stage the new DB file next to the old one → move the old files aside, swap in the new DB + SecureStore vault (on failure the old files and vault keys are put back) → record restore metadata ([`backupImportMeta.ts`](src/security/backupImportMeta.ts)) → lock session (user unlocks with **vault** password). **Destructive** on device: overwrites local data. After unlock, **Home** and **Settings** show a **”Restored from backup”** banner (backup created / imported timestamps) until dismissed. **Legacy recovery:** if the imported DB file is plain SQLite (created by an older build that used `serializeAsync`), `db/client.ts` automatically encrypts it in place with `PRAGMA rekey` on the first unlock — no user action needed.

Implementation: [`src/security/backup.ts`](src/security/backup.ts), [`src/security/backupCrypto.ts`](src/security/backupCrypto.ts), [`src/security/backupFormat.ts`](src/security/backupFormat.ts), [`src/security/backupImportMeta.ts`](src/security/backupImportMeta.ts), [`src/components/BackupPasswordModal.tsx`](src/components/BackupPasswordModal.tsx), [`src/components/BackupRestoredBanner.tsx`](src/components/BackupRestoredBanner.tsx). Imported directly from Settings (not the `security/index` barrel) so backup code does not load at cold start.

**Before upgrading** an old install, export a backup if you want a rollback copy.

---

## Monthly report export (CSV)

**Statistics → Export** (header button; native only, disabled on web). A monthly income/expense summary as a CSV file for a spreadsheet.

- **What is in the file:** for each calendar month (device time zone) and each chosen currency, `month,currency,income,expense,net`; every month in the range gets a row (zeros when empty). Only `income` and `expense` count, never transfers. Currencies are never added together (no exchange rates). Amounts are exact decimals (BigInt end to end, no rounding, no digit grouping); `expense` is the positive size of the spending and `net = income − expense`.
- **Optional category breakdown** (“Break down by category”, off by default): long form `month,currency,kind,category,amount`, non-zero sums only. This is the only place free text (category names) enters the file; text cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'` against spreadsheet formula injection.
- **What is never in the file:** pocket names or IDs, transaction titles, exact dates, timestamps, device info.
- **Choices:** time range (whole months, at most 240, default the last 12 including the current one), scope (all pockets / one pocket / outside the Jar, as in Statistics), which currencies to include, CSV preset (**International** by default: `,` between columns and a decimal point, so a spreadsheet never reads a decimal comma as a thousands separator; **Hungarian**: `;` and decimal comma; not remembered, resets on each open). UTF-8 with BOM, CRLF line ends, RFC 4180 quoting.
- **The file is not encrypted.** The screen says so in a confirmation before the share sheet. It is written to the cache as `tarcak-report-YYYY-MM-DD.csv`, shared with [`expo-sharing`](https://docs.expo.dev/versions/latest/sdk/sharing/) (lock-on-background is suspended while the sheet is open, like the backup), and removed on the next export or the next time the screen opens (not right after sharing: on Android the receiving app may still be reading it). Whatever app you share it with keeps its own copy.
- **No network, no analytics, no logging of the contents.** The preview and the file come from the same function ([`src/domain/monthlyReport.ts`](src/domain/monthlyReport.ts)).

Implementation: [`src/domain/monthlyReport.ts`](src/domain/monthlyReport.ts) (pure, unit-tested in `tests/monthlyReport.test.ts`), [`src/db/repositories/report.ts`](src/db/repositories/report.ts), [`src/utils/reportFile.ts`](src/utils/reportFile.ts), [`src/screens/ReportExportScreen.tsx`](src/screens/ReportExportScreen.tsx). The `.tarcak` backup, the schema and `src/security/` are untouched.

---

## Upgrading from an older build

Safe to install over an existing vault: on unlock, [`runPendingMigrations`](src/db/migrations/runner.ts) applies any of **`0001`–`0008`** not yet recorded in `schema_migrations`. No new migration is required for recent UI-only releases if you are already at version **8**.

| Migration | What changes |
|-----------|----------------|
| `0001` | Initial pockets, transactions, settings |
| `0002` | Amount scale → 10⁻⁸ minor units (multiplies legacy rows) |
| `0003` | `asset_types` catalog seeded from existing currencies |
| `0004` | Jar pocket + `jar_distribution_rules` |
| `0005` | `pockets.archived` |
| `0006` | Advanced Jar tables |
| `0007` | `categories` catalog + nullable `transactions.category_id` (FK, `ON DELETE SET NULL`) |
| `0008` | nullable `asset_types.display_decimals` (0–8; null = automatic) |

First unlock after a big jump may take a few seconds. Wrong vault password still fails before migrations run. See **Forgot password** if you need a clean slate.

---

`app.json` enables the **expo-sqlite** config plugin with **`useSQLCipher: true`**. That only applies after a **native build** (`npx expo prebuild` / EAS / `expo run:*`). **Expo Go does not ship SQLCipher** — the app still runs, but the DB file is **plaintext** there (a console warning explains this). Use a **development build** to validate real encryption.

**CI:** GitHub Actions runs `npm ci` and `npm run typecheck` on push/PR (see [.github/workflows/ci.yml](.github/workflows/ci.yml)). **Security:** [`security.yml`](.github/workflows/security.yml) runs `npm run security:scan` (npm audit + static pattern gate) and dependency review on PRs; see [SECURITY.md](SECURITY.md).

**Android APK for GitHub Releases:** [docs/ANDROID_GITHUB_RELEASE.md](docs/ANDROID_GITHUB_RELEASE.md) (EAS Build `preview` profile → attach `.apk` to a Release).

**Typecheck:** `npm run typecheck` type-checks the whole project (CI). Note: most `.tsx` screens and components still start with `// @ts-nocheck`, so they are not actually checked yet; removing it file by file (fixing the errors it hides) is open work. `npm run typecheck:src` covers only `src/**/*.ts` (security, DB client, migrations).

**Security disclosures:** see [SECURITY.md](SECURITY.md).

**VPN / tunnel issues:** If `npx expo start --tunnel` fails (e.g. `Cannot read properties of undefined (reading 'body')`), that is a known limitation of Expo’s shared ngrok tunnel—not this repo. **`npm run start:localhost` + QR scan usually fails without USB**: the QR points at `127.0.0.1` on the **phone**, not your PC — use **`npm run start:lan`** (same Wi‑Fi), or USB with **`adb reverse`** and open **`exp://127.0.0.1:8081`** manually in Expo Go, or a custom tunnel — see [docs/DEVELOPMENT_NETWORK.md](docs/DEVELOPMENT_NETWORK.md).

**Why migrations:** They let you **evolve the SQLite schema across app releases** without wiping the user’s encrypted file. On each `openMainDatabase()`, pending steps run in order and are recorded in `schema_migrations`. DDL migrations are **not** wrapped in `BEGIN…COMMIT` because SQLite’s `CREATE TABLE` / `CREATE INDEX` perform an implicit commit, which breaks Expo’s `withTransactionAsync` wrapper.

---

## Implemented cryptography (accurate detail)

| Piece | Choice | Where |
|-------|--------|--------|
| **DEK** | 32 random bytes (CSPRNG) | `vault.ts` + `random.ts` (`expo-crypto`) |
| **KEK** | PBKDF2-HMAC-SHA256; iteration count from **SecureStore** per vault (default **100,000** in `constants.ts` for new vaults and for unlock when no stored value exists) | `kdf.ts`, `vault.ts`, `keystore.ts` |
| **Password form** | Unicode **NFKC** normalization before KDF | `passwordPolicy.ts` |
| **DEK at rest (metadata)** | AES-256-GCM (12-byte random nonce, empty AAD), versioned blob → Base64 in SecureStore | `wrapDek.ts` (`@noble/ciphers`) |
| **DEK in session** | Copy in memory while unlocked; `fill(0)` on lock (best-effort in JS) | `session.ts`, `lockdown.ts` |
| **SQLite file** | SQLCipher: `PRAGMA key = "x'<hex of 32-byte DEK>'"` | `db/sqlcipher.ts`, `db/client.ts` |
| **Background** | `AppState` → `inactive` / `background` closes DB and clears session DEK | `session.ts` (dynamic import of `lockdown.ts` avoids import cycles) |

**Dependencies (main):** `expo-secure-store`, `expo-crypto`, `expo-sqlite`, `expo-constants`, `expo-font`, `expo-clipboard`, `expo-file-system`, `expo-document-picker`, `expo-sharing`, `expo-linear-gradient`, `@noble/hashes`, `@noble/ciphers`, `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-svg`, `react-native-gifted-charts`, `zustand`.

**Changing `PBKDF2_ITERATIONS`:** New vaults store the count at creation; password change updates it. Existing installs **with** a stored value keep unlocking with their saved count. Installs that **lack** the key (very old data) still use whatever value is in `constants.ts` today — do not assume you can freely change the constant for those users. See [SECURITY.md](SECURITY.md).

---

## What “backend” means here

There is **no remote server**. The **backend** is the **on-device stack**:

1. **Security** — password-based key derivation, protecting the database encryption key, session lifecycle (lock when backgrounded).
2. **Database** — encrypted SQLite schema, migrations, and repositories.
3. **Domain** — types and pure functions (e.g. computing balances and home-screen aggregates).

The UI calls into repositories; repositories run SQL and map rows to typed models.

---

## Security model (password-first)

**Goals**

- Database file on disk is **unreadable** without the password.
- After unlock, decrypted access exists **in memory** while the app is active; **lock on background** clears sensitive session state and requires the password again (policy you can tune).

**Recommended pattern (two-layer keys)**

1. **Data encryption key (DEK)** — random key that actually encrypts the SQLite database (e.g. SQLCipher).
2. **Key encryption key (KEK)** — derived from the **password** using a slow KDF (e.g. Argon2id or PBKDF2 with high iteration count) and a **random salt**.

Store **salt** and **DEK wrapped with KEK** in the OS secure store (Expo: `expo-secure-store`). The **password is not stored**. On launch, user enters password → derive KEK → unwrap DEK → open DB.

**Why not derive the DB key directly from the password?** You can, but wrapping a random DEK allows **password changes** without re-encrypting the entire database.

**Threat model (short)**

- **Helps**: lost device, backup extraction of app files, casual access without password.
- **Does not guarantee**: malware on an unlocked device, rooted/kernel compromise, or someone watching you type the password.

Biometrics can be added later as a **convenience** that gates access to the password or a short-lived session — but the **authoritative secret** remains the password, per your preference.

**Forgot password:** There is no server reset. The unlock screen offers **“Forgot password? Erase data and start over”**, which deletes the vault (SecureStore) and the local SQLite file so you can **Create vault** with a new password. All previous pockets and transactions on that device are lost unless you have an **encrypted `.tarcak` backup** (Settings → export) to restore on a fresh vault.

---

## Domain concepts

### Pocket

A **pocket** is a user-defined bucket (e.g. “Daily”, “Savings”, “Crypto”). It does not have a single currency: the same pocket can hold **multiple currencies** as separate balances.

### Asset type (currency code)

Each transaction stores a **`currency` string** that must match a row in the **`asset_types`** catalog (code + display name). Users **define** codes (e.g. `HUF`, `USD`, `XMR`) under **Settings → Asset types**, then **pick** them when recording a transaction (no free-text codes on the form). **`default_currency`** in `user_settings` must refer to an existing catalog code.

Amounts are stored as **signed integers**: **one major currency unit = 10⁸ minor units** (8 decimal places), so values like `0.00000001` are exact. **Income / expense** may use negative amounts; **transfers** must be positive (enforced in SQLite and app validation). The UI accepts decimal strings; see `src/utils/amountMinor.ts`. **Never** use floating point for money in logic — only for display derived from integers.

### Category (optional transaction tag)

Users define their own **categories** (e.g. “Groceries”, “Salary”) under **Settings → Categories**, each with an optional hex **color** swatch. A category can be attached to an **income** or **expense** transaction (optional — a transaction can have none); **transfers never carry a category** (enforced in `validateLedgerShape`, since it is not money in/out). `transactions.category_id` is a real FK to `categories.id` with **`ON DELETE SET NULL`**: deleting a category just uncategorizes the transactions that used it, it never blocks the delete. **History** can filter by category (including an “Uncategorized” bucket), and the **Statistics** month screen breaks a month's income or expense down by category.

### Jar (pool & distribute)

The vault has **one system pocket** with **`is_jar = 1`** (created by migration `0004`, default name “Jar”). It behaves like any other pocket in the ledger (income, expense, transfers). **Distribution:** either **basic split** (**Jar split** — target pockets and percentages as basis points summing to **10 000** = 100%) or, when **Advanced Jar** is enabled in Settings, **only** per-asset rules from **Advanced Jar** (ceiling + milestone splits; each asset in the Jar needs its own config). **Distribute** moves the **full** balance of a chosen asset from the Jar via **transfer** rows (integer split; remainder on the last target).

**Settings → Pool & distribute** toggles the feature. When **off**, the setting `jar_enabled` is false and the Jar pocket is **`archived = 1`**: it disappears from **Pockets**, **Home** shortcuts, and **new-transaction pocket pickers**, but **balances and history** still count in aggregates. Turning the feature **on** clears archive on the Jar row. `getPocket(id)` still returns archived pockets (e.g. opening the Jar from a disabled-state screen).

**Advanced Jar** (Settings → toggle + **Configure Advanced Jar…**): per-asset **default ceiling** and **milestone** splits. Between milestones, effective percentages **linearly blend** ([`src/domain/jarAdvancedMath.ts`](src/domain/jarAdvancedMath.ts)). **Distribute** uses only Advanced rules when the toggle is on (each asset in the Jar needs a config).

**Advanced Jar editor** ([`JarAdvancedAssetEditor`](src/screens/JarAdvancedAssetEditor.tsx)):

- **Split preview bar** — stacked bar + legend (theme-aware pocket colors).
- **Balance Chart** — X = Jar balance (asset amount), Y = 0–100% per pocket; one line per pocket in the rules; tap **knots** (ceiling / milestones) to edit; slide chart to **preview** automatic blend; **+ Milestone**.
- Preview mode shows pocket shares as **asset amounts** at the top; panel can **use preview as new milestone**.

Chart layout / sampling: [`src/domain/jarAdvancedChartModel.ts`](src/domain/jarAdvancedChartModel.ts). Colors: [`src/utils/pocketChartColors.ts`](src/utils/pocketChartColors.ts).

### Ledger transactions (single source of truth)

Every user-visible record is a **transaction** row. Balances are **derived** by summing effects per `(pocket_id, currency)` (acceptable for typical personal use; add materialized balance tables later if profiling says you need them).

**Transaction kinds**

| Kind | Meaning | Pockets affected |
|------|---------|------------------|
| `income` | Money in | One **credit** pocket |
| `expense` | Money out | One **debit** pocket |
| `transfer` | Move value between pockets | **Debit** pocket → **credit** pocket (same currency for v1; see below) |

Each record has a **title** (short label), **amount** (non-zero integer in minor units at 10⁻⁸ major), **currency** (must exist in `asset_types`), and **when it happened** (`occurred_at`, Unix ms). New saves set `occurred_at` to the current time; the editor **displays** the stored date when editing (changing it in UI is not implemented yet). **History** and pocket **recent lists** display this date; queries order by `occurred_at` descending.

**History screen** ([`HistoryScreen.tsx`](src/screens/HistoryScreen.tsx)):

- **Filter panel is collapsible** — collapsed by default (a header row + removable summary chips for whatever is active); tapping the header, a chip, or expanding shows the full Type / Asset / Pocket / **Category** filter grid. Keeps the screen from permanently losing space to filter UI once nothing is being changed.
- Optional **scope** from navigation (`pocketId`, e.g. opening History from a pocket) pre-selects that pocket in the **Pocket filter** (shown as a summary chip, panel stays collapsed) rather than a separate always-visible banner — a single selected pocket also still scopes the underlying SQL query itself (most-recent-N **for that pocket**, not a client-side slice of the global most-recent-N).
- Loads up to **500** recent transactions (scoped to one pocket when exactly one is filtered, otherwise global), then filters client-side.
- **Filters** (Type / Asset / Pocket / **Category**): tapping a non-"All" option **toggles its checkmark and keeps the sheet open** so several can be picked (OR within each dimension); tapping **"All"** clears that dimension and closes. (Earlier versions required a hidden long-press to multi-select — tap now does it directly.)
- **Income** filter includes `kind = income` and **transfers into the Jar** (money pooled from other pockets).
- **Jar** always appears in the pocket filter list when the Jar pocket exists.
- **Asset / Pocket / Category** filter option lists are sourced from the **full catalogs** (`assetTypes`, `pockets`, `categories`), independent of the currently loaded transaction batch — otherwise, once a single-pocket scope narrowed that batch, the other pickers would only offer whatever happened to appear in the narrowed set. **Category** additionally has an **“Uncategorized”** entry for transactions with no `category_id`.

**Statistics screen** ([`StatisticsScreen.tsx`](src/screens/StatisticsScreen.tsx), [`statistics.ts`](src/db/repositories/statistics.ts)):

- **Two levels:** the overview ([`StatisticsScreen.tsx`](src/screens/StatisticsScreen.tsx)) shows the last 12 months as income/expense bars and a month list (net, in, out; "Show earlier months" adds 12); a month opens [`StatisticsMonthScreen.tsx`](src/screens/StatisticsMonthScreen.tsx). Asset and pocket scope are two chips shared by both screens, kept in memory only.
- **Month screen:** the Income and Expense tiles choose what the breakdown shows; each carries the average of up to 12 earlier months since the first transaction (hidden with fewer than 3). Net and the month-end balance (transfers included, per scope) sit under the tiles. The breakdown is a ranked bar list by category or pocket; a row opens History on exactly the transactions behind it (`TransactionDrill`, no Jar pooling), so the listed amounts add up to the row. No donut: a negative total (refunds) stays a plain row.
- **Queries:** month bounds travel in a `VALUES` CTE ([`monthlyStats.ts`](src/db/repositories/monthlyStats.ts)), so up to 24 months are one grouped query using the `occurred_at` index; the overview opens with two queries for the months (two more for the balance chart, which can be collapsed), the month screen with three, and a step to a month already read needs none. Pure logic (sums, average, breakdown, chart scale) is in [`src/domain/monthlyStats.ts`](src/domain/monthlyStats.ts).
- **Balance-over-time chart** height is bounded even when the balance dips deep negative relative to its peak — `computeLineChartScale` caps how many extra sections gifted-charts can render below the zero line (`LINE_MAX_NEG_SECTIONS`), instead of trusting the library's default (`stepValue` derived only from the max value), which could otherwise blow the chart's rendered height up unboundedly.
- **Touched-point readout** is a fixed row above the chart (date + amount), not a floating tooltip anchored to your finger — a floating, absolutely-positioned label from the chart library kept getting clipped by Android's ScrollView view-flattening whenever it needed to render outside its own box, regardless of z-index/elevation/`collapsable` tuning. A row in normal layout flow can't be clipped that way since nothing needs to escape its own bounds.

**v1 rule:** **Transfers are same-currency.** Cross-currency moves are either two transactions (sell/buy) or a future `exchange` type when you add rates — avoid ambiguous bookkeeping early.

### Home screen: “overall assets”

Without exchange rates, **you cannot sum HUF + USD + BTC into one meaningful number**. Plan:

- **Phase A (now):** Show **totals grouped by currency** (and per-pocket breakdown if useful).
- **Phase B (later):** `user_settings.default_currency` + cached FX/crypto prices → converted **estimated** total in one fiat column, clearly labeled as approximate.

---

## Database schema (logical)

SQLite tables (column types illustrative; adjust to your SQLCipher driver).

### `schema_migrations`

| Column | Type | Purpose |
|--------|------|---------|
| `version` | INTEGER PK | Applied migration id (monotonic) |
| `applied_at` | INTEGER NOT NULL | Unix ms when the migration finished |

### `pockets`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Display name |
| `sort_index` | INTEGER NOT NULL | UI ordering |
| `created_at` | INTEGER NOT NULL | Unix ms |
| `updated_at` | INTEGER NOT NULL | Unix ms |
| `is_jar` | INTEGER NOT NULL | `1` for the single system Jar (migration `0004`) |
| `archived` | INTEGER NOT NULL | `1` = hidden from `listPockets()` and pickers (Jar when pool feature off; migration `0005`) |

Partial unique index: at most one row with `is_jar = 1`.

### `asset_types`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `code` | TEXT NOT NULL UNIQUE | Uppercase code stored on `transactions.currency` |
| `name` | TEXT NOT NULL | Display label |
| `display_decimals` | INTEGER, nullable, 0–8 | Decimals shown in lists and totals (migration `0008`); null = automatic: none from 100 units, two from 1, three significant digits below 1. Display only; edit fields show the exact amount |
| `sort_index` | INTEGER NOT NULL | UI ordering |
| `created_at` / `updated_at` | INTEGER NOT NULL | Unix ms |

### `jar_distribution_rules`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `target_pocket_id` | TEXT NOT NULL FK | Regular pocket (not the Jar); `ON DELETE CASCADE` |
| `percent_bps` | INTEGER NOT NULL | Share in basis points (1–10000); all active rules must sum to **10000** |
| `sort_index` | INTEGER NOT NULL | Order for split calculation |
| `created_at` / `updated_at` | INTEGER NOT NULL | Unix ms |

**Advanced Jar** (migration `0006`, when `advanced_jar_enabled` is on): **`jar_advanced_assets`** (per-currency ceiling), **`jar_advanced_default_splits`**, **`jar_advanced_milestones`**, **`jar_advanced_milestone_splits`** — see `jarAdvanced` repository and `domain/jarAdvancedMath.ts`.

### `categories` (migration `0007`)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL UNIQUE (case-insensitive) | Display label |
| `color` | TEXT | Optional `#RRGGBB`; falls back to a hash-based color (`pocketChartColor`) when unset |
| `sort_index` | INTEGER NOT NULL | UI ordering |
| `created_at` / `updated_at` | INTEGER NOT NULL | Unix ms |

### `transactions`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `kind` | TEXT NOT NULL | `income` \| `expense` \| `transfer` |
| `title` | TEXT NOT NULL | User label |
| `amount_minor` | INTEGER NOT NULL | Non-zero minor units (**10⁻⁸** of one major unit); signed allowed for `income` / `expense`; **transfers** must be > 0 (see migration `0002_amount_minor_scale`) |
| `currency` | TEXT NOT NULL | Must match `asset_types.code` (enforced in repositories) |
| `occurred_at` | INTEGER NOT NULL | When the user says the event happened (Unix ms); shown in History |
| `created_at` | INTEGER NOT NULL | Record creation |
| `updated_at` | INTEGER NOT NULL | Last edit |

Pocket linkage (nullable by kind):

| Column | Type | When set |
|--------|------|----------|
| `pocket_id` | TEXT FK → pockets.id | `income` (credit), `expense` (debit) |
| `from_pocket_id` | TEXT FK → pockets.id | `transfer` (debit) |
| `to_pocket_id` | TEXT FK → pockets.id | `transfer` (credit) |
| `category_id` | TEXT FK → categories.id (`ON DELETE SET NULL`), nullable | Optional tag on `income` / `expense`; always null on `transfer` (migration `0007`) |

**Constraints (enforce in app or DB triggers):**

- `income`: `pocket_id` set; `from`/`to` null.
- `expense`: `pocket_id` set; `from`/`to` null.
- `transfer`: `from_pocket_id` and `to_pocket_id` set, **distinct**; `pocket_id` null; `from` ≠ `to`; `category_id` null.

### `user_settings` (key-value for future-proofing)

| Column | Type | Purpose |
|--------|------|---------|
| `key` | TEXT PK | e.g. `default_currency` |
| `value` | TEXT NOT NULL | JSON or plain string |

Known keys include **`default_currency`** (code string), **`jar_enabled`** (`1` / `0`), **`advanced_jar_enabled`** (`1` / `0`), and **`show_archived_pockets`** (`1` / `0`). When `jar_enabled` is turned off in the app, the Jar pocket is archived in the same write. Price APIs and last-fetched rates can live here or in dedicated tables later.

**Note:** Dark mode and accent palette are also cached in SecureStore for the vault gate (see **Appearance**); they are written from `ThemeContext` when you change Settings.

---

## Balance math (derived)

For each pocket `p` and currency `c`:

- **Income** into `p`: `+amount_minor` (signed `amount_minor` supported)
- **Expense** from `p`: `-amount_minor`
- **Transfer** from `p`: `-amount_minor` when `p = from_pocket_id` (`amount_minor` > 0)
- **Transfer** to `p`: `+amount_minor` when `p = to_pocket_id`

**Home “assets by currency”:** sum the above across all pockets, grouped by `currency`.

**Pocket screen:** same sum restricted to that pocket.

---

## Repository API (implemented surface)

- **Pockets:** `listPockets()` (non-archived only), `listRegularPockets()`, `getPocket()`, `getJarPocket()`, `createPocket()`, `renamePocket()`, `deletePocketIfUnused()`, `setJarPocketArchived()`.
- **Transactions:** `insertIncome` / `insertExpense` / `insertTransfer`, `updateTransaction`, `deleteTransaction`, `getTransaction`, `listTransactions({ pocketId?, limit, offset })` ordered by `occurred_at` DESC, `sumBalancesAll`, `sumBalancesForPocket`.
- **Settings:** `getSetting` / `setSetting`, `getDefaultCurrency` / `setDefaultCurrency`, `getJarEnabled` / `setJarEnabled` (also archives/unarchives the Jar), `getAdvancedJarEnabled` / `setAdvancedJarEnabled`, `getShowArchivedPockets` / `setShowArchivedPockets`.
- **Backup:** `exportEncryptedBackup`, `importEncryptedBackup` ([`src/security/backup.ts`](src/security/backup.ts)) — require unlocked session.
- **Asset types:** `listAssetTypes`, `createAssetType`, `updateAssetTypeName`, `deleteAssetType`, `currencyExists`, `requireRegisteredAssetCurrency`.
- **Categories:** `listCategories`, `createCategory`, `updateCategory`, `deleteCategory` (relies on the `ON DELETE SET NULL` FK — no usage guard, no “keep at least one” rule).
- **Jar:** `listJarDistributionRules`, `replaceJarDistributionRules`, `distributeJarCurrency`, `splitAmountByBps` (pure helper).
- **Jar advanced:** `listJarAdvancedSummaries`, `getJarAdvancedAssetDetail`, `saveJarAdvancedAsset`, `deleteJarAdvancedAsset`, `getJarAdvancedDistributeConfig`, `resolveAdvancedEffectiveBps`, etc.
- **Report:** `getReportRows({ months, scope, currencies? })` ([`src/db/repositories/report.ts`](src/db/repositories/report.ts)): income/expense sums per month, currency, kind and category, as BigInt.
- **Statistics:** `getBalanceTimeline`, `downsampleTimeline`, `getEarliestOccurredAt` (for the balance chart and time-range defaults), `scopeBalanceDeltaSql` (a row's balance change per pocket scope). **Monthly stats:** `getMonthlyFlows` (month × kind × category × pocket sums), `getMonthBalanceDeltas` (for month-end balances), `getFirstActivityAt`.

---

## Folder structure (implementation target)

```text
src/
  security/
    constants.ts       # sizes, PBKDF2 iterations, SecureStore key names
    errors.ts            # typed errors
    encoding.ts          # hex + Base64 helpers
    random.ts            # CSPRNG via expo-crypto
    passwordPolicy.ts    # NFKC + minimum length
    kdf.ts               # PBKDF2 → KEK, zeroize helper
    wrapDek.ts           # AES-GCM wrap/unwrap DEK with KEK
    backupFormat.ts      # `.tarcak` JSON payload v1
    backupCrypto.ts      # backup-password AES-GCM
    backup.ts            # export / import (reads encrypted file directly; legacy rekey recovery)
    backupImportMeta.ts  # pending restore metadata (SecureStore → DB on first unlock)
    keystore.ts          # expo-secure-store accessors (+ vault snapshot for backup)
    vault.ts             # create / unlock / change password
    session.ts           # in-memory DEK + AppState listener
    lockdown.ts          # close DB + clear session
    index.ts             # public exports (backup imported ad hoc from Settings)
  theme/
    palette.ts           # AppColors type
    colorThemes.ts       # six accent families (light + dark)
    appearanceCache.ts   # SecureStore mirror for vault gate
    ThemeContext.tsx
    fonts.ts
  constants/
    donations.ts         # BTC / XMR support addresses
  db/
    sqlcipher.ts         # build PRAGMA key SQL from raw DEK
    client.ts            # PRAGMA key, foreign_keys=ON, runPendingMigrations, open/close
    migrations/
      types.ts
      runner.ts
      0001_initial.ts
      0002_amount_minor_scale.ts
      0003_asset_types.ts
      0004_jar.ts
      0005_pockets_archived.ts
      0006_jar_advanced.ts
      0007_categories.ts
      0008_asset_display_decimals.ts
      index.ts           # re-exports
    repositories/
      pockets.ts
      transactions.ts
      settings.ts
      assetTypes.ts
      categories.ts
      jar.ts
      jarAdvanced.ts
      statistics.ts
      report.ts            # grouped sums for the CSV report export
  domain/
    types.ts
    jarAdvancedMath.ts       # milestone / ceiling BPS resolution
    jarAdvancedChartModel.ts # Balance Chart layout + effective % sampling
    jarAdvancedEditorTypes.ts
    jarAdvancedEditorSave.ts
    monthlyReport.ts         # CSV report: month ranges, exact amount text, CSV cells (pure)
  stores/
    ledgerStore.ts       # zustand: pockets + home balances refresh
  components/
    ModalSelectField.tsx   # dropdown picker; optional multiSelect (tap toggles, stays open); chip trigger
    MonthlyBarsChart.tsx   # income/expense bars per month (Statistics)
    RankedBarList.tsx      # breakdown rows with bars (Statistics month)
    SegmentedControl.tsx
    BalanceTrendCard.tsx   # collapsible balance-over-time line chart (Statistics)
    TimeRangePickerField.tsx # compact field + sheet: presets / month browser / custom range (Statistics)
    BackupPasswordModal.tsx
    BackupRestoredBanner.tsx
    DonationFooter.tsx
    jarAdvanced/
      JarAdvancedBalanceChart.tsx
      JarAdvancedSplitBar.tsx
      JarAdvancedSplitEditor.tsx
  navigation/
    types.ts
    LockVaultContext.ts
    MainNavigator.tsx
  screens/
    HomeScreen.tsx
    PocketsScreen.tsx
    PocketDetailScreen.tsx
    TransactionEditorScreen.tsx
    HistoryScreen.tsx
    StatisticsScreen.tsx
    StatisticsMonthScreen.tsx
    statistics/            # shared selection, chips, labels for the two Statistics screens
    ReportExportScreen.tsx
    SettingsScreen.tsx
    AssetTypesScreen.tsx
    CategoriesScreen.tsx
    JarScreen.tsx
    JarSplitScreen.tsx
    JarAdvancedHub.tsx
    JarAdvancedAssetEditor.tsx
  utils/
    amountMinor.ts         # parse (comma or point decimals) / exact and rounded format
    formatMinor.ts         # display rounding per asset (display_decimals or automatic)
    formatOccurredAt.ts
    pocketChartColors.ts   # stable per-pocket chart colors (theme-aware)
    reportFile.ts          # write/purge the report CSV in the cache
AppBoot.tsx              # vault gate (themed via appearanceCache) + SafeAreaProvider + MainNavigator when unlocked
scripts/
  jar-advanced-chart-selftest.mjs  # manual QA checklist (`npm run test:jar`)
  security-scan.mjs
```

Keep **SQL strings and migrations** out of React components.

---

## Roadmap alignment

| Your feature | Where it lives |
|--------------|----------------|
| Multi-currency pockets | `transactions` rows + balance aggregation |
| Transfers between pockets | `kind = transfer` + from/to FKs |
| Income / expense + title | `kind` + `title` |
| Edit + history | `updateTransaction`, `listTransactions` |
| Conducted date in UI | `occurred_at` stored + shown in History / pocket detail / editor (edit date: not yet) |
| Filter history by pocket | `listTransactions({ pocketId })` |
| History filters (type / asset / pocket / category) | Collapsible panel, tap-to-toggle multi-select (no hidden long-press); Asset/Pocket/Category options from full catalogs, not the loaded batch |
| History Income + Jar | Income filter includes transfers **to** the Jar pocket |
| Appearance / themes | `colorThemes.ts` + `ThemeContext` + `appearanceCache` on vault gate |
| Encrypted backup | `backup.ts` → `.tarcak` file; separate backup password |
| Advanced Jar Balance Chart | `jarAdvancedChartModel` + `JarAdvancedBalanceChart` visual editor |
| Statistics by month | `monthlyStats` domain + repository, `StatisticsScreen` (bars, month list), `StatisticsMonthScreen` (tiles, average, month-end balance, breakdown, History drill-down) |
| Statistics balance chart | `BalanceTrendCard` (`react-native-gifted-charts`), open by default and collapsible; bounded negative-range scaling so the chart can't stretch unboundedly |
| Statistics time range | `TimeRangePickerField` — quick presets, month browser (any past year), manual custom range |
| Chart value readout | Fixed row above the chart instead of a floating per-touch tooltip (avoids Android ScrollView clipping of absolutely-positioned overflow content) |
| Per-category income/expense breakdown | `buildBreakdown` + `RankedBarList` on the month screen, by category or pocket |
| Asset type catalog | `asset_types` + `assetTypes` repository + Settings / editor dropdowns |
| Category catalog | `categories` + `categories` repository + Settings / transaction editor / History / Statistics |
| Jar pool & split distribute | `is_jar` pocket, `jar_distribution_rules`, `jar` repository, Jar / Jar split screens |
| Advanced Jar | `0006` tables + `jarAdvanced` repository + hub / per-asset editor; optional vs basic split |
| Jar off → archive pocket | `user_settings.jar_enabled` + `pockets.archived` + `setJarEnabled` |
| Encrypted storage | `db/client.ts` + SQLCipher (or equivalent) |
| Password unlock | `security/*` + lock on background |
| Default asset + API prices | `user_settings.default_currency` + optional FX tables later |

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Expo dev server |
| `npm run start:lan` | Dev server on LAN (physical device on same Wi‑Fi) |
| `npm run start:localhost` | Dev server on `127.0.0.1` (often needs USB + `adb reverse`) |
| `npm run android` / `ios` / `web` | Run native / web targets |
| `npm run typecheck` | Typecheck the whole project incl. `.tsx` (CI) |
| `npm run typecheck:src` | Typecheck `src/**/*.ts` only |
| `scripts/check.sh` | Local gate: full typecheck + static security patterns (offline, no `npm audit`); prints `OK` when green |
| `npm run test:jar` | Print Advanced Jar / Balance Chart manual QA checklist |
| `npm run security:scan` | `npm audit` + static secret-pattern gate |

**Git hooks (once per clone):** `git config core.hooksPath .githooks`. The pre-commit hook runs `scripts/check.sh --staged`; the commit-msg hook strips AI attribution lines.

**UI formatting:** Amounts show **spaced thousands** on the integer part (e.g. `1 000`, `54 333 234`) via `formatIntegerPartWithSpaces` in [`src/utils/amountMinor.ts`](src/utils/amountMinor.ts).

---


## License

MIT, see [LICENSE](LICENSE).
