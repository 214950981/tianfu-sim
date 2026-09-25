/**
 * UI04D — CloudBase document-database gateway store.
 *
 * This is a *port implementation*, not a second gateway: it answers exactly the `GatewayStore`
 * questions `CommandGateway` asks (read a run, transact over runs / command idempotency / bootstrap
 * mappings) and it changes none of the settlement semantics. Everything that makes a command settle
 * once — the payload fingerprint, the STATE_CONFLICT version comparison, the ownership check, the
 * snapshot cadence — still lives in `CommandGateway`.
 *
 * THREE PROPERTIES THE CLOUD DEPLOYMENT NEEDS
 *
 *  1. **Deterministic document ids.** Every id is a hex digest of its logical key (run id, commandId,
 *     playerId+bootstrapId), so the transactional path never queries: it addresses a document. A CloudBase
 *     transaction supports server-side `doc()` reads and writes; a `where` query inside one is exactly the
 *     thing that does not work, and it is also what would make the transaction non-atomic. There is no
 *     `.where(` anywhere in this file, and a test asserts that at source level.
 *  2. **Read-your-writes inside the transaction.** Writes are staged in the view and flushed after the
 *     operation resolves, still inside `runTransaction`. So a second read of the same run in one
 *     settlement sees the staged value, and an operation that throws flushes nothing.
 *  3. **Cold-start safe.** Nothing is cached between calls: every transaction re-reads, so a fresh
 *     handler instance settles against the same documents as the one that timed out.
 *
 * The database object is *injected*. This module names no SDK, so the same implementation runs against
 * the real `cloud.database()` in the cloud function and against a fake in tests.
 */

import { sha256Utf8 } from "../../packages/core/src/sha256.ts";
import type { BootstrapRecord, GatewayStore, GatewayTransactionView, IdempotencyRecord, StoredRun, TerminalTransitionRecord } from "./gateway-store.ts";

/** The minimal CloudBase document-database surface this store uses. */
export interface CloudDocumentSnapshot { data?: Record<string, unknown> | null }
export interface CloudDocumentReference {
  get(): Promise<CloudDocumentSnapshot>;
  set(input: { data: Record<string, unknown> }): Promise<unknown>;
}
export interface CloudCollectionReference {
  doc(id: string): CloudDocumentReference;
  /** Present on the real client, deliberately absent from anything this store calls inside a transaction. */
  where?(query: Record<string, unknown>): unknown;
}
export interface CloudTransaction { collection(name: string): CloudCollectionReference }
export interface CloudDatabase {
  collection(name: string): CloudCollectionReference;
  runTransaction<T>(operation: (transaction: CloudTransaction) => Promise<T>, times?: number): Promise<T>;
}

/** Collection names. Document ids inside each are hex digests, so the names carry the human meaning. */
export const RUNS_COLLECTION = "tianfu2_runs";
export const COMMANDS_COLLECTION = "tianfu2_commands";
export const BOOTSTRAPS_COLLECTION = "tianfu2_bootstraps";
/** UI04E — exactly-once terminal transition receipts, addressed by `terminalTransitionId`. */
export const TERMINAL_TRANSITIONS_COLLECTION = "tianfu2_terminal_transitions";

const ID_LENGTH = 32;

function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
/** A deterministic, character-safe document id for a logical key. Hex only: safe as a CloudBase `_id`. */
export function documentIdFor(kind: string, key: string): string { return hex(sha256Utf8(`tianfu2/${kind}/${key}`)).slice(0, ID_LENGTH); }

/** Strips CloudBase-managed fields and normalises to plain JSON, so a stored doc is byte-stable. */
function toDocument(value: unknown): Record<string, unknown> {
  const plain = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const key of Object.keys(plain)) if (key.startsWith("_")) delete plain[key];
  return plain;
}
function fromDocument<T>(data: unknown): T | undefined {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  return JSON.parse(JSON.stringify(data)) as T;
}

/** A stored run must actually be a run; a half-written document must fail loudly, not behave like one. */
function asStoredRun(data: unknown): StoredRun | undefined {
  const record = fromDocument<Record<string, unknown>>(data);
  if (record === undefined || record.state === undefined || record.commandLog === undefined) return undefined;
  return record as unknown as StoredRun;
}

