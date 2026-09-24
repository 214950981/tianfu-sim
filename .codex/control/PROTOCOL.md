# Tianfu Agent Handoff Protocol v1.4

This directory is the Git-based handoff bus between the controller (ChatGPT) and the implementer (WorkBuddy).

## Roles

- Controller: decides architecture, writes/updates NEXT_TASK, reviews Git evidence, accepts/rejects results, and dispatches the next task.
- Implementer: executes exactly one READY task in an isolated Worktree, runs required verification, writes LAST_RESULT, commits, and pushes only to the assigned work branch.
- The implementer never self-dispatches the next task.

## Source of truth

Priority remains:
1. latest Git state
2. contracts / task definitions / tests
3. docs/dev-status.md
4. long-form project notes

NEXT_TASK is dispatch metadata, not a replacement for contracts or the task definition.

## Verification profiles

NEXT_TASK may set `verificationProfile`:

- `fast-lane`: default for bounded implementation slices after a stable milestone. Run the dedicated task suite, directly affected predecessor suites, and the specific boundary/audit gates named by the task. Do NOT run aggregate `npm test`, 600-run simulation, untouched-base reproduction, or unrelated historical suites unless the task explicitly requires them or the implementation unexpectedly touches gameplay/content/server semantics.
- `standard`: broader verification for architecture changes whose blast radius is not yet narrow.
- `final-audit`: milestone/full-chain regression. Run the aggregate suite and all task-specified release gates; re-establish environment-noise evidence as needed.

Fast-lane is a throughput policy, not permission to weaken contracts. A dedicated test failure, scope drift, unexpected dependency edge, or new P0/P1 issue still blocks acceptance.

For fast-lane tasks:
- prefer a larger vertical slice over a tiny single-file task when boundaries are already understood;
- do not rerun known sandbox failures just to reconfirm the same environment signature;
- `LAST_RESULT.tests` should list only tests actually executed;
- `toolingObservations` records only NEW reusable findings. Proxy-port changes or repeated confirmation of an already documented workaround are not new findings;
- controller schedules a later `final-audit` checkpoint to pay the deferred regression cost once, not on every intermediate commit.

## Resource-efficient execution

All implementation tasks default to resource-efficient execution unless NEXT_TASK explicitly opts out. This is about reducing tool churn, not lowering correctness.

Rules:
- Read the task/context/contracts once at the start. For large source files, use search/targeted ranges; do not repeatedly dump whole files after the relevant symbols are known.
- Before editing, form one implementation plan and batch related edits. Do not alternate tiny edits with full-suite reruns.
- While fixing a failing dedicated suite, run the smallest failing test or `--test-name-pattern` first. Do not rerun the whole dedicated file for every edit.
- A full dedicated task suite should normally run at most twice: once when the implementation is believed complete, once as final confirmation. If the same full suite fails twice, diagnose with targeted tests rather than immediately running it again.
- Typecheck should normally run at most twice per task. Lint/secret/audit gates should normally run once after source changes stabilize, with one repeat only if that gate itself found an issue that was then fixed.
- Generated runtime/artifact regeneration should happen after source code stabilizes. Regenerate + freshness/audit/smoke as one batch; repeat only if source changes after that batch.
- Do not repeatedly inspect generated files line-by-line when freshness/hash/audit tools already prove their contents. Inspect source of truth instead.
- Git/network operations must be bounded. Do one credential/remote preflight if needed, then one push. On a transient network failure, make at most one additional push attempt. Never spin a 5/10/20-attempt push loop. If two bounded attempts fail, stop with BLOCKED/PUSH_BLOCKED and preserve the local commit SHA.
- Do not repeatedly run `git status`, `rev-parse`, `write-tree`, or ancestry probes after every edit. Verify source/base once at start and final tree/commit once before push unless a real inconsistency appears.
- LAST_RESULT is evidence, not a transcript. Do not paste full test logs, long source excerpts, or repeated observations. Record one concise result per executed gate plus genuinely new blockers/tooling findings.
- Already documented environment behavior is not re-investigated on fast-lane tasks unless it changes the task result.

If an iteration loop reaches 3 attempts on the same unresolved symptom, stop rerunning commands and reassess the root cause. If still unresolved, report BLOCKED rather than consuming budget by repetition.

## Task states

NEXT_TASK.status:
- READY: implementer may execute.
- HOLD: do not execute.
- CLOSED: no current task.

LAST_RESULT.status:
- NONE: no result yet.
- PASS: implementation and required verification passed.
- BLOCKED: task cannot be completed without a controller decision or out-of-scope architecture change.
- FAIL: implementation/test failure remains.

