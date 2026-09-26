# Owner input checklist (Gate 3 = INPUT REQUIRED)

Tick each item, put the answer in the matching file under `operating-data/real/`
(templates: `operating-data/owner-input/*.template.csv`), set
`approval_status` to `approved` only after you checked the value.
Anything you do not know stays out: nothing is invented for you.

## A. Approve what the legacy app already shows (edit approval_status, no new data)

- [x] Categories: the 10 categories (Gıda, Kahvaltı, Kahve, Meyve Suyu, Sıcak İçecek, Soğuk İçecek, Salata, Tatlı, Dondurma, Börek & Çörek) are correct for V4. Owner approved 2026-09-26. (`real/sales_categories.csv`)
- [x] Rumeli reports all 10 categories. Owner approved 2026-09-26. (`real/category_branches.csv`)
- [x] Rumeli has two registers: Ana Kasa and 2. Kasa. Owner approved 2026-09-26. (`real/registers.csv`)
- [x] Rumeli shifts: Sabah 09:00–17:30 (report deadline 17:30) and Akşam 16:00–01:00 (deadline 01:00 the next day). Owner approved 2026-09-26. (`real/shift_definitions.csv`)
- [x] Legacy `sabah`/`aksam` map to V4 `morning`/`evening`. Owner approved 2026-09-26.

## B. Decisions only the owner can make

- [x] Balık Ekmek (separate branch `balik_ekmek`): one S900 register; one daily shift 14:00–00:00 (report cutoff 00:00 next day); categories Balık Ekmek and Soğuk İçecek (more may be added later, none invented). Owner approved 2026-09-26.
- [x] Legacy Rumeli evening-report revenue mapping: `balik_ekmek` revenue → branch `balik_ekmek`; `dondurma` revenue → branch `iskele_dondurma`. Owner approved 2026-09-26 (decision only; the Stage 4 adapter is not built).
- [x] İskele Dondurma currently has one S900 computer/register. Pavo is planned but not active yet. Owner statement 2026-09-26.
- [x] İskele Dondurma has one seasonal shift: summer 16:00–00:00; cold season 14:00–22:00. Cold-season shift is currently active; cutoffs equal shift end. Owner statement 2026-09-26.
- [x] İskele Dondurma reports exactly two categories: Dondurma and Su (`su`). Owner correction 2026-09-26; it **supersedes** the earlier approval of Dondurma + Sıcak İçecek + Soğuk İçecek. The two obsolete mappings are removed through `real/category_branch_removals.csv`; the global Sıcak/Soğuk İçecek categories stay (Rumeli and Balık Ekmek use them). Categories may be edited or expanded later.
- [ ] Pavo transition (future, NOT active, not loaded): confirm the activation details/date; then deactivate S900 and activate Pavo without rewriting history.
- [x] Reconciliation tolerance: 2% warning / 5% error for all three branches. Owner approved 2026-09-26.
- [x] Waste reasons: son kullanma tarihi geçmiş, hasarlı, dökülme, kalite sorunu, ikram/numune, diğer. Owner approved 2026-09-26.

## C. Catalogue (nothing exists yet)

- [ ] Product list per branch: stable code (UPPER CASE), name, unit (adet, kg, g, lt, ml, paket, kutu, porsiyon), whole units only or decimals allowed, active or not. (`inventory_items`)
- [ ] Which sales category each product is sold under. (`product_categories`)
- [ ] Opening stock per product from a physical count, with the count date. (`opening_stock`)
- [ ] Unit cost per product with the date it became valid; later changes are new rows. (`item_costs`)

## D. After you return the files

Operator runs the dry run, reads the report, then applies. The daily-operation
rehearsal is re-run on the real catalogue and you approve the catalogue and
operating rules (Gate 3).
