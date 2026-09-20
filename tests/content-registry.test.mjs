import assert from "node:assert/strict";
import test from "node:test";

import {
  ContentRegistry,
  ContentValidationError,
  computePackChecksum,
  sealContentPack,
  validateContentPack
} from "../packages/content/src/index.ts";

function draft(contentVersion = "content-1") {
  return {
    manifest: { schemaVersion: 2, packId: `pack-${contentVersion}`, rulesVersion: "2.0.0", contentVersion },
    references: { items: ["item.tea"], components: [], npcTemplates: [], regions: ["region.start", "region.next"], endings: [], causes: [], conditions: [] },
    events: [{
      id: "event.start", version: 1, kind: "choice", titleKey: "event.start.title", tags: ["dev-fixture"], weight: 100,
      choices: [{
        id: "take-tea", scope: "core", labelKey: "event.start.take-tea",
        outcomes: { success: { effects: [{ op: "ADD_ITEM", itemId: "item.tea", amount: 1 }] } }
      }],
      fallback: { bodyKey: "event.start.body" }
    }]
  };
}

test("CNT-001: duplicate stable IDs fail validation", () => {
  const value = draft(); value.events.push(structuredClone(value.events[0]));
  assert.throws(() => validateContentPack(sealContentPack(value)), /duplicate id/);
  const duplicateReference = draft(); duplicateReference.references.items.push("item.tea");
  assert.throws(() => validateContentPack(sealContentPack(duplicateReference)), /duplicate id/);
});

test("CNT-002: broken references fail validation", () => {
  const value = draft(); value.events[0].choices[0].outcomes.success.effects[0].itemId = "item.missing";
  assert.throws(() => validateContentPack(sealContentPack(value)), /unknown reference/);
});

test("CNT-005: locked content version mismatch fails validation", () => {
  const pack = sealContentPack(draft("content-old"));
  assert.throws(() => validateContentPack(pack, "content-new"), /locked contentVersion/);
});

test("CNT-010: unknown DSL operations and executable values are rejected", () => {
  const unknownEffect = draft(); unknownEffect.events[0].choices[0].outcomes.success.effects = [{ op: "EXECUTE_CODE", code: "return 1" }];
  assert.throws(() => validateContentPack(sealContentPack(unknownEffect)), /unknown effect/);
  const executable = draft(); executable.events[0].ai = () => "not data";
  assert.throws(() => validateContentPack(sealContentPack(executable)), ContentValidationError);
});

test("manifest_determinism: canonical checksum ignores object key and registry set ordering", () => {
  const first = draft();
  const second = {
    events: structuredClone(first.events),
    references: { conditions: [], causes: [], endings: [], regions: ["region.next", "region.start"], npcTemplates: [], components: [], items: ["item.tea"] },
    manifest: { contentVersion: "content-1", rulesVersion: "2.0.0", packId: "pack-content-1", schemaVersion: 2 }
  };
  assert.equal(computePackChecksum(first), computePackChecksum(second));
  assert.doesNotThrow(() => validateContentPack(sealContentPack(first)));
});

test("locked contentVersion remains retrievable after newer content registration", () => {
  const registry = new ContentRegistry();
  const oldPack = registry.register(sealContentPack(draft("content-old")));
  registry.register(sealContentPack(draft("content-new")));
  assert.strictEqual(registry.get("content-old"), oldPack);
  assert.equal(registry.getEvent("content-old", "event.start").id, "event.start");
  assert.equal(Object.isFrozen(oldPack), true);
});
