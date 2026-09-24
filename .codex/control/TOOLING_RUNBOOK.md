# WorkBuddy Tooling Runbook

This file stores durable, cross-task environment/tooling knowledge discovered during implementation.
It is controller-reviewed Git evidence, not a substitute for task-specific LAST_RESULT evidence.

## Observation persistence rule

When WorkBuddy discovers a reusable tooling or environment issue:
1. record it in the current task's `LAST_RESULT.yaml` under `toolingObservations`;
2. include evidence, impact, and the verified workaround when one exists;
3. do not leave the only copy in chat;
4. do not silently edit this runbook unless the task/controller permits it; the controller promotes durable findings here.

## GitHub push authentication in the current sandbox

Observed in UI02FINAL:
- `~/.gitconfig` ends the credential section with an empty `helper =`, which resets the helper inherited from PortableGit.
- A plain `git push` can therefore fall back to an interactive credential prompt and appear to hang with no output.
- Windows Git Credential Manager has a working GitHub credential.

Validated non-interactive pattern:

`GCM_INTERACTIVE=never git -c credential.helper=manager -c credential.https://github.com.helper=manager push origin HEAD:refs/heads/<workBranch>`

Operational rules:
- push only the task's exact flat work branch;
- bound attempts with a timeout where the sandbox supports it;
- do not assume a fixed proxy port;
- read the current proxy from `HTTPS_PROXY`.

Proxy ports observed so far include 18036 and 23843. The port is environment data, not configuration.

## WeChat DevTools worktree pollution

Observed repeatedly:
- `project.config.json` can be modified;
- `project.private.config.json` can be modified;
- an untracked `miniprogram/pages/game/game.js` stub may appear.

These artifacts can invalidate digest-pinned UI regression checks even when product code is unchanged.

Before trusting regression output:
- inspect `git status`;
- isolate unexpected DevTools artifacts outside the worktree or restore tracked files to the task base;
- never commit these artifacts unless a task explicitly requires them;
- record any recurring variant in `toolingObservations`.

## Nested Node process EBUSY

In the current sandbox, Node tests that spawn another `node.exe` process may fail with `spawnSync ... EBUSY`.

UI02FINAL proved the known three failures were environmental only because BOTH conditions held:
1. the exact failures reproduced on the untouched task base; and
2. each underlying direct tool succeeded when invoked directly from the shell, including the negative-control behavior where applicable.

Do not classify a future EBUSY as environment noise merely because the error text looks similar. Re-establish both proofs for the affected task.
