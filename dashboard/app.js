// Token Launch Radar dashboard (app.js). Reads window.BOARD from data.js:
// {a: as-of date, f: floor, r: rows} with short row keys:
// s slug, n name, c category, h chains, t tvl, g change_7d, v implied value,
// m peer multiple, fg/fm/fc factors, d listed_at, p farm steps, w watchlist, x extra rule.
// Model (lib/model.ts): implied = TVL x peer multiple x growth x maturity x
// chains. URL states: ?shot=board (default), ?shot=detail&slug=X,
// ?shot=filtered (category Risk Curators preset).
const B = window.BOARD, rows = B.r;
const maxV = Math.max(...rows.map((r) => r.v));
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
const short = (v) => v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : money(v);
const pct = (g) => g === null ? "—" : (g > 0 ? "+" : "") + g.toFixed(1) + "%";
const cls = (g) => g === null ? "" : g >= 0 ? "up" : "dn";
$("asof").textContent = B.a;

let sortK = "rank", sortDir = 1;
const sortVal = {
  rank: (r, i) => i + 1, name: (r) => r.n.toLowerCase(), category: (r) => r.c || "",
  chains: (r) => r.h.length, tvl: (r) => r.t, chg: (r) => r.g ?? -1e9,
  value: (r) => r.v, mult: (r) => r.m,
};
function filtered() {
  const cat = $("fCat").value, ch = $("fChain").value;
  const minT = +$("fTvl").value || 0, q = $("fQ").value.trim().toLowerCase();
  const wl = $("fWl").checked;
  return rows.filter((r) =>
    (!cat || r.c === cat) && (!ch || r.h.includes(ch)) && r.t >= minT &&
    (!wl || r.w) && (!q || r.n.toLowerCase().includes(q) || r.s.includes(q)));
}
function render() {
  const list = filtered().slice().sort((a, b) => {
    const x = sortVal[sortK](a, rows.indexOf(a)), y = sortVal[sortK](b, rows.indexOf(b));
    return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
  });
  $("rows").innerHTML = list.map((r) => {
    const i = rows.indexOf(r);
    return `<tr data-slug="${esc(r.s)}"><td>${i + 1}</td><td><b>${esc(r.n)}</b>${r.w ? '<span class="badge">WATCHLIST</span>' : ""}${r.x ? ` <span class="flag">· flagged: ${esc(r.x)}</span>` : ""}<br><span class="flag">${esc(r.s)}</span></td><td>${esc(r.c || "—")}</td><td>${esc(r.h.slice(0, 2).join(", "))}${r.h.length > 2 ? " +" + (r.h.length - 2) : ""}</td><td class="num">${short(r.t)}</td><td class="num ${cls(r.g)}">${pct(r.g)}</td><td class="num"><b>${short(r.v)}</b><span class="bar"><i style="width:${Math.max(2, Math.round((r.v / maxV) * 100))}%"></i></span></td><td class="num">${r.m.toFixed(2)}×</td></tr>`;
  }).join("");
  $("count").textContent = `Showing ${list.length} of ${rows.length}`;
  document.querySelectorAll("#rows tr").forEach((tr) =>
    tr.addEventListener("click", () => showDetail(tr.dataset.slug)));
}
function showDetail(slug) {
  const r = rows.find((x) => x.s === slug), i = rows.indexOf(r);
  if (!r) return;
  $("detail").hidden = false;
  $("detail").innerHTML = `<button class="x" onclick="document.getElementById('detail').hidden=true">Close ✕</button>
    <h2>#${i + 1} — ${esc(r.n)}</h2>
    <div class="meta">${esc(r.c || "Uncategorised")} · ${esc(r.h.join(", "))} · listed ${esc(r.d || "unknown")} · slug ${esc(r.s)}${r.w ? ' · <span class="wl">★ on the watchlist</span>' : ""}${r.x ? ` · flagged: ${esc(r.x)}` : ""}</div>
    <div class="big">${money(r.v)} implied value</div>
    <div class="formula">TVL ${money(r.t)} × peer multiple ${r.m.toFixed(3)}× × growth ${r.fg.toFixed(3)} (7d ${pct(r.g)}) × maturity ${r.fm.toFixed(3)} × chains ${r.fc.toFixed(3)} = <b>${money(r.v)}</b>. Peer multiple = median market-cap/TVL of live-token ${esc(r.c || "DeFi")} protocols.</div>
    <h3>Farm plan — how to farm it</h3>
    <ol>${r.p.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <p class="note">${esc(r.n)} records no token in the snapshot (as of ${esc(B.a)}). Nothing here promises a token or an airdrop — the implied value is this entry's own claim about what a launch would be worth if the record stayed as it is.</p>`;
  $("detail").scrollIntoView({ block: "start" });
}
document.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
  const k = th.dataset.k;
  if (sortK === k) sortDir *= -1; else { sortK = k; sortDir = 1; }
  render();
}));
["fCat", "fChain", "fTvl", "fQ", "fWl"].forEach((id) =>
  $(id).addEventListener("input", render));
// Fill filter options from the data itself.
[...new Set(rows.map((r) => r.c).filter(Boolean))].sort().forEach((c) => {
  const o = document.createElement("option"); o.value = o.textContent = c; $("fCat").appendChild(o);
});
[...new Set(rows.flatMap((r) => r.h))].sort().forEach((c) => {
  const o = document.createElement("option"); o.value = o.textContent = c; $("fChain").appendChild(o);
});
$("fCat").insertAdjacentHTML("afterbegin", `<option value="">All categories</option>`);
$("fChain").insertAdjacentHTML("afterbegin", `<option value="">All chains</option>`);
$("fCat").value = ""; $("fChain").value = ""; // inserting "All" must also select it
// Screenshot states driven by ?shot=.
const q = new URLSearchParams(location.search);
if (q.get("shot") === "filtered") { $("fCat").value = "Risk Curators"; }
if (q.get("shot") === "detail" && q.get("slug")) { showDetail(q.get("slug")); }
render();
