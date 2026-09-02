# TIANFU 2.0 / CODEX RULES v0.1

Priority: task spec > contracts > this file. If conflict with product intent, STOP; do not guess.

## Global invariants
G01 Core is pure: no wx/tt, UI, DB SDK, HTTP/fetch, AI provider, platform clock.
G02 Rule RNG only via injected seeded RNG. No Math.random()/Date.now() for rule outcomes.
G03 Rule entry: reduce(State, Command, Context) -> {State, Effects, NarrativeFacts, Trace}. No hidden writes.
G04 Client sends intent only. Never trust client currency/rank/realm/reward/final-state values.
G05 Server authoritative for rewards, ranked state, paid/meta currency, challenge results.
G06 Run locks rulesVersion + contentVersion + seed. Same versions+seed+commands => same RuleState hash.
G07 Content uses versioned schemas + whitelisted Condition/Effect DSL. No eval/new Function/arbitrary scripts.
G08 AI is optional narrative only. It cannot create DomainEffect, rewards, combat/breakthrough/rank results, or mutate RuleState.
G09 Every AI scene has deterministic fallback. AI-off must not block the run.
G10 Platform code is Adapter-only. Core/Content never import wx/tt.
G11 RunState != MetaState. Cross-run unlocks do not mutate an ended Run.
G12 Cause must trace to a real choice/system cause; echo cannot reference nonexistent cause/NPC.
G13 Challenge: no paid/ad/AI difference may change ranked result.
G14 Prefer small changes. No whole-repo rewrite, no unrelated cleanup, no gameplay scope creep.
G15 Rule/Core changes require deterministic tests. Random behavior requires replay evidence.
G16 Failed/invalid command must not mutate RuleState or consume RNG/time.
G17 commandId is idempotency key; expectedStateVersion guards concurrency.
G18 Do not silently change frozen product assumptions. Use ADR/blocker.

## Work protocol
1. Read `.codex/INDEX.yaml`, then ONLY the current task's `read` files. Do not read the four long design docs by default.
2. Inspect only code/config needed for the task. Avoid broad repo scans unless blocked.
3. If task touches an unresolved decision in `.codex/DECISIONS.yaml`, STOP and report the decision ID.
4. Implement only `in`. Never implement `out` “while here”.
5. Run task `tests`. If unavailable, create the smallest missing test harness only when task allows it.
6. Before finish: self-check G01–G18 + task acceptance.
7. Output only: changed files; tests run/results; blockers/ADR; next task readiness. No long recap.

## Severity / merge
P0/P1 => no merge. Determinism/security/fairness/data-loss/idempotency failures are >=P1; exploitable reward/rank/other-user access is P0.

## Token discipline
- Do not reread unchanged `.codex` files in the same task.
- Do not ingest `docs/*.docx` unless task says `escalate: true` or a contract conflict cannot be resolved locally.
- Prefer targeted `rg`/file reads over full-repo reading.
- Do not generate prose docs unless the task explicitly requires an ADR.
