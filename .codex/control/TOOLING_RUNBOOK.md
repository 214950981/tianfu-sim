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

Optional credential-only probe before spending a network attempt:

`printf 'protocol=https\nhost=github.com\n\n' | GCM_INTERACTIVE=never git -c credential.helper=manager credential fill`

UI03 verified this probe and the documented push pattern successfully on the first attempt without changing `~/.gitconfig`.

Operational rules:
- push only the task's exact flat work branch;
- bound attempts with a timeout where the sandbox supports it;
- do not assume a fixed proxy port;
- read the current proxy from `HTTPS_PROXY`.

Observed proxy ports vary between sessions. The port is environment data, not configuration. Do not record a new tooling observation merely because the numeric port changed; only record new network behavior or a new workaround.

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

Do not classify a new failure as environment noise merely because the error text looks similar. On `final-audit` or when an affected suite must run, re-establish both proofs. On a `fast-lane` task, do not rerun known nested-process failures unless the task changed the affected tool/test path or the targeted verification surfaces a new failure.

## Real-ancestry worktree positioning without ref writes

UI03 verified a safe recipe when the exact remote commit object is fetchable but local ref writes are undesirable:
- fetch the remote source commit;
- `git read-tree -u --reset <sha>`;
- write the worktree-specific `HEAD` file to `<sha>` directly;
- verify `git rev-parse HEAD == <sha>` and `git write-tree == <sha>^{tree}` before editing.

This preserves real ancestry without creating or moving an extra local branch ref. Use synthetic-tree fallback only when the remote commit object genuinely cannot be fetched and NEXT_TASK explicitly allows it.

## Untouched-base reproduction

For proving that a failure exists on the pristine task base, UI03 verified:

`mkdir -p <scratch> && git archive <baseCommit> | tar -x -C <scratch>`

Run the suspect tests from that extracted tree. This is safer for multi-file tasks than temporarily checking out task files back to base and avoids stash/ref writes. Keep the scratch tree Git-excluded and remove any accidental nested `.git` directory.

## Sandbox composite-command artefact

A sandbox-level `decisionRecord missing actual resource subject` error may abort a long composite shell call before any command runs. When it appears with no command output, split the chain into single-purpose calls and retry the pieces before diagnosing repository state.

## Testing CLI tools in this sandbox

UI04A refined the nested-process failure pattern: child `node.exe` failures do not always contain the literal text `EBUSY`. Some tests surface only a null status or missing stderr because the spawn never completed.

Operational rule:
- classify nested-process failures by exact untouched-base reproduction plus underlying direct-tool success, not by matching the word `EBUSY`;
- when adding a new audit/tool, prefer exporting a pure function and importing it directly from tests;
- keep a direct-run guard in the CLI wrapper so importing the module does not set `process.exitCode`;
- verify the actual CLI exit code separately from the shell.

## Digest-pinned scope tests

UI04A confirmed that legitimate refactors can invalidate old tree digests in tests outside the task's named list.
After changing a pinned tree:
- search the full `tests/` and `tools/` tree for the old digest or the pinned path;
- update only pins whose underlying reviewed tree intentionally changed;
- run the aggregate regression, not only task-targeted suites.

## Frozen semantic marker audits

If a frozen marker check points at a file that becomes a facade/re-export after a legitimate code move, re-point the marker to the new owning module and retain the check. Do not delete or weaken the audit simply to make it green.

## Compatibility re-export proof

When a module becomes a compatibility re-export, runtime object identity assertions are a cheap guard against accidentally creating a second implementation. Example: assert the compat export's validator/class/constant is `===` the source module binding.

## Fast-lane verification

Protocol v1.3 adds `verificationProfile: fast-lane` for stable implementation phases.
- Run only the task's dedicated tests, directly affected predecessor tests, and named boundary/audit gates.
- Skip aggregate `npm test`, untouched-base reproduction and 600-run simulation unless the task explicitly requires them or scope unexpectedly reaches gameplay/content/server semantics.
- Do not repeat already documented tooling observations. A changed proxy port by itself is not a finding.
- Pay the deferred full-regression cost once at an explicit `final-audit` milestone.

## REST-assisted exact Git reconstruction fallback

