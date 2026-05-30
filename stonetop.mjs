import { StonetopCharacterSheet } from "./module/sheets/character-sheet.mjs";
import { StonetopSteadingSheet } from "./module/sheets/steading-sheet.mjs";
import { StonetopNPCSheet } from "./module/sheets/npc-sheet.mjs";
import { StonetopItemSheet } from "./module/sheets/item-sheet.mjs";

Hooks.once("init", async function () {
  console.log("Stonetop | Initializing system");

  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
  const ActorSheet = foundry.appv1.sheets.ActorSheet;
  const ItemSheet = foundry.appv1.sheets.ItemSheet;

  DocumentSheetConfig.unregisterSheet(Actor, "core", ActorSheet);

  DocumentSheetConfig.registerSheet(Actor, "stonetop", StonetopCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "Stonetop Character Sheet"
  });

  DocumentSheetConfig.registerSheet(Actor, "stonetop", StonetopSteadingSheet, {
    types: ["steading"],
    makeDefault: true,
    label: "Stonetop Steading Sheet"
  });

  DocumentSheetConfig.registerSheet(Actor, "stonetop", StonetopNPCSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "Stonetop NPC Sheet"
  });

  DocumentSheetConfig.unregisterSheet(Item, "core", ItemSheet);

  DocumentSheetConfig.registerSheet(Item, "stonetop", StonetopItemSheet, {
    makeDefault: true,
    label: "Stonetop Item Sheet"
  });
});
Hooks.on("preCreateActor", function (actor, createData, options, userId) {
  if (actor.type !== "steading") return;
  const actorName = actor.name?.trim();
  if (actorName && actorName !== "New Actor") return;

  actor.updateSource({ name: "Stonetop" });
});
