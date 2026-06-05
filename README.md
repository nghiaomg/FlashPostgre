# FlashPostgre

A minimal PostgreSQL GUI client — think "MongoDB Compass, but for Postgres" — built with **Electron + TypeScript + React + Radix UI Themes**, using `electron-store` for persistent config and `pg` for the database driver.

Designed as a **daily driver for backend developers**: connection URL support, environment grouping, snippets, EXPLAIN, inline cell editing with transactional batch UPDATE, CSV/JSON export, and SQL formatting.

## Features

### Connections
- **PostgreSQL URL mode** — paste `postgresql://user:pass@host:5432/db?sslmode=require` and the form is auto-filled (or the other way around). Press the **Copy URL** button to grab the connection string with password.
- **Environment tags** — `local` / `dev` / `staging` / `prod` / `custom` (with custom label + color). Connections in the sidebar are grouped by environment with a color dot.
- **Test connection** before saving.
- **Persistent profiles** via `electron-store` (lives at the OS-standard userData path).

### Schema explorer
- Browse schemas, tables and views (lazy-loaded on expand).
- **Auto-loads public schema** — immediately loads the tables list for the `public` schema upon connection.
- **Fast Search** — dynamic quick filter input at the top of the Sidebar to filter tables/schemas, automatically expanding the matching parent folders.
- Tables marked as VIEW get a distinct icon.
- Click a table → opens a Data tab.

### Columns & Indexes
- **Tabular columns view** — displays columns in a clean, structured table (Name, Type, Nullable, Default) instead of raw text.
- **Row-level Copy** — copy individual column names with one click (turns into a green checkmark on success).
- **Copy Struct** — copy the full definition structure of all columns.
- **Copy Names** — copy all column names as a comma-separated list (great for quickly writing `SELECT` queries).

### Query editor
- Multi-line contentEditable editor with `⌘/Ctrl + Enter` to run.
- **Format SQL** with one click (`⌘/Ctrl + Shift + F`) — Postgres-aware via `sql-formatter`.
- **EXPLAIN** as a separate tab next to the result.
- **History** dropdown (last 100 queries, persisted).
- **Snippets** panel on the right: organized by folder, with search. Built-in starter snippets (top tables by size, active queries, locks, kill query, EXPLAIN wrapper). Click to insert into the editor. Save the current query as a snippet with one click.

### Data explorer
- Inline cell editing — **double-click a cell to edit**. Press `Enter` to commit, `Esc` to cancel.
- **Batch UPDATE with transaction**: edits are staged, and when you click **Apply changes** you see the full SQL preview (wrapped in `BEGIN; … COMMIT;`). The IPC runs everything in a single transaction; any error rolls everything back.
- **Primary key awareness**: tables without a PK disable inline editing (warning callout). PK columns are tagged and cannot be edited (to keep the WHERE clause stable).
- **Click column headers to sort** (ASC / DESC / off). The first PK is a sensible default but you can override.
- **Instant Search on All Columns** — search bar automatically scans all columns using a case-insensitive `ILIKE` pattern with a 400ms debounce.
- **Server-side filter** with a raw `WHERE` clause input.
- **Pagination** with adjustable page size (25 / 50 / 100 / 200 / 500 / 1000).
- **CSV / JSON export** for the current page.

### Output
- **Copy as TSV** (one click) and **Download CSV / JSON** for query results.
- Status bar shows connection name + environment, tab count, snippet count.

### Style & Layout
- Radix UI Themes: `gray` accent, `slate` gray scale, `small` radius, **light by default**.
- **Light/dark toggle** — theme state is synchronized globally via `ThemeContext` and persisted in `electron-store`. The native window background color follows the theme to prevent flashing on launch.
- **Fixed Statusbar** — statusbar is pinned strictly to the bottom (footer) without layout shifting.
- No `cn()` utility — only Radix props and a single hand-written `global.css` for layout.
- **Fully custom title bar**:
  - macOS uses the OS-managed traffic lights (`titleBarStyle: 'hiddenInset'`) with the rest of the bar custom.
  - Windows / Linux get a frameless window with **custom minimize / maximize / close buttons** in the top-right corner (close button turns red on hover, VSCode-style).
  - The whole title bar is draggable (including double-click to toggle maximize); the action buttons opt out via `-webkit-app-region: no-drag`.

## Tech stack

| Layer            | Library                           |
| ---------------- | --------------------------------- |
| Shell            | Electron 33                       |
| Renderer         | React 18 + Vite 6                 |
| UI kit           | @radix-ui/themes 3 + @radix-ui/react-icons |
| Language         | TypeScript 5                      |
| DB driver        | pg 8                              |
| Persistent store | electron-store 8                  |
| SQL formatter    | sql-formatter 15 (lazy-loaded)    |

## Project layout

