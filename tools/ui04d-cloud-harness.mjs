/**
 * UI04D — cloud function harness.
 *
 * The point of this file is to make the *real* `cloudfunctions/tianfu2/index.js` executable outside the
 * WeChat cloud, so the thing under test is the deployable host itself rather than a re-implementation of
 * it. Three seams are injected, and nothing else is faked:
 *
 *   - `wx-server-sdk` — an in-memory stand-in exposing `init`, `DYNAMIC_CURRENT_ENV`, `getWXContext` and
 *     `database()`. `getWXContext().OPENID` is the identity source a real deployment uses, so the harness
 *     is exactly as authoritative as the platform.
 *   - the CloudBase document database — collections of documents addressed by id, with server-side
 *     `runTransaction` semantics: staged writes, commit after the operation resolves, and a retry budget
 *     like the platform's. `where()` inside a transaction throws, which is what proves the store never
 *     depends on a query inside the transactional path.
 *   - `crypto` — deterministic, so a test can assert idempotency without depending on real entropy.
 *
 * Two realism rules are enforced here deliberately:
 *
 *  1. The request payload is serialised and re-parsed **inside** the handler's realm, because a real cloud
 *     call does that too. It also keeps a test from passing by accident across realms: the generated
 *     validators reject an object whose prototype is not the realm's own.
 *  2. Each `loadCloudFunction()` call evaluates `index.js` in a **fresh** realm, which is what a cold start
 *     is. A second call therefore reproduces the cold-handler case: no cached registry, no cached store,
 *     only the documents the first handler committed.
 *
 * Usage: see `tools/ui04d-cloud-runtime-smoke.mjs` (CLI) and `tests/ui04d.test.mjs` (suite).
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const CLOUD_FUNCTION_DIR = "cloudfunctions/tianfu2";
export const HOST_PATH = CLOUD_FUNCTION_DIR + "/index.js";

/** Raised when a store tries to query inside a transaction — the thing the design forbids. */
export class TransactionQueryError extends Error {
  constructor(collection) { super(`collection ${collection}: a where() query inside a transaction is not supported`); this.name = "TransactionQueryError"; }
}

/**
 * Raised *after* a transaction's writes were already applied, to model the failure that actually matters
 * for idempotency: the client's request was committed and then the response was lost (a timeout, a dropped
 * connection). The retry must recover the settled result, not settle again.
 */
export class PostCommitTimeoutError extends Error {
  constructor() { super("the transaction committed but the response was lost"); this.name = "PostCommitTimeoutError"; }
}

function jsonClone(value) { return JSON.parse(JSON.stringify(value)); }

/**
 * LIVEFIX01 — the four collections a correct deployment provisions before the first request.
 *
 * They start EMPTY, which is the supported first-use state: the first `createRunOffer` must create its
 * documents itself. A read against a collection that is *not* provisioned is a deployment error, not a
 * first-use absence, so the harness reproduces that separately below.
 */
export const CLOUDBASE_COLLECTIONS = ["tianfu2_runs", "tianfu2_commands", "tianfu2_bootstraps", "tianfu2_terminal_transitions"];

/** The one numeric family real CloudBase used for BOTH missing-document and missing-collection reads. */
export const RESOURCE_NOT_FOUND_CODE = -502005;

/**
 * LIVEFIX04 — the generic code the same benign missing-document condition arrived wrapped in on the
 * deployed function. Carries no information by itself: the platform returns it for permission, network
 * and transaction failures too.
 */
export const GENERIC_ERROR_CODE = -1;

/**
 * LIVEFIX04 — the exact production sentence, with a 32-hex id because that is what `documentIdFor`
 * produces. Kept as a template so the harness, the classifier and the tests cannot drift apart.
 */
export const GENERIC_MINUS_ONE_MESSAGE_ID = "3ce20f6c196afe9afe03504165d51dcf";

/** Selectable missing-document error shapes. "resourceNotFound" is the LIVEFIX01 default. */
export const MISSING_DOCUMENT_SHAPES = ["resourceNotFound", "genericMinusOne"];

function cloudError(message) {
  const error = new Error(message);
  error.errCode = RESOURCE_NOT_FOUND_CODE;
  error.errMsg = message;
  return error;
}

/** Shape A of the accepted missing-document rejection: coded, names the document `_id` as absent. */
export function missingDocumentError(id) {
  return cloudError(`[ResourceNotFound] document.get failed because document with _id ${id} does not exist`);
}

/**
 * LIVEFIX04 — the production shape: generic `errCode: -1` with the `document.get:fail` sentence.
 *
 * The code is set both numerically and as a string across the two helpers below so a test can prove that
 * `-1` and `"-1"` are both accepted for this exact message while every other `-1` stays fatal.
 */
export function genericMinusOneMissingDocumentError(id) {
  const error = new Error(`document.get:fail document with _id ${id} does not exist`);
  error.errCode = GENERIC_ERROR_CODE;
  error.errMsg = `document.get:fail document with _id ${id} does not exist`;
  return error;
}

