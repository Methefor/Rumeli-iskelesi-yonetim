import { createHash } from "node:crypto";

export const LEGACY_FIELDS = [
  "id",
  "date",
  "cashier_id",
  "kasa",
  "shift",
  "rumeli_z1",
  "rumeli_z2",
  "balik_ekmek",
  "dondurma",
  "total_revenue",
  "individual_revenue",
  "kahve",
  "sicak_icecek",
  "soguk_icecek",
  "tatli",
  "meyvesuyu",
  "gida",
  "kahvalti",
  "salata",
  "dondurma_kategori",
  "borek_corek",
  "depo",
  "kategori_devri",
  "notlar",
  "created_at",
  "entry_time",
  "is_on_time",
];

export const FROZEN_TOTALS = {
  "2026-06": 505678150,
  "2026-07": 502684250,
  "2026-08": 595913374,
};

export function toKurus(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed))
    throw new Error(`Geçersiz para değeri: ${value}`);
  return Math.round(parsed * 100);
}

export function stableRows(rows) {
  return [...rows]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((row) =>
      Object.fromEntries(
        LEGACY_FIELDS.map((field) => [field, row[field] ?? null]),
      ),
    );
}

export function fingerprintRows(rows) {
  return createHash("sha256")
    .update(JSON.stringify(stableRows(rows)))
    .digest("hex");
}

export function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("Kaynak rapor bulunamadı.");
  const ids = new Set();
  const composite = new Set();
  const allowedKasa = new Set([
    "ana_kasa",
    "iki_kasa",
    "cafetarya",
    "restoran",
  ]);
  const allowedShift = new Set(["sabah", "aksam"]);
  const moneyFields = LEGACY_FIELDS.filter(
    (field) =>
      ![
        "id",
        "date",
        "cashier_id",
        "kasa",
        "shift",
        "notlar",
        "created_at",
        "entry_time",
        "is_on_time",
      ].includes(field),
  );
  for (const row of rows) {
    if (!row.id || !row.date || !row.cashier_id)
      throw new Error("Kimlik/tarih/kasiyer alanı eksik.");
    if (ids.has(row.id)) throw new Error(`Mükerrer legacy id: ${row.id}`);
    ids.add(row.id);
    if (!allowedKasa.has(row.kasa))
      throw new Error(`Bilinmeyen kasa: ${row.kasa}`);
    if (!allowedShift.has(row.shift))
      throw new Error(`Bilinmeyen vardiya: ${row.shift}`);
    const key = `${row.date}|${row.shift}|${row.kasa}`;
    if (composite.has(key))
      throw new Error(`Mükerrer tarih/vardiya/kasa: ${key}`);
    composite.add(key);
    for (const field of moneyFields) {
      if (toKurus(row[field]) < 0)
        throw new Error(`Negatif değer: ${row.id}/${field}`);
    }
  }
  return true;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + toKurus(row[field]), 0);
}

export function auditLegacyRows(rows, knownCashierIds = []) {
  validateRows(rows);
  const known = new Set(knownCashierIds);
  const zRows = rows.filter((row) => row.shift === "aksam");
  const months = {};
  for (const month of Object.keys(FROZEN_TOTALS)) {
    const selected = zRows.filter((row) => row.date.startsWith(month));
    const current =
      sum(selected, "rumeli_z1") +
      sum(selected, "rumeli_z2") +
      sum(selected, "balik_ekmek") +
      sum(selected, "dondurma");
    months[month] = {
      rows: selected.length,
      currentKurus: current,
      frozenKurus: FROZEN_TOTALS[month],
      differenceKurus: current - FROZEN_TOTALS[month],
    };
  }
  const formulaMismatch = rows.filter(
    (row) =>
      toKurus(row.total_revenue) !==
      toKurus(row.rumeli_z1) +
        toKurus(row.rumeli_z2) +
        toKurus(row.balik_ekmek) +
        toKurus(row.dondurma),
  );
  return {
    sourceRows: rows.length,
    firstDate: [...rows].sort((a, b) => a.date.localeCompare(b.date))[0].date,
    lastDate: [...rows].sort((a, b) => b.date.localeCompare(a.date))[0].date,
    fingerprint: fingerprintRows(rows),
    xRows: rows.length - zRows.length,
    zRows: zRows.length,
    rumeliReports: rows.length,
    balikReports: zRows.filter((row) => toKurus(row.balik_ekmek) > 0).length,
    dondurmaReports: zRows.filter((row) => toKurus(row.dondurma) > 0).length,
    formulaMismatchRows: formulaMismatch.length,
    unknownCashierRows:
      known.size === 0
        ? null
        : rows.filter((row) => !known.has(row.cashier_id)).length,
    months,
  };
}

export function publicAuditReport(audit) {
  return {
    ...audit,
    cashierNames: "not read",
    legacyPins: "not read",
    notes: "not included in the report",
  };
}
