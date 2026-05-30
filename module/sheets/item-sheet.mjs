const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class StonetopItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["stonetop", "sheet", "item"],
    position: {
      width: 600,
      height: 650
    },
    window: {
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/stonetop/templates/sheets/item-sheet.hbs"
    }
  };

  get title() {
    return this.item?.name || "Item";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.item = this.item;
    context.system = this.item.system;

    if (this.item.type === "move") {
      context.maxPips = Number(this.item.system.maxPips ?? 0);
    }
    context.cssClass = "stonetop sheet item";

    if (this.item.type === "npc") {
      context.loyaltyPips = this._buildNpcLoyaltyPips(this.item);
    }

    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this._activateSaving();
    this._activateImagePicker();
    this._activateNpcItemControls();
    this._activateInsertContainer();
    this._activateBuilderContainer();
  }

  _activateSaving() {
    const form = this.element.querySelector("form");

    if (!form) return;

    form.addEventListener("change", async event => {
      const input = event.target;

      if (!input.name) return;

      let value;

      if (input.type === "checkbox") {
        value = input.checked;
      } else if (input.type === "number" || input.name === "system.maxPips") {
        value = Number(input.value);
      } else {
        value = input.value;
      }

      await this.item.update({
        [input.name]: value
      });
    });
  }

  _activateImagePicker() {
    this.element.querySelectorAll(".item-image-picker").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();

        new FilePicker({
          type: "image",
          current: this.item.img || "icons/svg/item-bag.svg",
          callback: path => {
            this.item.update({ img: path });
          }
        }).render(true);
      });
    });
  }



  _buildNpcLoyaltyPips(item) {
    const value =
      Number(item.system.loyalty?.value ?? 0);

    const max =
      Number(item.system.loyalty?.max ?? 3);

    const pips = [];

    for (let i = 1; i <= max; i++) {
      pips.push({
        value: i,
        checked: i <= value
      });
    }

    return pips;
  }

  _activateNpcItemControls() {
    if (this.item.type !== "npc") return;

    this.element.querySelectorAll(".npc-portrait-frame").forEach(frame => {
      frame.addEventListener("click", event => {
        event.preventDefault();

        new FilePicker({
          type: "image",
          current: this.item.img || "icons/svg/mystery-man.svg",
          callback: path => {
            this.item.update({ img: path });
          }
        }).render(true);
      });
    });

    this.element.querySelectorAll(".npc-loyalty-pip").forEach(checkbox => {
      checkbox.addEventListener("change", async event => {
        event.preventDefault();

        const value =
          Number(event.currentTarget.dataset.value ?? 0);

        const current =
          Number(this.item.system.loyalty?.value ?? 0);

        await this.item.update({
          "system.loyalty.value": event.currentTarget.checked && value > current
            ? value
            : Math.max(0, value - 1)
        });
      });
    });

    this.element.querySelectorAll(".npc-damage-roll").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const roll =
          await new Roll(this.item.system.damage || "d6").evaluate();

        await roll.toMessage({
          speaker: ChatMessage.getSpeaker(),
          flavor: `<strong>${this.item.name}</strong> damage`
        });
      });
    });
  }

  _activateBuilderContainer() {
    if (!["playbook", "background"].includes(this.item.type)) return;

    this.element.querySelectorAll(".builder-drop-zone").forEach(zone => {
      zone.addEventListener("dragover", event => {
        event.preventDefault();
        zone.style.background = "rgba(0, 0, 0, 0.08)";
      });

      zone.addEventListener("dragleave", () => {
        zone.style.background = "";
      });

      zone.addEventListener("drop", async event => {
        event.preventDefault();
        zone.style.background = "";

        await this._onBuilderDrop(event, zone);
      });
    });

    this.element.querySelectorAll(".builder-entry-open").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const uuid =
          button.dataset.uuid;

        if (!uuid) return;

        const document =
          await fromUuid(uuid);

        document?.sheet?.render(true);
      });
    });

    this.element.querySelectorAll(".builder-entry-remove").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        await this._removeBuilderEntry(button);
      });
    });

    this.element.querySelectorAll(".builder-choice-add").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        await this._addBuilderChoiceGroup();
      });
    });

    this.element.querySelectorAll(".builder-choice-remove").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        await this._removeBuilderChoiceGroup(Number(button.dataset.groupIndex));
      });
    });

    this.element.querySelectorAll(".builder-choice-label").forEach(input => {
      input.addEventListener("change", async event => {
        await this._updateBuilderChoiceGroup(
          Number(input.dataset.groupIndex),
          {
            label: event.currentTarget.value
          }
        );
      });
    });

    this.element.querySelectorAll(".builder-choice-type").forEach(select => {
      select.addEventListener("change", async event => {
        await this._updateBuilderChoiceGroup(
          Number(select.dataset.groupIndex),
          {
            allowedType: event.currentTarget.value
          }
        );
      });
    });
  }

  async _onBuilderDrop(event, zone) {
    const field =
      zone.dataset.builderField;

    const mode =
      zone.dataset.builderMode;

    const groupIndex =
      Number(zone.dataset.groupIndex);

    const accept =
      zone.dataset.builderAccept || "";

    let data;

    try {
      data =
        JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (error) {
      console.warn("Stonetop | Could not parse builder drop data.", error);
      return;
    }

    const uuid =
      data.uuid
        ?? data.documentUuid
        ?? null;

    if (!uuid) return;

    const document =
      await fromUuid(uuid);

    if (!document || document.documentName !== "Item") return;

    if (accept && document.type !== accept) {
      ui.notifications?.warn?.(`Expected ${accept}, got ${document.type}.`);
      return;
    }

    const entry =
      this._makeBuilderEntry(document, uuid);

    if (mode === "single") {
      await this.item.update({
        [`system.${field}`]: entry
      });

      return;
    }

    if (mode === "array") {
      const current =
        Array.isArray(this.item.system[field])
          ? foundry.utils.deepClone(this.item.system[field])
          : [];

      current.push(entry);

      await this.item.update({
        [`system.${field}`]: current
      });

      return;
    }

    if (mode === "choice") {
      const groups =
        Array.isArray(this.item.system.choiceGroups)
          ? foundry.utils.deepClone(this.item.system.choiceGroups)
          : [];

      if (!Number.isInteger(groupIndex) || !groups[groupIndex]) return;

      groups[groupIndex].choices =
        Array.isArray(groups[groupIndex].choices)
          ? groups[groupIndex].choices
          : [];

      groups[groupIndex].choices.push(entry);

      await this.item.update({
        "system.choiceGroups": groups
      });
    }
  }

  _makeBuilderEntry(document, uuid) {
    return {
      uuid,
      source: "item",
      type: document.type,
      name: document.name ?? "Dropped Item",
      img: document.img ?? "icons/svg/item-bag.svg"
    };
  }

  async _removeBuilderEntry(button) {
    const field =
      button.dataset.builderField;

    const mode =
      button.dataset.builderMode;

    const index =
      Number(button.dataset.index);

    const groupIndex =
      Number(button.dataset.groupIndex);

    if (mode === "single") {
      await this.item.update({
        [`system.${field}`]: null
      });

      return;
    }

    if (mode === "array") {
      const current =
        Array.isArray(this.item.system[field])
          ? foundry.utils.deepClone(this.item.system[field])
          : [];

      if (!Number.isInteger(index)) return;

      current.splice(index, 1);

      await this.item.update({
        [`system.${field}`]: current
      });

      return;
    }

    if (mode === "choice") {
      const groups =
        Array.isArray(this.item.system.choiceGroups)
          ? foundry.utils.deepClone(this.item.system.choiceGroups)
          : [];

      if (!Number.isInteger(groupIndex) || !groups[groupIndex]) return;
      if (!Number.isInteger(index)) return;

      groups[groupIndex].choices =
        Array.isArray(groups[groupIndex].choices)
          ? groups[groupIndex].choices
          : [];

      groups[groupIndex].choices.splice(index, 1);

      await this.item.update({
        "system.choiceGroups": groups
      });
    }
  }

  async _addBuilderChoiceGroup() {
    const groups =
      Array.isArray(this.item.system.choiceGroups)
        ? foundry.utils.deepClone(this.item.system.choiceGroups)
        : [];

    groups.push({
      id: foundry.utils.randomID(),
      label: "Choose One",
      allowedType: this.item.type === "playbook" ? "background" : "move",
      choices: []
    });

    await this.item.update({
      "system.choiceGroups": groups
    });
  }

  async _removeBuilderChoiceGroup(index) {
    if (!Number.isInteger(index)) return;

    const groups =
      Array.isArray(this.item.system.choiceGroups)
        ? foundry.utils.deepClone(this.item.system.choiceGroups)
        : [];

    groups.splice(index, 1);

    await this.item.update({
      "system.choiceGroups": groups
    });
  }

  async _updateBuilderChoiceGroup(index, changes) {
    if (!Number.isInteger(index)) return;

    const groups =
      Array.isArray(this.item.system.choiceGroups)
        ? foundry.utils.deepClone(this.item.system.choiceGroups)
        : [];

    if (!groups[index]) return;

    groups[index] = {
      ...groups[index],
      ...changes
    };

    await this.item.update({
      "system.choiceGroups": groups
    });
  }


  _activateInsertContainer() {
    if (this.item.type !== "insert") return;

    this.element.querySelectorAll(".insert-drop-zone").forEach(zone => {
      zone.addEventListener("dragover", event => {
        event.preventDefault();
        zone.style.background = "rgba(0, 0, 0, 0.08)";
      });

      zone.addEventListener("dragleave", () => {
        zone.style.background = "";
      });

      zone.addEventListener("drop", async event => {
        event.preventDefault();
        zone.style.background = "";

        await this._onInsertDrop(
          event,
          zone.dataset.column
        );
      });
    });

    this.element.querySelectorAll(".insert-entry-remove").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        await this._removeInsertEntry(
          button.dataset.column,
          Number(button.dataset.index)
        );
      });
    });

    this.element.querySelectorAll(".insert-entry-open").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const uuid =
          button.dataset.uuid;

        if (!uuid) return;

        const document =
          await fromUuid(uuid);

        document?.sheet?.render(true);
      });
    });
  }

  async _onInsertDrop(event, column) {
    if (!["leftColumn", "rightColumn"].includes(column)) return;

    let data;

    try {
      data =
        JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (error) {
      console.warn("Stonetop | Could not parse insert drop data.", error);
      return;
    }

    const uuid =
      data.uuid
        ?? data.documentUuid
        ?? null;

    if (!uuid) return;

    const document =
      await fromUuid(uuid);

    if (!document) return;

    const documentName =
      document.documentName ?? "";

    if (!["Item", "Actor"].includes(documentName)) return;

    if (documentName === "Item" && document.type === "insert") {
      ui.notifications?.warn?.("Inserts cannot contain other inserts yet.");
      return;
    }

    const entry = {
      uuid,
      source: documentName.toLowerCase(),
      type: document.type ?? documentName.toLowerCase(),
      name: document.name ?? "Dropped Document",
      img: document.img ?? "icons/svg/item-bag.svg"
    };

    const current =
      Array.isArray(this.item.system[column])
        ? foundry.utils.deepClone(this.item.system[column])
        : [];

    current.push(entry);

    await this.item.update({
      [`system.${column}`]: current
    });
  }

  async _removeInsertEntry(column, index) {
    if (!["leftColumn", "rightColumn"].includes(column)) return;
    if (!Number.isInteger(index)) return;

    const current =
      Array.isArray(this.item.system[column])
        ? foundry.utils.deepClone(this.item.system[column])
        : [];

    current.splice(index, 1);

    await this.item.update({
      [`system.${column}`]: current
    });
  }

}