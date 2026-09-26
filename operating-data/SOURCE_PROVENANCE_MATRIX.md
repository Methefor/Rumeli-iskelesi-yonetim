# Source / provenance matrix (as of 2026-09-26)

Classes: `confirmed` (verified by the running app or an explicit business
decision) · `legacy_observed` (seen in legacy code/data; approval is tracked
separately) · `demo_only` (synthetic) · `unknown` (owner input needed).
"In DB" = what a fresh local `db reset` (migrations 001-017) contains.

| Data | Value(s) | Class | Evidence | In DB | Loaded as real? |
|---|---|---|---|---|---|
| Branches | Rumeli İskelesi, İskele Dondurma, Balık Ekmek | **confirmed** | Names carry the frozen 2026 per-branch management totals (BACKLOG.md); legacy admin dashboard; migration 003 | seeded | yes (`real/branches.csv`, unchanged) |
| Registers, Rumeli | `ana_kasa` "Ana Kasa", `iki_kasa` "2. Kasa" | legacy_observed / approved | `entry.html` (1. Kasa / 2. Kasa), `js/supabase-client.js` `register_name`; owner approval 2026-09-26 | none | yes |
| Register, İskele Dondurma | `s900` "S900" (current single computer); Pavo planned | confirmed / approved | owner statement 2026-09-26 | none | S900 yes; Pavo not loaded until transition |
| Register, Balık Ekmek | `s900` "S900" (single S900 POS computer) | confirmed / approved | owner statement 2026-09-26 | none | yes |
| Shifts, Rumeli | sabah 09:00–17:30 (report deadline 17:30); akşam 16:00–01:00 (deadline 01:00, next day) | legacy_observed / approved | `entry.html` shift labels; `isOnTime` rule in `js/supabase-client.js`; owner approval 2026-09-26 | **009 seeded 08:00–16:00 / 16:00–23:59, cutoff 16:30 / 01:00 (different)** | yes; approved values replace seed when loaded |
| Shifts, İskele Dondurma | summer 16:00–00:00; cold season 14:00–22:00; one shift per day | confirmed / approved | owner statement 2026-09-26 | generic morning/evening seed | yes; generic pair disabled, winter active, summer prepared inactive |
| Shift, Balık Ekmek | `daily` "Tek vardiya" 14:00–00:00, cutoff 00:00 next day, active | confirmed / approved | owner statement 2026-09-26 | none | yes |
| Sales categories | Gıda, Kahvaltı, Kahve, Meyve Suyu, Sıcak İçecek, Soğuk İçecek, Salata, Tatlı, Dondurma, Börek & Çörek | legacy_observed / approved | 10 fields in `entry.html`; owner approval 2026-09-26 | seeded (009) | yes |
| Category → branch (Rumeli: all 10) | | legacy_observed / approved | Rumeli cashier form shows all 10; owner approval 2026-09-26 | 9 seeded (Dondurma not) | yes |
| Category → branch (İskele Dondurma: Dondurma, Sıcak İçecek, Soğuk İçecek) | 3 mappings | confirmed / approved | owner approval 2026-09-26 (`real/category_branches.csv`) | seeded by 009 (same three) | yes; provenance changes from unknown/pending to confirmed/approved |
| Category `balik_ekmek` (global) | Balık Ekmek | confirmed / approved | owner approval 2026-09-26 | none | yes |
| Category → branch (Balık Ekmek: `balik_ekmek`, `soguk_icecek`) | 2 mappings; more may be added later | confirmed / approved | owner approval 2026-09-26 | none | yes |
| Legacy revenue fields → branches | Rumeli evening report `balik_ekmek` → branch `balik_ekmek`; `dondurma` → branch `iskele_dondurma` | confirmed / approved (mapping decision) | owner statement 2026-09-26 | — | decision recorded for the future Stage 4 adapter; no adapter built |
| Inventory items (codes, names, units, decimals) | — | unknown | no product data exists anywhere in the repo or legacy app | none | no |
| Product → category mapping | — | unknown | | none | no |
| Opening stock | — | unknown | | none | no |
| Costs + effective dates | — | unknown | | none | no |
| Waste reasons | Son kullanma tarihi geçmiş, Hasarlı, Dökülme, Kalite sorunu, İkram/numune, Diğer (`expired`, `damaged`, `spilled`, `quality`, `sample`, `other`) | confirmed / approved | owner approval 2026-09-26; codes fixed by migration 012 | codes constrained; labels stored in provenance | yes |
| Reconciliation thresholds | 2% warning / 5% error for all three branches | confirmed / approved | owner approval 2026-09-26 | Rumeli and İskele Dondurma seeded; Balık Ekmek absent | yes; approved values loaded for all branches |
| Test catalogue | TEST-A01 (adet, whole), TEST-B01 (kg, decimal), 2 TEST categories, costs, opening stock | demo_only | `test-only/` | only if `--dataset test-only` was loaded | never as real |
| Demo store (app) | "Demo …" people, "Örnek Ürün A…" | demo_only | `app/src/services/demo/store.ts` | not in DB | not a source of truth |

Migrations 001-016 are immutable; wrong or unproven seeds are not edited.
Migration 017 records their classification in `operating_data_provenance`
(without changing any value) so the UI can label them.