// ---------------------------------------------------------------------------
// LIVEFIX01 — real CloudBase empty-read normalization.
//
// Real WeChat CloudBase does NOT return an empty snapshot for a nonexistent document: with the
// collection provisioned, `collection(name).doc(id).get()` can REJECT. On a freshly provisioned but
// empty database that rejection hit every first-use read (bootstrap mapping, run, command receipt,
// terminal receipt), so the very first `createRunOffer` blew up before it could create anything and the
// client only saw `createRunOffer result.runId must be a non-empty string`.
//
// The fix belongs here, at the persistence boundary, and it is deliberately NARROW:
//
//   - only an actual missing DOCUMENT is normalized to `undefined`;
//   - a missing COLLECTION is an operational/deployment error and stays fatal — real smoke has observed
//     the same broad ResourceNotFound numeric code for it, so the code alone is never the discriminator;
//   - permission, network, transaction, malformed and unknown errors stay fatal (fail closed).
// ---------------------------------------------------------------------------

/** The ResourceNotFound family code real CloudBase returned for the observed missing-document read. */
export const CLOUDBASE_RESOURCE_NOT_FOUND_CODE = -502005;

/**
 * Text of the observed production rejection. Kept as a literal so the classifier, the harness and the
 * tests all agree on one shape instead of three loosely similar regexes.
 */
export const CLOUDBASE_MISSING_DOCUMENT_MESSAGE = "document.get failed because document with deterministic _id does not exist";

/**
 * Collection-level absence. Real CloudBase reports it under the same broad ResourceNotFound family, so
 * any message that names a collection as absent must NEVER be treated as an empty document — a missing
 * collection is a deployment prerequisite violation, not a first-use absence.
 */
const COLLECTION_ABSENCE = /(collection|集合)[^\n]{0,60}(not\s+exist|does\s+not\s+exist|not\s+found|missing|不存在)/i;

/**
 * Document-level absence. Two pieces of evidence are required together: the sentence is about a
 * *document*, and it says the document is absent. Either alone is too loose.
 */
const DOCUMENT_ABSENCE_SUBJECT = /document[^\n]{0,80}_id|_id[^\n]{0,40}document|document\s+with\s+_id/i;
const ABSENCE_CLAIM = /(does\s+not\s+exist|do\s+not\s+exist|not\s+exist|not\s+found|不存在)/i;

