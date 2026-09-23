import type { GameCommand } from "../../core/src/index.ts";
import { canOrdinaryBack, type SubmissionSnapshot } from "../../application-ui/src/index.ts";
import type { PublicJson, PublicViewModel } from "../../platform-contract/src/index.ts";

export interface WeChatPageShellModel {
  pageState: PublicViewModel["state"]["pageState"];
  interactionLocked: boolean;
  ordinaryBackAllowed: boolean;
  visibleEntries: { dailyChallenge: boolean; rewardedAd: boolean; commerce: boolean; share: boolean; aiNarrative: boolean };
  titleKey?: string;
  optionLabels: string[];
}

export function buildWeChatPageShell(view: PublicViewModel, submission: SubmissionSnapshot): WeChatPageShellModel {
  const capability = view.state.capabilities;
  const platformAvailable = capability.PlatformCapability;
  return {
    pageState: view.state.pageState,
    interactionLocked: submission.mutuallyExclusiveLocked,
    ordinaryBackAllowed: canOrdinaryBack(view.state.pageState, submission.interactionState),
    visibleEntries: {
      dailyChallenge: capability.DailyChallengeCapability,
      rewardedAd: platformAvailable && capability.RewardedAdCapability,
      commerce: platformAvailable && capability.CommerceCapability,
      share: platformAvailable && capability.ShareCapability,
      aiNarrative: capability.AiNarrativeCapability
    },
    ...(view.currentInteraction === undefined ? {} : { titleKey: view.currentInteraction.titleKey }),
    optionLabels: view.currentInteraction?.options.map((option) => option.labelKey) ?? []
  };
}

/**
 * UI02 platform-neutral intent mapping.
 *
 * The shell turns an already-projected, server-authoritative public entry into a GameCommand intent.
 * It performs no rule calculation of any kind: it does not compute eligibility, difficulty, odds,
 * cost or outcome. It only reads the projected availability flag and emits the matching command.
 */
export const CORE_ACTION_IDS = ["cultivate", "travel", "worldly", "pursuit"] as const;
export type CoreActionId = (typeof CORE_ACTION_IDS)[number];

export interface ShellIntent {
  intentId: string;
  labelKey: string;
  command: GameCommand;
  enabled: boolean;
}

function isCoreActionId(value: unknown): value is CoreActionId {
  return typeof value === "string" && (CORE_ACTION_IDS as readonly string[]).includes(value);
}

function projectedEntries(view: PublicViewModel, key: string): Record<string, PublicJson>[] {
  const value: PublicJson | undefined = view.state.publicRun[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, PublicJson> => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}

/** Bounded to the four core action ids. Unknown or malformed projections are dropped, never guessed. */
export function mapCoreActionIntents(view: PublicViewModel): ShellIntent[] {
  return projectedEntries(view, "actions").flatMap((entry): ShellIntent[] => {
    if (!isCoreActionId(entry.actionId)) return [];
    return [{
      intentId: `core.${entry.actionId}`,
      labelKey: typeof entry.labelKey === "string" ? entry.labelKey : `action.${entry.actionId}`,
      command: { type: "CHOOSE_ACTION", actionId: entry.actionId },
      enabled: entry.enabled === true
    }];
  });
}

/**
 * Emits ATTEMPT_BREAKTHROUGH only from the server-projected public availability flag.
 * No client-side score, difficulty, modifier, RNG or outcome field is ever produced.
 */
export function mapSpecialActionIntents(view: PublicViewModel): ShellIntent[] {
  return projectedEntries(view, "specialActions").flatMap((entry): ShellIntent[] => {
    if (entry.actionId !== "attemptBreakthrough") return [];
    return [{
      intentId: "special.attemptBreakthrough",
      labelKey: typeof entry.labelKey === "string" ? entry.labelKey : "special.attemptBreakthrough",
      command: { type: "ATTEMPT_BREAKTHROUGH" },
      enabled: entry.available === true
    }];
  });
}

export interface ArchiveEntryView { entryId: string; kind: string; titleKey: string; summaryKey: string; data?: Record<string, PublicJson> }
export interface ArchiveCauseView { publicId: string; level: "explicit" | "hinted"; titleKey?: string; summaryKey: string }
export interface ArchiveBuildView { buildId: string; displayName?: string; stage: string; labelKey: string; dominant: boolean }
export interface ArchivePersonView { npcId: string; displayName: string; knownRoles: string[]; knownStatus: string; milestones: PublicJson[] }

/**
 * UI02 LIFE_ARCHIVE presentation projection: read-only, and a pure selection over the already-public
 * ViewModel. Hidden Causes are never sent by the server, so they cannot appear here even by accident;
 * this builder never re-derives or re-interprets Cause visibility.
 */
export interface WeChatArchiveModel {
  readOnly: true;
  runName?: string;
  history: ArchiveEntryView[];
  causes: ArchiveCauseView[];
  builds: ArchiveBuildView[];
  people: ArchivePersonView[];
  death?: Record<string, PublicJson>;
}

function asRecords(value: PublicJson | undefined): Record<string, PublicJson>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, PublicJson> => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}
const str = (value: PublicJson | undefined): string | undefined => (typeof value === "string" ? value : undefined);

export function buildArchiveView(view: PublicViewModel): WeChatArchiveModel {
  const run = view.state.publicRun;
  return {
    readOnly: true,
    ...(str(run.runName) === undefined ? {} : { runName: str(run.runName) as string }),
    history: view.history.entries.map((entry) => ({ entryId: entry.entryId, kind: entry.kind, titleKey: entry.titleKey, summaryKey: entry.summaryKey, ...(entry.data === undefined ? {} : { data: entry.data }) })),
    causes: view.state.publicCauses.map((cause) => ({ publicId: cause.publicId, level: cause.level, ...(cause.titleKey === undefined ? {} : { titleKey: cause.titleKey }), summaryKey: cause.summaryKey })),
    builds: asRecords(run.builds).flatMap((entry): ArchiveBuildView[] => {
      const buildId = str(entry.buildId);
      if (buildId === undefined) return [];
      return [{ buildId, ...(str(entry.displayName) === undefined ? {} : { displayName: str(entry.displayName) as string }), stage: str(entry.stage) ?? "latent", labelKey: str(entry.labelKey) ?? `build.${buildId}.latent`, dominant: entry.dominant === true }];
    }),
    people: asRecords(run.people).flatMap((entry): ArchivePersonView[] => {
      const npcId = str(entry.npcId);
      if (npcId === undefined) return [];
      return [{ npcId, displayName: str(entry.displayName) ?? npcId, knownRoles: Array.isArray(entry.knownRoles) ? entry.knownRoles.filter((role): role is string => typeof role === "string") : [], knownStatus: str(entry.knownStatus) ?? "unknown", milestones: Array.isArray(entry.milestones) ? entry.milestones : [] }];
    }),
    ...(run.death === undefined || typeof run.death !== "object" || Array.isArray(run.death) ? {} : { death: run.death as Record<string, PublicJson> })
  };
}