```
FlashPostgre/
├── electron/
│   ├── main.ts              # BrowserWindow + lifecycle
│   ├── preload.ts           # contextBridge → window.flashpostgre
│   ├── db/pool.ts           # pg Pool manager
│   └── ipc/
│       ├── connection.ts    # test / connect / disconnect
│       ├── query.ts         # run / explain / runBatch / transaction
│       ├── schema.ts        # databases / schemas / tables / columns / indexes / primaryKeys / preview / count
│       └── store.ts         # electron-store proxy + default snippets
├── src/
│   ├── App.tsx              # Top-level layout
│   ├── main.tsx             # React entry, mounts <Theme>
│   ├── theme.ts             # Radix theme props
│   ├── styles/global.css    # Layout & component styles layered on Radix
│   ├── types/               # Shared types (incl. Environment, Snippet, PendingEdit)
│   ├── lib/
│   │   ├── store.ts             # Renderer-side store wrapper
│   │   ├── postgresUrl.ts       # URL ↔ form parser/formatter
│   │   ├── sqlFormat.ts         # sql-formatter wrapper (lazy)
│   │   ├── sqlBuilders.ts       # Safe UPDATE statement builder
│   │   └── exporters.ts         # CSV / JSON / download helpers
│   ├── hooks/
│   │   ├── useConnections.ts
│   │   ├── useTabs.ts
│   │   └── useSnippets.ts
│   └── components/
│       ├── Titlebar.tsx
│       ├── Sidebar.tsx
│       ├── ConnectionList.tsx     # env grouping + filter
│       ├── SidebarTree.tsx
│       ├── ConnectionDialog.tsx   # form/URL modes + env
│       ├── SnippetsPanel.tsx
│       ├── SnippetDialog.tsx
│       ├── TabBar.tsx
│       ├── QueryTab.tsx
│       ├── TableTab.tsx
│       ├── DataExplorer.tsx       # inline edit + sort/filter/paginate
│       ├── ResultView.tsx
│       ├── EmptyState.tsx
│       └── Statusbar.tsx
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server (Vite + Electron together)
npm run electron:dev

# OR run Vite only, then in a separate shell:
npm run dev
# and in another:
npx electron .
```

The first time you launch the app you'll land in the **New connection** dialog. Paste a Postgres URL, switch to **Form** to tweak, or just fill in the form. Save and the explorer tree will populate.

## Scripts

| Script                | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `npm run dev`         | Start Vite dev server for the renderer (port 5173)      |
| `npm run build`       | Type-check + production Vite build (renderer + main)    |
| `npm run electron:dev`| Build once, then launch Electron in dev mode            |
| `npm run lint`        | `tsc --noEmit` type-check                               |
| `npm run dist`        | Build the installer for the current platform            |
| `npm run dist:win`    | Build the Windows NSIS installer + portable .exe        |
| `npm run dist:portable` | Build only the Windows portable .exe                  |
| `npm run dist:dir`    | Build an unpacked directory (no installer) for testing  |

## Building installers

The build pipeline is **electron-builder** with `electron-builder.yml` as the source of truth. To produce release artifacts on the current platform:

```bash
npm install
npm run dist:win        # produces release/FlashPostgre-0.1.0-x64.exe
                         # and       release/FlashPostgre-0.1.0-portable.exe
```

The Windows build produces two artifacts in `release/`:

| File                                  | Type        | Use case                                            |
| ------------------------------------- | ----------- | --------------------------------------------------- |
| `FlashPostgre-0.1.0-x64.exe`          | NSIS        | Standard installer (Start menu, desktop shortcut, uninstaller) |
| `FlashPostgre-0.1.0-portable.exe`     | Portable    | Single-file, runs without install, no admin needed  |

Both executables bundle:
- Electron 33 + Chromium runtime
- The compiled renderer + main process (in `app.asar`)
- `pg` with its native libpq bindings rebuilt for Electron
- `electron-store` (config persistence)
- 5 default snippets (top tables, active queries, kill query, EXPLAIN wrapper, locks)

### Code signing

The build is **unsigned by default** (no certificate). Windows SmartScreen will warn the first time users run the installer — they can click **More info → Run anyway**. For a clean experience, set the `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables to a code-signing certificate (`.pfx`), and electron-builder will sign both the installer and the portable exe automatically.

### App icon

Drop your icons into `build/`:
- `build/icon.ico` (256×256+, used by both .exe + NSIS)
- `build/icon.png` (512×512+, used by Linux)

electron-builder picks them up automatically — no config changes needed.

## Design notes

- **Security** — `contextIsolation: true`, `nodeIntegration: false`. The renderer never touches Node APIs directly; everything goes through the `window.flashpostgre` bridge defined in `preload.ts`.
- **Externalized deps** — `pg` and `electron-store` are external in the main bundle (rollup `external`), so they're resolved at runtime by Node, not bundled. This avoids native-binding headaches.
- **Identifier safety** — Schema/table/column names in generated SQL are double-quoted identifiers (with embedded `"` escaped). `ORDER BY` columns are validated against `/^[A-Za-z_][A-Za-z0-9_]*$/`.
- **Transactions** — The `query:transaction` IPC grabs a dedicated `pg.Client` from the pool, runs `BEGIN; … COMMIT;`, and rolls back on any failure. This is what powers safe batch UPDATE for inline edits.
- **Lazy `sql-formatter`** — The formatter library is dynamic-imported on first use, so it doesn't bloat the initial renderer bundle (Vite splits it into its own chunk).
- **No `cn()`** — Radix Themes ships its own prop-based styling (`size`, `variant`, `color`, `radius`). Only a single hand-written `global.css` lays out the workspace (tree rows, editor, result table, snippets panel, custom scrollbar). No Tailwind, no `classnames`.

## License

MIT
