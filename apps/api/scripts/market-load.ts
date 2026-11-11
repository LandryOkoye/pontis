// Measures the market reads on a populated database and prints a table: p50, p95 and max per
// endpoint over repeated requests, plus EXPLAIN of the chart and directory queries. Populate the
// database first (registry sync, then `pnpm --filter @pontis/simulator start backfill`).
//
//   DATABASE_URL=... pnpm --filter @pontis/api exec tsx scripts/market-load.ts [requests]
//
// The chain is faked (the market reads do not touch it); this measures the API and the database.

import { createDb } from "@pontis/db";
import { keyFromSeed } from "@pontis/quote-engine";
import { sql } from "drizzle-orm";
import { buildApp } from "../src/app.ts";

const requests = Number(process.argv[2] ?? 200);
const { db, pool } = createDb(
  process.env.DATABASE_URL ?? "postgres://pontis:pontis@localhost:5432/pontis",
);
const app = buildApp({
  db,
  chainHeight: async () => 1,
  quotes: {
    chain: {
      getRoute: async () => ({
        executable: false,
        refusal: "no_relationship",
        terms: null,
        next_freeze_ms: null,
      }),
      isAllowed: async () => true,
      getInventory: async () => "0",
      getFeeBps: async () => 10,
      getRouteGuards: async () => {
        throw new Error("the load script never reaches the guards");
      },
      getPrice: async () => null,
    },
    key: keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1)),
    coreId: "core.testnet",
  },
  conversionChain: { isRegistered: async () => true },
  txVerifier: { getTransaction: async () => undefined },
});

const [first] = (
  await db.execute(sql`select representation_id as rep from asset_market_stats limit 1`)
).rows as { rep: string }[];
const rep = first?.rep ?? "tgold-a";

const urls: [string, string][] = [
  ["directory, default page", "/v1/assets"],
  ["directory, sorted by market cap", "/v1/assets?sort=marketCap&order=desc&data=simulated"],
  ["directory, search", "/v1/assets?q=gold"],
  ["market overview", "/v1/market/overview"],
  ["market movers", "/v1/market/movers"],
  ["price chart, 1h x 500", `/v1/assets/${rep}/charts/price?interval=1h`],
  [
    "price chart, 1d x 90 days",
    `/v1/assets/${rep}/charts/price?interval=1d&from=${new Date(Date.now() - 90 * 86_400_000).toISOString()}`,
  ],
  [
    "NAV chart, 4h x 7 days",
    `/v1/assets/${rep}/charts/nav?interval=4h&from=${new Date(Date.now() - 7 * 86_400_000).toISOString()}`,
  ],
  ["supply chart", `/v1/assets/${rep}/charts/supply?interval=1d`],
  ["asset activity", `/v1/assets/${rep}/activity`],
  ["search", "/v1/search?q=gold"],
  ["status", "/v1/status"],
];

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] as number;
console.log("| Endpoint | p50 ms | p95 ms | max ms |\n| --- | --- | --- | --- |");
let worst = 0;
for (const [label, url] of urls) {
  await app.inject({ method: "GET", url }); // warm up
  const times: number[] = [];
  for (let i = 0; i < requests; i++) {
    const t0 = performance.now();
    const res = await app.inject({ method: "GET", url });
    times.push(performance.now() - t0);
    if (res.statusCode !== 200) throw new Error(`${url} answered ${res.statusCode}: ${res.body}`);
  }
  times.sort((a, b) => a - b);
  worst = Math.max(worst, pct(times, 0.95));
  console.log(
    `| ${label} | ${pct(times, 0.5).toFixed(1)} | ${pct(times, 0.95).toFixed(1)} | ${(times[times.length - 1] as number).toFixed(1)} |`,
  );
}

const explain = async (label: string, query: ReturnType<typeof sql>) => {
  const rows = (await db.execute(sql`explain ${query}`)).rows as { "QUERY PLAN": string }[];
  console.log(`\nEXPLAIN ${label}\n${rows.map((r) => r["QUERY PLAN"]).join("\n")}`);
};
await explain(
  "candles (price chart)",
  sql`select * from candles where representation_id = ${rep} and interval = '1h' and bucket_start >= now() - interval '21 days' and bucket_start < now() order by bucket_start`,
);
await explain(
  "search",
  sql`select representation_id from asset_search where document ilike '%gold%'`,
);

console.log(`\nworst p95: ${worst.toFixed(1)} ms (target: under 200 ms)`);
await app.close();
await pool.end();
process.exit(worst < 200 ? 0 : 1);
