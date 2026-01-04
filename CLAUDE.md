# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
bun install

# Development
bun run dev          # Start all apps (web on http://localhost:3001)
bun run dev:web      # Start only web app

# Desktop (Tauri) - run from apps/web/
cd apps/web && bun run desktop:dev    # Dev mode
cd apps/web && bun run desktop:build  # Production build

# Build & Check
bun run build        # Build all apps
bun run check-types  # TypeScript type checking
bun run check        # Run Oxlint + Oxfmt
```

## Architecture

**Monorepo Structure (Turborepo + Bun workspaces)**

- `apps/web/` - React frontend with TanStack Router, buildable as Tauri desktop app
- `packages/env/` - Type-safe environment variables via `@t3-oss/env-core`
- `packages/config/` - Shared TypeScript config (`tsconfig.base.json`)

**Web App Stack**

- TanStack Router with file-based routing (`apps/web/src/routes/`)
- Route tree auto-generated to `routeTree.gen.ts`
- Path alias: `@/` maps to `apps/web/src/`
- shadcn/ui components in `components/ui/`
- Theme: next-themes with dark mode default

**Tauri Desktop**

- Rust backend in `apps/web/src-tauri/`
- Frontend served from Vite dev server (port 3001) in dev mode