UI04C hit a session where repository API/raw HTTP worked while git transport repeatedly returned proxy/TLS 502 errors. If the exact remote commit cannot be fetched but API access is healthy, a task may reconstruct the commit without switching to synthetic history:
- obtain the remote commit metadata/tree SHA and changed-file set from the repository API;
- materialize the parent tree locally and apply the exact remote file bytes;
- require `git write-tree` to equal the remote tree SHA before any edit;
- if real ancestry is needed, reconstruct/hash the commit object from the API metadata and verify its SHA exactly;
- continue retrying `ls-remote` independently for remote-head confirmation.

Use this only as a transport fallback. Prefer normal fetch when available, and never treat approximate file reconstruction as real ancestry.

## Generated cloud runtime cold-start ordering

UI04D showed that generated CommonJS modules may execute `structuredClone` during module evaluation. If the target cloud Node runtime needs a compatibility shim, install it before the first `require()` of the generated runtime, not after. Cold-start compatibility code that runs after import is already too late.

## Cross-realm cloud harness payloads

When a cloud host is loaded in `node:vm`, objects created outside that realm can fail plain-object/prototype validators for reasons the real platform would not. Model the platform boundary by JSON-round-tripping request data into the VM realm and responses back out before asserting protocol behavior.

## Post-commit timeout tests

Arm a simulated post-commit timeout immediately before the transaction/operation being tested. A database-wide `throwAfterCommitOnce` flag set at construction can be consumed by bootstrap or setup work and silently test the wrong transaction.

## Negative controls must drift the enforced property

A negative control should mutate the boundary the tool actually guarantees. For generated artifacts, ordinary legal source edits belong to freshness checks; dependency-closure or facade-surface violations belong to generator/audit negative controls. Do not expect a valid derivation to fail merely because source content changed.

## Resource / credit efficiency

Protocol v1.4 makes bounded tool use the default.
- Prefer targeted symbol/range reads over repeated full-file reads.
- Fix a red test with the smallest test-name pattern; do not rerun the whole suite after every edit.
- Full dedicated suite: normally <=2 runs. Typecheck: normally <=2. Final audits/generators: batch once after source stabilizes.
- Push: one preflight if needed, one push, at most one retry on transient network failure. Two failures => stop and report PUSH_BLOCKED with the local commit SHA.
- Never use an unbounded shell/network retry loop.
- LAST_RESULT records concise evidence, not command transcripts or duplicated logs.
- If the same symptom survives 3 attempts, stop looping and reassess or BLOCK.

## Bootstrap recovery must preserve presentation sidecars

UI04E_R2 exposed a general server projection rule: if a bootstrap/recovery endpoint returns an already-persisted run, it must project the complete stored run, not only its canonical gameplay state. Otherwise server-side presentation/session sidecars can disappear on reload even though fetchView is correct.

For terminal runs specifically, `createRunOffer` recovery and `fetchView` must agree on the same terminal-aware ViewModel projection.

## Real CloudBase missing-document semantics

Real WeChat CloudBase differs from the original fake DB used by UI04D tests: `collection(name).doc(id).get()` may reject when the collection exists but the document does not. The observed production error is `-502005` with a message equivalent to `document with _id ... does not exist`.

Important: `-502005` is not sufficient by itself to mean an empty document. The same broad ResourceNotFound family was also observed for a missing collection. A compatibility layer must distinguish a missing-document read from a missing collection and from permission/network/transaction errors. Only the exact missing-document case may be normalized to `undefined`.

Cloud harnesses for persistence code should emulate the real missing-document rejection path, not only return `{data: undefined}`. Keep a negative control proving collection-not-found remains fatal.

## MiniProgram root must be a closed runtime package

Real DevTools smoke exposed that project.config.json points at miniprogram/, while some registered pages inside that root referenced or depended on files that existed only in legacy root-level pages/.

A file outside miniprogramRoot cannot satisfy a MiniProgram runtime require(). Every registered page entry and every literal relative dependency reachable from the MiniProgram package must exist inside miniprogramRoot.

DevTools creating an untracked page stub such as miniprogram/pages/game/game.js can indicate a missing committed page entry, not merely editor pollution. Prefer a static package-closure audit over trusting synthesized local files.

## MiniProgram mirror manifest caveat

LIVEFIX02's current mirror tool correctly enforces freshness for all entries present in MIRROR_MANIFEST. Its comment also claims it detects an arbitrary old mirror target left behind after removing a manifest entry, but the current implementation does not enumerate historical/unlisted targets, so that specific promise is not yet mechanically enforced.

This is non-blocking for the accepted four current mirrors, which are byte-identical to their sources and covered by the package-closure audit. If mirror-manifest maintenance is revisited, either implement explicit target discovery/ownership metadata or narrow the comment to the behavior actually enforced.

