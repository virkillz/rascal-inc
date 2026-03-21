# Rascal Desktop App — Technical Plan

**Goal:** Package rascal-inc as a distributable desktop application (macOS first, Windows/Linux later) so users can install and run it without any CLI setup.

---

## Chosen Approach: Tauri v2 + Node.js Sidecar

### Why Tauri over Electron

| | Tauri | Electron |
|---|---|---|
| Binary size | ~5–15 MB | ~150–200 MB |
| WebView | OS native (WebKit/WebView2) | Bundled Chromium |
| Rust required | Minimal (thin shell only) | No |
| Node.js support | Sidecar process | Built-in |
| Auto-update | Built-in | Manual (electron-updater) |

Tauri's main trade-off is that it uses the OS webview, which means slight rendering differences across platforms. For an internal tool this is fine.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Tauri Shell (Rust — thin layer)                    │
│  - Window management                                │
│  - System tray                                      │
│  - Auto-updater                                     │
│  - Spawns & manages sidecar                         │
│                                                     │
│  ┌──────────────────┐    ┌───────────────────────┐  │
│  │  WebView         │    │  Node.js Sidecar      │  │
│  │  (React/Vite     │◄──►│  (Express + WS        │  │
│  │   built assets)  │    │   server, port 37421) │  │
│  └──────────────────┘    └───────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

The Express server runs as a **sidecar** — a separate bundled binary that Tauri spawns on startup and kills on exit. The WebView loads the built React app (as static files, no dev server) and communicates with the sidecar over `localhost:37421` (a fixed, non-standard port to avoid conflicts).

---

## What Changes

### 1. Port Strategy

Replace the current dynamic/default port with a fixed port `37421` for the packaged app. The frontend `api.ts` will resolve the base URL from `window.__RASCAL_API_URL__` (injected at startup) so it works in both dev and desktop modes.

```ts
// web/src/api.ts
const BASE = (window as any).__RASCAL_API_URL__ ?? 'http://localhost:3000';
```

### 2. SQLite Data Directory

Currently `data/` is relative to the working directory. In a packaged app this must point to the user's app data directory:

- macOS: `~/Library/Application Support/com.rascal-inc.app/`
- Windows: `%APPDATA%\rascal-inc\`
- Linux: `~/.local/share/rascal-inc/`

Tauri exposes this path at startup. It will be passed to the sidecar as an env var `RASCAL_DATA_DIR`.

Change in `server/src/db.ts`:
```ts
const dataDir = process.env.RASCAL_DATA_DIR ?? path.join(process.cwd(), 'data');
const DB_PATH = path.join(dataDir, 'rascal.db');
```

### 3. Node.js Sidecar Bundle

The Express server (`packages/server`) needs to be bundled into a single self-contained executable so Tauri can ship it without requiring Node.js to be installed on the user's machine.

**Tool: [pkg](https://github.com/yao-pkg/pkg) or [esbuild](https://esbuild.github.io/) + [sea (Node SEA)](https://nodejs.org/api/single-executable-applications.html)**

Recommended: **esbuild → Node SEA** (native, no third-party bundler for prod):
1. `esbuild` bundles all server TypeScript into a single `server.cjs`
2. Node SEA wraps it into a standalone binary per platform

This binary is placed in `src-tauri/binaries/` and declared as a sidecar in `tauri.conf.json`.

### 4. Tauri Shell (`src-tauri/`)

New package at the repo root alongside `packages/`:

```
src-tauri/
  Cargo.toml
  tauri.conf.json
  src/
    main.rs        # ~50 lines: spawn sidecar, create window
  binaries/
    rascal-server-aarch64-apple-darwin   # macOS ARM
    rascal-server-x86_64-apple-darwin    # macOS Intel
    rascal-server-x86_64-pc-windows-msvc.exe