/** The same production shape with a stringified code, as an SDK that stringifies would report it. */
export function genericMinusOneMissingDocumentErrorStringCode(id) {
  const error = new Error(`document.get:fail document with _id ${id} does not exist`);
  error.errCode = String(GENERIC_ERROR_CODE);
  error.errMsg = `document.get:fail document with _id ${id} does not exist`;
  return error;
}

/**
 * The near-miss that must stay FATAL: same numeric family, but the COLLECTION is absent. This is the
 * negative control the classifier is built around — swallowing it would hide a broken deployment.
 */
export function missingCollectionError(name) {
  return cloudError(`[ResourceNotFound] collection.get failed because collection ${name} does not exist`);
}

/**
 * An in-memory CloudBase-like document database.
 *
 * Documents are addressed by id only. `runTransaction` stages writes and commits them after the
 * operation resolves, so an operation that throws leaves the collection untouched, and a read inside the
 * transaction sees its own writes.
 */
/**
 * @param throwOnWhereInTransaction   keeps the no-query-inside-a-transaction invariant enforced.
 * @param provisionedCollections      collections that exist. Read/write against anything else fails.
 * @param missingDocumentMode         "reject" reproduces real CloudBase (default, and the whole point of
 *                                    LIVEFIX01); "empty" restores the old fake behaviour of returning
 *                                    `{ data: undefined }`, kept only so a test can contrast the two.
 * @param missingDocumentShape        which real missing-document wire shape a "reject" throws:
 *                                    "resourceNotFound" (LIVEFIX01, the -502005 family) or
 *                                    "genericMinusOne" (LIVEFIX04, the production errCode -1 wrapper).
 *                                    Both drive the SAME store, service and host, so a test can prove the
 *                                    boundary handles the real runtime shape without a special code path.
 */
export function createFakeCloudDatabase({
  throwOnWhereInTransaction = true,
  provisionedCollections = CLOUDBASE_COLLECTIONS,
  missingDocumentMode = "reject",
  missingDocumentShape = "resourceNotFound"
} = {}) {
  if (missingDocumentMode !== "reject" && missingDocumentMode !== "empty") throw new RangeError('missingDocumentMode must be "reject" or "empty"');
  if (!MISSING_DOCUMENT_SHAPES.includes(missingDocumentShape)) throw new RangeError(`missingDocumentShape must be one of ${MISSING_DOCUMENT_SHAPES.join(", ")}`);
  const missingDocument = missingDocumentShape === "genericMinusOne" ? genericMinusOneMissingDocumentError : missingDocumentError;
  const provisioned = new Set(provisionedCollections);
  const collections = new Map();
  const audits = { transactions: 0, attempts: 0, whereCalls: 0, writes: 0, documentIds: new Set(), postCommitTimeouts: 0 };
  let commitTimeoutPending = false;

  const documentsOf = (name) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };

  /** Test-only: write a document straight into the committed collection (bypassing the staged view).
   *  Used to seed a near-death offered state before a reducer-driven START_RUN. */
  const seedDoc = (name, id, data) => { documentsOf(name).set(id, jsonClone(data)); audits.documentIds.add(`${name}/${id}`); };

  /**
   * One document reference. `staged` is the transaction's write buffer (`name -> id -> data`) or `null`
   * outside a transaction; reads see staged writes first, so the transaction is read-your-writes.
   */
  function reference(staged, name, id, inTransaction) {
    const committed = documentsOf(name);
    return {
      async get() {
        // LIVEFIX01: a missing COLLECTION is a deployment error and is never normalized.
        if (provisioned.has(name) === false) throw missingCollectionError(name);
        const pending = staged === null ? undefined : staged.get(name);
        if (pending !== undefined && pending.has(id)) return { data: jsonClone(pending.get(id)) };
        const value = committed.get(id);
        if (value === undefined) {
          // Real CloudBase rejects this read instead of handing back an empty snapshot.
          if (missingDocumentMode === "reject") throw missingDocument(id);
          return { data: undefined };
        }
        return { data: jsonClone(value) };
      },
      async set(input) {
        if (provisioned.has(name) === false) throw missingCollectionError(name);
        audits.writes += 1;
        audits.documentIds.add(`${name}/${id}`);
        const data = jsonClone(input.data);
        if (staged === null) committed.set(id, data);
        else {
          if (!staged.has(name)) staged.set(name, new Map());
          staged.get(name).set(id, data);
        }
        return { stats: { updated: 1 } };
      },
      async remove() {
        const pending = staged === null ? undefined : staged.get(name);
        if (pending !== undefined) pending.delete(id);
        else committed.delete(id);
        return { stats: { removed: 1 } };
      },
      where() {
        audits.whereCalls += 1;
        if (inTransaction === true && throwOnWhereInTransaction === true) throw new TransactionQueryError(name);
        return { async get() { return { data: [] }; } };
      }
    };
  }

  const collection = (staged, inTransaction) => (name) => ({
    doc: (id) => {
      if (typeof id !== "string" || id.length === 0) throw new TypeError("document id must be a non-empty string");
      return reference(staged, name, id, inTransaction);
    },
    where: () => {
      audits.whereCalls += 1;
      if (inTransaction === true && throwOnWhereInTransaction === true) throw new TransactionQueryError(name);
      return { async get() { return { data: [] }; } };
    }
  });

  const database = {
    collection: collection(null, false),
    async runTransaction(operation, times = 3) {
      audits.transactions += 1;
      const staged = new Map();
      let lastError;
      for (let attempt = 0; attempt < times; attempt += 1) {
        audits.attempts += 1;
        staged.clear();
        try {
          const result = await operation({ collection: collection(staged, true) });
          for (const [name, documents] of staged) {
            const committed = documentsOf(name);
            for (const [id, data] of documents) committed.set(id, data);
          }
          // The response is lost *after* the writes landed: this is the retry case the design must survive.
          if (commitTimeoutPending === true) {
            commitTimeoutPending = false;
            audits.postCommitTimeouts += 1;
            throw new PostCommitTimeoutError();
          }
          return result;
        } catch (error) {
          lastError = error;
          // The real platform retries only on a write conflict; anything else aborts immediately, so a
          // genuine failure must not be retried into a different outcome.
          if (error !== null && typeof error === "object" && error.code === "DATABASE_CONFLICT") continue;
          throw error;
        }
      }
      throw lastError;
    },
    /**
     * Arms the post-commit timeout for the *next* transaction only.
     *
     * It is armed explicitly rather than at construction, because the first transaction of a fresh
     * database is `createRunOffer`; arming at construction would model a lost offer instead of the lost
     * command the idempotency design actually has to survive.
     */
    armPostCommitTimeout: () => { commitTimeoutPending = true; },
    seedDoc,
    /** Test-only introspection. */
    audit: () => ({ ...audits, documentIds: [...audits.documentIds].sort() }),
    snapshot: () => new Map([...collections].map(([name, documents]) => [name, new Map(documents)]))
  };
  return database;
}