function fieldOf(error: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = error[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/**
 * True only for the exact benign "this document is not there yet" rejection.
 *
 * Two shapes are accepted, because the SDK has been observed reporting the same condition both with and
 * without a numeric code. Anything else — including anything the classifier cannot positively identify —
 * returns false so the caller rethrows.
 */
export function isMissingDocumentError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const message = fieldOf(record, ["message", "errMsg", "errorMsg", "errorMessage"]);
  if (message === undefined) return false;

  // Collection absence always wins: it is never a first-use empty document.
  if (COLLECTION_ABSENCE.test(message) === true) return false;
  if (DOCUMENT_ABSENCE_SUBJECT.test(message) !== true) return false;
  if (ABSENCE_CLAIM.test(message) !== true) return false;

  // Shape B — the literal production sentence, accepted with or without a code. Nothing else in the SDK's
  // vocabulary can accidentally match it, so this is the only uncoded message ever normalized.
  if (message.toLowerCase().includes(CLOUDBASE_MISSING_DOCUMENT_MESSAGE)) return true;

  // Shape A — coded. The code must be the observed ResourceNotFound family and nothing else, and an error
  // with no code at all is not this shape.
  const coded = fieldOf(record, ["errCode", "code", "errorCode"]) ?? record.errCode ?? record.code ?? record.errorCode;
  if (coded === undefined) return false;
  const numeric = typeof coded === "number" ? coded : Number(coded);
  return numeric === CLOUDBASE_RESOURCE_NOT_FOUND_CODE;
}

/** Reads one document, normalizing ONLY a real missing-document rejection to `undefined`. */
async function readDocumentData(reference: CloudDocumentReference): Promise<unknown> {
  try {
    const snapshot = await reference.get();
    return snapshot?.data;
  } catch (error) {
    if (isMissingDocumentError(error) === true) return undefined;
    throw error;
  }
}

export interface CloudBaseGatewayStoreOptions { database: CloudDatabase; collections?: { runs?: string; commands?: string; bootstraps?: string; terminalTransitions?: string } }

export class CloudBaseGatewayStore implements GatewayStore {
  readonly #database: CloudDatabase;
  readonly #runs: string;
  readonly #commands: string;
  readonly #bootstraps: string;
  readonly #terminalTransitions: string;

  constructor(options: CloudBaseGatewayStoreOptions) {
    if (options === null || typeof options !== "object" || options.database === undefined) throw new RangeError("a CloudBase database handle is required");
    this.#database = options.database;
    this.#runs = options.collections?.runs ?? RUNS_COLLECTION;
    this.#commands = options.collections?.commands ?? COMMANDS_COLLECTION;
    this.#bootstraps = options.collections?.bootstraps ?? BOOTSTRAPS_COLLECTION;
    this.#terminalTransitions = options.collections?.terminalTransitions ?? TERMINAL_TRANSITIONS_COLLECTION;
  }

  async readRun(runId: string): Promise<StoredRun | undefined> {
    // LIVEFIX01: an unknown run is a normal first-use absence, not an error. A missing collection is.
    return asStoredRun(await readDocumentData(this.#database.collection(this.#runs).doc(documentIdFor("run", runId))));
  }

  /**
   * Runs one gateway settlement inside a server-side transaction.
   *
   * The operation decides; the store only serves reads and flushes exactly what the operation staged. A
   * thrown operation therefore commits nothing at all, which is what keeps a failed reducer or an
   * unexpected error from leaving a half-settled run behind.
   */
  async transact<T>(operation: (view: GatewayTransactionView) => Promise<T> | T): Promise<T> {
    return await this.#database.runTransaction(async (transaction) => {
      const stagedRuns = new Map<string, StoredRun>();
      const stagedIdempotency = new Map<string, IdempotencyRecord>();
      const stagedBootstraps = new Map<string, BootstrapRecord>();
      const stagedTerminalTransitions = new Map<string, TerminalTransitionRecord>();

      // LIVEFIX01: every transactional read shares the same empty-read semantics — runs, command
      // idempotency receipts, bootstrap mappings and terminal-transition receipts alike. A document that
      // does not exist yet is `undefined`; anything else stays fatal.
      const read = async (collection: string, kind: string, key: string): Promise<unknown> =>
        await readDocumentData(transaction.collection(collection).doc(documentIdFor(kind, key)));
      const view: GatewayTransactionView = {
        getRun: async (runId) => {
          const staged = stagedRuns.get(runId);
          if (staged !== undefined) return staged;
          return asStoredRun(await read(this.#runs, "run", runId));
        },
        setRun: (runId, value) => { stagedRuns.set(runId, value); },
        getIdempotency: async (commandId) => {
          const staged = stagedIdempotency.get(commandId);
          if (staged !== undefined) return staged;
          return fromDocument<IdempotencyRecord>(await read(this.#commands, "command", commandId));
        },
        setIdempotency: (commandId, value) => { stagedIdempotency.set(commandId, value); },
        getBootstrap: async (bootstrapKey) => {
          const staged = stagedBootstraps.get(bootstrapKey);
          if (staged !== undefined) return staged;
          return fromDocument<BootstrapRecord>(await read(this.#bootstraps, "bootstrap", bootstrapKey));
        },
        setBootstrap: (bootstrapKey, value) => { stagedBootstraps.set(bootstrapKey, value); },
        getTerminalTransition: async (terminalTransitionId) => {
          const staged = stagedTerminalTransitions.get(terminalTransitionId);
          if (staged !== undefined) return staged;
          return fromDocument<TerminalTransitionRecord>(await read(this.#terminalTransitions, "terminal-transition", terminalTransitionId));
        },
        setTerminalTransition: (terminalTransitionId, value) => { stagedTerminalTransitions.set(terminalTransitionId, value); }
      };

      const result = await operation(view);
      for (const [runId, value] of stagedRuns) await transaction.collection(this.#runs).doc(documentIdFor("run", runId)).set({ data: toDocument(value) });
      for (const [commandId, value] of stagedIdempotency) await transaction.collection(this.#commands).doc(documentIdFor("command", commandId)).set({ data: { ...toDocument(value), commandId } });
      for (const [bootstrapKey, value] of stagedBootstraps) await transaction.collection(this.#bootstraps).doc(documentIdFor("bootstrap", bootstrapKey)).set({ data: { ...toDocument(value), bootstrapKey } });
      for (const [terminalTransitionId, value] of stagedTerminalTransitions) await transaction.collection(this.#terminalTransitions).doc(documentIdFor("terminal-transition", terminalTransitionId)).set({ data: { ...toDocument(value), terminalTransitionId } });
      return result;
    });
  }
}