## Worktree / branch safety

For every READY task:

1. Fetch origin when the sandbox permits it.
2. Read .codex/control/NEXT_TASK.yaml from the current remote source branch. If normal git fetch is blocked but the repository API is reachable, the remote source branch is authoritative.
3. Verify taskDefinition and run `node .codex/context.mjs <taskId>` once.
4. Work only in the isolated Worktree. Never edit or push the source branch directly.
5. Record the exact remote source HEAD at task start as baseCommit.
6. Prefer an exact local ancestry rooted at baseCommit.
7. Do not create a nested local branch name solely for the task. The local Worktree may stay on its tool-managed branch/detached HEAD.
8. Commit the completed task locally, then push the resulting HEAD to the exact flat remote branch named by NEXT_TASK.workBranch:
   `git push origin HEAD:refs/heads/<workBranch>`
9. Do not merge, fast-forward, rebase, or push the source branch.
10. Do not begin another task.

The flat work-branch naming rule avoids the known sandbox issue with nested local refs.

### Synthetic-tree fallback

The sandbox is known to sometimes block fetching the exact remote commit object while still allowing repository-API reads and work-branch pushes.

Synthetic-tree fallback is allowed only when NEXT_TASK explicitly sets `allowSyntheticTreeBase: true`.

In that mode the implementer must:
- verify the remote source HEAD by repository API;
- verify the complete working tree is byte-identical to the remote source tree before editing;
- record `historyMode: synthetic-tree-base` and `baseTreeSha` in LAST_RESULT;
- never claim the work branch is a descendant of sourceBranch unless Git proves it;
- never merge/rebase/fast-forward the source branch.

A synthetic-tree work branch is evidence only. The controller reviews the tree/file diff and, if accepted, transplants the reviewed changes onto the unchanged source HEAD as a new controller-created commit. If source HEAD moved, acceptance stops and the task must be rebased/re-reviewed.

## Result contract

Before the final task commit, update .codex/control/LAST_RESULT.yaml on the task branch.

Required fields:
- version
- taskId
- status
- sourceBranch
- workBranch
- baseCommit
- summary
- changedFiles
- tests
- gates
- scope
- blockers
- recommendedCommitMessage

When synthetic-tree fallback is used, also include:
- historyMode: synthetic-tree-base
- baseTreeSha
- sourceHeadVerifiedBy

Rules:
- baseCommit is the remote source-branch HEAD observed at task start.
- Reusable environment/tooling findings MUST be written into Git under `toolingObservations` in LAST_RESULT; chat-only observations are not durable evidence.
- When an observation is likely to affect later tasks (credentials, proxy behavior, worktree pollution, sandbox limitations, verified workarounds), the implementer should point to `.codex/control/TOOLING_RUNBOOK.md`. The controller decides whether to promote/update the runbook after review.
- changedFiles lists actual task changes, excluding generated temp files.
- tests/gates must report real executed results, never planned results.
- scope.coreChanged / contractsChanged / directorChanged / contentChanged must be explicit booleans.
- blockers is [] for PASS.
- Do not guess resultCommit inside the file. The pushed workBranch HEAD is the authoritative result commit.

## Controller review

The controller reviews:
- remote source HEAD
- remote workBranch HEAD
- compare/tree diff
- LAST_RESULT.yaml
- task definition / contracts / relevant tests

If accepted with exact ancestry:
- controller may fast-forward source branch to the reviewed workBranch HEAD only if source HEAD has not drifted from LAST_RESULT.baseCommit.

If accepted from synthetic-tree fallback:
- controller must not merge or fast-forward the divergent work branch;
- controller creates a new commit on the unchanged source HEAD containing only the reviewed accepted diff.

After acceptance:
- controller dispatches the next task by updating NEXT_TASK on source;
- controller reviews `toolingObservations` and promotes durable, cross-task findings into `.codex/control/TOOLING_RUNBOOK.md` when useful;
- workBranch may be retained temporarily for audit.

If rejected or blocked:
- source gameplay code is not advanced;
- controller writes a repair/replacement NEXT_TASK;
- implementer waits for the next READY task.

## Stop conditions

Implementer must stop and return BLOCKED instead of widening scope when:
- Core/contracts/Director changes are required but task forbids them;
- source branch moved after baseCommit;
- deterministic/replay/idempotency invariants would be violated;
- task contracts conflict;
- a P0/P1 issue appears.

This protocol favors bounded, reviewable progress. Use fast-lane vertical slices and resource-efficient execution between explicit final-audit checkpoints so safety and tool churn do not consume most implementation time.