/** The injected `wx-server-sdk`. Only the four members the host uses. */
export function createFakeServerSdk({ openid, database }) {
  let initialized = null;
  return {
    DYNAMIC_CURRENT_ENV: "DYNAMIC_CURRENT_ENV",
    init(options) { initialized = options; },
    initialisedWith: () => initialized,
    getWXContext: () => ({ OPENID: openid }),
    database: () => database
  };
}

/** Deterministic stand-in for `crypto.randomBytes`, so idempotency assertions do not depend on entropy. */
export function createFakeCrypto() {
  let counter = 0;
  return {
    randomBytes(size) {
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const block = createHash("sha256").update(`tianfu2/entropy/${counter}/${offset}`).digest();
        counter += 1;
        for (const byte of block) {
          if (offset >= size) break;
          bytes[offset] = byte;
          offset += 1;
        }
      }
      return bytes;
    }
  };
}

/**
 * Evaluates the committed cloud host in a fresh CommonJS realm — a cold start — with the injected seams.
 *
 * `main` is wrapped so the request payload crosses into the handler's realm the way a real cloud call
 * delivers it (serialised), and the response crosses back the same way. That is what makes the round trip
 * an honest test of the deployable file.
 */
export function loadCloudFunction({ openid = "o-test-openid", database = createFakeCloudDatabase(), crypto: cryptoModule = createFakeCrypto() } = {}) {
  const context = vm.createContext({ console, TextEncoder, setTimeout, clearTimeout, Buffer });
  const seams = {
    "wx-server-sdk": createFakeServerSdk({ openid, database }),
    crypto: cryptoModule
  };
  const root = path.join(REPO_ROOT, CLOUD_FUNCTION_DIR);
  const cache = new Map();

  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute);
    const object = { exports: {} };
    cache.set(absolute, object.exports);
    const filename = path.relative(REPO_ROOT, absolute).replace(/\\/g, "/");
    const wrapper = vm.runInContext(`(function (exports, module, require) {\n${fs.readFileSync(absolute, "utf8")}\n})`, context, { filename });
    wrapper(object.exports, object, (specifier) => {
      if (typeof specifier !== "string") throw new TypeError("require needs a string specifier");
      if (specifier.startsWith(".")) {
        const resolved = path.resolve(path.dirname(absolute), specifier);
        if (!resolved.startsWith(root + path.sep)) throw new Error("specifier escapes the cloud function: " + specifier);
        return load(resolved);
      }
      const seam = seams[specifier];
      if (seam === undefined) throw new Error("the cloud host may not require " + JSON.stringify(specifier));
      return seam;
    });
    cache.set(absolute, object.exports);
    return object.exports;
  };

  const handler = load(path.join(root, "index.js"));
  if (typeof handler.main !== "function") throw new Error("the cloud function must export main");

  const main = async (event) => {
    // Serialise into the handler's realm and back: a real cloud call does exactly this, and it keeps a
    // cross-realm prototype from silently satisfying (or failing) a validator.
    const payload = JSON.stringify(event === undefined ? {} : event);
    const local = vm.runInContext(`(JSON.parse(${JSON.stringify(payload)}))`, context);
    const result = await handler.main(local);
    return jsonClone(result);
  };

  return { main, context, database, handler };
}
