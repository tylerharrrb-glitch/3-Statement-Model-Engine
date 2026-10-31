# Monorepo Migration (Part 13)

This is a plan only. Nothing here has been started. It needs the owner's written approval.

## Target

```
wolf-suite/
  apps/wolf/            valuation engine
  apps/3sm/             this repo
  apps/valor/           M&A engine
  packages/rates-registry/   schema, staleness, merge, snapshot (from this repo)
  packages/schemas/          shared data schemas, starting with the 3SM to WOLF export
  worker/                    one rates Worker serving all three apps
  data/rates.manual.json     one manual file
```

## Steps

1. Compare schemas. WOLF has its own `RateEntry`: values in percent, ids such as `cbe.overnightDeposit`, `bounds` as a pair, and no `weekly_auction` cycle. 3SM uses the brief's schema: ids such as `cbe_overnight_deposit`, `bounds` as an object. Choose one and write a one-way migration for saved models.
2. Create the repo with `git subtree add` per app, so each history is kept.
3. Move `packages/rates-registry`. Point all apps at it.
4. Merge the two manual rates files, keeping the more recent verified value per id. Record conflicts instead of resolving them silently.
5. Move to one Worker and retire `functions/api/rates.ts` in WOLF.
6. Have WOLF read the 3SM export through `packages/schemas`.
7. Run each app's gates in one CI matrix. Migrate only when all pass.
8. Repoint the Cloudflare projects, on preview deployments first.

## Risks

- WOLF and VALOR saved models hold frozen snapshots under old ids. A migration is needed, or the old ids must be kept as aliases.
- A shared registry means one bad manual edit affects all three engines. The gates must run for all of them on any data change.
- History size: `.next` and generated files must be excluded before the subtree import.

## Decision needed

Written approval, and which schema wins in step 1. Recommendation: the brief's schema, because WOLF would gain the `weekly_auction` cycle.
