// Token Launch Radar — ranking model (lib/model.ts).
//
// Reads only the sealed DefiLlama snapshot. No network, no external data, and no
// hardcoded list of protocol names: every figure below is derived from the
// snapshot's own fields (tvl_usd, change_7d, listed_at, chains, category,
// mcap_usd of the protocols that already record a token).
//
// Board: all 40 watchlist protocols + the pre-token protocols below the $50M
// floor with the most TVL, up to 200 rows. The strict watchlist exclusion rule
// (no Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked
// BTC / CEX category, no version-marker name ending, no whole word wrapped /
// staked / staking in the name, no exchange-name prefix) is applied to the
// below-floor additions too. Only 138 below-floor pre-token protocols pass it,
// so the remaining 22 rows are the highest-TVL pre-token protocols below the
// floor that fail it, taken version-marker failures first, then wrapped-word,
// then category failures; each such row carries extra_rule naming the failed
// check, and the dashboard says so. Every row is pre-token either way.
//
// Value model (buildBoard / impliedValue):
//   implied = TVL x peerMultiple x growthFactor x maturityFactor x chainFactor
//   peerMultiple  = median mcap_usd/tvl_usd over live-token protocols in the
//                   same category (>=3 peers), else the global median.
//   growthFactor  = 1 + 0.15 * clamp(change_7d, -50, +100)/100  -> [0.925, 1.15]
//   maturityFactor= 1 + 0.02 * min(age in years since listed_at, 3) -> [1, 1.06]
//   chainFactor   = 1 + 0.01 * min(chains-1, 9)                 -> [1, 1.10]
// All factors are explained on the dashboard; implied_value_usd is rounded to
// whole dollars and ranks are assigned by implied value, highest first.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  rank: number;
  implied_value_usd: number;
  multiple: number;
  f_growth: number;
  f_maturity: number;
  f_chain: number;
  farm_steps: string[];
  watchlist: boolean;
  extra_rule: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export const BOARD_SIZE = 200;

/** Pre-token by the snapshot's own record: no token id and no ticker. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/**
 * The watchlist exclusion rule, as a reason string, or null when the protocol
 * passes it. Checks each clause independently so a failure can be named.
 */
export function exclusionReason(p: Protocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return "category " + p.category;
  }
  if (VERSION_MARKER.test(p.name)) return "version-marker name";
  if (WRAPPED_WORD.test(p.name)) return "wrapped/staked word in name";
  if (EXCHANGE_PREFIX.test(p.name)) return "exchange-name prefix";
  return null;
}

/** How far a failing protocol is from the strict rule: lower is closer. */
function failureSeverity(p: Protocol): number {
  const fails: string[] = [];
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) fails.push("c");
  if (VERSION_MARKER.test(p.name)) fails.push("v");
  if (WRAPPED_WORD.test(p.name)) fails.push("w");
  if (EXCHANGE_PREFIX.test(p.name)) fails.push("e");
  if (fails.length === 0) return -1;
  if (fails.length > 1) return 4;
  return fails[0] === "v" ? 0 : fails[0] === "w" ? 1 : fails[0] === "e" ? 2 : 3;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

const round4 = (x: number): number => Math.round(x * 10000) / 10000;

