# Tianfu Agent Handoff Protocol v1

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

1. Fetch origin.
2. Read .codex/control/NEXT_TASK.yaml from the current source branch.
3. Verify taskDefinition and run `node .codex/context.mjs <taskId>` once.
4. Work only in the isolated Worktree. Never edit or push the source branch directly.
5. Base the task on the current remote source branch HEAD at task start.
6. Do not create a nested local branch name solely for the task. The local Worktree may stay on its tool-managed branch/detached HEAD.
7. Commit the completed task locally, then push the resulting HEAD to the exact flat remote branch named by NEXT_TASK.workBranch:
   `git push origin HEAD:refs/heads/<workBranch>`
8. Do not merge, fast-forward, rebase, or push the source branch.
9. Do not begin another task.

The flat work-branch naming rule avoids the known sandbox issue with nested local refs.

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

Rules:
- baseCommit is the remote source-branch HEAD observed at task start.
- changedFiles lists actual task changes, excluding generated temp files.
- tests/gates must report real executed results, never planned results.
- scope.coreChanged / contractsChanged / directorChanged / contentChanged must be explicit booleans.
- blockers is [] for PASS.
- Do not guess resultCommit inside the file. The pushed workBranch HEAD is the authoritative result commit.

## Controller review

The controller reviews:
- remote source HEAD
- remote workBranch HEAD
- compare source...workBranch
- LAST_RESULT.yaml
- task definition / contracts / relevant tests

If accepted:
- controller may fast-forward source branch to the reviewed workBranch HEAD only if source HEAD has not drifted from LAST_RESULT.baseCommit
- controller then dispatches the next task by updating NEXT_TASK on source
- workBranch may be retained temporarily for audit

If rejected or blocked:
- source branch is not advanced
- controller writes a repair/replacement NEXT_TASK
- implementer waits for the next READY task

## Stop conditions

Implementer must stop and return BLOCKED instead of widening scope when:
- Core/contracts/Director changes are required but task forbids them
- source branch moved after baseCommit
- deterministic/replay/idempotency invariants would be violated
- task contracts conflict
- a P0/P1 issue appears

This protocol deliberately favors safe serialized work over autonomous breadth.
