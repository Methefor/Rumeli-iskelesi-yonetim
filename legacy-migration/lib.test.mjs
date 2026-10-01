import test from "node:test";
import assert from "node:assert/strict";
import { auditLegacyRows, fingerprintRows, validateRows } from "./lib.mjs";

const base = {
  id: "00000000-0000-0000-0000-000000000011",
  date: "2026-08-01",
  cashier_id: "00000000-0000-0000-0000-000000000021",
  kasa: "ana_kasa",
  shift: "aksam",
  rumeli_z1: 100,
  rumeli_z2: 0,
  balik_ekmek: 20,
  dondurma: 30,
  total_revenue: 150,
  individual_revenue: 150,
  kahve: 40,
  sicak_icecek: 0,
  soguk_icecek: 10,
  tatli: 20,
  meyvesuyu: 0,
  gida: 30,
  kahvalti: 0,
  salata: 0,
  dondurma_kategori: 0,
  borek_corek: 0,
  depo: 0,
  kategori_devri: 0,
  notlar: "",
  created_at: "2026-08-01T20:00:00Z",
  entry_time: "2026-08-01T20:00:00Z",
  is_on_time: true,
};

test("validates supported legacy grain and produces deterministic fingerprint", () => {
  assert.equal(validateRows([base]), true);
  assert.equal(fingerprintRows([base]), fingerprintRows([{ ...base }]));
});

test("rejects duplicate date/shift/register and negative money", () => {
  assert.throws(
    () =>
      validateRows([
        base,
        { ...base, id: "00000000-0000-0000-0000-000000000012" },
      ]),
    /Mükerrer/,
  );
  assert.throws(() => validateRows([{ ...base, rumeli_z1: -1 }]), /Negatif/);
});

test("plans branch reports and never counts X as Z revenue", () => {
  const morning = {
    ...base,
    id: "00000000-0000-0000-0000-000000000012",
    shift: "sabah",
    balik_ekmek: 0,
    dondurma: 0,
    total_revenue: 25,
    rumeli_z1: 25,
  };
  const audit = auditLegacyRows([morning, base], [base.cashier_id]);
  assert.equal(audit.sourceRows, 2);
  assert.equal(audit.xRows, 1);
  assert.equal(audit.zRows, 1);
  assert.equal(audit.rumeliReports, 2);
  assert.equal(audit.balikReports, 1);
  assert.equal(audit.dondurmaReports, 1);
  assert.equal(audit.unknownCashierRows, 0);
});