## Mirror freshness does not prove source validity

LIVEFIX03 was triggered because LIVEFIX02 correctly proved a byte-exact mirror was fresh while the root source itself was historically truncated. A mirror gate answers 'target equals source'; it does not answer 'source is syntactically complete'.

For MiniProgram style assets, pair mirror freshness with a syntax/integrity gate that at minimum catches EOF inside a rule/declaration, unbalanced braces/parentheses/quotes/comments, and malformed property values caused by truncation.

## Reconstructed legacy assets require human visual acceptance

LIVEFIX03 repaired a historically truncated stylesheet by reconstruction because no complete source existed in Git, local refs, worktrees or project-specific recovery locations. Static structure/class coverage can prove consistency with current markup, but cannot prove historical visual fidelity.

When an asset is RECONSTRUCTED rather than RECOVERED, keep that distinction explicit and require real platform compile + human visual QA before treating the UI as fully accepted.

Also avoid repeating broad DevTools cache scans for source recovery: LIVEFIX03 scanned about 1.4G of Local/Roaming DevTools cache without finding project source, establishing that cache location as low-value for future recovery attempts.

## Dedicated audit tests and aggregate coverage

A production-facing gate integrated into a routinely-run suite can protect the real current files, but the gate's own negative controls are only protected when its dedicated test suite also participates in a broader final/aggregate test plan. LIVEFIX03 currently relies on UI04C route-guard integration for routine real-file coverage while its dedicated negative-control suite remains separate. Add it to aggregate orchestration during the next test-plan maintenance/final-audit update rather than creating a standalone micro-task.

## CloudBase missing-document error shapes vary by runtime

A second real WeChat cloud smoke on 2026-10-05 showed the same benign empty-document condition as `errCode: -1` with `errMsg: document.get:fail document with _id <32-hex-id> does not exist`, rather than the earlier `-502005` / `document.get failed because ...` shape.

Do not key absence normalization on one SDK numeric code. Also do not broadly swallow generic `-1`. Accept only positively identified document-not-found shapes with exact operation/message evidence, while keeping collection absence, permission, network, transaction and unknown failures fatal.

## Fast-lane dedicated suites must rejoin final aggregate

LIVEFIX03 and LIVEFIX04 intentionally used fast-lane dedicated suites and skipped aggregate npm test. Their production-facing checks are still protected by route/cloud smoke gates, but their dedicated negative controls are not automatically rerun by the current aggregate script.

Do not create micro-tasks just to fix this during a live smoke loop. At the next explicit final-audit or test-plan maintenance milestone, add the accepted LIVEFIX03/LIVEFIX04 dedicated suites to aggregate orchestration so boundary-algorithm negative controls are not permanently detached from full regression.

## LIVEQA06 real DevTools project detection and two-file local synchronization (reported 2026-10-09)

WorkBuddy's on-machine log inspection found that the **DevTools active project is not necessarily the main Git clone**. The observed open-last-project directory was:
`C:\Users\Administrator\WorkBuddy\Worktrees\tianfu-sim\dev-tianfu-2-0-e746fd55`.
A separate main clone at `C:\Users\Administrator\Documents\GitHub\tianfu-sim` existed but was behind the accepted dev branch. Use the path actually referenced by DevTools (`autoOpen/openLastModifiedProject` or its current project config/log), not a guess from `project.config.json` alone. Treat both paths as observed environment details, not permanent conventions.

On this machine the DevTools installation was reported at `D:\微信web开发者工具` with `cli.bat`, and the running IDE HTTP service used port `34863` (`Default\\.ide`). **Detect the current IDE port on each attempt**; do not hard-code it and do not open a duplicate project window.

For accepted LIVEFIX06, WorkBuddy reported the active worktree already at `31bbc5b4` with both `v2-live.js` and `content01-zh-cn.js` matching their remote blobs byte-for-byte. The main clone needed the two-file API sync due to one failed SSL handshake. In the active worktree, CLI compiler logs showed simulator launch, appservice load, and no project compile/module errors. This is *reported local compile evidence*, **not** direct Controller inspection or human visual acceptance. Visual Chinese EVENT check remains pending.

Future local operations should be delegated to WorkBuddy first: discover the *actual* active DevTools project path, inspect dirty files, use narrowly scoped file updates (API fallback when Git transport fails), and leave final game clicks/visual confirmation to the user. Never hard reset, bulk pull, clear database, or override pre-existing dirty files just to sync the client.
