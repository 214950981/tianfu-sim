import {
  CONTENT01_PACK,
  NPC_CONTENT01_V1,
  ContentRegistry,
} from "../packages/content/src/index.ts";

const registry = new ContentRegistry();
registry.registerNpcPack(NPC_CONTENT01_V1);
const registered = registry.register(CONTENT01_PACK);

console.log(JSON.stringify({
  contentVersion: registered.manifest.contentVersion,
  checksum: registered.manifest.checksum,
  events: registered.events.length,
  causeTemplates: registered.causeTemplates.length,
  npcDefinitions: registry.getNpc(registered.manifest.contentVersion).coreDefinitions.length,
  npcArchetypes: registry.getNpc(registered.manifest.contentVersion).archetypes.length,
}, null, 2));
