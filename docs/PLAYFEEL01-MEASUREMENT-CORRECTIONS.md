# PLAYFEEL01 measurement corrections (v1 → v2)

The Controller's Stage A review found five defects in the first autoplay harness. The v1 artifact is kept in
Git history as `b2506871ec5051bfda6e0b20a0ebe031d8244fe8` so the correction is auditable; it is **not** the
authoritative baseline any more. This appendix states what was wrong, what it changed numerically, and what
the corrected numbers now are. Nothing here is a gameplay claim — it is a measurement claim.

## Why v1 could not be trusted as a baseline

| # | v1 defect | Effect on the reported numbers |
| --- | --- | --- |
| M1 | `curious-traveler` computed its action from a **counter** (`travelCount % 3 === 2`), so after the first two non-travel actions the count froze and the policy cultivated forever instead of "mostly travelling". | The group's action mix did not describe the strategy it was named after, so its 92–98-year lifespan was read as a property of "travelling" when it was a property of "cultivating forever". |
| M2 | "never reached 10000 cultivation" was derived from the **final** cultivation. A successful breakthrough resets cultivation to 0 and an interrupted run can end at 9100 in 金丹. | Overstated: v1 reported **11** runs never full; the true figure is **6**. |
| M3 | "time-only streak" searched for the substring `time` in effect labels. `OUTCOME_TIME_DELTA` need not appear as a label, and every formal command changes counters. | Blind: v1 reported 0 runs with a ≥5 streak and 0 time-only choices at all. The corrected measure finds **52 / 386** event choices are genuinely time-only. |
| M4 | "no death sample" was treated as an outstanding gap rather than a failure to measure. | v1 had **0** deaths and no route to one. v2 adds two bounded directed fixtures through the authentic engine and both reach a real `deathRecord`. |
| M5 | "has a Cause" was treated as "has a cause echo". | v1 reported 15/18 runs "产生因果"; that only proves a Cause id exists. v2 tracks origin Event/command → public Cause state change → echo, and reports **14/18** runs with an actual origin→echo chain. |

## Corrected baseline (measurement v2, same 6 seeds × 3 strategies, ≤24 core actions each)

| metric | v1 | v2 (authoritative) |
| --- | --- | --- |
| runs that ever reached 10000 cultivation | 7 (implied by "neverFull = 11") | **12 / 18 (67%)** |
| runs still mortal at 50+ | 8 | **6** (all six are `social-causality`) |
| eligible breakthrough within 8 core actions | 6 (guided only) | **6 / 6 guided**, median first-eligible = **5**, median first-attempted = **5** |
| breakthrough outcomes | 15 / 28 | **15 / 28** (unchanged; guided only, as `curious` never attempts) |
| event choices whose only public change is age | not measurable | **52 / 386 (13%)** |
| longest run of consecutive time-only choices | 0 (metric blind) | **3** |
| runs with a real Cause origin→echo chain | not measurable | **14 / 18** |
| natural deaths in the bounded window | 0 | 0 |
| directed death fixtures reaching a real deathRecord | none existed | **2 / 2** — `lifespan@18` via `lifespan-hard-ceiling`, `exploration@16` via `threat.dangerous-exploration` |

## What the corrected numbers say about the game (this is the part that matters)

1. **The cultivation loop itself works, and always did.** Guided play reaches 10000 cultivation by core
   action 5 and reaches 金丹 (3 successes out of 4 attempts) in every guided run. The v1 claim that
   cultivation never filled was a measurement artefact, and it is withdrawn.
2. **The real defect is that nothing tells the player.** All six `curious-traveler` runs sit at
   **10000 / 10000 cultivation, still 凡人, aged 71–82, with zero breakthrough attempts**. The state says
   "you are ready"; the screen says nothing. This is exactly the B1 gap: the information exists in
   `publicRun.realm` and in the projected `specialIntents.breakthrough` (`available` +
   `blockedReasonKey`) and is not surfaced.
3. **A whole play style is a lifetime trap.** All six `social-causality` runs end at **43–49 岁 with only
   1240–1810 / 10000 cultivation** and never once fill it. A player who does 入世 / 追索 burns thirty years
   with no signal that cultivation has not moved — the contract's §2 prediction, now measured correctly.
4. **Time-only choices are common but not a wall.** 13% of event choices change nothing but age, and the
   worst consecutive run is 3. The contract's hard gate is "连续 5 次只有岁月变化" and the corrected
   measure shows that does **not** occur naturally in the baseline — so the fix for the time-only events is
   about *meaning* (the player cannot tell whether a search found anything), not about frequency.
5. **Both real death paths are reachable.** Lifespan and lethal-risk death both resolve through the frozen
   Risk/Progression contracts with a concrete `category` and `immediateSource`; the reason the natural 18
   runs show none is that they are bounded to 24 actions and the policies avoid `take-risk`. This is
   reported as *no natural sample*, not as *no death path*.

## Reproduce

```
node tools/playfeel01-autoplay.mjs --label before-v2 --json .playfeel01/before-v2.json
```

Directed fixtures are included in that run and are excluded from the natural-policy prevalence counts. The
harness never assigns a `deathRecord`; the fixture for the lethal case only places the run on a lethal Risk
Event with the injury level the Risk pack's own `lethalityPolicy.prerequisites` requires, and the tier, the
fatality and the record all come from `resolveOutcome` and the reducer.
