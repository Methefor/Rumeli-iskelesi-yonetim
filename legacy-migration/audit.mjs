import { auditLegacyRows, publicAuditReport } from "./lib.mjs";
import { readLegacySnapshot } from "./source.mjs";

const { rows, cashierIds } = await readLegacySnapshot();
console.log(
  JSON.stringify(publicAuditReport(auditLegacyRows(rows, cashierIds)), null, 2),
);
