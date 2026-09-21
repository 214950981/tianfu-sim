import type { CommandEnvelope, CommandResult, GameCommand } from "../../core/src/index.ts";

export const platformContractBoundary = "platform-contract" as const;

export type PageState = "START" | "MODE_SELECT" | "DESTINY_OFFER" | "RUN_OPENING" | "RUN_HOME" | "EVENT" | "SPECIAL_NODE" | "LIFE_ARCHIVE" | "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
export type InteractionState = "idle" | "submitting" | "confirmed" | "retryableError" | "fatalError";
export type PublicJson = string | number | boolean | null | PublicJson[] | { [key: string]: PublicJson };
export type RiskPresentation = Readonly<{
  tier: "low" | "caution" | "dangerous" | "lethal";
  canBeFatal: boolean;
  reasons: string[];
  level?: "safe" | "guarded" | "dangerous" | "unknown";
  labelKey?: string;
  detailKey?: string;
}>;
export type KnownCapability = "DailyChallengeCapability" | "AdCapability" | "RewardedAdCapability" | "CommerceCapability" | "ShareCapability" | "AiNarrativeCapability" | "PlatformCapability";
export type CapabilitySet = Readonly<Record<KnownCapability, boolean>>;

export interface PublicCause { publicId: string; level: "explicit" | "hinted"; titleKey?: string; summaryKey: string }
export interface PublicState {
  schemaVersion: number; rulesVersion: string; contentVersion: string; stateVersion: number; runId: string;
  pageState: PageState; runStatus: "offered" | "active" | "dying" | "ended" | "abandoned";
  publicRun: Record<string, PublicJson>; capabilities: CapabilitySet; publicCauses: PublicCause[];
}
export interface PublicOption { optionId: string; labelKey: string; riskPresentation?: RiskPresentation }
export interface CurrentInteraction {
  interactionId: string; kind: "destinyOffer" | "event" | "specialNode" | "ending" | "rebirth";
  titleKey: string; body: PublicJson; options: PublicOption[]; interactionState: InteractionState; retryCommandId?: string;
}
export interface PublicHistoryEntry { entryId: string; kind: string; titleKey: string; summaryKey: string; data?: Record<string, PublicJson> }
export interface PublicHistory { entries: PublicHistoryEntry[] }
export interface ShareViewModel { title: string; summary: string; imageKey?: string; facts: Array<{ label: string; value: string }> }
export interface PublicViewModel { state: PublicState; currentInteraction?: CurrentInteraction; history: PublicHistory; share: ShareViewModel }

export interface ApplicationTransport {
  sendCommand(command: CommandEnvelope<GameCommand>): Promise<CommandResult>;
  fetchView(runId: string): Promise<unknown>;
  createRunOffer(): Promise<unknown>;
}
export interface PlatformStorage { getLocal(key: string): Promise<string | null>; setLocal(key: string, value: string): Promise<void> }