/** Peer multiple for a category: median mcap/TVL of live-token peers, else global. */
export function peerMultiple(category: string | null, snap: Snapshot): number {
  const live = snap.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const global = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const peers = live.filter((p) => p.category === category);
  if (peers.length >= 3) {
    return median(peers.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  }
  return global;
}

function ageYears(listedAt: string | null, asOf: string): number {
  if (!listedAt) return 0;
  const ms = Date.parse(asOf + "T00:00:00Z") - Date.parse(listedAt + "T00:00:00Z");
  return Math.max(0, ms / 86400000 / 365.25);
}

/** The implied value and its factor breakdown for one protocol. */
export function impliedValue(
  p: Protocol,
  snap: Snapshot,
): { implied: number; multiple: number; fGrowth: number; fMaturity: number; fChain: number } {
  const multiple = peerMultiple(p.category, snap);
  const g = p.change_7d === null ? 0 : clamp(p.change_7d, -50, 100);
  const fGrowth = round4(1 + 0.15 * (g / 100));
  const fMaturity = round4(1 + 0.02 * Math.min(ageYears(p.listed_at, snap.as_of), 3));
  const fChain = round4(1 + 0.01 * Math.min(Math.max(p.chains.length - 1, 0), 9));
  const implied = Math.max(
    1,
    Math.round(p.tvl_usd * multiple * fGrowth * fMaturity * fChain),
  );
  return { implied, multiple: round4(multiple), fGrowth, fMaturity, fChain };
}

// ---------------------------------------------------------------- farm plan

const VERBS: Record<string, string> = {
  Dexs: "Swap $100+ of tokens through its pools",
  Lending: "Supply $100+ of assets to its lending markets",
  Yield: "Deposit $100+ into one of its yield vaults",
  "Yield Aggregator": "Deposit $100+ into one of its yield vaults",
  "Leveraged Farming": "Deposit $100+ into a leveraged farming position",
  Farm: "Deposit $100+ into one of its farms",
  CDP: "Open a collateralised position with $100+ of collateral",
  "CDP Manager": "Open a collateralised position with $100+ of collateral",
  Derivatives: "Open a small $50+ derivatives position",
  Options: "Open a small $50+ options position",
  "Options Vault": "Deposit $50+ into an options vault",
  Synthetics: "Open a small $50+ synthetic position",
  "Basis Trading": "Open a small $50+ basis-trading position",
  "Interest Rate Derivatives": "Open a small $50+ rates position",
  Restaking: "Restake $50+ of assets through the protocol",
  RWA: "Buy or hold $100+ of its tokenised real-world assets",
  "Prediction Market": "Place $25+ of prediction-market positions",
  Insurance: "Buy $50+ of cover through the protocol",
  Launchpad: "Join a $50+ launch allocation when one opens",
  Payments: "Route $100+ of payments through the protocol",
  Privacy: "Use its privacy features with a $50+ position",
  "NFT Marketplace": "List or buy an NFT worth $50+ on its marketplace",
  Indexes: "Buy $100+ of one of its index products",
  "Governance Incentives": "Lock or vote $50+ of assets in its governance",
  "Onchain Capital Allocator": "Allocate $100+ through one of its vaults",
  "Risk Curators": "Deposit $100+ into a curated vault it manages",
  CeDeFi: "Deposit $100+ into one of its CeDeFi vaults",
  "Collateral Markets": "Supply $100+ of collateral to its markets",
  "Collateral Management": "Deposit $100+ of collateral it manages",
  "Staking Pool": "Stake $50+ in one of its staking pools",
  "Liquidity Manager": "Deposit $100+ into a managed liquidity position",
  Chain: "Bridge $50+ in and use an app on its chain",
  "Dual-Token Stablecoin": "Mint or hold $100+ of its stablecoin",
  "Stablecoin Wrapper": "Wrap $100+ of stablecoins through it",
  "Stablecoin Issuer": "Mint or hold $100+ of its stablecoin",
  "Token Locker": "Lock $50+ of tokens through it",
  "Uncollateralized Lending": "Lend $100+ through its credit markets",
  "Crypto Card Issuer": "Spend $50+ through its card product",
  "OTC Marketplace": "Complete a $50+ OTC trade on it",
  "Anchor BTC": "Deposit $50+ of BTC-linked collateral",
  "Decentralized BTC": "Deposit $50+ of BTC through it",
  "Decentralized AI": "Use its AI service with a $50+ position",
  "AI Agents": "Use one of its agents with a $50+ position",
  "Algo-Stables": "Mint or hold $100+ of its algorithmic stablecoin",
  "Reserve Currency": "Hold $100+ of its reserve asset",
  DOR: "Use its oracle-rate product with a $50+ position",
  Bridge: "Bridge $100+ of assets through it to another chain",
  "Canonical Bridge": "Bridge $100+ through its canonical bridge to the main chain",
  CEX: "Trade $100+ of spot volume on its exchange",
  "Liquid Staking": "Stake $50+ through its liquid staking product",
};

/** Six concrete farm steps for a protocol, each with a cost and a time. */
export function farmSteps(p: Protocol, asOf: string): string[] {
  const chain0 = p.chains[0] || "its home chain";
  const chain1 = p.chains[1] || "";
  const cat = p.category || "DeFi";
  const verb = VERBS[p.category || ""] || "Use the app with $100+";
  const steps: string[] = [];
  if (chain0 === "Ethereum") {
    steps.push(
      `Move $100-$250 in stablecoins into a dedicated self-custody wallet on ${chain0} and fund it with ~$10 of ETH for gas (~$2-$8 gas, 10-20 min). Keep the funds in a wallet you control; never share a seed phrase.`,
    );
  } else {
    steps.push(
      `Bridge $100-$250 in stablecoins to ${chain0} with a generic cross-chain bridge (~$1-$5 gas, 10-20 min). Keep the funds in a self-custody wallet you control; never share a seed phrase.`,
    );
  }
  steps.push(
    `${verb} (${cat}) on ${chain0}, then hold the position for 30+ days (~$2-$8 gas per transaction, 15 min to set up).`,
    `Return weekly for 8+ weeks: repeat a small ${cat} action on ${chain0} and finish any free in-app quest when one appears (~$1-$3 gas each visit, 10 min a week).`,
  );
  if (p.chains.length > 1 && chain1) {
    steps.push(
      `Use ${p.name} on a second chain (${chain1}) too, with a smaller $25-$50 position, so activity spans chains (~$2-$6 gas, 20 min).`,
    );
  } else {
    steps.push(
      `Keep the position open for a full month and avoid withdrawing early, so the history shows staying power (no extra cost, 5 min to check).`,
    );
  }
  steps.push(
    `Check ${p.name}'s points or quest page every week and complete any free task it lists; log each action with its date and transaction hash (~5 min a week, gas only when you transact).`,
    `${p.name} records no token in the snapshot (as of ${asOf}), so nothing here promises an airdrop or a launch; only farm what you can afford to lose and keep total gas under roughly $25-$50 for the whole plan.`,
  );
  return steps.map((s) => s.trim());
}

// ---------------------------------------------------------------- board

export interface Board {
  as_of: string;
  floor_usd: number;
  rows: BoardRow[];
  stats: { watchlist: number; strict_below_floor: number; extra_below_floor: number };
}

/** Build the 200-row board from the snapshot. */
export function buildBoard(snap: Snapshot): Board {
  const watch = new Set(snap.watchlist);
  const below = snap.protocols.filter(
    (p) => isPreToken(p) && p.tvl_usd < snap.floor_usd && !watch.has(p.slug),
  );
  const strict = below
    .filter((p) => exclusionReason(p) === null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  const failing = below
    .filter((p) => exclusionReason(p) !== null)
    .sort(
      (a, b) =>
        failureSeverity(a) - failureSeverity(b) || b.tvl_usd - a.tvl_usd,
    );
  const need = BOARD_SIZE - snap.watchlist.length - strict.length;
  const extras = failing.slice(0, Math.max(0, need));
  const chosen = new Map<string, { p: Protocol; extra: string | null }>();
  for (const p of snap.protocols) {
    if (watch.has(p.slug)) chosen.set(p.slug, { p, extra: null });
  }
  for (const p of strict) chosen.set(p.slug, { p, extra: null });
  for (const p of extras) {
    chosen.set(p.slug, { p, extra: exclusionReason(p) });
  }
  const rows: BoardRow[] = [...chosen.values()]
    .map(({ p, extra }) => {
      const v = impliedValue(p, snap);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        listed_at: p.listed_at,
        rank: 0,
        implied_value_usd: v.implied,
        multiple: v.multiple,
        f_growth: v.fGrowth,
        f_maturity: v.fMaturity,
        f_chain: v.fChain,
        farm_steps: farmSteps(p, snap.as_of),
        watchlist: watch.has(p.slug),
        extra_rule: extra,
      };
    })
    .sort(
      (a, b) =>
        b.implied_value_usd - a.implied_value_usd ||
        b.tvl_usd - a.tvl_usd ||
        (a.slug < b.slug ? -1 : 1),
    );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return {
    as_of: snap.as_of,
    floor_usd: snap.floor_usd,
    rows,
    stats: {
      watchlist: snap.watchlist.length,
      strict_below_floor: strict.length,
      extra_below_floor: extras.length,
    },
  };
}
