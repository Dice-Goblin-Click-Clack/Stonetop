const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class StonetopCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["stonetop", "sheet", "actor", "character"],

    position: {
      width: 980,
      height: 820
    },

    window: {
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/stonetop/templates/sheets/character-sheet.hbs"
    }
  };

  constructor(options = {}) {
  super(options);

  this._activeTab = "playbook";
  this._expandedMoves = new Set();
  this._expandedArcana = new Set();

  this._closedMoveCategories = new Set();

  this._ownedItemRefreshHook = document => {
    if (!this.rendered) return;
    if (document?.parent?.id !== this.actor.id) return;

    this.render(false);
  };

  Hooks.on("updateItem", this._ownedItemRefreshHook);
}


  async _onClose(options) {
    if (this._ownedItemRefreshHook) {
      Hooks.off("updateItem", this._ownedItemRefreshHook);
      this._ownedItemRefreshHook = null;
    }

    return super._onClose?.(options);
  }

  get title() {
    return this.actor?.name || "Character";
  }

  async _prepareContext(options) {

    const context = await super._prepareContext(options);

    const moves = [];

    const arcanaItems = [];

    for (const item of this.actor.items.filter(item => item.type === "move")) {

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
        usesRoll: item.system.usesRoll !== false
      };

      moves.push({
        id: item.id,
        name: item.name,
        img: item.img || "icons/svg/book.svg",
        type: item.type,
        system: preparedSystem,
        canRoll: preparedSystem.usesRoll !== false,
        pipSlots,
        descriptionHtml: await this._prepareMoveDescription(item)
      });
    }

    for (const item of this.actor.items.filter(item => item.type === "arcana")) {

      const preparedSystem = {
        ...item.system,
        usesRoll: item.system.usesRoll !== false,
        arcanaType: item.system.arcanaType || "minor",
        activeSide: item.system.activeSide || "front"
      };

      const isBack =
        preparedSystem.activeSide === "back";

      const displayTitle =
        isBack
          ? (preparedSystem.backTitle || item.name)
          : (preparedSystem.frontTitle || item.name);

      const faceText =
        isBack
          ? (preparedSystem.backText || "")
          : (preparedSystem.frontText || "");

      const isGM =
        game.user.isGM;

      arcanaItems.push({
        id: item.id,
        name: item.name,
        img: item.img || "icons/svg/card-joker.svg",
        type: item.type,
        system: preparedSystem,
        isBack,
        displayTitle,
        canFlip: isGM || preparedSystem.revealBack === true,
        canRoll: isGM ? preparedSystem.usesRoll !== false : preparedSystem.usesRoll === true,
        descriptionHtml: await this._prepareArcanaText(item, faceText)
      });
    }

    context.actor = this.actor;
    context.actorImg = this._getActorImage();
    context.system = this.actor.system;
    context.moves = moves;
    context.moveCategories = this._buildMoveCategories(moves);
    context.arcanaGroups = {
      minor: arcanaItems.filter(arcana => arcana.system.arcanaType !== "major"),
      major: arcanaItems.filter(arcana => arcana.system.arcanaType === "major")
    };


    const playbookItem =
      this.actor.items.find(item => item.type === "playbook") || null;

    context.playbookItem = playbookItem
      ? {
          id: playbookItem.id,
          name: playbookItem.name,
          system: playbookItem.system,
          descriptionHtml: await this._preparePlainText(playbookItem.system.description || ""),
          builderApplied: foundry.utils.getProperty(this.actor.system.builderChoices || {}, `applied.${playbookItem.id}`) === true,
          builderChoiceGroups: this._prepareBuilderChoiceGroups(playbookItem)
        }
      : null;

    const backgroundItem =
      this.actor.items.find(item => item.type === "background") || null;

    context.backgroundItem = backgroundItem
      ? {
          id: backgroundItem.id,
          name: backgroundItem.name,
          system: backgroundItem.system,
          descriptionHtml: await this._preparePlainText(backgroundItem.system.description || ""),
          builderApplied: foundry.utils.getProperty(this.actor.system.builderChoices || {}, `applied.${backgroundItem.id}`) === true,
          builderChoiceGroups: this._prepareBuilderChoiceGroups(backgroundItem)
        }
      : null;

    context.profilePanels =
      await this._buildProfilePanels();

    context.insertTabs =
      await this._buildInsertTabs();

    context.cssClass = "stonetop sheet actor character";

    context.nextLevelXP =
      Number(this.actor.system.level ?? 1) * 2 + 6;

    return context;
  }




  _prepareBuilderChoiceGroups(sourceItem) {
    const groups =
      Array.isArray(sourceItem.system.choiceGroups)
        ? sourceItem.system.choiceGroups
        : [];

    const prepared = [];

    for (const group of groups) {
      const choices =
        Array.isArray(group.choices)
          ? group.choices.filter(choice => choice?.uuid)
          : [];

      if (!choices.length) continue;

      const groupId =
        group.id || `${sourceItem.id}-${prepared.length}`;

      const choiceKey =
        `${sourceItem.id}.${groupId}`;

      const selectedUuid =
        foundry.utils.getProperty(this.actor.system.builderChoices || {}, choiceKey) || "";

      const selected =
        choices.find(choice => choice.uuid === selectedUuid) || null;

      prepared.push({
        id: groupId,
        sourceItemId: sourceItem.id,
        choiceKey,
        label: group.label || "Choose One",
        allowedType: group.allowedType || "",
        choices,
        selectedUuid,
        selectedName: selected?.name || "",
        complete: Boolean(selected),
        checkmark: selected ? "✓" : ""
      });
    }

    return prepared;
  }


  async _createOwnedCopyFromUuid(uuid) {
    if (!uuid) return false;

    const document =
      await fromUuid(uuid);

    if (!document || document.documentName !== "Item") return false;

    const duplicate =
      this.actor.items.some(item => {
        return item.name === document.name && item.type === document.type;
      });

    if (duplicate) return false;

    const data =
      document.toObject();

    delete data._id;

    await this.actor.createEmbeddedDocuments("Item", [data]);

    return true;
  }

  _activateBuilderChoiceControls() {
    this.element.querySelectorAll(".builder-choice-button").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const choiceKey =
          button.dataset.choiceKey;

        const sourceItemId =
          button.dataset.sourceItemId;

        const groupId =
          button.dataset.groupId;

        if (!choiceKey || !sourceItemId || !groupId) return;

        const sourceItem =
          this.actor.items.get(sourceItemId);

        if (!sourceItem) return;

        const groups =
          Array.isArray(sourceItem.system.choiceGroups)
            ? sourceItem.system.choiceGroups
            : [];

        const group =
          groups.find(candidate => (candidate.id || "") === groupId);

        if (!group || !Array.isArray(group.choices) || !group.choices.length) return;

        const selectedUuid =
          await this._promptBuilderChoice(group);

        if (!selectedUuid) return;

        await this.actor.update({
          [`system.builderChoices.${choiceKey}`]: selectedUuid
        });

        await this._createOwnedCopyFromUuid(selectedUuid);
      });
    });
  }

  async _promptBuilderChoice(group) {
    const choices =
      Array.isArray(group.choices)
        ? group.choices.filter(choice => choice?.uuid)
        : [];

    if (!choices.length) return null;

    const options =
      choices.map(choice => {
        return `<option value="${foundry.utils.escapeHTML(choice.uuid)}">${foundry.utils.escapeHTML(choice.name || "Unnamed Choice")}</option>`;
      }).join("");

    const content = `
      <form>
        <div class="form-group">
          <label>${foundry.utils.escapeHTML(group.label || "Choose One")}</label>
          <select name="choiceUuid">
            ${options}
          </select>
        </div>
      </form>
    `;

    return new Promise(resolve => {
      new Dialog({
        title: group.label || "Choose One",
        content,
        buttons: {
          ok: {
            label: "OK",
            callback: html => {
              const value =
                html.find('[name="choiceUuid"]').val();

              resolve(value || null);
            }
          },
          cancel: {
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "ok",
        close: () => resolve(null)
      }).render(true);
    });
  }


  _activateBuilderApplyControls() {
    this.element.querySelectorAll(".builder-apply-button").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        await this._applyBuilder(button.dataset.sourceItemId);
      });
    });
  }

  async _applyBuilder(sourceItemId) {
    const source =
      this.actor.items.get(sourceItemId);

    if (!source) return;

    const create = [];

    const addFromUuid = async uuid => {
      if (!uuid) return;

      const document =
        await fromUuid(uuid);

      if (!document || document.documentName !== "Item") return;

      const duplicate =
        this.actor.items.some(item => {
          return item.name === document.name && item.type === document.type;
        });

      if (duplicate) return;

      const data =
        document.toObject();

      delete data._id;

      create.push(data);
    };

    if (source.type === "playbook") {
      await addFromUuid(source.system.autoAppearance?.uuid);
      await addFromUuid(source.system.autoOrigin?.uuid);
      await addFromUuid(source.system.autoInsert?.uuid);
    }

    if (source.type === "background") {
      const autoMoves =
        Array.isArray(source.system.autoMoves)
          ? source.system.autoMoves
          : [];

      for (const move of autoMoves) {
        await addFromUuid(move.uuid);
      }

      await addFromUuid(source.system.autoInsert?.uuid);
    }

    const choiceGroups =
      Array.isArray(source.system.choiceGroups)
        ? source.system.choiceGroups
        : [];

    const builderChoices =
      this.actor.system.builderChoices || {};

    const pendingKeys =
      new Set();

    for (let index = 0; index < choiceGroups.length; index++) {
      const group =
        choiceGroups[index];

      const explicitGroupId =
        group.id || "";

      const fallbackGroupId =
        `${source.id}-${index}`;

      const possibleKeys = [
        `${source.id}.${explicitGroupId}`,
        `${source.id}.${fallbackGroupId}`
      ];

      for (const key of Object.keys(builderChoices)) {
        if (key.startsWith(`${source.id}.`)) {
          possibleKeys.push(key);
        }
      }

      for (const choiceKey of possibleKeys) {
        if (pendingKeys.has(choiceKey)) continue;

        const uuid =
          foundry.utils.getProperty(builderChoices, choiceKey);

        const validChoice =
          Array.isArray(group.choices)
            ? group.choices.some(choice => choice.uuid === uuid)
            : false;

        if (!validChoice) continue;

        pendingKeys.add(choiceKey);
        await addFromUuid(uuid);
        break;
      }
    }

    if (create.length) {
      await this.actor.createEmbeddedDocuments("Item", create);
    }

    await this.actor.update({
      [`system.builderChoices.applied.${source.id}`]: true
    });
  }

  async _buildInsertTabs() {
    const tabs = [];

    for (const item of this.actor.items.filter(item => item.type === "insert")) {
      tabs.push({
        id: item.id,
        tabId: `insert-${item.id}`,
        label: item.system.tabLabel || item.name || "Insert",
        name: item.name,
        leftColumn: await this._prepareInsertColumn(item.system.leftColumn),
        rightColumn: await this._prepareInsertColumn(item.system.rightColumn)
      });
    }

    return tabs;
  }

  async _prepareInsertColumn(entries) {
    const prepared = [];

    if (!Array.isArray(entries)) return prepared;

    for (const entry of entries) {
      prepared.push(await this._prepareInsertEntry(entry));
    }

    return prepared;
  }

  async _prepareInsertEntry(entry) {
    let document = null;

    if (entry?.uuid) {
      document = await fromUuid(entry.uuid);
    }

    if (!document) {
      return {
        id: "",
        name: entry?.name || "Missing Entry",
        img: entry?.img || "icons/svg/item-bag.svg",
        source: entry?.source || "missing",
        type: entry?.type || "unknown",
        isMove: false,
        canRoll: false,
        descriptionHtml: "Missing or unavailable source document."
      };
    }

    if (document.documentName !== "Item") {
      return {
        id: "",
        name: document.name || entry?.name || "Actor",
        img: document.img || entry?.img || "icons/svg/mystery-man.svg",
        source: "actor",
        type: document.type || "actor",
        isMove: false,
        canRoll: false,
        descriptionHtml: "Actor/NPC entries will be handled by the later NPC blueprint pass."
      };
    }

    if (document.type === "move") {
      const preparedSystem = {
        ...document.system,
        usesRoll: document.system.usesRoll !== false
      };

      return {
        id: document.id,
        uuid: entry?.uuid || document.uuid,
        name: this._getInsertItemTitle(document),
        img: document.img || entry?.img || "icons/svg/book.svg",
        source: "item",
        type: document.type,
        system: preparedSystem,
        isMove: true,
        canRoll: preparedSystem.usesRoll !== false,
        descriptionHtml: await this._prepareMoveDescription(document)
      };
    }

    if (document.type === "arcana") {
      const preparedSystem = {
        ...document.system,
        usesRoll: document.system.usesRoll !== false,
        activeSide: document.system.activeSide || "front"
      };

      const isBack =
        preparedSystem.activeSide === "back";

      const faceText =
        isBack
          ? (preparedSystem.backText || "")
          : (preparedSystem.frontText || "");

      const isGM =
        game.user.isGM;

      return {
        id: document.id,
        uuid: entry?.uuid || document.uuid,
        name: isBack
          ? (preparedSystem.backTitle || document.name)
          : (preparedSystem.frontTitle || document.name),
        img: document.img || entry?.img || "icons/svg/card-joker.svg",
        source: "item",
        type: document.type,
        system: preparedSystem,
        isMove: false,
        isArcana: true,
        isBack,
        canFlip: isGM || preparedSystem.revealBack === true,
        canRoll: isGM ? preparedSystem.usesRoll !== false : preparedSystem.usesRoll === true,
        descriptionHtml: await this._preparePlainText(faceText)
      };
    }


    if (document.type === "npc") {
      const system =
        document.system;

      const loyaltyValue =
        Number(system.loyalty?.value ?? 0);

      const loyaltyMax =
        Number(system.loyalty?.max ?? 3);

      const loyaltyPips = [];

      for (let i = 1; i <= loyaltyMax; i++) {
        loyaltyPips.push({
          value: i,
          checked: i <= loyaltyValue
        });
      }

      return {
        id: document.id,
        uuid: entry?.uuid || document.uuid,
        name: document.name,
        img: document.img || entry?.img || "icons/svg/mystery-man.svg",
        source: "item",
        type: document.type,
        system,
        isMove: false,
        isArcana: false,
        isNpc: true,
        isTextPanel: false,
        canFlip: false,
        canRoll: false,
        loyaltyPips,
        instinctHtml: await this._prepareNpcInsertText(document, system.instinct || "", "instinct"),
        costHtml: await this._prepareNpcInsertText(document, system.cost || "", "cost"),
        npcDescriptionHtml: await this._prepareNpcInsertText(document, system.description || "", "description"),
        descriptionHtml: ""
      };
    }

    if (document.type === "profileText" || document.type === "textBox" || document.type === "steadingImprovement") {
      return {
        id: document.id,
        uuid: entry?.uuid || document.uuid,
        name: this._getInsertItemTitle(document),
        img: document.img || entry?.img || "icons/svg/item-bag.svg",
        source: "item",
        type: document.type,
        system: document.system,
        isMove: false,
        isArcana: false,
        isTextPanel: true,
        isTextBox: document.type === "textBox" || document.type === "steadingImprovement",
        showHeaderCheckbox: (document.type === "textBox" || document.type === "steadingImprovement") && document.system.showHeaderCheckbox === true,
        headerCheckboxChecked: (document.type === "textBox" || document.type === "steadingImprovement") && document.system.headerCheckboxChecked === true,
        canFlip: false,
        canRoll: false,
        descriptionHtml: await this._prepareInsertRichText(
          document,
          this._getInsertItemText(document)
        )
      };
    }

    return {
      id: document.id,
      uuid: entry?.uuid || document.uuid,
      name: this._getInsertItemTitle(document),
      img: document.img || entry?.img || "icons/svg/item-bag.svg",
      source: "item",
      type: document.type,
      system: document.system,
      isMove: false,
      isArcana: false,
      isTextPanel: false,
      canFlip: false,
      canRoll: false,
      descriptionHtml: await this._preparePlainText(
        this._getInsertItemText(document)
      )
    };
  }

  _getInsertItemTitle(item) {
    if (item.type === "arcana") {
      return item.system.frontTitle || item.name;
    }

    if (item.type === "textBox" || item.type === "steadingImprovement") {
      return item.system.header || item.name;
    }

    return item.name;
  }

  _getInsertItemText(item) {
    if (item.type === "move") return item.system.description || "";
    if (item.type === "arcana") return item.system.frontText || "";
    if (item.type === "profileText") return item.system.text || "";
    if (item.type === "textBox" || item.type === "steadingImprovement") return item.system.text || "";
    if (item.type === "background") return item.system.description || "";
    if (item.type === "playbook") return item.system.description || "";

    return item.system.description || "";
  }



  async _prepareNpcInsertText(item, text, field) {
    let escaped =
      foundry.utils.escapeHTML(text || "");

    let checkIndex = 0;
    const replacements = [];

    const makeDescriptionCheck = (shape) => {
      checkIndex += 1;

      const key =
        `${field}Check${checkIndex}`;

      const checked =
        item.system.descriptionChecks?.[key]
          ? "checked"
          : "";

      const shapeClass =
        shape === "diamond"
          ? "diamond-description-check"
          : "square-description-check";

      const token =
        `%%STONETOP_NPC_CHECK_${item.id}_${field}_${checkIndex}%%`;

      replacements.push({
        token,
        html: `<input type="checkbox" class="profile-description-check ${shapeClass}" data-item-id="${item.id}" data-check="${key}" ${checked}>`
      });

      return token;
    };

    escaped = escaped.replace(/\[&lt;&gt;\]/g, () => {
      return makeDescriptionCheck("diamond");
    });

    escaped = escaped.replace(/\[ \]/g, () => {
      return makeDescriptionCheck("square");
    });

    escaped = escaped.replace(/\n/g, "<br>");

    let enriched =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        escaped,
        {
          async: true,
          rollData: this._getRollData(),
          rolls: true,
          documents: true,
          secrets: true
        }
      );

    for (const replacement of replacements) {
      enriched = enriched.replace(replacement.token, replacement.html);
    }

    return enriched;
  }

  async _prepareInsertRichText(item, text) {
    let escaped =
      foundry.utils.escapeHTML(text || "");

    let checkIndex = 0;
    const replacements = [];

    const makeDescriptionCheck = (shape) => {
      checkIndex += 1;

      const key = `check${checkIndex}`;

      const checked =
        item.system.descriptionChecks?.[key]
          ? "checked"
          : "";

      const shapeClass =
        shape === "diamond"
          ? "diamond-description-check"
          : "square-description-check";

      const token = `%%STONETOP_INSERT_CHECK_${item.id}_${checkIndex}%%`;

      replacements.push({
        token,
        html: `<input type="checkbox" class="profile-description-check ${shapeClass}" data-item-id="${item.id}" data-check="${key}" ${checked}>`
      });

      return token;
    };

    escaped = escaped.replace(/\[&lt;&gt;\]/g, () => {
      return makeDescriptionCheck("diamond");
    });

    escaped = escaped.replace(/\[ \]/g, () => {
      return makeDescriptionCheck("square");
    });

    escaped = escaped.replace(/\n/g, "<br>");

    let enriched =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        escaped,
        {
          async: true,
          rollData: this._getRollData(),
          rolls: true,
          documents: true,
          secrets: true
        }
      );

    for (const replacement of replacements) {
      enriched = enriched.replace(replacement.token, replacement.html);
    }

    return enriched;
  }

  async _buildProfilePanels() {
    const slots = [
      { slot: "instinct", label: "Instinct" },
      { slot: "appearance", label: "Appearance" },
      { slot: "origin", label: "Place of Origin & Name" }
    ];

    const panels = [];

    for (const slot of slots) {
      const item =
        this.actor.items.find(i => {
          return i.type === "profileText"
            && (i.system.profileSlot || "instinct") === slot.slot;
        }) || null;

      panels.push({
        ...slot,
        item: item
          ? {
              id: item.id,
              name: item.name,
              system: item.system,
              textHtml: await this._prepareProfileText(item)
            }
          : null
      });
    }

    return panels;
  }

  async _prepareProfileText(item) {
    let text = item.system.text || "";

    let escaped =
      foundry.utils.escapeHTML(text);

    let checkIndex = 0;
    const replacements = [];

    const makeDescriptionCheck = (shape) => {
      checkIndex += 1;

      const key = `check${checkIndex}`;

      const checked =
        item.system.descriptionChecks?.[key]
          ? "checked"
          : "";

      const shapeClass =
        shape === "diamond"
          ? "diamond-description-check"
          : "square-description-check";

      const token = `%%STONETOP_PROFILE_CHECK_${item.id}_${checkIndex}%%`;

      replacements.push({
        token,
        html: `<input type="checkbox" class="profile-description-check ${shapeClass}" data-item-id="${item.id}" data-check="${key}" ${checked}>`
      });

      return token;
    };

    escaped = escaped.replace(/\[&lt;&gt;\]/g, () => {
      return makeDescriptionCheck("diamond");
    });

    escaped = escaped.replace(/\[ \]/g, () => {
      return makeDescriptionCheck("square");
    });

    escaped = escaped.replace(/\n/g, "<br>");

    let enriched =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        escaped,
        {
          async: true,
          rollData: this._getRollData()
        }
      );

    for (const replacement of replacements) {
      enriched = enriched.replace(replacement.token, replacement.html);
    }

    return enriched;
  }


  async _prepareArcanaText(item, text) {
    let escaped =
      foundry.utils.escapeHTML(text || "");

    let checkIndex = 0;
    const replacements = [];

    const makeDescriptionCheck = (shape) => {
      checkIndex += 1;

      const key = `check${checkIndex}`;

      const checked =
        item.system.descriptionChecks?.[key]
          ? "checked"
          : "";

      const shapeClass =
        shape === "diamond"
          ? "diamond-description-check"
          : "square-description-check";

      const token = `%%STONETOP_ARCANA_CHECK_${item.id}_${checkIndex}%%`;

      replacements.push({
        token,
        html: `<input type="checkbox" class="profile-description-check ${shapeClass}" data-item-id="${item.id}" data-check="${key}" ${checked}>`
      });

      return token;
    };

    escaped = escaped.replace(/\[&lt;&gt;\]/g, () => {
      return makeDescriptionCheck("diamond");
    });

    escaped = escaped.replace(/\[ \]/g, () => {
      return makeDescriptionCheck("square");
    });

    escaped = escaped.replace(/\n/g, "<br>");

    let enriched =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        escaped,
        {
          async: true,
          rollData: this._getRollData(),
          rolls: true,
          documents: true,
          secrets: true
        }
      );

    for (const replacement of replacements) {
      enriched = enriched.replace(replacement.token, replacement.html);
    }

    return enriched;
  }

  async _preparePlainText(text) {
    let escaped =
      foundry.utils.escapeHTML(text || "");

    escaped = escaped.replace(/\n/g, "<br>");

    return foundry.applications.ux.TextEditor.implementation.enrichHTML(
      escaped,
      {
        async: true,
        rollData: this._getRollData()
      }
    );
  }

  _buildMoveCategories(moves) {
    const definitions = [
      {
        key: "player",
        label: "Player Moves",
        column: "left"
      },
      {
        key: "follower",
        label: "Follower Moves",
        column: "left"
      },
      {
        key: "special",
        label: "Special Moves",
        column: "left"
      },
      {
        key: "playbook",
        label: "Playbook Moves",
        column: "right"
      },
      {
        key: "expedition",
        label: "Expedition Moves",
        column: "right"
      }
    ];

    const grouped = {
      left: [],
      right: []
    };

    for (const definition of definitions) {
      grouped[definition.column].push({
        ...definition,
        expanded: !this._closedMoveCategories.has(definition.key),
        moves: moves.filter(move => {
          return (move.system.category || "player") === definition.key;
        })
      });
    }

    return grouped;
  }

  async _onRender(context, options) {

    await super._onRender(context, options);

    this._activateTabs();
    this._setActiveTab(this._activeTab);

    this._activateSaving();
    this._activateMoveControls();
    this._activateInsertMoveControls();
    this._activateInsertArcanaControls();
    this._activateInsertArcanaHardDelegation();
    this._activateInsertNpcControls();
    this._activateEmbeddedItemControls();
    this._activateBuilderChoiceControls();
    this._activateBuilderApplyControls();
    this._activateArcanaControls();
    this._activateMoveCategoryControls();

    this.element.querySelectorAll(".portrait-frame").forEach(frame => {
      frame.addEventListener("click", async event => {
        event.preventDefault();

        const current = this.actor.img || "systems/stonetop/assets/icons/character-default.png";

        const fp = new FilePicker({
          type: "image",
          current,
          callback: async path => {
            await this.actor.update({ img: path });
          }
        });

        fp.render(true);
      });
    });


    this._activateStatControls();
    this._activatePortraitControls();

    this._restoreExpandedMoves();
    this._restoreExpandedArcana();
  }


  _getActorImage() {

    const img = this.actor?.img;

    if (!img || img === "icons/svg/mystery-man.svg") {
      return "systems/stonetop/assets/icons/character-default.png";
    }

    return img;
  }

  _activatePortraitControls() {

    this.element.querySelectorAll(".portrait-picker").forEach(button => {

      button.addEventListener("click", event => {

        event.preventDefault();

        new FilePicker({
          type: "image",
          current: this.actor.img || "systems/stonetop/assets/icons/character-default.png",
          callback: path => {
            this.actor.update({ img: path });
          }
        }).render(true);
      });
    });
  }
  _activateTabs() {

    const tabs =
      this.element.querySelectorAll(".sheet-tabs .item");

    for (const tab of tabs) {

      tab.addEventListener("click", event => {

        event.preventDefault();

        this._activeTab =
          event.currentTarget.dataset.tab;

        this._setActiveTab(this._activeTab);
      });
    }
  }

  _setActiveTab(tabName) {

    const tabs =
      this.element.querySelectorAll(".sheet-tabs .item");

    const tabContents =
      this.element.querySelectorAll(".sheet-body .tab");

    for (const tab of tabs) {

      tab.classList.toggle(
        "active",
        tab.dataset.tab === tabName
      );
    }

    for (const content of tabContents) {

      content.classList.toggle(
        "active",
        content.dataset.tab === tabName
      );
    }
  }

  _activateSaving() {

    const form = this.element.querySelector("form");

    if (!form) return;

    form.addEventListener("change", async event => {

      const input = event.target;

      if (!input.name) return;

      const activeTab =
        this.element.querySelector(".sheet-tabs .item.active");

      if (activeTab) {
        this._activeTab = activeTab.dataset.tab;
      }

      let value;

      if (input.type === "checkbox") {
        value = input.checked;
      }
      else if (input.type === "number") {
        value = Number(input.value);
      }
      else {
        value = input.value;
      }

      await this.actor.update({
        [input.name]: value
      });
    });
  }



  async _getInsertMoveFromEvent(event) {
    const card =
      event.currentTarget.closest(".insert-move-card");

    if (!card) return null;

    if (card.dataset.uuid) {
      return fromUuid(card.dataset.uuid);
    }

    if (card.dataset.itemId) {
      return this.actor.items.get(card.dataset.itemId) || game.items.get(card.dataset.itemId);
    }

    return null;
  }

  _activateInsertMoveControls() {
    this.element.querySelectorAll(".insert-move-edit").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const move =
          await this._getInsertMoveFromEvent(event);

        move?.sheet?.render(true);
      });
    });

    this.element.querySelectorAll(".insert-move-delete").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const card =
          event.currentTarget.closest(".insert-move-card");

        const uuid =
          card?.dataset.uuid;

        if (!uuid) return;

        for (const insert of this.actor.items.filter(item => item.type === "insert")) {
          let changed = false;

          for (const column of ["leftColumn", "rightColumn"]) {
            const entries =
              Array.isArray(insert.system[column])
                ? foundry.utils.deepClone(insert.system[column])
                : [];

            const filtered =
              entries.filter(entry => entry.uuid !== uuid);

            if (filtered.length !== entries.length) {
              changed = true;

              await insert.update({
                [`system.${column}`]: filtered
              });
            }
          }

          if (changed) break;
        }
      });
    });

    this.element.querySelectorAll(".insert-move-roll").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const move =
          await this._getInsertMoveFromEvent(event);

        if (!move) return;

        if (move.system.usesRoll === false) {
          return this._postMove(move);
        }

        const card =
          event.currentTarget.closest(".insert-move-card");

        const statSelect =
          card?.querySelector(".insert-move-stat-select");

        const statKey =
          statSelect?.value ||
          move.system.stat ||
          "";

        const rollOptions =
          event.shiftKey
            ? {
                mode: "normal",
                modifier: 0
              }
            : await this._chooseRollMode(
                `Roll ${move.name}`
              );

        if (!rollOptions) return;

        return this._rollMove(
          move,
          statKey,
          rollOptions.mode,
          rollOptions.modifier
        );
      });
    });

    this.element.querySelectorAll(".insert-move-stat-select").forEach(select => {
      select.addEventListener("change", async event => {
        event.preventDefault();
        event.stopPropagation();

        const move =
          await this._getInsertMoveFromEvent(event);

        if (!move) return;

        await move.update({
          "system.stat": event.currentTarget.value
        });
      });
    });
  }


  async _getInsertArcanaFromEvent(event) {
    const card =
      event.currentTarget.closest(".insert-arcana-card");

    if (!card) return null;

    if (card.dataset.uuid) {
      return fromUuid(card.dataset.uuid);
    }

    if (card.dataset.itemId) {
      return this.actor.items.get(card.dataset.itemId) || game.items.get(card.dataset.itemId);
    }

    return null;
  }

  _activateInsertArcanaControls() {
    this.element.querySelectorAll(".insert-arcana-title").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const card =
          event.currentTarget.closest(".insert-arcana-card");

        if (card) {
          card.classList.toggle("expanded");

          const itemId =
            card.dataset.itemId;

          if (itemId) {
            if (card.classList.contains("expanded")) {
              this._expandedArcana.add(itemId);
            }
            else {
              this._expandedArcana.delete(itemId);
            }
          }
        }
      });
    });

    this.element.querySelectorAll(".insert-arcana-edit").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const arcana =
          await this._getInsertArcanaFromEvent(event);

        arcana?.sheet?.render(true);
      });
    });

    this.element.querySelectorAll(".insert-arcana-delete").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const card =
          event.currentTarget.closest(".insert-arcana-card");

        const uuid =
          card?.dataset.uuid;

        if (!uuid) return;

        for (const insert of this.actor.items.filter(item => item.type === "insert")) {
          let changed = false;

          for (const column of ["leftColumn", "rightColumn"]) {
            const entries =
              Array.isArray(insert.system[column])
                ? foundry.utils.deepClone(insert.system[column])
                : [];

            const filtered =
              entries.filter(entry => entry.uuid !== uuid);

            if (filtered.length !== entries.length) {
              changed = true;

              await insert.update({
                [`system.${column}`]: filtered
              });
            }
          }

          if (changed) break;
        }
      });
    });

    this.element.querySelectorAll(".insert-arcana-flip").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const arcana =
          await this._getInsertArcanaFromEvent(event);

        if (!arcana) return;

        const current =
          arcana.system.activeSide || "front";

        await arcana.update({
          "system.activeSide": current === "front" ? "back" : "front"
        });
      });
    });

    this.element.querySelectorAll(".insert-arcana-roll").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const arcana =
          await this._getInsertArcanaFromEvent(event);

        if (!arcana) return;

        const canRoll =
          game.user.isGM
            ? arcana.system.usesRoll !== false
            : arcana.system.usesRoll === true;

        if (!canRoll) {
          return this._shareArcana(arcana);
        }

        const card =
          event.currentTarget.closest(".insert-arcana-card");

        const statSelect =
          card?.querySelector(".insert-arcana-stat-select");

        const statKey =
          statSelect?.value ||
          arcana.system.stat ||
          "";

        const rollOptions =
          event.shiftKey
            ? {
                mode: "normal",
                modifier: 0
              }
            : await this._chooseRollMode(
                `Roll ${arcana.name}`
              );

        if (!rollOptions) return;

        return this._rollMoveLikeItem(
          arcana,
          statKey,
          rollOptions.mode,
          rollOptions.modifier
        );
      });
    });

    this.element.querySelectorAll(".insert-arcana-stat-select").forEach(select => {
      select.addEventListener("change", async event => {
        event.preventDefault();
        event.stopPropagation();

        const arcana =
          await this._getInsertArcanaFromEvent(event);

        if (!arcana) return;

        await arcana.update({
          "system.stat": event.currentTarget.value
        });
      });
    });
  }


  async _getInsertArcanaFromCard(card) {
    if (!card) return null;

    if (card.dataset.uuid) {
      return fromUuid(card.dataset.uuid);
    }

    if (card.dataset.itemId) {
      return this.actor.items.get(card.dataset.itemId) || game.items.get(card.dataset.itemId);
    }

    return null;
  }

  _activateInsertArcanaHardDelegation() {
    const root =
      this.element;

    if (!root) return;

    root.addEventListener("click", async event => {
      const title =
        event.target.closest(".insert-arcana-title");

      if (title) {
        event.preventDefault();
        event.stopPropagation();

        const card =
          title.closest(".insert-arcana-card");

        if (card) {
          card.classList.toggle("expanded");
        }

        return;
      }

      const flip =
        event.target.closest(".insert-arcana-flip");

      if (flip) {
        event.preventDefault();
        event.stopPropagation();

        const card =
          flip.closest(".insert-arcana-card");

        const arcana =
          await this._getInsertArcanaFromCard(card);

        if (!arcana) return;

        const current =
          arcana.system.activeSide || "front";

        await arcana.update({
          "system.activeSide": current === "front" ? "back" : "front"
        });

        return;
      }
    }, true);
  }


  _openEmbeddedItemSheet(item) {
    if (!item?.sheet) return;

    const sheet =
      item.sheet;

    if (!sheet._stonetopParentRefreshPatched) {
      const originalClose =
        sheet.close.bind(sheet);

      sheet.close = async (...args) => {
        const result =
          await originalClose(...args);

        if (this.rendered) {
          this.render(false);
        }

        return result;
      };

      sheet._stonetopParentRefreshPatched = true;
    }

    sheet.render(true);
  }

  async _getInsertNpcFromEvent(event) {
    const card =
      event.currentTarget.closest(".insert-npc-card");

    if (!card) return null;

    if (card.dataset.uuid) {
      const document =
        await fromUuid(card.dataset.uuid);

      if (document?.documentName === "Item") return document;
    }

    if (card.dataset.itemId) {
      return this.actor.items.get(card.dataset.itemId) || game.items.get(card.dataset.itemId);
    }

    return null;
  }

  _activateInsertNpcControls() {
    this.element.querySelectorAll(".insert-npc-damage-roll").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const npc =
          await this._getInsertNpcFromEvent(event);

        if (!npc) return;

        const roll =
          await new Roll(npc.system.damage || "d6").evaluate();

        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: `<strong>${npc.name}</strong> damage`
        });
      });
    });

    this.element.querySelectorAll(".insert-npc-loyalty-pip").forEach(checkbox => {
      checkbox.addEventListener("click", event => {
        event.stopPropagation();
      });

      checkbox.addEventListener("change", async event => {
        event.stopPropagation();

        const npc =
          await this._getInsertNpcFromEvent(event);

        if (!npc) return;

        const value =
          Number(event.currentTarget.dataset.value ?? 0);

        const current =
          Number(npc.system.loyalty?.value ?? 0);

        await npc.update({
          "system.loyalty.value": event.currentTarget.checked && value > current
            ? value
            : Math.max(0, value - 1)
        });
      });
    });

    this.element.querySelectorAll(".insert-npc-field").forEach(input => {
      input.addEventListener("change", async event => {
        event.stopPropagation();

        const npc =
          await this._getInsertNpcFromEvent(event);

        if (!npc) return;

        const field =
          event.currentTarget.dataset.field;

        if (!field) return;

        let value =
          event.currentTarget.value;

        if (event.currentTarget.type === "number") {
          value = Number(value);
        }

        await npc.update({
          [field]: value
        });
      });
    });
  }

  _activateEmbeddedItemControls() {
    this.element.querySelectorAll(".embedded-item-field").forEach(field => {
      field.addEventListener("change", async event => {
        const itemId =
          event.currentTarget.dataset.itemId;

        const fieldPath =
          event.currentTarget.dataset.field;

        const item =
          this.actor.items.get(itemId);

        if (!item) return;

        await item.update({
          [fieldPath]: event.currentTarget.value
        });
      });
    });

    this.element.querySelectorAll(".text-box-header-check").forEach(checkbox => {
      checkbox.addEventListener("click", event => {
        event.stopPropagation();
      });

      checkbox.addEventListener("mousedown", event => {
        event.stopPropagation();
      });

      checkbox.addEventListener("change", async event => {
        event.stopPropagation();

        const itemId =
          event.currentTarget.dataset.itemId;

        const item =
          this.actor.items.get(itemId);

        if (!item || (item.type !== "textBox" && item.type !== "steadingImprovement")) return;

        await item.update({
          "system.headerCheckboxChecked": event.currentTarget.checked
        });
      });
    });

    this.element.querySelectorAll(".embedded-item-edit").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();

        const item =
          this.actor.items.get(event.currentTarget.dataset.itemId);

        if (item) {
          this._openEmbeddedItemSheet(item);
        }
      });
    });

    this.element.querySelectorAll(".embedded-item-delete").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const item =
          this.actor.items.get(event.currentTarget.dataset.itemId);

        if (item) {
          if (item.type === "insert" && this._activeTab === `insert-${item.id}`) {
            this._activeTab = "playbook";
          }

          await item.delete();
        }
      });
    });

    this.element.querySelectorAll(".profile-description-check").forEach(checkbox => {
      checkbox.addEventListener("click", event => {
        event.stopPropagation();
      });

      checkbox.addEventListener("mousedown", event => {
        event.stopPropagation();
      });

      checkbox.addEventListener("change", async event => {
        event.stopPropagation();

        const item =
          this.actor.items.get(event.currentTarget.dataset.itemId);

        if (!item) return;

        if (item.type === "arcana") {
          this._expandedArcana.add(item.id);
        }

        const checkKey =
          event.currentTarget.dataset.check;

        await item.update({
          [`system.descriptionChecks.${checkKey}`]:
            event.currentTarget.checked
        });
      });
    });
  }

  _activateMoveControls() {

    this.element.querySelectorAll(".move-title").forEach(button => {

      button.addEventListener("click", event => {

        event.preventDefault();

        const card =
          event.currentTarget.closest(".move-card");

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

        const move = this._getMoveFromEvent(event);

        if (move) {
          this._openEmbeddedItemSheet(move);
        }
      });
    });

    this.element.querySelectorAll(".move-delete").forEach(button => {

      button.addEventListener("click", async event => {

        event.preventDefault();

        const move = this._getMoveFromEvent(event);

        if (move) {
          await move.delete();
        }
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

        await move.update({
          "system.stat": event.currentTarget.value
        });
      });
    });

    this.element.querySelectorAll(".move-pip").forEach(checkbox => {

      checkbox.addEventListener("change", async event => {

        event.preventDefault();

        const move = this._getMoveFromEvent(event);

        if (!move) return;

        const pipKey =
          event.currentTarget.dataset.pip;

        this._expandedMoves.add(move.id);

        await move.update({
          [`system.pips.${pipKey}`]:
            event.currentTarget.checked
        });
      });
    });

    this.element.querySelectorAll(".description-check").forEach(checkbox => {

      checkbox.addEventListener("click", event => {
        event.stopPropagation();
      });

      checkbox.addEventListener("change", async event => {

        event.preventDefault();
        event.stopPropagation();

        const move = this._getMoveFromEvent(event);

        if (!move) return;

        const checkKey =
          event.currentTarget.dataset.check;

        this._expandedMoves.add(move.id);

        await move.update({
          [`system.descriptionChecks.${checkKey}`]:
            event.currentTarget.checked
        });
      });
    });
  }


  _activateMoveCategoryControls() {
    this.element.querySelectorAll(".move-category-header").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();

        const category = event.currentTarget.dataset.category;
        const section = event.currentTarget.closest(".move-category");

        if (!category || !section) return;

        if (this._closedMoveCategories.has(category)) {
          this._closedMoveCategories.delete(category);
          section.classList.remove("category-closed");
        }
        else {
          this._closedMoveCategories.add(category);
          section.classList.add("category-closed");
        }
      });
    });

    this.element.querySelectorAll(".move-category").forEach(categoryElement => {
      categoryElement.addEventListener("dragover", event => {
        event.preventDefault();
        categoryElement.classList.add("drop-target");
      });

      categoryElement.addEventListener("dragleave", event => {
        categoryElement.classList.remove("drop-target");
      });

      categoryElement.addEventListener("drop", async event => {
        event.preventDefault();
        event.stopPropagation();

        categoryElement.classList.remove("drop-target");

        const category = categoryElement.dataset.category || "player";

        await this._onDropMoveToCategory(event, category);
      });
    });
  }

  async _onDropMoveToCategory(event, category) {
    let data = null;

    try {
      const textEditor = foundry.applications.ux.TextEditor.implementation;
      data = textEditor.getDragEventData(event);
    }
    catch (error) {
      try {
        data = JSON.parse(event.dataTransfer.getData("text/plain"));
      }
      catch (innerError) {
        return;
      }
    }

    if (!data) return;

    let item = null;

    if (data.uuid) {
      item = await fromUuid(data.uuid);
    }
    else if (data.id) {
      item = this.actor.items.get(data.id) || game.items.get(data.id);
    }

    if (!item || item.type !== "move") return;

    this._activeTab = "moves";
    this._closedMoveCategories.delete(category);

    if (item.parent?.id === this.actor.id) {
      await item.update({
        "system.category": category
      });

      return;
    }

    const itemData = item.toObject();
    itemData.system = itemData.system || {};
    itemData.system.category = category;

    await this.actor.createEmbeddedDocuments("Item", [itemData]);
  }


  _activateArcanaControls() {
    this.element.querySelectorAll(".arcana-title").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();

        const card =
          event.currentTarget.closest(".arcana-card");

        if (card) {
          card.classList.toggle("expanded");
        }
      });
    });

    this.element.querySelectorAll(".arcana-flip").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const arcana =
          this._getArcanaFromEvent(event);

        if (!arcana) return;

        const current =
          arcana.system.activeSide || "front";

        await arcana.update({
          "system.activeSide": current === "front" ? "back" : "front"
        });
      });
    });

    this.element.querySelectorAll(".arcana-edit").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();

        const arcana =
          this._getArcanaFromEvent(event);

        if (arcana) {
          this._openEmbeddedItemSheet(arcana);
        }
      });
    });

    this.element.querySelectorAll(".arcana-delete").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const arcana =
          this._getArcanaFromEvent(event);

        if (arcana) {
          await arcana.delete();
        }
      });
    });

    this.element.querySelectorAll(".arcana-stat-select").forEach(select => {
      select.addEventListener("change", async event => {
        event.preventDefault();

        const arcana =
          this._getArcanaFromEvent(event);

        if (!arcana) return;

        await arcana.update({
          "system.stat": event.currentTarget.value,
          "system.usesRoll": true
        });
      });
    });

    this.element.querySelectorAll(".arcana-roll").forEach(button => {
      button.addEventListener("click", event => {
        this._onRollArcana(event);
      });
    });
  }

  _getArcanaFromEvent(event) {
    const card =
      event.currentTarget.closest(".arcana-card");

    if (!card) return null;

    return this.actor.items.get(card.dataset.itemId);
  }

  async _onRollArcana(event) {
    event.preventDefault();

    const arcana =
      this._getArcanaFromEvent(event);

    if (!arcana) return;

    if (arcana.system.usesRoll === false) {
      return this._shareArcana(arcana);
    }

    const rollOptions = event.shiftKey
      ? { mode: "normal", modifier: 0 }
      : await this._chooseRollMode(`Roll ${arcana.name}`);

    if (!rollOptions) return;

    const stat =
      arcana.system.stat || "";

    return this._rollMoveLikeItem(arcana, stat, rollOptions.mode, rollOptions.modifier);
  }


  async _rollMoveLikeItem(item, statKey, mode = "normal", extraModifier = 0) {

    const statValue =
      statKey
        ? Number(this.actor.system.stats?.[statKey] ?? 0)
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
      resultText = item.system.result10 || "10+";
    }
    else if (roll.total >= 7) {
      resultText = item.system.result79 || "7-9";
    }
    else {
      resultText = item.system.result6 || "6-";
    }

    const resultHtml =
      await this._formatMoveText(resultText);

    const description =
      await this._formatMoveText(
        item.system.frontText || item.system.description || ""
      );

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({
        actor: this.actor
      }),

      flavor: `
        <div class="stonetop-chat-card">
          <h2>${item.name}</h2>

          <div class="stonetop-chat-description">
            ${description}
          </div>

          <p><strong>Mode:</strong> ${modeLabel}</p>
          <p><strong>Stat:</strong> ${statKey || "None"}</p>

          <hr>

          <div class="stonetop-chat-result">
            ${resultHtml}
          </div>
        </div>
      `
    });
  }

  async _shareArcana(arcana) {
    const isBack =
      (arcana.system.activeSide || "front") === "back";

    const title =
      isBack
        ? (arcana.system.backTitle || arcana.name)
        : (arcana.system.frontTitle || arcana.name);

    const text =
      isBack
        ? (arcana.system.backText || "")
        : (arcana.system.frontText || "");

    const descriptionHtml =
      await this._formatMoveText(text);

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <div class="stonetop-chat-card">
          <h2>${title}</h2>
          <div>${descriptionHtml}</div>
        </div>
      `
    });
  }


  _restoreExpandedArcana() {
    for (const id of this._expandedArcana) {
      const card =
        this.element.querySelector(`.arcana-card[data-item-id="${id}"]`);

      if (card) {
        card.classList.add("expanded");
      }
    }
  }

  _activateStatControls() {

    this.element.querySelectorAll(".stat-roll").forEach(button => {

      button.addEventListener("click", event => {
        this._onRollStat(event);
      });
    });

    this.element.querySelectorAll(".damage-roll").forEach(button => {

      button.addEventListener("click", event => {
        this._onRollDamage(event);
      });
    });
  }

  _restoreExpandedMoves() {

    this.element.querySelectorAll(".move-card").forEach(card => {

      if (this._expandedMoves.has(card.dataset.itemId)) {
        card.classList.add("expanded");
      }
    });
  }

  _getMoveFromEvent(event) {

    const card =
      event.currentTarget.closest(".move-card");

    if (!card) return null;

    return this.actor.items.get(card.dataset.itemId);
  }

  _getRollData() {

    return {
      str: Number(this.actor.system.stats?.str ?? 0),
      dex: Number(this.actor.system.stats?.dex ?? 0),
      con: Number(this.actor.system.stats?.con ?? 0),
      int: Number(this.actor.system.stats?.int ?? 0),
      wis: Number(this.actor.system.stats?.wis ?? 0),
      cha: Number(this.actor.system.stats?.cha ?? 0),
      system: this.actor.system
    };
  }

  async _prepareMoveDescription(move) {

    let text = move.system.description || "";

    let escaped =
      foundry.utils.escapeHTML(text);

    let checkIndex = 0;
    const replacements = [];

    const makeDescriptionCheck = (shape) => {

      checkIndex += 1;

      const key = `check${checkIndex}`;

      const checked =
        move.system.descriptionChecks?.[key]
          ? "checked"
          : "";

      const shapeClass =
        shape === "diamond"
          ? "diamond-description-check"
          : "square-description-check";

      const token = `%%STONETOP_CHECK_${checkIndex}%%`;

      replacements.push({
        token,
        html: `<input type="checkbox" class="description-check ${shapeClass}" data-check="${key}" ${checked}>`
      });

      return token;
    };

    escaped = escaped.replace(/\[&lt;&gt;\]/g, () => {
      return makeDescriptionCheck("diamond");
    });

    escaped = escaped.replace(/\[ \]/g, () => {
      return makeDescriptionCheck("square");
    });

    escaped = escaped.replace(/\n/g, "<br>");

    let enriched =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(escaped, {
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

    let escaped =
      foundry.utils.escapeHTML(text || "");

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

  async _onRollMove(event) {

    event.preventDefault();

    const card =
      event.currentTarget.closest(".move-card");

    if (!card) return;

    const move =
      this.actor.items.get(card.dataset.itemId);

    if (!move) return;

    if (move.system.usesRoll === false) {
      return this._postMove(move);
    }

    const statSelect =
      card.querySelector(".move-stat-select");

    const statKey =
      statSelect?.value ||
      move.system.stat ||
      "";

    const rollOptions =
      event.shiftKey
        ? {
            mode: "normal",
            modifier: 0
          }
        : await this._chooseRollMode(
            `Roll ${move.name}`
          );

    if (!rollOptions) return;

    return this._rollMove(
      move,
      statKey,
      rollOptions.mode,
      rollOptions.modifier
    );
  }

  async _rollMove(
    move,
    statKey,
    mode = "normal",
    extraModifier = 0
  ) {

    const statValue =
      statKey
        ? Number(this.actor.system.stats?.[statKey] ?? 0)
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
      resultText = move.system.result10 || "10+";
    }
    else if (roll.total >= 7) {
      resultText = move.system.result79 || "7-9";
    }
    else {
      resultText = move.system.result6 || "6-";
    }

    const resultHtml =
      await this._formatMoveText(resultText);

    const description =
      await this._formatMoveText(
        move.system.description
      );

    await roll.toMessage({

      speaker: ChatMessage.getSpeaker({
        actor: this.actor
      }),

      flavor: `
        <div class="stonetop-chat-card">

          <h2>${move.name}</h2>

          <div class="stonetop-chat-description">
            ${description}
          </div>

          <p><strong>Mode:</strong> ${modeLabel}</p>

          <p><strong>Stat:</strong> ${statKey || "None"}</p>

          <p><strong>Modifier:</strong>
            ${modifierValue >= 0 ? "+" : ""}
            ${modifierValue}
          </p>

          <hr>

          <div class="stonetop-chat-result">
            ${resultHtml}
          </div>

        </div>
      `
    });
  }

  async _postMove(move) {

    const description =
      await this._formatMoveText(
        move.system.description
      );

    await ChatMessage.create({

      speaker: ChatMessage.getSpeaker({
        actor: this.actor
      }),

      content: `
        <div class="stonetop-chat-card">

          <h2>${move.name}</h2>

          <div class="stonetop-chat-description">
            ${description}
          </div>

        </div>
      `
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
        ? Number(this.actor.system.stats?.[statKey] ?? 0)
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

  async _onRollDamage(event) {

    event.preventDefault();

    const damageDie =
      this.actor.system.damage || "d6";

    const rollOptions =
      event.shiftKey
        ? {
            mode: "normal",
            modifier: 0
          }
        : await this._chooseRollMode(
            "Roll Damage"
          );

    if (!rollOptions) return;

    return this._rollDamage(
      damageDie,
      rollOptions.mode,
      rollOptions.modifier
    );
  }

  async _rollDamage(
    damageDie,
    mode = "normal",
    extraModifier = 0
  ) {

    const die =
      String(damageDie)
        .trim()
        .replace(/^1/, "");

    const modifierValue =
      Number(extraModifier ?? 0);

    let formula = `1${die} + @mod`;

    let modeLabel = "Normal";

    if (mode === "disadvantage") {
      formula = `2${die}kl1 + @mod`;
      modeLabel = "Disadvantage";
    }

    if (mode === "advantage") {
      formula = `2${die}kh1 + @mod`;
      modeLabel = "Advantage";
    }

    const roll = await new Roll(formula, {
      mod: modifierValue
    }).evaluate();

    await roll.toMessage({

      speaker: ChatMessage.getSpeaker({
        actor: this.actor
      }),

      flavor: `
        <div class="stonetop-chat-card">

          <h2>Damage</h2>

          <p><strong>Die:</strong> ${damageDie}</p>

          <p><strong>Mode:</strong> ${modeLabel}</p>

          <p><strong>Modifier:</strong>
            ${modifierValue >= 0 ? "+" : ""}
            ${modifierValue}
          </p>

        </div>
      `
    });
  }
}