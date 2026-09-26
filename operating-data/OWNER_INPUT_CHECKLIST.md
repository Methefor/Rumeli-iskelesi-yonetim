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

- [ ] Balık Ekmek is already one of the three confirmed branches. Define its registers, shifts and categories, and confirm whether the legacy Rumeli evening Z-report `balik_ekmek` revenue field belongs to this branch or remains part of Rumeli reporting.
- [ ] İskele Dondurma: which categories does it report? Its registers? Its shift times and report deadlines?
- [ ] Reconciliation tolerance per branch (warning % and error %). The current 2 / 5 is a generic seed, not a decision.
- [ ] Waste reasons the business wants. The database supports only: expired, damaged, spilled, quality, sample, other. Ask for a change if these are wrong; do not invent codes.

## C. Catalogue (nothing exists yet)

- [ ] Product list per branch: stable code (UPPER CASE), name, unit (adet, kg, g, lt, ml, paket, kutu, porsiyon), whole units only or decimals allowed, active or not. (`inventory_items`)
- [ ] Which sales category each product is sold under. (`product_categories`)
- [ ] Opening stock per product from a physical count, with the count date. (`opening_stock`)
- [ ] Unit cost per product with the date it became valid; later changes are new rows. (`item_costs`)

## D. After you return the files

Operator runs the dry run, reads the report, then applies. The daily-operation
rehearsal is re-run on the real catalogue and you approve the catalogue and
operating rules (Gate 3).
