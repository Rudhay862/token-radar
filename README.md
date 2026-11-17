# Token Launch Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Rudhay862/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Rudhay862/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama
tracks, finds the ones that still record no token and are not a wrapped or
staked product of one that trades, and ranks them by what their launch would
be worth — with a concrete farm plan for each one. Built for the make.fun
bounty [token-radar-01](https://make.fun/bounty/token-radar-01).

## Methodology

**Implied value = TVL × peer multiple × growth × maturity × chains.**

- **Peer multiple** — the median market-cap/TVL of live-token protocols in
  the same category (global median when a category has fewer than 3 peers).
- **Growth** — 7-day TVL change, clamped to [-50%, +100%], scaled to a
  0.925–1.15 factor.
- **Maturity** — how long the protocol has run since DefiLlama first listed
  it, up to a 1.06 factor.
- **Chains** — how many chains its TVL spans, up to a 1.10 factor.

The board holds 200 rows: all 40 watchlist protocols plus the pre-token
protocols below the $50M floor with the most TVL. The strict watchlist
exclusion rule is applied to the below-floor additions too; only 138 pass it,
so 22 further pre-token rows are included and flagged with the failed check,
so the board reaches 200. Every figure comes from the snapshot alone — no
network, no hardcoded list of names. “Records no token” is the snapshot’s
record, not proof a protocol has none, and an implied value is this entry’s
own claim, not a prediction that a token will launch.

## How to run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22+ (stdlib only, no install). Writes `out/board.json`,
`out/dashboard/` (the static page + `data.js`), `out/screenshots/` and
`out/dossier.json`. Two runs write byte-identical files.

## Referral

Entering bounties on make.fun? Use my referral link:
https://make.fun/r/dzgseakx
