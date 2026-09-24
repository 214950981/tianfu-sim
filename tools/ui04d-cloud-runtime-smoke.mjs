/**
 * UI04D — cloud runtime load smoke.
 *
 * `node tools/ui04d-cloud-runtime-smoke.mjs`
 *
 * Generation being byte-fresh and the dependency audit being green do not prove the artifact *loads*. This
 * tool loads the **committed deployable host** — `cloudfunctions/tianfu2/index.js` — the way the WeChat
 * cloud loads it: as CommonJS, in its own realm, with an injected `wx-server-sdk`, an injected
 * `getWXContext().OPENID` and an injected CloudBase-like database. It then drives the whole documented
 * path end to end and asserts the properties a reviewer cannot see from the diff:
 *
 *   1. `createRunOffer` returns a valid public ViewModel of a real CONTENT01 destiny offer;
 *   2. the same OPENID + bootstrapId returns the **same run**, including after a *cold handler start*;
 *   3. a different bootstrapId creates a different run;
 *   4. START_RUN settles, and `fetchView` then reports the server's next page state;
 *   5. another OPENID can neither read nor command that run, and learns nothing from the refusal;
 *   6. no `where()` query was issued on the transactional path and every document was addressed by id.
 *
 * Nothing here re-implements the host: the harness only injects the three platform seams. If this smoke
 * passes, the file a human uploads is the file that ran.
 */

import process from "node:process";

import { loadCloudFunction, createFakeCloudDatabase } from "./ui04d-cloud-harness.mjs";

const ALICE = "o-alice-smoke";
const BOB = "o-bob-smoke";
const BOOTSTRAP = "boot:smoke:1";

export async function runCloudRuntimeSmoke() {
  const database = createFakeCloudDatabase();
  const checks = [];
  const record = (name, ok, detail = "") => { checks.push({ name, ok: ok === true, detail }); return ok === true; };

  const handler = loadCloudFunction({ openid: ALICE, database });

  // 1. first bootstrap
  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: BOOTSTRAP });
  record("createRunOffer returns a public offer view", offer.view !== undefined && offer.view.state !== undefined, JSON.stringify(offer).slice(0, 160));
  record("the offer projects DESTINY_OFFER", offer.view?.state?.pageState === "DESTINY_OFFER");
  record("the response carries an authoritative playerId", typeof offer.playerId === "string" && offer.playerId.startsWith("p-"), offer.playerId);
  const serialized = JSON.stringify(offer);
  record("no rootSeed or OPENID in the response", !serialized.includes("rootSeed") && !serialized.includes(ALICE) && !serialized.toLowerCase().includes("openid"));
  record("the destiny offer publishes candidates", (offer.view?.currentInteraction?.options ?? []).length > 0);

  // 2. same-bootstrap retry, then a cold handler over the same database
  const retry = await handler.main({ operation: "createRunOffer", bootstrapId: BOOTSTRAP });
  record("same OPENID + bootstrapId returns the same run", retry.runId === offer.runId, `${offer.runId} vs ${retry.runId}`);
  const cold = loadCloudFunction({ openid: ALICE, database });
  const coldRetry = await cold.main({ operation: "createRunOffer", bootstrapId: BOOTSTRAP });
  record("a cold handler recovers the same run", coldRetry.runId === offer.runId);

  // 3. a different bootstrap key starts a different life
  const fresh = await cold.main({ operation: "createRunOffer", bootstrapId: "boot:smoke:2" });
  record("a different bootstrapId creates a new run", typeof fresh.runId === "string" && fresh.runId !== offer.runId);

  // 4. the full live chain
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  const started = await cold.main({
    operation: "sendCommand",
    command: {
      commandId: "cmd:smoke:start", playerId: offer.playerId, runId: offer.runId, expectedStateVersion: 0,
      rulesVersion: offer.rulesVersion, contentVersion: offer.contentVersion,
      clientPlatform: "wechat", clientBuild: "smoke",
      command: { type: "START_RUN", offerId: "offer-" + offer.runId, selectionId }
    }
  });
  record("START_RUN settles", started.ok === true, JSON.stringify(started));
  const view = await cold.main({ operation: "fetchView", runId: offer.runId });
  record("fetchView returns the authoritative next page state", typeof view.view?.state?.pageState === "string" && view.view.state.stateVersion === started.stateVersion, view.view?.state?.pageState);

  // 5. another OPENID is refused, and learns nothing
  const bob = loadCloudFunction({ openid: BOB, database });
  const bobFetch = await bob.main({ operation: "fetchView", runId: offer.runId });
  record("a foreign fetch is refused", bobFetch.ok === false && bobFetch.error?.code === "UNAUTHORIZED", JSON.stringify(bobFetch));
  record("the refusal leaks no run state", !JSON.stringify(bobFetch).includes(offer.runId) && bobFetch.view === undefined);
  const bobCommand = await bob.main({
    operation: "sendCommand",
    command: {
      commandId: "cmd:smoke:attack", playerId: offer.playerId, runId: offer.runId, expectedStateVersion: started.stateVersion,
      rulesVersion: offer.rulesVersion, contentVersion: offer.contentVersion,
      clientPlatform: "wechat", clientBuild: "smoke", command: { type: "CHOOSE_ACTION", actionId: "cultivate" }
    }
  });
  record("a foreign command is refused", bobCommand.ok === false && bobCommand.error?.code === "UNAUTHORIZED", JSON.stringify(bobCommand));

  // 6. the transactional path addresses documents by id only
  const audited = database.audit();
  record("no where() query was issued", audited.whereCalls === 0, String(audited.whereCalls));
  record("every document was addressed by a deterministic id", audited.documentIds.length > 0 && audited.documentIds.every((entry) => /^[0-9a-f]{32}$/.test(entry.split("/")[1])), audited.documentIds.join(", "));

  const failed = checks.filter((entry) => entry.ok === false);
  return { ok: failed.length === 0, checks, failures: failed.map((entry) => `${entry.name} :: ${entry.detail}`) };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  process.argv[1].replace(/\\/g, "/").endsWith("/tools/ui04d-cloud-runtime-smoke.mjs");

if (isDirectRun) {
  const result = await runCloudRuntimeSmoke();
  for (const entry of result.checks) console.log(`${entry.ok ? "ok  " : "FAIL"}  ${entry.name}${entry.detail ? "  — " + entry.detail : ""}`);
  if (result.ok) console.log(`UI04D cloud runtime smoke: PASS (${result.checks.length} checks)`);
  else {
    console.error(result.failures.join("\n"));
    process.exitCode = 1;
  }
}
