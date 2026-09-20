import { canOrdinaryBack, type SubmissionSnapshot } from "../../application-ui/src/index.ts";
import type { PublicViewModel } from "../../platform-contract/src/index.ts";

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
