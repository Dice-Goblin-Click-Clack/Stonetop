const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class StonetopNPCSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["stonetop", "sheet", "actor", "npc"],

    position: {
      width: 430,
      height: 760
    },

    window: {
      resizable: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/stonetop/templates/sheets/npc-sheet.hbs"
    }
  };

  get title() {
    return this.actor?.name || "NPC";
  }

  async _prepareContext(options) {
    const context =
      await super._prepareContext(options);

    context.actor =
      this.actor;

    context.system =
      this.actor.system;

    context.loyaltyPips =
      this._buildLoyaltyPips();

    return context;
  }

  _buildLoyaltyPips() {
    const current =
      Number(this.actor.system.loyalty?.value ?? 0);

    const max =
      Number(this.actor.system.loyalty?.max ?? 3);

    const pips = [];

    for (let i = 1; i <= max; i++) {
      pips.push({
        value: i,
        checked: current >= i
      });
    }

    return pips;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    this._activatePortraitPicker();
    this._activateLoyaltyControls();
    this._activateDamageRoller();
  }

  _activatePortraitPicker() {
    this.element.querySelectorAll(".npc-portrait-frame").forEach(frame => {
      frame.addEventListener("click", async event => {
        event.preventDefault();

        const picker =
          new foundry.applications.apps.FilePicker.implementation({
            type: "image",
            current: this.actor.img,
            callback: async path => {
              await this.actor.update({
                img: path
              });
            }
          });

        picker.browse();
      });
    });
  }

  _activateLoyaltyControls() {
    this.element.querySelectorAll(".npc-loyalty-pip").forEach(checkbox => {
      checkbox.addEventListener("change", async event => {
        const value =
          Number(event.currentTarget.dataset.value ?? 0);

        const current =
          Number(this.actor.system.loyalty?.value ?? 0);

        await this.actor.update({
          "system.loyalty.value":
            current === value ? Math.max(0, value - 1) : value
        });
      });
    });
  }

  _activateDamageRoller() {
    this.element.querySelectorAll(".npc-damage-roll").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();

        const damageDie =
          this.actor.system.damage || "d6";

        const rollOptions =
          event.shiftKey
            ? { mode: "normal", modifier: 0 }
            : await this._chooseRollMode("Roll Damage");

        if (!rollOptions) return;

        return this._rollDamage(
          damageDie,
          rollOptions.mode,
          rollOptions.modifier
        );
      });
    });
  }

  async _chooseRollMode(title) {
    return new Promise(resolve => {
      const content = `
        <form class="stonetop-roll-dialog">
          <div class="form-group">
            <label>Roll Mode</label>
            <select name="mode">
              <option value="disadvantage">Disadvantage</option>
              <option value="normal" selected>Normal</option>
              <option value="advantage">Advantage</option>
            </select>
          </div>

          <div class="form-group">
            <label>Modifier</label>
            <input name="modifier" type="number" step="1" value="0">
          </div>
        </form>
      `;

      new DialogV2({
        window: { title },
        content,
        buttons: [
          {
            action: "roll",
            label: "Roll",
            default: true,
            callback: (event, button) => {
              const form = button.form;

              resolve({
                mode: form.mode.value,
                modifier: Number(form.modifier.value || 0)
              });
            }
          },
          {
            action: "cancel",
            label: "Cancel",
            callback: () => resolve(null)
          }
        ],
        close: () => resolve(null)
      }).render(true);
    });
  }

  async _rollDamage(damageDie, mode = "normal", modifier = 0) {
    const die =
      String(damageDie || "d6").trim();

    const dieSize =
      die.match(/^d(\d+)$/i)?.[1];

    const baseDie =
      dieSize ? `d${dieSize}` : "d6";

    let formula =
      `1${baseDie} + @mod`;

    let modeLabel =
      "Normal";

    if (mode === "disadvantage") {
      formula =
        `2${baseDie}kl + @mod`;
      modeLabel =
        "Disadvantage";
    }

    if (mode === "advantage") {
      formula =
        `2${baseDie}kh + @mod`;
      modeLabel =
        "Advantage";
    }

    const roll =
      await new Roll(formula, {
        mod: Number(modifier ?? 0)
      }).evaluate();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({
        actor: this.actor
      }),
      flavor: `
        <div class="stonetop-chat-card">
          <h2>${this.actor.name} Damage</h2>
          <p><strong>Mode:</strong> ${modeLabel}</p>
        </div>
      `
    });

    return roll;
  }

}
