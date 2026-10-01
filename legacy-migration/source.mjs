import fs from "node:fs";
import { LEGACY_FIELDS } from "./lib.mjs";

function legacyPublicConfig() {
  if (process.env.LEGACY_SUPABASE_URL && process.env.LEGACY_SUPABASE_ANON_KEY) {
    return {
      url: process.env.LEGACY_SUPABASE_URL,
      key: process.env.LEGACY_SUPABASE_ANON_KEY,
    };
  }
  const source = fs.readFileSync(
    new URL("../js/supabase-client.js", import.meta.url),
    "utf8",
  );
  const url = source.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
  const key = source.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
  if (!url || !key)
    throw new Error("Legacy public client configuration is unavailable.");
  return { url, key };
}

async function request(path) {
  const { url, key } = legacyPublicConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `Legacy read failed (${response.status}): ${text.slice(0, 200)}`,
    );
  return JSON.parse(text);
}

export async function readLegacySnapshot() {
  const rows = await request(
    `daily_reports?select=${LEGACY_FIELDS.join(",")}&order=date.asc&limit=1000`,
  );
  const cashiers = await request("cashiers?select=id&limit=1000");
  return { rows, cashierIds: cashiers.map((cashier) => cashier.id) };
}
