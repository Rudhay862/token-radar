// Token Launch Radar — entry program (Node 22, standard library only).
//
// Reads the sealed snapshot (--input, default /input/snapshot.json), builds the
// ranked board with lib/model.ts, and writes the output directory
// ($MAKEFUN_OUTPUT_DIR, default "out"):
//   board.json            { as_of, floor_usd, rows } — 200 ranked rows
//   dashboard/data.js     window.BOARD = {...} — compact JSON, short keys
//   dashboard/            the static page, copied from the repo root
//   screenshots/          the three screenshots, copied from the repo root
//   dossier.json          buildDossier(out, { text_max_bytes: 65536 })
// Deterministic: two runs write byte-identical files (fixed key order, no
// timestamps, no randomness, output directory rebuilt from scratch each run).

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let input = "/input/snapshot.json";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--input" && args[i + 1]) input = args[++i];
}
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || "out");

const snap = JSON.parse(readFileSync(resolve(input), "utf8"));
const board = buildBoard(snap);

// Rebuild the output directory from scratch so stale files can never leak in.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "dashboard"), { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });

// board.json: the ranked board, pretty-printed for human readers.
writeFileSync(
  join(outDir, "board.json"),
  JSON.stringify(
    {
      as_of: board.as_of,
      floor_usd: board.floor_usd,
      model:
        "implied_value_usd = tvl_usd x peer multiple (median mcap_usd/tvl_usd " +
        "of live-token protocols in the same category, global median when " +
        "fewer than 3 peers) x growth factor (7d change clamped to " +
        "[-50,+100]%, scaled 0.925-1.15) x maturity factor (listed_at age, " +
        "1-1.06) x chain factor (chains spanned, 1-1.10)",
      rows: board.rows,
    },
    null,
    2,
  ) + "\n",
);

// dashboard/data.js: the same rows under short keys, compact JSON.
const data = {
  a: board.as_of,
  f: board.floor_usd,
  r: board.rows.map((r) => ({
    s: r.slug,
    n: r.name,
    c: r.category,
    h: r.chains,
    t: r.tvl_usd,
    g: r.change_7d,
    v: r.implied_value_usd,
    m: r.multiple,
    fg: r.f_growth,
    fm: r.f_maturity,
    fc: r.f_chain,
    d: r.listed_at,
    p: r.farm_steps,
    w: r.watchlist,
    x: r.extra_rule,
  })),
};
writeFileSync(
  join(outDir, "dashboard", "data.js"),
  "window.BOARD=" + JSON.stringify(data) + ";\n",
);

// dashboard/ and screenshots/ are copied in from the repository root.
cpSync(join(here, "dashboard"), join(outDir, "dashboard"), { recursive: true });
cpSync(join(here, "screenshots"), join(outDir, "screenshots"), {
  recursive: true,
});
const shotFiles = readdirSync(join(outDir, "screenshots")).filter((f) =>
  f.endsWith(".png"),
);
if (shotFiles.length !== 3) {
  throw new Error(`expected 3 screenshots, found ${shotFiles.length}`);
}
if (board.rows.length !== 200) {
  throw new Error(`expected 200 board rows, found ${board.rows.length}`);
}

// dossier.json: exactly what the scorer's copy of buildDossier writes.
writeFileSync(
  join(outDir, "dossier.json"),
  buildDossier(outDir, { text_max_bytes: 65536 }),
);

console.log(
  `token-radar: ${board.rows.length} rows ` +
    `(watchlist ${board.stats.watchlist}, strict below-floor ` +
    `${board.stats.strict_below_floor}, flagged extras ` +
    `${board.stats.extra_below_floor}), rank 1 ${board.rows[0].slug} ` +
    `$${board.rows[0].implied_value_usd.toLocaleString("en-US")}, wrote ${outDir}`,
);
