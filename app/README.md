# Rumeli Operations V4 (2027)

New React + TypeScript + Vite frontend for Rumeli İskelesi / İskele
Dondurma, built alongside the legacy static-HTML app at the repo root.
**The legacy app is untouched and still in production** — this directory
is additive only. See `../CURRENT_STATE.md`, `../DECISIONS.md` and
`../BACKLOG.md` at the repo root for the full picture.

## Stack

React 19, TypeScript (strict), Vite, React Router 7, Supabase JS,
Vitest + Testing Library, ESLint + Prettier. No CSS framework — plain CSS
Modules over a token system (`src/styles/tokens.css`).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Scripts

| Script                 | Purpose                            |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | Start the Vite dev server          |
| `npm run build`        | Type-check + production build      |
| `npm run preview`      | Preview a production build locally |
| `npm run lint`         | ESLint                             |
| `npm run format`       | Prettier — write                   |
| `npm run format:check` | Prettier — check only              |
| `npm run typecheck`    | `tsc -b`, no emit                  |
| `npm test`             | Run the Vitest suite once          |
| `npm run test:watch`   | Vitest in watch mode               |

## Structure

```
src/
  app/            router, layouts (employee/manager), app-wide providers
  components/ui/  design-system primitives (Button, CurrencyInput, ...)
  components/     charts, forms, navigation (feature-agnostic UI)
  features/       one folder per product area (auth, branches, shifts, ...)
  domain/         pure business logic — revenue, scoring, reconciliation,
                  badges, shifts. No Supabase calls, no React, unit-tested.
  services/       supabase/ — the ONLY place a Supabase client is created
  hooks/ types/ utils/
```

Business calculations live in `domain/`, never duplicated in a component.
Feature code talks to Supabase only through `services/supabase`.

## Auth status

Not implemented yet. There is no login wired to Supabase in this phase —
see `src/features/auth/README.md`.