```

`main.rs` responsibilities:
- Spawn the sidecar with `RASCAL_DATA_DIR` env var set
- Wait for the sidecar's HTTP server to be ready (poll `/api/health`)
- Open the main window pointing at the built React assets
- On close: kill the sidecar process

### 5. Vite Build for Desktop

The React build output goes into `src-tauri/dist/` instead of `packages/web/dist/`. One small change to `vite.config.ts`:

```ts
build: {
  outDir: process.env.TAURI_BUILD ? '../../src-tauri/dist' : 'dist'
}
```

API base URL injection happens via Vite's `define` or by writing a small `<script>` into `index.html` at build time.

### 6. Monorepo Scripts

New root-level scripts:

```json
"desktop:dev": "...",       // run dev server + tauri dev simultaneously
"desktop:build": "...",     // build web + bundle server + tauri build
"desktop:build:mac": "...", // macOS universal binary
"desktop:build:win": "..."  // Windows via cross-compilation or CI
```

---

## New Dependencies

| Package | Where | Purpose |
|---|---|---|
| `@tauri-apps/cli` | root devDep | Tauri build tooling |
| `@tauri-apps/api` | web devDep | JS bridge to Tauri (optional — only if native APIs needed) |
| `esbuild` | root devDep | Bundle server to single file |
| Rust toolchain | system | Required for Tauri compilation |

---

## File Changes Summary

| File | Change |
|---|---|
| `packages/server/src/db.ts` | Read data dir from `RASCAL_DATA_DIR` env var |
| `packages/server/src/index.ts` | Use fixed port `37421` when `NODE_ENV=desktop` |
| `packages/web/src/api.ts` | Read API base URL from `window.__RASCAL_API_URL__` |
| `packages/web/vite.config.ts` | Conditionally set `outDir` to `src-tauri/dist` |
| `src-tauri/` | New — Tauri shell (Rust, ~50 lines) |
| `scripts/build-server.sh` | New — esbuild + Node SEA bundling script |
| `package.json` (root) | Add `desktop:*` scripts |

---

## Build Pipeline

```
npm run desktop:build
  │
  ├── 1. tsc + vite build (web) → src-tauri/dist/
  │
  ├── 2. esbuild (server) → dist/server.cjs
  │        └── node --experimental-sea-config → binaries per platform
  │
  └── 3. tauri build
           └── compiles Rust shell + packages everything → .dmg / .msi / .AppImage
```

---

## Distribution

- **macOS**: `.dmg` with drag-to-Applications install. Sign & notarize with Apple Developer cert.
- **Windows**: `.msi` installer via NSIS (Tauri default). Sign with EV cert for SmartScreen.
- **Linux**: `.AppImage` (portable, no install needed).

Tauri's built-in updater (`tauri-plugin-updater`) can check a GitHub Releases endpoint for new versions and apply updates in the background.

---

## Implementation Phases

### Phase A — Foundation (prerequisite for everything)
- [ ] Add `RASCAL_DATA_DIR` support to `db.ts`
- [ ] Add `__RASCAL_API_URL__` injection to frontend
- [ ] Set up Rust toolchain + Tauri CLI
- [ ] Create minimal `src-tauri/` scaffold (window only, no sidecar)
- [ ] Verify React app loads correctly inside Tauri WebView

### Phase B — Sidecar Integration
- [ ] Write `scripts/build-server.sh` (esbuild + Node SEA)
- [ ] Wire sidecar into `main.rs` (spawn, health check, kill on exit)
- [ ] Verify full app flow (chat, agents, WebSocket) works end-to-end in desktop mode

### Phase C — Polish
- [ ] System tray icon with Show/Quit
- [ ] Auto-updater pointing to GitHub Releases
- [ ] Custom app icon set (1024×1024 PNG → Tauri generates all sizes)
- [ ] macOS: sign + notarize
- [ ] Windows: sign + NSIS customization

### Phase D — CI/CD
- [ ] GitHub Actions matrix build (macOS ARM, macOS Intel, Windows)
- [ ] Upload artifacts to GitHub Releases on tag push
- [ ] Updater manifest auto-generated in release workflow

---

## Open Questions

1. **`@mariozechner/pi-coding-agent` in SEA:** The agent SDK spawns child processes (Claude CLI). These need to be resolvable in the packaged environment. May need to bundle or vendor the CLI binary separately — requires testing.

2. **API keys:** Users need to provide their Anthropic API key. Currently this likely lives in `.env`. In the desktop app this should move to the OS keychain (`tauri-plugin-keychain`) or the settings DB table (already exists).

3. **Node.js SEA maturity:** Node SEA is stable in Node 21+ but has known issues with some native addons. If `better-sqlite3` (or whichever SQLite binding is used) causes problems, fallback is `pkg` or shipping a separate bundled Node.js runtime.

4. **First-time setup UX:** On first launch, the app should guide the user to enter their API key before anything works. This connects to the existing onboarding flow.
