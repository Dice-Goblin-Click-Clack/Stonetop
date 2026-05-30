const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class StonetopSteadingSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["stonetop", "sheet", "actor", "steading"],
    position: {
      width: 1180,
      height: 760
    },
    window: {
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/stonetop/templates/sheets/steading-sheet.hbs"
    }
  };

  constructor(options = {}) {
    super(options);
    this._activeTab = "overview";
    this._expandedImprovements = new Set();
    this._expandedMoves = new Set();
    this._rosterSaveTimeouts = {
      residents: null,
      neighbors: null
    };
  }

  get title() {
    return this.actor?.name || "Stonetop";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.actor = this.actor;
    context.system = system;
    context.cssClass = "stonetop sheet actor steading";
    context.ratings = this._getSteadingRatings(system);
    context.debilityList = this._getSteadingDebilities(system);
    context.residentRows = this._getResidentRows(system);
    context.residentNames = this._getResidentNames(system);
    context.npcTraits = this._getNpcTraits(system);
    context.npcTraitColumns = this._getNpcTraitColumns(context.npcTraits);
    context.neighborRows = this._getNeighborRows(system);
    context.neighborPlaces = this._getNeighborPlaces(system);
    context.improvementColumns = await this._getImprovementColumns(system);
    context.homefrontMoves = await this._getHomefrontMoves();
    context.homefrontMoveColumns = this._getHomefrontMoveColumns(context.homefrontMoves);

    return context;
  }

  _getNpcTraitColumns(traitsText) {
    const traits = String(traitsText ?? "")
      .split(/\r?\n/)
      .map(trait => trait.trim())
      .filter(Boolean);

    const columnCount = 5;
    const rowsPerColumn = Math.ceil(traits.length / columnCount) || 1;

    return Array.from({ length: columnCount }, (_unused, index) => {
      const start = index * rowsPerColumn;
      return traits.slice(start, start + rowsPerColumn);
    });
  }


  _getNeighborRows(system) {
    const rows = system.neighborsRoster?.rows;

    if (Array.isArray(rows) && rows.length) {
      return rows.map(row => ({
        name: row?.name ?? "",
        occupation: row?.occupation ?? "",
        traits: row?.traits ?? ""
      }));
    }

    return [
      {
        name: "",
        occupation: "",
        traits: ""
      }
    ];
  }

  _getNeighborPlaces(system) {
    const defaults = [
      {
        title: "Marshedge",
        names: "Abben, Ailen, Brin, Brogan, Catlin, Coln, Daedre, Dermos, Ennin, Finnen, Gilor, Isbeal, Kiran, Lile, Lim, Mathuin, Mirne, Noren, Owan, Ragan, Renan, Seadha, Seann, Tierney, Ulliam"
      },
      {
        title: "Gordin’s Delve",
        names: "Choose from other lists; everyone comes to Gordin’s Delve from somewhere else."
      },
      {
        title: "The Steplands",
        names: "Adm, Blej, Cirl, Davth, Elst, Gwilm, Gwenl, Henri, Ines, Jenfir, Jown, Juda, Kiln, Laurl, Loic, Merrn, Maikl, Nanzl, Nolwn, Quent, Reegn, Ropr, Sabi, Stren, Yanz"
      },
      {
        title: "Lygos",
        names: "Agatte, Aref, Alix, Baraz, Canan, Darya, Demetra, Elene, Elios, Fotios, Faruza, Golza, Iasos, Iona, Kyriakos, Marika, Maayan, Osher, Natasa, Nivola, Rinat, Stamat, Thecla, Zhaleh"
      },
      {
        title: "Other Places",
        names: ""
      }
    ];

    const places = system.neighborPlaces ?? [];

    return defaults.map((place, index) => ({
      title: place.title,
      notes: places?.[index]?.notes ?? "",
      names: places?.[index]?.names ?? place.names
    }));
  }

  _getResidentRows(system) {
    const rows = system.residentsRoster?.rows;

    if (Array.isArray(rows) && rows.length) {
      return rows.map(row => ({
        name: row?.name ?? "",
        occupation: row?.occupation ?? "",
        traits: row?.traits ?? ""
      }));
    }

    return [
      {
        name: "",
        occupation: "",
        traits: ""
      }
    ];
  }

  _getResidentNames(system) {
    return system.residentNames ?? `Aderyn, Aeronwen, Afanen, Afon, Alun,
Andras, Aneirin, Awstin, Bedwyr,
Berwyn, Betrys, Braith, Briallen,
Bronwen, Bryn, Cadi, Cadoc, Cadwygan,
Caron, Cefin, Ceinwen, Ceridwyn, Cerys,
Colwyn, Deiniol, Dilwen, Dylis, Eifion,
Eirlys, Eluned, Emrys, Enfys, Eurwen,
Gaenor, Garet, Gethin, Glyndir, Heledd,
Hywel, Ifan, Iorwerth, Iwan, Lewela,
Leuca, Linos, Mado, Maldwyn, Malon,
Mared, Marged, Martyn, Meirion,
Menwen, Mererid, Neirin, Nia, Ofydd,
Olwyn, Owain, Padrig, Parry, Pryce,
Pryder, Rheinal, Rhisiart, Rhosyn,
Rydderch, Sawyl, Siana, Sioned, Talfryn,
Tegid, Tiwlip, Tomos, Tudyr,
Winifred, Yorath`;
  }

  _getNpcTraits(system) {
    return system.npcTraits ?? `all thumbs
ambitious
beloved by everyone
beautiful singing voice
best cook
best weaver
blind
braved the Ruined Tower
cautious
cheery
chronic cough
complains too much
cowardly
craves recognition
curious
dallied with the Fae years ago
deaf
desperately wants a child
distills the best whisky
doesn’t pull their weight
drunkard
eagle-eye
fearless
foundling
gathers herbs from the Wood
gets the best deals
gifted storyteller
gods-fearing
good with children
happy-go-lucky
has a beef with Marshedge
has a good heart
has a lot of backbone
has a wandering eye
has a way with animals
has Fae blood in their veins
has just terrible luck
has lost their nerve
has no respect for their elders
has terrible nightmares
has the most children
has their head in the clouds
hates the Hillfolk
hears voices
humorless
immaculate appearance
jealous
just got married
keeps to themselves
knows all the gossip
lame
likes to hurt things
lived among the Forest Folk
lost all their children
lovesick
loves their dogs
loyal friend
most handsome
moved here recently
must approve any marriages
mute
not afraid of deep water
not too bright
oldest
orphan
overprotective
prettiest
prideful
reckless
refuses to marry
resents their lot in life
runs everywhere
sensitive
simpleton
slew many crinwin
stoic
stubborn
suffers from fits
swears they met the Pale Hunter
tells the best jokes
tender-hearted
tends the Gods’ Pavilion
tends to the sick & injured
touched
very strong
wants to have kids
well-read
well-traveled
widowed
will eat anything`;
  }

  _getSteadingRatings(system) {
    return {
      fortunes: {
        label: "Fortunes",
        path: "system.fortunes",
        start: "Starts at +1",
        value: Number(system.fortunes ?? 1),
        options: [
          { value: -1, label: "-1" },
          { value: 0, label: "+0" },
          { value: 1, label: "+1" },
          { value: 2, label: "+2" },
          { value: 3, label: "+3" }
        ]
      },
      size: {
        label: "Size",
        path: "system.size",
        start: "Starts at Village",
        value: Number(system.size ?? 0),
        options: [
          { value: -1, label: "-1 hamlet", note: "(<50 people)" },
          { value: 0, label: "+0 village", note: "(150-350)" },
          { value: 1, label: "+1 town", note: "(500-1000)" },
          { value: 2, label: "+2 city", note: "(2500+)" }
        ]
      },
      population: {
        label: "Population",
        path: "system.population",
        start: "Starts at +0",
        value: Number(system.population ?? 0),
        options: [
          { value: -1, label: "-1" },
          { value: 0, label: "+0" },
          { value: 1, label: "+1" },
          { value: 2, label: "+2" },
          { value: 3, label: "+3" }
        ]
      },
      prosperity: {
        label: "Prosperity",
        path: "system.prosperity",
        start: "Starts at +0",
        value: Number(system.prosperity ?? 0),
        options: [
          { value: -1, label: "-1" },
          { value: 0, label: "+0" },
          { value: 1, label: "+1" },
          { value: 2, label: "+2" },
          { value: 3, label: "+3" }
        ]
      },
      defenses: {
        label: "Defenses",
        path: "system.defenses",
        start: "Starts at +0",
        value: Number(system.defenses ?? 0),
        options: [
          { value: -1, label: "-1 feeble" },
          { value: 0, label: "+0 mediocre" },
          { value: 1, label: "+1 strong" },
          { value: 2, label: "+2 formidable" },
          { value: 3, label: "+3 legendary" }
        ]
      }
    };
  }


  async _getImprovementColumns(system) {
    const storedColumns = system.improvementColumns ?? {};

    const makeColumn = async (columnKey) => {
      const ids = Array.isArray(storedColumns?.[columnKey])
        ? storedColumns[columnKey]
        : [];

      const improvements = [];

      for (const id of ids) {
        const item = this.actor.items.get(id);
        if (!item || item.type !== "steadingImprovement") continue;

        const header = item.system?.header || item.name;
        const text = item.system?.text || "";

        improvements.push({
          id: item.id,
          name: header,
          textHtml: await TextEditor.enrichHTML(text, {
            async: true,
            relativeTo: item
          }),
          showHeaderCheckbox: item.system?.showHeaderCheckbox === true,
          headerCheckboxChecked: item.system?.headerCheckboxChecked === true,
          expanded: this._expandedImprovements.has(item.id)
        });
      }

      return improvements;
    };

    return {
      left: await makeColumn("left"),
      middle: await makeColumn("middle"),
      right: await makeColumn("right")
    };
  }

  _getImprovementColumnIds() {
    const columns = this.actor.system.improvementColumns ?? {};

    return {
      left: Array.isArray(columns.left) ? [...columns.left] : [],
      middle: Array.isArray(columns.middle) ? [...columns.middle] : [],
      right: Array.isArray(columns.right) ? [...columns.right] : []
    };
  }


  async _getHomefrontMoves() {
    const moves = [];

    for (const item of this.actor.items.filter(item => item.type === "move")) {
      if ((item.system.category || "player") !== "homefront") continue;
      moves.push(await this._prepareHomefrontMove(item));
    }

    return moves;
  }

  async _prepareHomefrontMove(item) {
    const maxPips = Number(item.system.maxPips ?? 0);
    const pipSlots = [];

    for (let i = 1; i <= maxPips; i++) {
      pipSlots.push({
        key: `pip${i}`,
        checked: Boolean(item.system.pips?.[`pip${i}`])
      });
    }

    const preparedSystem = {
      ...item.system,
      usesRoll: item.system.usesRoll !== false,
      stat: item.system.stat || "defenses"
    };

    return {
      id: item.id,
      name: item.name,
      img: item.img || "icons/svg/book.svg",
      system: preparedSystem,
      canRoll: preparedSystem.usesRoll !== false,
      pipSlots,
      expanded: this._expandedMoves.has(item.id),
      descriptionHtml: await this._prepareMoveDescription(item)
    };
  }

  _getHomefrontMoveColumns(moves) {
    const columns = {
      left: [],
      middle: [],
      right: []
    };

    const storedColumns = this.actor.system.homefrontMoveColumns ?? {};
    const moveMap = new Map(moves.map(move => [move.id, move]));
    const assigned = new Set();
    const keys = ["left", "middle", "right"];
    const hasStoredColumns = keys.some(key => Array.isArray(storedColumns?.[key]) && storedColumns[key].length);

    for (const key of keys) {
      const ids = Array.isArray(storedColumns?.[key]) ? storedColumns[key] : [];

      for (const id of ids) {
        const move = moveMap.get(id);
        if (!move) continue;

        columns[key].push(move);
        assigned.add(id);
      }
    }

    const unassignedMoves = moves.filter(move => !assigned.has(move.id));

    if (hasStoredColumns) {
      columns.left.push(...unassignedMoves);
    }
    else {
      for (const [index, move] of unassignedMoves.entries()) {
        columns[keys[index % keys.length]].push(move);
      }
    }

    return columns;
  }

  _getHomefrontMoveColumnIds() {
    const storedColumns = this.actor.system.homefrontMoveColumns ?? {};

    return {
      left: Array.isArray(storedColumns.left) ? [...storedColumns.left] : [],
      middle: Array.isArray(storedColumns.middle) ? [...storedColumns.middle] : [],
      right: Array.isArray(storedColumns.right) ? [...storedColumns.right] : []
    };
  }


  async _prepareMoveDescription(move) {
    let text = move.system.description || "";
    let escaped = foundry.utils.escapeHTML(text);
    let checkIndex = 0;
    const replacements = [];

    const makeDescriptionCheck = (shape) => {
      checkIndex += 1;
      const key = `check${checkIndex}`;
      const checked = move.system.descriptionChecks?.[key] ? "checked" : "";
      const shapeClass = shape === "diamond" ? "diamond-description-check" : "square-description-check";
      const token = `%%STONETOP_STEADING_CHECK_${checkIndex}%%`;

      replacements.push({
        token,
        html: `<input type="checkbox" class="description-check ${shapeClass}" data-check="${key}" ${checked}>`
      });

      return token;
    };

    escaped = escaped.replace(/\[&lt;&gt;\]/g, () => makeDescriptionCheck("diamond"));
    escaped = escaped.replace(/\[ \]/g, () => makeDescriptionCheck("square"));
    escaped = escaped.replace(/\n/g, "<br>");

    let enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(escaped, {
      async: true,
      rollData: this._getRollData(),
      rolls: true,
      documents: true,
      secrets: true
    });

    for (const replacement of replacements) {
      enriched = enriched.replace(replacement.token, replacement.html);
    }

    return enriched;
  }

  async _formatMoveText(text) {
    let escaped = foundry.utils.escapeHTML(text || "");
    escaped = escaped.replace(/\[&lt;&gt;\]/g, "◆");
    escaped = escaped.replace(/\[ \]/g, "□");
    escaped = escaped.replace(/\n/g, "<br>");

    return foundry.applications.ux.TextEditor.implementation.enrichHTML(escaped, {
      async: true,
      rollData: this._getRollData(),
      rolls: true,
      documents: true,
      secrets: true
    });
  }

  _getRollData() {
    return {
      fortunes: Number(this.actor.system.fortunes ?? 0),
      surplus: Number(this.actor.system.surplus ?? 0),
      size: Number(this.actor.system.size ?? 0),
      population: Number(this.actor.system.population ?? 0),
      prosperity: Number(this.actor.system.prosperity ?? 0),
      defenses: Number(this.actor.system.defenses ?? 0),
      system: this.actor.system
    };
  }

  _getDropData(event) {
    try {
      if (TextEditor?.getDragEventData) {
        return TextEditor.getDragEventData(event);
      }
    }
    catch (_error) {
      // Fall through to manual parsing.
    }

    try {
      const raw = event.dataTransfer?.getData("text/plain");
      return raw ? JSON.parse(raw) : null;
    }
    catch (error) {
      console.warn("Stonetop | Could not parse steading improvement drop data.", error);
      return null;
    }
  }

  async _getDroppedItem(event) {
    const data = this._getDropData(event);
    if (!data) return null;

    if (data.uuid) {
      const document = await fromUuid(data.uuid);
      if (document?.documentName === "Item" || document instanceof Item) return document;
    }

    if (data.type === "Item" && data.id) {
      return this.actor.items.get(data.id) || game.items.get(data.id) || null;
    }

    return null;
  }

  async _onDropSteadingImprovement(event, columnKey) {
    event.preventDefault();
    event.stopPropagation();

    const activeTab = this.element.querySelector(".sheet-tabs .item.active");
    if (activeTab) this._activeTab = activeTab.dataset.tab;

    const item = await this._getDroppedItem(event);

    if (!item || item.type !== "steadingImprovement") {
      ui.notifications?.warn("Only Steading Improvement items can be dropped here.");
      return;
    }

    let embeddedItem = item;

    if (item.parent !== this.actor) {
      const itemData = item.toObject();
      delete itemData._id;
      itemData.system = itemData.system || {};
      itemData.system.showHeaderCheckbox = itemData.system.showHeaderCheckbox !== false;

      const created = await this.actor.createEmbeddedDocuments("Item", [itemData]);
      embeddedItem = created?.[0];
    }

    if (!embeddedItem) return;

    const columns = this._getImprovementColumnIds();

    for (const key of ["left", "middle", "right"]) {
      columns[key] = columns[key].filter(id => id !== embeddedItem.id);
    }

    columns[columnKey].push(embeddedItem.id);

    this._expandedImprovements.add(embeddedItem.id);

    await this.actor.update({
      "system.improvementColumns": columns
    });
  }

  _activateImprovementControls() {
    this.element.querySelectorAll(".steading-improvement-column").forEach(column => {
      column.addEventListener("dragover", event => {
        event.preventDefault();
        column.classList.add("drop-target");
      });

      column.addEventListener("dragleave", () => {
        column.classList.remove("drop-target");
      });

      column.addEventListener("drop", async event => {
        column.classList.remove("drop-target");
        await this._onDropSteadingImprovement(event, column.dataset.column);
      });
    });

    this.element.querySelectorAll(".steading-improvement-title").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();

        const card = event.currentTarget.closest(".steading-improvement-card");
        if (!card) return;

        card.classList.toggle("expanded");

        if (card.classList.contains("expanded")) {
          this._expandedImprovements.add(card.dataset.itemId);
        }
        else {
          this._expandedImprovements.delete(card.dataset.itemId);
        }
      });
    });

    this.element.querySelectorAll(".steading-improvement-check").forEach(input => {
      input.addEventListener("change", async event => {
        event.stopPropagation();

        const item = this.actor.items.get(event.currentTarget.dataset.itemId);
        if (!item || item.type !== "steadingImprovement") return;

        await item.update({
          "system.headerCheckboxChecked": event.currentTarget.checked
        });
      });
    });

    this.element.querySelectorAll(".steading-improvement-edit").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const item = this.actor.items.get(event.currentTarget.dataset.itemId);
        item?.sheet?.render(true);
      });
    });

    this.element.querySelectorAll(".steading-improvement-delete").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item || item.type !== "steadingImprovement") return;

        const columns = this._getImprovementColumnIds();
        for (const key of ["left", "middle", "right"]) {
          columns[key] = columns[key].filter(id => id !== itemId);
        }

        this._expandedImprovements.delete(itemId);

        await this.actor.update({
          "system.improvementColumns": columns
        });
        await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      });
    });
  }

  _getSteadingDebilities(system) {
    const debilities = system.debilities ?? {};
    return [
      {
        key: "diminished",
        path: "system.debilities.diminished",
        checked: Boolean(debilities.diminished),
        text: "diminished, by injury/sickness/doubt (disadvantage to Deploy, Muster, or Pull Together)"
      },
      {
        key: "lacking",
        path: "system.debilities.lacking",
        checked: Boolean(debilities.lacking),
        text: "lacking, due to shortages/hoarding/distrust (treat Prosperity as if it’s 1 lower than it is)"
      },
      {
        key: "malcontent",
        path: "system.debilities.malcontent",
        checked: Boolean(debilities.malcontent),
        text: "malcontent, from fear/anger/despair (Fortunes reset to +0 each season, not +1; folks need Persuading more often than usual)"
      }
    ];
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this._activateTabs();
    this._setActiveTab(this._activeTab);
    this._activateSaving();
    this._activateStatControls();
    this._activateResidentControls();
    this._activateNeighborControls();
    this._activateRosterAutosave();
    this._activateImprovementControls();
    this._activateMoveControls();
  }

  _activateStatControls() {
    this.element.querySelectorAll(".steading-stat-roll").forEach(button => {
      button.addEventListener("click", event => {
        this._onRollStat(event);
      });
    });
  }

  async _chooseRollMode(title) {
    return DialogV2.wait({
      window: {
        title
      },
      content: `
        <div class="stonetop-roll-dialog">
          <p>Choose roll mode.</p>

          <label>Modifier</label>

          <select name="modifier">
            <option value="-2">-2</option>
            <option value="-1">-1</option>
            <option value="0" selected>+0</option>
            <option value="1">+1</option>
            <option value="2">+2</option>
          </select>
        </div>
      `,
      buttons: [
        {
          action: "disadvantage",
          label: "Disadvantage",
          callback: (event, button, dialog) => {
            const modifier = Number(
              dialog.element
                .querySelector("[name='modifier']")
                .value
            );

            return {
              mode: "disadvantage",
              modifier
            };
          }
        },
        {
          action: "normal",
          label: "Normal",
          default: true,
          callback: (event, button, dialog) => {
            const modifier = Number(
              dialog.element
                .querySelector("[name='modifier']")
                .value
            );

            return {
              mode: "normal",
              modifier
            };
          }
        },
        {
          action: "advantage",
          label: "Advantage",
          callback: (event, button, dialog) => {
            const modifier = Number(
              dialog.element
                .querySelector("[name='modifier']")
                .value
            );

            return {
              mode: "advantage",
              modifier
            };
          }
        }
      ],
      rejectClose: false
    });
  }

  async _onRollStat(event) {
    event.preventDefault();

    const statKey =
      event.currentTarget.dataset.stat;

    const statLabel =
      event.currentTarget.dataset.label;

    const rollOptions =
      event.shiftKey
        ? {
            mode: "normal",
            modifier: 0
          }
        : await this._chooseRollMode(
            `Roll ${statLabel}`
          );

    if (!rollOptions) return;

    return this._rollStat(
      statKey,
      statLabel,
      rollOptions.mode,
      rollOptions.modifier
    );
  }

  async _rollStat(
    statKey,
    statLabel,
    mode = "normal",
    extraModifier = 0
  ) {
    const statValue =
      statKey
        ? Number(this.actor.system?.[statKey] ?? 0)
        : 0;

    const modifierValue =
      Number(extraModifier ?? 0);

    let formula = "2d6 + @stat + @mod";

    let modeLabel = "Normal";

    if (mode === "disadvantage") {
      formula = "3d6kl2 + @stat + @mod";
      modeLabel = "Disadvantage";
    }

    if (mode === "advantage") {
      formula = "3d6kh2 + @stat + @mod";
      modeLabel = "Advantage";
    }

    const roll = await new Roll(formula, {
      stat: statValue,
      mod: modifierValue
    }).evaluate();

    let resultText = "";

    if (roll.total >= 10) {
      resultText = "Success";
    }
    else if (roll.total >= 7) {
      resultText = "Success at a cost";
    }
    else {
      resultText = "Failure";
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({
        actor: this.actor
      }),
      flavor: `
        <div class="stonetop-chat-card">
          <h2>${statLabel}</h2>

          <p><strong>Mode:</strong> ${modeLabel}</p>

          <p><strong>Modifier:</strong>
            ${modifierValue >= 0 ? "+" : ""}
            ${modifierValue}
          </p>

          <hr>

          <div class="stonetop-chat-result">
            ${resultText}
          </div>
        </div>
      `
    });
  }


  _getMoveFromEvent(event) {
    const card = event.currentTarget.closest(".move-card");
    if (!card) return null;
    return this.actor.items.get(card.dataset.itemId) || null;
  }

  _activateMoveControls() {
    this.element.querySelectorAll(".steading-homefront-move-column").forEach(column => {
      column.addEventListener("dragover", event => {
        event.preventDefault();
        column.classList.add("drop-target");
      });

      column.addEventListener("dragleave", () => {
        column.classList.remove("drop-target");
      });

      column.addEventListener("drop", async event => {
        column.classList.remove("drop-target");
        await this._onDropMove(event, column.dataset.column);
      });
    });

    this.element.querySelectorAll(".move-title").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        const card = event.currentTarget.closest(".move-card");
        if (!card) return;

        card.classList.toggle("expanded");

        if (card.classList.contains("expanded")) {
          this._expandedMoves.add(card.dataset.itemId);
        }
        else {
          this._expandedMoves.delete(card.dataset.itemId);
        }
      });
    });

    this.element.querySelectorAll(".move-edit").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        this._getMoveFromEvent(event)?.sheet?.render(true);
      });
    });

    this.element.querySelectorAll(".move-delete").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        const move = this._getMoveFromEvent(event);
        if (!move) return;

        const columns = this._getHomefrontMoveColumnIds();
        for (const key of ["left", "middle", "right"]) {
          columns[key] = columns[key].filter(id => id !== move.id);
        }

        this._expandedMoves.delete(move.id);

        await this.actor.update({
          "system.homefrontMoveColumns": columns
        });
        await move.delete();
      });
    });

    this.element.querySelectorAll(".move-roll").forEach(button => {
      button.addEventListener("click", event => {
        this._onRollMove(event);
      });
    });

    this.element.querySelectorAll(".move-stat-select").forEach(select => {
      select.addEventListener("change", async event => {
        event.preventDefault();
        const move = this._getMoveFromEvent(event);
        if (!move) return;
        await move.update({ "system.stat": event.currentTarget.value });
      });
    });

    this.element.querySelectorAll(".move-pip").forEach(checkbox => {
      checkbox.addEventListener("change", async event => {
        event.preventDefault();
        const move = this._getMoveFromEvent(event);
        if (!move) return;
        await move.update({ [`system.pips.${event.currentTarget.dataset.pip}`]: event.currentTarget.checked });
      });
    });

    this.element.querySelectorAll(".description-check").forEach(checkbox => {
      checkbox.addEventListener("click", event => event.stopPropagation());
      checkbox.addEventListener("change", async event => {
        event.preventDefault();
        event.stopPropagation();
        const move = this._getMoveFromEvent(event);
        if (!move) return;
        await move.update({ [`system.descriptionChecks.${event.currentTarget.dataset.check}`]: event.currentTarget.checked });
      });
    });
  }


  async _onDropMove(event, columnKey = "left") {
    event.preventDefault();
    event.stopPropagation();

    const activeTab = this.element.querySelector(".sheet-tabs .item.active");
    if (activeTab) this._activeTab = activeTab.dataset.tab;

    const item = await this._getDroppedItem(event);

    if (!item || item.type !== "move") {
      ui.notifications?.warn("Only Move items can be dropped here.");
      return;
    }

    const targetColumn = ["left", "middle", "right"].includes(columnKey) ? columnKey : "left";
    const columns = this._getHomefrontMoveColumnIds();
    let embeddedItem = item;

    if (item.parent === this.actor) {
      await item.update({
        "system.category": "homefront",
        "system.stat": item.system.stat || "defenses"
      });
    }
    else {
      const itemData = item.toObject();
      delete itemData._id;
      itemData.system = itemData.system || {};
      itemData.system.category = "homefront";
      itemData.system.stat = itemData.system.stat || "defenses";

      const created = await this.actor.createEmbeddedDocuments("Item", [itemData]);
      embeddedItem = created?.[0];
    }

    if (!embeddedItem) return;

    for (const key of ["left", "middle", "right"]) {
      columns[key] = columns[key].filter(id => id !== embeddedItem.id);
    }

    columns[targetColumn].push(embeddedItem.id);
    this._expandedMoves.add(embeddedItem.id);

    await this.actor.update({
      "system.homefrontMoveColumns": columns
    });
  }


  async _onRollMove(event) {
    event.preventDefault();

    const move = this._getMoveFromEvent(event);
    if (!move) return;

    if (move.system.usesRoll === false) {
      return this._postMove(move);
    }

    const statSelect = event.currentTarget.closest(".move-card")?.querySelector(".move-stat-select");
    const statKey = statSelect?.value || move.system.stat || "defenses";

    const rollOptions = event.shiftKey
      ? { mode: "normal", modifier: 0 }
      : await this._chooseRollMode(`Roll ${move.name}`);

    if (!rollOptions) return;

    return this._rollMove(move, statKey, rollOptions.mode, rollOptions.modifier);
  }

  async _rollMove(move, statKey, mode = "normal", extraModifier = 0) {
    const statValue = statKey ? Number(this.actor.system?.[statKey] ?? 0) : 0;
    const modifierValue = Number(extraModifier ?? 0);

    let formula = "2d6 + @stat + @mod";
    let modeLabel = "Normal";

    if (mode === "disadvantage") {
      formula = "3d6kl2 + @stat + @mod";
      modeLabel = "Disadvantage";
    }

    if (mode === "advantage") {
      formula = "3d6kh2 + @stat + @mod";
      modeLabel = "Advantage";
    }

    const roll = await new Roll(formula, { stat: statValue, mod: modifierValue }).evaluate();

    let resultText = "";
    if (roll.total >= 10) resultText = move.system.result10 || "10+";
    else if (roll.total >= 7) resultText = move.system.result79 || "7-9";
    else resultText = move.system.result6 || "6-";

    const resultHtml = await this._formatMoveText(resultText);
    const description = await this._formatMoveText(move.system.description);

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `
        <div class="stonetop-chat-card">
          <h2>${move.name}</h2>
          <div class="stonetop-chat-description">${description}</div>
          <p><strong>Mode:</strong> ${modeLabel}</p>
          <p><strong>Stat:</strong> ${statKey || "None"}</p>
          <p><strong>Modifier:</strong> ${modifierValue >= 0 ? "+" : ""}${modifierValue}</p>
          <hr>
          <div class="stonetop-chat-result">${resultHtml}</div>
        </div>
      `
    });
  }

  async _postMove(move) {
    const description = await this._formatMoveText(move.system.description);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <div class="stonetop-chat-card">
          <h2>${move.name}</h2>
          <div class="stonetop-chat-description">${description}</div>
        </div>
      `
    });
  }

  _collectRosterRows(rowSelector) {
    const rows = Array.from(this.element.querySelectorAll(rowSelector)).map(row => ({
      name: row.querySelector('input[name$=".name"]')?.value ?? "",
      occupation: row.querySelector('input[name$=".occupation"]')?.value ?? "",
      traits: row.querySelector('input[name$=".traits"]')?.value ?? ""
    }));

    return rows.length ? rows : [{ name: "", occupation: "", traits: "" }];
  }

  _collectResidentRowsFromSheet() {
    return this._collectRosterRows(".steading-residents-roster .steading-resident-row");
  }

  _collectNeighborRowsFromSheet() {
    return this._collectRosterRows(".steading-neighbors-roster .steading-neighbor-row");
  }

  _getRosterRowsForKind(kind) {
    return kind === "residents"
      ? this._collectResidentRowsFromSheet()
      : this._collectNeighborRowsFromSheet();
  }

  _cancelRosterSave(kind) {
    if (!this._rosterSaveTimeouts[kind]) return;
    window.clearTimeout(this._rosterSaveTimeouts[kind]);
    this._rosterSaveTimeouts[kind] = null;
  }

  async _saveRosterRows(kind, { render = false } = {}) {
    const path = kind === "residents"
      ? "system.residentsRoster.rows"
      : "system.neighborsRoster.rows";

    await this.actor.update({
      [path]: this._getRosterRowsForKind(kind)
    }, { render });
  }

  async _saveResidentsRosterFromSheet(options = {}) {
    await this._saveRosterRows("residents", options);
  }

  async _saveNeighborsRosterFromSheet(options = {}) {
    await this._saveRosterRows("neighbors", options);
  }

  _queueRosterSave(kind, { delay = 900, render = false } = {}) {
    this._cancelRosterSave(kind);

    this._rosterSaveTimeouts[kind] = window.setTimeout(async () => {
      this._rosterSaveTimeouts[kind] = null;
      await this._saveRosterRows(kind, { render });
    }, delay);
  }

  _activateRosterAutosave() {
    const bindRosterInputs = (selector, kind) => {
      for (const input of this.element.querySelectorAll(selector)) {
        input.addEventListener("input", () => this._queueRosterSave(kind, { render: false }));
        input.addEventListener("change", () => this._queueRosterSave(kind, { delay: 0, render: false }));
        input.addEventListener("blur", () => this._queueRosterSave(kind, { delay: 0, render: false }));
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
          }
        });
      }
    };

    bindRosterInputs(".steading-residents-roster .steading-resident-row input", "residents");
    bindRosterInputs(".steading-neighbors-roster .steading-neighbor-row input", "neighbors");
  }

  _activateRosterDeleteControls(kind, buttonSelector, rowSelector, path) {
    for (const button of this.element.querySelectorAll(buttonSelector)) {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const activeTab = this.element.querySelector(".sheet-tabs .item.active");
        if (activeTab) {
          this._activeTab = activeTab.dataset.tab;
        }

        this._cancelRosterSave(kind);

        const row = button.closest(rowSelector);
        if (!row) return;

        row.remove();

        const rows = this._getRosterRowsForKind(kind);
        await this.actor.update({ [path]: rows });
      });
    }
  }

  _activateResidentControls() {
    const addButton = this.element.querySelector(".steading-add-resident");

    this._activateRosterDeleteControls("residents", ".steading-delete-resident", ".steading-resident-row", "system.residentsRoster.rows");

    if (!addButton) return;

    addButton.addEventListener("click", async event => {
      event.preventDefault();

      const activeTab = this.element.querySelector(".sheet-tabs .item.active");
      if (activeTab) {
        this._activeTab = activeTab.dataset.tab;
      }

      this._cancelRosterSave("residents");

      const rows = [
        ...this._collectResidentRowsFromSheet(),
        {
          name: "",
          occupation: "",
          traits: ""
        }
      ];

      await this.actor.update({
        "system.residentsRoster.rows": rows
      });
    });
  }


  _activateNeighborControls() {
    const addButton = this.element.querySelector(".steading-add-neighbor");

    this._activateRosterDeleteControls("neighbors", ".steading-delete-neighbor", ".steading-neighbor-row", "system.neighborsRoster.rows");

    if (!addButton) return;

    addButton.addEventListener("click", async event => {
      event.preventDefault();

      const activeTab = this.element.querySelector(".sheet-tabs .item.active");
      if (activeTab) {
        this._activeTab = activeTab.dataset.tab;
      }

      this._cancelRosterSave("neighbors");

      const rows = [
        ...this._collectNeighborRowsFromSheet(),
        {
          name: "",
          occupation: "",
          traits: ""
        }
      ];

      await this.actor.update({
        "system.neighborsRoster.rows": rows
      });
    });
  }

  _activateTabs() {
    const tabs = this.element.querySelectorAll(".sheet-tabs .item");

    for (const tab of tabs) {
      tab.addEventListener("click", event => {
        event.preventDefault();

        const selectedTab = event.currentTarget.dataset.tab;
        this._activeTab = selectedTab;
        this._setActiveTab(selectedTab);
      });
    }
  }

  _setActiveTab(tabName) {
    const tabs = this.element.querySelectorAll(".sheet-tabs .item");
    const tabContents = this.element.querySelectorAll(".sheet-body .tab");

    for (const tab of tabs) {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    }

    for (const content of tabContents) {
      content.classList.toggle("active", content.dataset.tab === tabName);
    }
  }

  _activateSaving() {
    const form = this.element.querySelector("form");

    if (!form) return;

    form.addEventListener("change", async event => {
      const input = event.target;

      if (!input.name) return;

      if (input.closest(".steading-residents-roster")) {
        await this._saveResidentsRosterFromSheet();
        return;
      }

      if (input.closest(".steading-neighbors-roster")) {
        await this._saveNeighborsRosterFromSheet();
        return;
      }

      const activeTab = this.element.querySelector(".sheet-tabs .item.active");
      if (activeTab) {
        this._activeTab = activeTab.dataset.tab;
      }

      let value;

      if (input.type === "checkbox") {
        value = input.checked;
      } else if (input.type === "number" || input.type === "radio") {
        value = Number(input.value);
      } else {
        value = input.value;
      }

      await this.actor.update({
        [input.name]: value
      });
    });
  }
}
