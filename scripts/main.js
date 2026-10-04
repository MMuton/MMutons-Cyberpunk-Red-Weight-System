const MODULE_ID = "mmutons-cyberpunk-red-weight-system";
const VAS_ID = "mmutons-cyberpunk-red-vas";

const CONTAINER_CATEGORIES = ["ammo", "armor", "clothing", "cyberdeck", "cyberware", "drug", "gear", "upgrade", "program", "weapon"];

const ITEM_TYPE_TO_CATEGORY = { itemUpgrade: "upgrade" };

const NON_PHYSICAL_TYPES = new Set(["criticalInjury", "netarch", "role", "skill"]);

const CONTAINER_TYPE_LABELS = {
    multi: "Multi-Functional Container",
    ammo: "Ammo Container",
    armor: "Armor Container",
    clothing: "Clothing Container",
    cyberdeck: "Cyberdeck Container",
    cyberware: "Cyberware Container",
    drug: "Drug Container",
    gear: "Gear Container",
    upgrade: "Upgrade Container",
    program: "Program Container",
    weapon: "Weapon Container"
};

const CONTAINER_SHORT_LABELS = {
    multi: "MULT", ammo: "AMMO", armor: "ARMR", clothing: "CLTH", cyberdeck: "CYBD", cyberware: "CYBW",
    drug: "DRUG", gear: "GEAR", upgrade: "UPGD", program: "PRGM", weapon: "WEAP"
};

const CONTAINER_ICON_OPTIONS = [
    "fa:box-open", "fa:briefcase", "fa:backpack", "fa:gun", "fa:toolbox",
    "fa:first-aid", "fa:radiation", "fa:gem", "fa:circle-stop", "fa:sd-card"
];

const EQUIPPED_LABELS = { 0: "weightless", 0.33: "1/3 weight", 0.5: "1/2 weight" };

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function num(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

function fmt(value) {
    const rounded = round1(value).toFixed(1);
    return rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
}

class WeightSystemCompendiumCloner extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "weight-system-compendium-cloner",
            title: "Clone Compendium with Weights",
            template: "templates/generic.html",
            width: 400
        });
    }
    async _updateObject() {}
    render() {
        WeightSystem.openCompendiumClonerDialog();
        return this;
    }
}

class WeightSystem {
    static MODULE_ID = MODULE_ID;

    static updateTimeouts = new Map();
    static notificationCooldowns = new Map();
    static itemActiveTabs = new Map();

    static initialize() {
        console.log("MMuton's Weight System | Initializing...");
        this.registerSettings();
        this.registerHooks();
    }

    static registerSettings() {
        game.settings.register(MODULE_ID, "enableWeightSystem", {
            name: "Enable Weight System",
            hint: "Enable weight tracking for player characters",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            requiresReload: true
        });

        game.settings.register(MODULE_ID, "capacityCalculation", {
            name: "Capacity Calculation Method",
            hint: "How to calculate maximum carry capacity",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "body": "BODY × Multiplier",
                "custom": "Custom Fixed Value"
            },
            default: "body"
        });

        game.settings.register(MODULE_ID, "baseWeightMultiplier", {
            name: "Capacity Multiplier (BODY × N)",
            hint: "Multiply BODY stat by this value (only used if calculation method is BODY × Multiplier)",
            scope: "world",
            config: true,
            type: Number,
            default: 3,
            range: { min: 1, max: 10, step: 0.5 }
        });

        game.settings.register(MODULE_ID, "customCapacity", {
            name: "Custom Capacity Value",
            hint: "Fixed carry capacity for all characters (only used if calculation method is Custom Fixed Value)",
            scope: "world",
            config: true,
            type: Number,
            default: 30,
            range: { min: 5, max: 200, step: 5 }
        });

        game.settings.register(MODULE_ID, "enableContainers", {
            name: "Enable Container System",
            hint: "Allow items to be containers that reduce weight",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register(MODULE_ID, "equippedWeaponWeight", {
            name: "Equipped Weapon & Armor Weight",
            hint: "How much weight equipped weapons and armor contribute to carried weight",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "0": "No weight",
                "0.33": "1/3 weight",
                "0.5": "1/2 weight",
                "1": "Full weight"
            },
            default: "0.33"
        });

        game.settings.registerMenu(MODULE_ID, "compendiumClonerMenu", {
            name: "Clone Compendium with Weights",
            label: "Open Cloner",
            hint: "Create a copy of a compendium with preset item weights applied.",
            icon: "fas fa-copy",
            type: WeightSystemCompendiumCloner,
            restricted: true
        });

        game.settings.register(MODULE_ID, "showSyncButton", {
            name: "Show Weight Sync Button",
            hint: "Display a button on character sheets to sync item weights from weighted compendiums and the Items Directory.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        });

        game.settings.register(MODULE_ID, "includeUpgradeWeight", {
            name: "Include Upgrade Weight",
            hint: "When enabled, installed item upgrades (attachments) add their weight to the item they are installed in. When disabled, installed upgrades weigh nothing.",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register(MODULE_ID, "excludeOwnedItems", {
            name: "Exclude 'Owned' Items from Weight",
            hint: "Items marked as 'Owned' (not 'Equipped' or 'Carried') contribute zero weight and hide their weight display.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        });

        game.settings.register(MODULE_ID, "vehicleCargoCapacity", {
            name: "Vehicle Cargo Capacity",
            hint: "Maximum cargo capacity for vehicles. Only works with MMuton's CPR Vehicle Actor Sheet installed.",
            scope: "world",
            config: true,
            type: Number,
            default: 10,
            range: { min: 10, max: 500, step: 10 }
        });

        game.settings.register(MODULE_ID, "showContainerNotifications", {
            name: "Show Container Move Notifications",
            hint: "Show a pop-up when an item is put into or taken out of a container. Warnings (wrong type, full, etc.) are always shown.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        });

        game.settings.register(MODULE_ID, "groupContainerContents", {
            name: "Group Items Under Their Container",
            hint: "Show containers in their own Containers section on the Gear tab, with the items inside each one listed directly under it. When off, items stay in their normal categories and show a container marker instead. (Per user.)",
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => {
                for (const app of Object.values(ui.windows)) {
                    if (app instanceof ActorSheet && app.rendered) app.render(false);
                }
            }
        });

        game.settings.register(MODULE_ID, "collapsedContainers", {
            scope: "client",
            config: false,
            type: Object,
            default: {}
        });
    }

    static registerHooks() {
        Hooks.on("ready", this.onReady.bind(this));
        Hooks.on("renderActorSheet", this.onInitialRender.bind(this));
        Hooks.on("renderItemSheet", this.onRenderItemSheet.bind(this));

        Hooks.on("preCreateItem", this.onPreCreateItem.bind(this));
        Hooks.on("createItem", (item, options) => this.onItemChange(item, null, options));
        Hooks.on("updateItem", (item, changes, options, userId) => {
            this.cleanupAfterItemUpdate(item, changes, userId);
            this.onItemChange(item, changes, options);
        });
        Hooks.on("deleteItem", (item, options, userId) => {
            this.cleanupAfterItemDelete(item, userId);
            this.onItemChange(item, null, options);
        });
    }

    static onReady() {
        if (!game.settings.get(MODULE_ID, "enableWeightSystem")) return;
        console.log("MMuton's Weight System | Ready and enabled");
    }

    static readSettings() {
        const multiplier = Number(game.settings.get(MODULE_ID, "equippedWeaponWeight"));
        return {
            equippedMultiplier: Number.isFinite(multiplier) ? multiplier : 1,
            includeUpgradeWeight: game.settings.get(MODULE_ID, "includeUpgradeWeight"),
            excludeOwned: game.settings.get(MODULE_ID, "excludeOwnedItems")
        };
    }

    static isContainer(item) {
        return item?.getFlag(MODULE_ID, "isContainer") === true;
    }

    static isVehicleSheet(app, html) {
        return html?.hasClass?.("vas-vehicle") || app?.constructor?.name === "VehicleSheet";
    }

    static normalizeIcon(icon) {
        if (!icon) return "fa:box-open";
        return String(icon).includes(":") ? String(icon) : `fa:${icon}`;
    }

    static itemCategory(item) {
        return ITEM_TYPE_TO_CATEGORY[item.type] || item.type;
    }

    static getContainerData(container) {
        const raw = container.getFlag(MODULE_ID, "containerData") || {};
        const containerType = CONTAINER_TYPE_LABELS[raw.containerType] ? raw.containerType : "multi";
        const reductionDefault = containerType === "multi" ? 1 : 0;
        return {
            containerType,
            capacity: Math.max(0, num(raw.capacity, 50)),
            weightReduction: Math.min(1, Math.max(0, num(raw.weightReduction, reductionDefault))),
            allowedTypes: containerType === "multi" ? [...CONTAINER_CATEGORIES] : [containerType],
            icon: this.normalizeIcon(raw.icon)
        };
    }

    static getBaseWeight(item) {
        return Math.max(0, num(item.getFlag(MODULE_ID, "weight")?.value, 0));
    }

    static getQuantity(item) {
        return Math.max(0, num(item.system?.amount, 1));
    }

    static buildContext(actor, { vehicle = false } = {}) {
        const items = actor.items;
        const settings = this.readSettings();

        const parentOf = new Map();
        for (const item of items) {
            const list = item.system?.installedItems?.list;
            if (!Array.isArray(list)) continue;
            for (const id of list) if (!parentOf.has(id)) parentOf.set(id, item.id);
        }
        const actorInstalled = new Set(actor.system?.installedItems?.list ?? []);

        const containers = new Map();
        for (const item of items) {
            if (this.isContainer(item)) {
                containers.set(item.id, { item, data: this.getContainerData(item), contents: [] });
            }
        }

        const ctx = { actor, vehicle, settings, parentOf, actorInstalled, containers, containedIn: new Map(), cache: new Map() };

        for (const item of items) {
            const containerId = item.getFlag(MODULE_ID, "containedIn");
            if (!containerId || containerId === item.id) continue;
            const container = containers.get(containerId);
            if (!container || containers.has(item.id) || this.isInstalledNonAmmo(ctx, item)) continue;
            ctx.containedIn.set(item.id, containerId);
            container.contents.push(item);
        }
        return ctx;
    }

    static isInstalled(ctx, item) {
        return ctx.actorInstalled.has(item.id) || ctx.parentOf.has(item.id);
    }

    static isInstalledNonAmmo(ctx, item) {
        return item.type !== "ammo" && this.isInstalled(ctx, item);
    }

    static computeItem(ctx, item) {
        const cached = ctx.cache.get(item.id);
        if (cached) return cached;

        const { settings } = ctx;
        const base = this.getBaseWeight(item);
        const qty = this.getQuantity(item);
        const reasons = [];
        let unit = base;
        let hidden = base <= 0;

        if (NON_PHYSICAL_TYPES.has(item.type)) {
            unit = 0;
            hidden = true;
        } else if (ctx.vehicle) {
            unit = this.applyVehicleRules(ctx, item, base, reasons);
        } else if (settings.excludeOwned && item.system?.equipped === "owned") {
            unit = 0;
            hidden = true;
        } else if (item.type === "cyberware" && this.isInstalled(ctx, item)) {
            unit = 0;
            reasons.push("Installed (weightless)");
        } else if (item.type === "itemUpgrade" && ctx.parentOf.has(item.id)) {
            const parent = ctx.actor.items.get(ctx.parentOf.get(item.id));
            unit = 0;
            hidden = false;
            reasons.push(settings.includeUpgradeWeight
                ? `Installed in ${parent?.name || "item"} (counted there)`
                : `Installed in ${parent?.name || "item"}`);
        } else if (item.type === "clothing" && item.system?.equipped === "equipped") {
            unit = 0;
            reasons.push("Worn (weightless)");
        } else {
            if (settings.includeUpgradeWeight) {
                const upgrade = this.getInstalledUpgradeWeight(ctx, item);
                if (upgrade.total !== 0) {
                    unit = Math.max(0, unit + upgrade.total);
                    reasons.push(`${upgrade.total > 0 ? "+" : ""}${fmt(upgrade.total)}u from: ${upgrade.names.join(", ")}`);
                    hidden = false;
                }
            }
            if ((item.type === "weapon" || item.type === "armor") && item.system?.equipped === "equipped") {
                const m = settings.equippedMultiplier;
                if (m !== 1) {
                    unit = unit * m;
                    reasons.push(`Equipped (${EQUIPPED_LABELS[m] ?? `×${m}`})`);
                }
            }
        }

        const carried = unit * qty;

        const containerId = ctx.containedIn.get(item.id);
        if (containerId) {
            const container = ctx.containers.get(containerId);
            const reduction = container.data.weightReduction;
            if (reduction !== 1) {
                unit = unit * reduction;
                reasons.push(reduction === 0
                    ? `in ${container.item.name} (weightless)`
                    : `in ${container.item.name} (${Math.round(reduction * 100)}% weight)`);
            }
        }

        const result = { base, qty, unit, carried, total: unit * qty, reasons, hidden };
        ctx.cache.set(item.id, result);
        return result;
    }

    static getInstalledUpgradeWeight(ctx, item) {
        const list = item.system?.installedItems?.list;
        let total = 0;
        const names = [];
        if (!Array.isArray(list)) return { total, names };
        for (const id of list) {
            const installed = ctx.actor.items.get(id);
            if (installed?.type !== "itemUpgrade") continue;
            const upgradeData = installed.getFlag(MODULE_ID, "upgradeData") || {};
            let add = 0;
            if (!upgradeData.weightlessWhenAttached) add += this.getBaseWeight(installed) * this.getQuantity(installed);
            add += num(upgradeData.additionalWeight, 0);
            if (add !== 0) {
                total += add;
                names.push(installed.name);
            }
        }
        return { total, names };
    }

    static applyVehicleRules(ctx, item, base, reasons) {
        if (item.type === "cyberware" && item.getFlag(VAS_ID, "installed")) {
            reasons.push("Installed (weightless)");
            return 0;
        }
        if (item.type === "itemUpgrade" && item.getFlag(VAS_ID, "mounted")) {
            reasons.push("Mounted (weightless)");
            return 0;
        }
        if (item.type === "weapon" && item.getFlag(VAS_ID, "mountedPosition")) {
            const m = ctx.settings.equippedMultiplier;
            if (m !== 1) {
                reasons.push(`Mounted (${EQUIPPED_LABELS[m] ?? `×${m}`})`);
                return base * m;
            }
        }
        return base;
    }

    static containerLoad(ctx, containerId, excludeItemId = null) {
        const container = ctx.containers.get(containerId);
        if (!container) return 0;
        let load = 0;
        for (const item of container.contents) {
            if (item.id !== excludeItemId) load += this.computeItem(ctx, item).carried;
        }
        return load;
    }

    static sumActorWeight(ctx) {
        let total = 0;
        for (const item of ctx.actor.items) total += this.computeItem(ctx, item).total;
        return total;
    }

    static toWeightData(total, max, extra = {}) {
        const percentage = max > 0 ? (total / max) * 100 : (total > 0 ? 999 : 0);
        return {
            current: round1(total),
            max: round1(max),
            percentage: Math.round(percentage),
            status: percentage > 100 ? "overweight" : "normal",
            ...extra
        };
    }

    static async calculateActorWeight(actor, ctx = null) {
        return this.calculateActorWeightSync(actor, ctx);
    }

    static calculateActorWeightSync(actor, ctx = null) {
        ctx ??= this.buildContext(actor);
        return this.toWeightData(this.sumActorWeight(ctx), this.calculateMaxWeight(actor, ctx));
    }

    static calculateMaxWeight(actor, ctx = null) {
        let baseCapacity;
        if (game.settings.get(MODULE_ID, "capacityCalculation") === "custom") {
            baseCapacity = game.settings.get(MODULE_ID, "customCapacity");
        } else {
            const body = actor.system.stats?.body?.value ?? 10;
            baseCapacity = body * game.settings.get(MODULE_ID, "baseWeightMultiplier");
        }
        return baseCapacity + this.getCapacityBonus(actor, ctx);
    }

    static getCapacityBonus(actor, ctx = null) {
        ctx ??= this.buildContext(actor);
        let bonus = 0;
        for (const item of actor.items) {
            if (item.type !== "cyberware" || !this.isInstalled(ctx, item)) continue;
            const value = num(item.getFlag(MODULE_ID, "capacityBonus")?.value, 0);
            if (value > 0) bonus += value;
        }
        return bonus;
    }

    static async calculateVehicleWeight(actor) {
        return this.calculateVehicleWeightSync(actor);
    }

    static calculateVehicleWeightSync(actor, ctx = null) {
        ctx ??= this.buildContext(actor, { vehicle: true });
        const perVehicleCap = actor.getFlag(MODULE_ID, "vehicleCapacity");
        const baseWeight = Number.isFinite(perVehicleCap)
            ? perVehicleCap
            : (game.settings.get(MODULE_ID, "vehicleCargoCapacity") ?? 10);
        const capacityBonus = this.getVehicleCapacityBonus(actor);
        return this.toWeightData(this.sumActorWeight(ctx), baseWeight + capacityBonus, { base: baseWeight, bonus: capacityBonus });
    }

    static getVehicleCapacityBonus(actor) {
        let bonus = 0;
        for (const item of actor.items) {
            const active = (item.type === "cyberware" && item.getFlag(VAS_ID, "installed"))
                || (item.type === "itemUpgrade" && item.getFlag(VAS_ID, "mounted"));
            if (!active) continue;
            const value = num(item.getFlag(MODULE_ID, "capacityBonus")?.value, 0);
            if (value > 0) bonus += value;
        }
        return bonus;
    }

    static getItemWeight(item) {
        if (!item.parent) return this.getBaseWeight(item) * this.getQuantity(item);
        return this.computeItem(this.buildContext(item.parent), item).carried;
    }

    static getContainerContentsWeight(container) {
        if (!container.parent) return 0;
        return this.containerLoad(this.buildContext(container.parent), container.id);
    }

    static async calculateContainerWeight(container, actor) {
        const ctx = this.buildContext(actor);
        const own = this.computeItem(ctx, container).total;
        const entry = ctx.containers.get(container.id);
        if (!entry) return own;
        return own + entry.contents.reduce((sum, item) => sum + this.computeItem(ctx, item).total, 0);
    }

    static getWeightBarColor(percentage) {
        if (percentage >= 69) return "#de453b";
        if (percentage >= 39) return "#fbcc76";
        return "#52606d";
    }

    static getContainerTypeLabel(containerType) {
        return CONTAINER_TYPE_LABELS[containerType] || "Container";
    }

    static renderContainerIcon(iconValue) {
        const [type, name] = this.normalizeIcon(iconValue).split(":");
        const safe = esc(name);
        if (type === "wa") return `<wa-icon name="${safe}"></wa-icon>`;
        return `<i class="fas fa-${safe}"></i>`;
    }

    static canPutInContainer(ctx, item, container) {
        const entry = ctx.containers.get(container.id);
        if (!entry) return { ok: false, reason: `${container.name} is not a container.` };
        if (item.id === container.id) return { ok: false, reason: "An item can't be put inside itself." };
        if (this.isContainer(item)) return { ok: false, reason: "Containers can't be put inside other containers." };
        if (this.isInstalledNonAmmo(ctx, item)) return { ok: false, reason: `${item.name} is installed and can't be stored in a container.` };
        if (!entry.data.allowedTypes.includes(this.itemCategory(item))) {
            return { ok: false, reason: `This ${this.getContainerTypeLabel(entry.data.containerType)} cannot hold ${item.type} items!` };
        }
        const load = this.containerLoad(ctx, container.id, item.id);
        const itemWeight = this.computeItem(ctx, item).carried;
        if (load + itemWeight > entry.data.capacity + 1e-9) {
            return { ok: false, reason: `Container capacity exceeded! (${fmt(load + itemWeight)}/${fmt(entry.data.capacity)} units)` };
        }
        return { ok: true };
    }

    static getCompatibleContainers(ctx, item) {
        const current = ctx.containedIn.get(item.id);
        const result = [];
        for (const [id, entry] of ctx.containers) {
            if (id === item.id || id === current) continue;
            if (!entry.data.allowedTypes.includes(this.itemCategory(item))) continue;
            if (this.isContainer(item) || this.isInstalledNonAmmo(ctx, item)) continue;
            result.push(entry.item);
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    static async putItemInContainer(item, containerId) {
        const actor = item.parent;
        if (!actor) return false;
        const container = actor.items.get(containerId);
        if (!container) {
            ui.notifications.error("Container not found!");
            return false;
        }

        const ctx = this.buildContext(actor, { vehicle: this.isVehicleSheet(actor.sheet, actor.sheet?.element) });
        const check = this.canPutInContainer(ctx, item, container);
        if (!check.ok) {
            ui.notifications.warn(check.reason);
            return false;
        }

        await item.setFlag(MODULE_ID, "containedIn", containerId);

        if (game.settings.get(MODULE_ID, "showContainerNotifications")) {
            const data = ctx.containers.get(containerId).data;
            if (data.containerType !== "multi" && data.weightReduction === 0) {
                ui.notifications.info(`${item.name} put into ${container.name} (${this.getContainerTypeLabel(data.containerType)} - weightless!)`);
            } else {
                ui.notifications.info(`${item.name} put into ${container.name}`);
            }
        }
        return true;
    }

    static async removeFromContainer(item) {
        const containerId = item.getFlag(MODULE_ID, "containedIn");
        const container = item.parent?.items.get(containerId);
        await item.unsetFlag(MODULE_ID, "containedIn");
        if (game.settings.get(MODULE_ID, "showContainerNotifications")) {
            ui.notifications.info(`${item.name} removed from ${container?.name || "container"}`);
        }
    }

    static async showContainerDialog(item) {
        const actor = item.parent;
        if (!actor) return;

        const vehicle = this.isVehicleSheet(actor.sheet, actor.sheet?.element);
        const ctx = this.buildContext(actor, { vehicle });
        const compatible = this.getCompatibleContainers(ctx, item);

        if (compatible.length === 0) {
            ui.notifications.warn(`No compatible containers found for ${item.type} items!`);
            return;
        }

        const containerButtons = compatible.map(container => {
            const data = ctx.containers.get(container.id).data;
            const isWeightless = data.weightReduction === 0;
            const load = this.containerLoad(ctx, container.id);
            return `
                <button type="button" class="ws-dialog-button" data-container-id="${esc(container.id)}">
                    <span class="ws-dialog-icon">${this.renderContainerIcon(data.icon)}</span>
                    <span class="ws-dialog-text">
                        <div class="ws-dialog-name">${esc(container.name)}</div>
                        <div class="ws-dialog-sub">
                            ${esc(this.getContainerTypeLabel(data.containerType))}${isWeightless ? ' - <span class="ws-weightless">Weightless!</span>' : ""} | ${fmt(load)}/${fmt(data.capacity)} units
                        </div>
                    </span>
                </button>`;
        }).join("");

        const content = `
            <div class="ws-dialog-outer">
                <div class="ws-dialog-inner">
                    <h3 class="ws-dialog-title">Select Container for ${esc(item.name)}</h3>
                    <p class="ws-dialog-desc">Moving <strong>${esc(item.name)}</strong> (${esc(item.type)}) into container...</p>
                    <button type="button" class="ws-dialog-button ws-dialog-cancel">Cancel</button>
                    ${containerButtons}
                </div>
            </div>`;

        const dialog = new Dialog({
            title: "Put Item in Container",
            content,
            buttons: {},
            render: (html) => {
                html.closest(".dialog").addClass("ws-container-dialog");
                html.find(".ws-dialog-cancel").on("click", () => dialog.close());
                html.find(".ws-dialog-button[data-container-id]").on("click", async (event) => {
                    const containerId = event.currentTarget.dataset.containerId;
                    dialog.close();
                    await this.putItemInContainer(item, containerId);
                });
            }
        });
        dialog.render(true);
    }

    static closeContextMenu() {
        $(".weight-system-context-menu").remove();
        $(document).off(".ws-menu");
    }

    static bindContextMenu(rows, actor) {
        rows.off("contextmenu.weight-system").on("contextmenu.weight-system", (event) => {
            const row = event.currentTarget;
            if (event.target.closest?.("li.item, .item") !== row) return;
            const item = actor.items.get(row.dataset.itemId || row.dataset.documentId);
            if (!item) return;

            const vehicle = this.isVehicleSheet(actor.sheet, actor.sheet?.element);
            const ctx = this.buildContext(actor, { vehicle });
            const menuItems = [];
            if (this.getCompatibleContainers(ctx, item).length > 0) {
                menuItems.push({
                    icon: "fa-box",
                    name: ctx.containedIn.has(item.id) ? "Move to Another Container" : "Put in Container",
                    callback: () => this.showContainerDialog(item)
                });
            }
            if (ctx.containedIn.has(item.id)) {
                menuItems.push({ icon: "fa-box-open", name: "Remove from Container", callback: () => this.removeFromContainer(item) });
            }
            if (menuItems.length === 0) return;

            event.preventDefault();
            event.stopPropagation();
            this.closeContextMenu();

            const menu = $(`<div class="weight-system-context-menu">${menuItems.map((m, i) =>
                `<div class="menu-item" data-index="${i}"><i class="fas ${m.icon}"></i> ${esc(m.name)}</div>`).join("")}</div>`);
            menu.css({ left: `${event.clientX}px`, top: `${event.clientY}px` });
            $("body").append(menu);

            menu.find(".menu-item").on("click", (e) => {
                const entry = menuItems[Number(e.currentTarget.dataset.index)];
                this.closeContextMenu();
                entry?.callback();
            });

            setTimeout(() => {
                $(document)
                    .on("mousedown.ws-menu", (e) => { if (!$(e.target).closest(".weight-system-context-menu").length) this.closeContextMenu(); })
                    .on("keydown.ws-menu", (e) => { if (e.key === "Escape") this.closeContextMenu(); })
                    .on("wheel.ws-menu", () => this.closeContextMenu());
            }, 0);
        });
    }

    static addItemContextMenus(app, html) {
        if (!game.settings.get(MODULE_ID, "enableWeightSystem")) return;
        const gearTab = html.find('.tab[data-tab="gear"]');
        this.bindContextMenu(gearTab.find("li.item[data-item-id]"), app.actor);
    }

    static addVehicleItemContextMenus(app, html, actor) {
        const cargoTab = html.find('.tab[data-tab="cargo"]');
        if (cargoTab.length === 0) return;
        this.bindContextMenu(cargoTab.find(".item[data-item-id]"), actor);
    }

    static async onInitialRender(app, html, data) {
        if (!game.settings.get(MODULE_ID, "enableWeightSystem")) return;
        const actor = app.actor;
        if (!actor) return;

        if (this.isVehicleSheet(app, html)) {
            await this.onRenderVehicleSheet(app, html, data);
            return;
        }
        if (actor.type !== "character") return;

        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length === 0) return;

        const ctx = this.buildContext(actor);
        const weightData = this.calculateActorWeightSync(actor, ctx);

        this.renderWeightDisplay(gearTab, actor, weightData);
        if (game.settings.get(MODULE_ID, "groupContainerContents")) this.buildContainersSection(gearTab, ctx);
        this.applyInlineWeights(gearTab, ctx);
        this.applyContainerIndicators(gearTab, ctx);
        this.bindContainerDragDrop(gearTab, actor, app);
        this.addItemContextMenus(app, html);
        this.maybeNotifyOverweight(actor, weightData);
    }

    static async addWeightDisplay(app, html) {
        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length === 0) return;
        this.renderWeightDisplay(gearTab, app.actor, this.calculateActorWeightSync(app.actor));
    }

    static renderWeightDisplay(gearTab, actor, weightData) {
        let container = gearTab.find(".weight-system-container").first();
        if (container.length === 0) {
            const syncButton = game.settings.get(MODULE_ID, "showSyncButton")
                ? '<button type="button" class="weight-recalculate-btn" data-tooltip="Sync weights from compendiums and Items Directory"><i class="fa-solid fa-rotate"></i></button>'
                : "";
            container = $(`
                <div class="weight-system-container">
                    <div class="weight-display">
                        <div class="ws-display-row">
                            <span><strong>Capacity:</strong></span>
                            <span class="ws-capacity-text"></span>
                        </div>
                        <div class="weight-bar"><div class="weight-fill"></div></div>
                        <div class="ws-overweight-warning">⚠️ OVERWEIGHT!</div>
                        ${syncButton}
                    </div>
                </div>`);
            gearTab.prepend(container);
            container.find(".weight-recalculate-btn").on("click", () => this.recalculateWeightsFromDirectory(actor));
        }

        const overweight = weightData.status === "overweight";
        container.find(".weight-display").toggleClass("overweight", overweight);
        container.find(".ws-capacity-text").text(`${weightData.current}/${weightData.max} units`);
        container.find(".weight-fill").css({
            width: `${Math.min(weightData.percentage, 100)}%`,
            background: this.getWeightBarColor(weightData.percentage)
        });
    }

    static maybeNotifyOverweight(actor, weightData) {
        if (weightData.status !== "overweight") {
            this.notificationCooldowns.delete(actor.id);
            return;
        }
        const last = this.notificationCooldowns.get(actor.id);
        if (last && Date.now() - last < 30000) return;
        ui.notifications.warn(`${actor.name} is carrying too much weight! (${weightData.current}/${weightData.max} units)`);
        this.notificationCooldowns.set(actor.id, Date.now());
    }

    static getCollapsedState() {
        try {
            return foundry.utils.deepClone(game.settings.get(MODULE_ID, "collapsedContainers") || {});
        } catch (e) {
            return {};
        }
    }

    static isCollapsed(key) {
        return this.getCollapsedState()[key] === true;
    }

    static setCollapsed(key, value) {
        const state = this.getCollapsedState();
        if (value) state[key] = true;
        else delete state[key];
        game.settings.set(MODULE_ID, "collapsedContainers", state);
    }

    static buildContainersSection(gearTab, ctx) {
        gearTab.find(".ws-containers-section").remove();
        if (ctx.containers.size === 0) return;

        const rootList = gearTab.find(".gear-tab-data > ol.items-list").first();
        if (rootList.length === 0) return;

        const topLevelRow = (id) => rootList.find(`> .collapsible > ol.items-list > li.item[data-item-id="${id}"]`).first();
        const actorKey = ctx.actor.uuid;
        const sectionCollapsed = this.isCollapsed(`${actorKey}|section`);
        const loc = (key, fallback) => {
            const text = game.i18n.localize(key);
            return text === key ? fallback : text;
        };

        const section = $(`
            <div class="collapsible ws-containers-section">
                <li class="items-header flexrow">
                    <span class="item-name gear-name gear-section-header text-nowrap ws-section-toggle" data-tooltip="Show/hide containers">
                        Containers
                        <i class="fas ${sectionCollapsed ? "fa-plus" : "fa-minus"} ws-section-icon"></i>
                    </span>
                    <span class="item-detail gear-amount gear-section-header text-nowrap">${esc(loc("CPR.global.generic.amount", "Amount"))}</span>
                    <span class="item-detail gear-data gear-section-header text-nowrap">${esc(loc("CPR.characterSheet.rightPane.data", "Data"))}</span>
                    <span class="item-detail gear-actions gear-section-header text-nowrap">${esc(loc("CPR.global.generic.actions", "Actions"))}</span>
                </li>
                <ol class="items-list ws-containers-list"></ol>
            </div>`);
        const list = section.find(".ws-containers-list");

        const containers = [...ctx.containers.values()].sort((a, b) => a.item.name.localeCompare(b.item.name));
        let moved = 0;
        for (const entry of containers) {
            const row = topLevelRow(entry.item.id);
            if (row.length === 0) continue;
            const contentsCollapsed = this.isCollapsed(`${actorKey}|${entry.item.id}`);
            row.removeClass("hide").addClass("ws-container-row").attr("data-ws-container", entry.item.id);
            if (sectionCollapsed) row.addClass("ws-hidden");
            list.append(row);
            moved++;

            const contents = [...entry.contents].sort((a, b) => a.name.localeCompare(b.name));
            for (const item of contents) {
                const contentRow = topLevelRow(item.id);
                if (contentRow.length === 0) continue;
                contentRow.removeClass("hide").addClass("ws-contained").attr("data-ws-in", entry.item.id);
                if (sectionCollapsed || contentsCollapsed) contentRow.addClass("ws-hidden");
                list.append(contentRow);
            }
        }
        if (moved === 0) return;

        const gearCategory = rootList.children("div.collapsible").has("#gearTab-gear").first();
        if (gearCategory.length && gearCategory.parent().is(rootList)) gearCategory.before(section);
        else rootList.prepend(section);

        section.find(".ws-section-toggle").on("click", () => {
            const collapse = !this.isCollapsed(`${actorKey}|section`);
            this.setCollapsed(`${actorKey}|section`, collapse);
            section.find(".ws-section-icon").toggleClass("fa-plus", collapse).toggleClass("fa-minus", !collapse);
            list.children("li.item").each((i, el) => {
                const $el = $(el);
                const parentId = $el.attr("data-ws-in");
                const hideContents = parentId && this.isCollapsed(`${actorKey}|${parentId}`);
                $el.toggleClass("ws-hidden", collapse || !!hideContents);
            });
        });
    }

    static weightLabelHtml(result, extraClass = "") {
        let colorClass = "";
        if (result.unit < result.base) colorClass = "ws-lighter";
        else if (result.unit > result.base) colorClass = "ws-heavier";
        const modified = result.reasons.length > 0;
        const tooltip = modified ? ` data-tooltip="${esc(`${result.reasons.join(", then ")} - Base: ${fmt(result.base)}u`)}"` : "";
        return `<span class="weight-inline-display ${colorClass} ${extraClass}${modified ? " ws-modified" : ""}"${tooltip}>${fmt(result.total)}u</span>`;
    }

    static applyInlineWeights(gearTab, ctx) {
        gearTab.find(".weight-inline-display").remove();
        gearTab.find("ol.items-list > li.item[data-item-id]").each((i, el) => {
            const row = $(el);
            const item = ctx.actor.items.get(el.dataset.itemId);
            if (!item) return;
            const result = this.computeItem(ctx, item);
            if (result.hidden) return;
            const target = row.children(".item-detail.gear-data").first();
            if (target.length > 0) target.prepend(this.weightLabelHtml(result) + " ");
            else row.children(".item-name").first().append(this.weightLabelHtml(result, "ws-in-name"));
        });
    }

    static addInlineWeights(html, actor) {
        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length) this.applyInlineWeights(gearTab, this.buildContext(actor));
    }

    static applyContainerIndicators(gearTab, ctx) {
        gearTab.find("[data-weight-system-indicator]").remove();
        const actorKey = ctx.actor.uuid;

        for (const [id, entry] of ctx.containers) {
            const row = gearTab.find(`ol.items-list > li.item[data-item-id="${id}"]`).first();
            if (row.length === 0) continue;
            row.attr("data-ws-container", id);
            const { data } = entry;
            const load = this.containerLoad(ctx, id);
            const percentage = data.capacity > 0 ? Math.min((load / data.capacity) * 100, 100) : (load > 0 ? 100 : 0);
            const isWeightless = data.weightReduction === 0;
            const names = entry.contents.map(i => i.name).join(", ");
            const tooltip = `${this.getContainerTypeLabel(data.containerType)}: ${fmt(load)}/${fmt(data.capacity)} units (${entry.contents.length} items)`
                + `${isWeightless ? " - Weightless!" : ""}${entry.contents.length ? `<br>Contains: ${esc(names)}` : "<br>Empty"}`;
            const collapsed = this.isCollapsed(`${actorKey}|${id}`);
            const toggle = entry.contents.length && row.hasClass("ws-container-row")
                ? `<a class="ws-toggle-contents" data-tooltip="Show/hide contents"><i class="fas fa-chevron-${collapsed ? "right" : "down"}"></i></a>`
                : "";

            if (toggle) {
                row.children(".item-name").first().append(
                    `<span class="ws-container-toggle" data-weight-system-indicator="true">${toggle}</span>`);
            }
            const bar = `<span class="ws-container-indicator ws-in-data" data-weight-system-indicator="true">`
                + `<span class="ws-container-bar" data-tooltip="${esc(tooltip)}">`
                + `<span class="ws-container-fill" style="width: ${percentage}%; background: ${this.getWeightBarColor(percentage)};"></span>`
                + `</span></span>`;
            const dataCell = row.children(".item-detail.gear-data").first();
            const weightLabel = dataCell.children(".weight-inline-display").first();
            if (weightLabel.length) weightLabel.after(bar);
            else if (dataCell.length) dataCell.prepend(bar);
            else row.children(".item-name").first().append(bar);

            row.find(".ws-toggle-contents").on("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const collapse = !this.isCollapsed(`${actorKey}|${id}`);
                this.setCollapsed(`${actorKey}|${id}`, collapse);
                $(event.currentTarget).find("i").toggleClass("fa-chevron-right", collapse).toggleClass("fa-chevron-down", !collapse);
                row.parent().children(`li.item[data-ws-in="${id}"]`).toggleClass("ws-hidden", collapse);
            });
        }

        for (const [itemId, containerId] of ctx.containedIn) {
            const row = gearTab.find(`ol.items-list > li.item[data-item-id="${itemId}"]`).first();
            if (row.length === 0) continue;
            const entry = ctx.containers.get(containerId);
            const isWeightless = entry.data.weightReduction === 0;
            const grouped = row.closest(".ws-containers-section").length > 0;
            row.addClass("ws-contained").toggleClass("ws-grouped", grouped).attr("data-ws-in", containerId);
            row.children(".item-name").first().prepend(
                `<span class="ws-contained-marker" data-weight-system-indicator="true" data-tooltip="${esc(`In container: ${entry.item.name}${isWeightless ? " (Weightless)" : ""}`)}">`
                + `<span aria-hidden="true">↳</span>${grouped ? "" : this.renderContainerIcon(entry.data.icon)}</span>`);
        }
    }

    static addItemContainerIndicators(html, actor) {
        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length) this.applyContainerIndicators(gearTab, this.buildContext(actor));
    }

    static getDraggedOwnItem(event, actor) {
        let data;
        try {
            data = TextEditor.getDragEventData(event.originalEvent ?? event);
        } catch (e) {
            return null;
        }
        if (data?.type !== "Item" || !data.uuid) return null;
        const item = fromUuidSync(data.uuid);
        if (!item || item.parent?.uuid !== actor.uuid) return null;
        return item;
    }

    static bindContainerDragDrop(gearTab, actor, app) {
        if (!app.isEditable) return;
        const targetSelector = "li.item[data-ws-container], li.item[data-ws-in]";

        const drag = this.activeDrag;
        if (drag && drag.actor === actor && !drag.gearTab[0].isConnected) {
            const item = actor.items.get(drag.itemId);
            this.clearDragHighlight();
            if (item) this.startDragHighlight(gearTab, actor, item);
        }

        gearTab.off(".ws-drag").on("dragstart.ws-drag", (event) => {
            const row = event.target.closest?.("li.item[data-item-id]");
            const item = row && actor.items.get(row.dataset.itemId);
            this.clearDragHighlight();
            if (!item) return;
            this.startDragHighlight(gearTab, actor, item);
        });

        gearTab.off(".ws-drop")
            .on("dragover.ws-drop", (event) => {
                const row = event.target.closest?.(targetSelector);
                if (row) event.preventDefault();
                this.updateDragHover(gearTab, row);
            })
            .on("dragleave.ws-drop", (event) => {
                const into = event.originalEvent?.relatedTarget ?? event.relatedTarget;
                if (!into || !gearTab[0].contains(into)) this.updateDragHover(gearTab, null);
            })
            .on("drop.ws-drop", async (event) => {
                this.clearDragHighlight();
                const item = this.getDraggedOwnItem(event, actor);
                if (!item) return;

                const row = event.target.closest?.(targetSelector);
                if (row) {
                    event.preventDefault();
                    event.stopPropagation();
                    const containerId = row.dataset.wsContainer || row.dataset.wsIn;
                    if (!containerId || item.id === containerId) return;
                    if (item.getFlag(MODULE_ID, "containedIn") === containerId && this.isContainer(actor.items.get(containerId))) return;
                    await this.putItemInContainer(item, containerId);
                    return;
                }

                const ctx = this.buildContext(actor);
                if (!ctx.containedIn.has(item.id)) return;
                event.preventDefault();
                event.stopPropagation();
                await this.removeFromContainer(item);
            });
    }

    static activeDrag = null;

    static startDragHighlight(gearTab, actor, item) {
        const ctx = this.buildContext(actor);
        const currentContainer = ctx.containedIn.get(item.id);
        const states = new Map();
        for (const [id, entry] of ctx.containers) {
            if (id === item.id || id === currentContainer) continue;
            const state = this.canPutInContainer(ctx, item, entry.item).ok ? "ok" : "bad";
            states.set(id, state);
            gearTab.find(`li.item[data-ws-container="${id}"]`).addClass(state === "ok" ? "ws-drag-ok" : "ws-drag-bad");
        }
        this.activeDrag = { gearTab, actor, itemId: item.id, states, hoverId: null };

        const end = () => this.clearDragHighlight();
        document.addEventListener("dragend", end, { capture: true, once: true });
        document.addEventListener("drop", end, { capture: true, once: true });
        this.activeDrag.cleanup = () => {
            document.removeEventListener("dragend", end, { capture: true });
            document.removeEventListener("drop", end, { capture: true });
        };
    }

    static updateDragHover(gearTab, row) {
        const drag = this.activeDrag;
        if (!drag || drag.gearTab[0] !== gearTab[0]) return;
        const containerId = row ? (row.dataset.wsContainer || row.dataset.wsIn) : null;
        const hoverId = containerId && drag.states.has(containerId) ? containerId : null;
        if (hoverId === drag.hoverId && (!row || row === drag.hoverRow)) return;

        gearTab.find(".ws-drag-over").removeClass("ws-drag-over ws-drag-over-bad");
        drag.hoverId = hoverId;
        drag.hoverRow = row;
        if (!hoverId) return;

        const cls = drag.states.get(hoverId) === "ok" ? "ws-drag-over" : "ws-drag-over ws-drag-over-bad";
        gearTab.find(`li.item[data-ws-container="${hoverId}"]`).addClass(cls);
        if (row && !row.dataset.wsContainer) $(row).addClass(cls);
    }

    static clearDragHighlight() {
        const drag = this.activeDrag;
        if (!drag) return;
        drag.cleanup?.();
        if (drag.gearTab[0].isConnected) drag.gearTab.find(".ws-drag-ok, .ws-drag-bad, .ws-drag-over").removeClass("ws-drag-ok ws-drag-bad ws-drag-over ws-drag-over-bad");
        this.activeDrag = null;
    }

    static scheduleWeightUpdate(actor, { fullRender = false } = {}) {
        const key = actor.uuid;
        const existing = this.updateTimeouts.get(key);
        if (existing) clearTimeout(existing.timer);
        const needsFull = fullRender || existing?.fullRender || false;

        const timer = setTimeout(async () => {
            this.updateTimeouts.delete(key);
            const sheet = actor.sheet;
            if (!sheet?.rendered) return;
            if (needsFull) {
                sheet.render(false);
                return;
            }
            if (this.isVehicleSheet(sheet, sheet.element)) {
                await this.updateVehicleWeightDisplayOnly(actor, sheet.element);
            } else {
                await this.updateWeightDisplayOnly(actor, sheet.element);
            }
        }, 50);
        this.updateTimeouts.set(key, { timer, fullRender: needsFull });
    }

    static async updateWeightDisplayOnly(actor, html) {
        if (actor.type !== "character") return;
        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length === 0 || gearTab.find(".weight-system-container").length === 0) return;
        const ctx = this.buildContext(actor);
        const weightData = this.calculateActorWeightSync(actor, ctx);
        this.renderWeightDisplay(gearTab, actor, weightData);
        this.applyInlineWeights(gearTab, ctx);
        this.applyContainerIndicators(gearTab, ctx);
        this.maybeNotifyOverweight(actor, weightData);
    }

    static async onRenderVehicleSheet(app, html, data) {
        if (!game.settings.get(MODULE_ID, "enableWeightSystem")) return;
        const actor = app.actor;
        if (!actor) return;
        const ctx = this.buildContext(actor, { vehicle: true });
        this.renderVehicleWeightDisplay(html, actor, this.calculateVehicleWeightSync(actor, ctx));
        this.applyVehicleDecorations(html, ctx);
        this.addVehicleItemContextMenus(app, html, actor);
    }

    static async addVehicleWeightDisplay(app, html, actor) {
        this.renderVehicleWeightDisplay(html, actor, this.calculateVehicleWeightSync(actor));
    }

    static renderVehicleWeightDisplay(html, actor, weightData) {
        const cargoTab = html.find('.tab[data-tab="cargo"]');
        if (cargoTab.length === 0) return;

        let container = cargoTab.find(".weight-system-container.vehicle-weight").first();
        if (container.length === 0) {
            container = $(`
                <div class="weight-system-container vehicle-weight">
                    <div class="ws-display-row">
                        <span><strong>Cargo Capacity:</strong></span>
                        <span class="vehicle-weight-text"></span>
                    </div>
                    <div class="weight-bar"><div class="weight-fill"></div></div>
                    <div class="ws-overweight-warning">⚠️ OVERLOADED!</div>
                </div>`);
            cargoTab.find(".items-header").first().after(container);
        }

        const overweight = weightData.status === "overweight";
        container.toggleClass("overweight", overweight);
        container.find(".vehicle-weight-text").html(this._vehicleCapText(weightData));
        container.find(".weight-fill").css({
            width: `${Math.min(weightData.percentage, 100)}%`,
            background: this.getWeightBarColor(weightData.percentage)
        });
        this._bindVehicleCapEdit(actor, container);
    }

    static _vehicleCapText(weightData) {
        const valAttrs = game.user.isGM
            ? 'data-editable="1" data-tooltip="Click to edit cargo capacity"'
            : "";
        return `${weightData.current}/<span class="vehicle-cap-value${game.user.isGM ? " ws-editable" : ""}" ${valAttrs} data-base="${esc(weightData.base)}">${weightData.max}</span> units`;
    }

    static _bindVehicleCapEdit(actor, container) {
        if (!game.user.isGM || !container || container.length === 0) return;
        container.find(".vehicle-cap-value").off("click.weight-system").on("click.weight-system", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._beginVehicleCapEdit(actor, $(event.currentTarget));
        });
    }

    static _beginVehicleCapEdit(actor, $el) {
        const base = parseFloat($el.attr("data-base")) || 0;
        const $input = $(`<input type="number" class="vehicle-cap-input" value="${base}" step="1" min="0">`);
        $el.replaceWith($input);
        $input.trigger("focus").trigger("select");

        const restore = () => {
            const sheet = actor.sheet;
            if (sheet?.rendered) this.updateVehicleWeightDisplayOnly(actor, sheet.element);
        };
        const commit = async () => {
            $input.off();
            const val = parseFloat($input.val());
            if (Number.isFinite(val) && val >= 0) {
                await actor.setFlag(MODULE_ID, "vehicleCapacity", val);
            } else {
                restore();
            }
        };

        $input.on("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                $input.off("blur");
                commit();
            } else if (event.key === "Escape") {
                event.preventDefault();
                $input.off();
                restore();
            }
        });
        $input.on("blur", commit);
    }

    static async updateVehicleWeightDisplayOnly(actor, html) {
        const cargoTab = html.find('.tab[data-tab="cargo"]');
        if (cargoTab.find(".weight-system-container.vehicle-weight").length === 0) return;
        const ctx = this.buildContext(actor, { vehicle: true });
        this.renderVehicleWeightDisplay(html, actor, this.calculateVehicleWeightSync(actor, ctx));
        this.applyVehicleDecorations(html, ctx);
    }

    static applyVehicleDecorations(html, ctx) {
        this.applyVehicleCargoWeights(html, ctx);
        this.applyVehicleWeaponsArmorWeights(html, ctx);
        this.applyVehicleContainerIndicators(html, ctx);
    }

    static applyVehicleCargoWeights(html, ctx) {
        const cargoTab = html.find('.tab[data-tab="cargo"]');
        if (cargoTab.length === 0) return;
        cargoTab.find(".weight-inline-display").remove();
        cargoTab.find(".item[data-item-id]").each((i, el) => {
            const item = ctx.actor.items.get(el.dataset.itemId);
            if (!item) return;
            const result = this.computeItem(ctx, item);
            if (result.base <= 0) return;
            $(el).find(".item-properties").first().prepend(this.weightLabelHtml(result, "property ws-vehicle-label"));
        });
    }

    static applyVehicleWeaponsArmorWeights(html, ctx) {
        const weaponsTab = html.find('.tab[data-tab="weapons"]');
        if (weaponsTab.length === 0) return;
        weaponsTab.find(".weight-inline-display").remove();
        weaponsTab.find(".item[data-item-id]").each((i, el) => {
            const item = ctx.actor.items.get(el.dataset.itemId);
            if (!item || (item.type !== "weapon" && item.type !== "armor")) return;
            const result = this.computeItem(ctx, item);
            if (result.base <= 0) return;
            const label = this.weightLabelHtml(result, "ws-vehicle-weapon-label");
            const row = $(el);
            const badge = row.find(".mounted-badge").first();
            if (badge.length) badge.after(label);
            else if (row.find(".item-controls").length) row.find(".item-controls").first().append(label);
            else row.find(".item-properties").first().append(label);
        });
    }

    static applyVehicleContainerIndicators(html, ctx) {
        const cargoTab = html.find('.tab[data-tab="cargo"]');
        if (cargoTab.length === 0) return;
        cargoTab.find(".vehicle-container-indicator, .vehicle-contained-indicator").remove();

        for (const [id, entry] of ctx.containers) {
            const row = cargoTab.find(`.item[data-item-id="${id}"]`).first();
            if (row.length === 0) continue;
            const { data } = entry;
            const load = this.containerLoad(ctx, id);
            const percentage = data.capacity > 0 ? Math.min((load / data.capacity) * 100, 100) : (load > 0 ? 100 : 0);
            row.find(".item-details").first().append(`
                <div class="vehicle-container-indicator">
                    <span class="ws-container-label">${this.renderContainerIcon(data.icon)} ${CONTAINER_SHORT_LABELS[data.containerType] || "CONT"}:</span>
                    <div class="ws-container-bar ws-small" data-tooltip="${esc(`${fmt(load)}/${fmt(data.capacity)} units`)}">
                        <div class="ws-container-fill" style="width: ${percentage}%; background: ${this.getWeightBarColor(percentage)};"></div>
                    </div>
                </div>`);
        }

        for (const [itemId, containerId] of ctx.containedIn) {
            const row = cargoTab.find(`.item[data-item-id="${itemId}"]`).first();
            if (row.length === 0) continue;
            const entry = ctx.containers.get(containerId);
            row.find(".item-name").first().prepend(
                `<span class="vehicle-contained-indicator" data-tooltip="${esc(`In container: ${entry.item.name}`)}">↳ ${this.renderContainerIcon(entry.data.icon)}</span>`);
        }
    }

    static addVehicleInlineWeights(html, actor) {
        this.applyVehicleCargoWeights(html, this.buildContext(actor, { vehicle: true }));
    }

    static addVehicleWeaponsArmorInlineWeights(html, actor) {
        this.applyVehicleWeaponsArmorWeights(html, this.buildContext(actor, { vehicle: true }));
    }

    static addVehicleContainerIndicators(html, actor) {
        this.applyVehicleContainerIndicators(html, this.buildContext(actor, { vehicle: true }));
    }

    static onItemChange(item, changes, options = {}) {
        if (!game.settings.get(MODULE_ID, "enableWeightSystem")) return;
        const actor = item.parent;
        if (!actor || actor.documentName !== "Actor") return;
        const sheet = actor.sheet;
        if (!sheet?.rendered) return;

        const flagChanges = changes ? foundry.utils.getProperty(changes, `flags.${MODULE_ID}`) : null;
        const structural = !!flagChanges && ["containedIn", "-=containedIn", "isContainer", "-=isContainer", "containerData"]
            .some(key => key in flagChanges);
        this.scheduleWeightUpdate(actor, { fullRender: structural && options.render === false });
    }

    static onRenderActorSheet(...args) {
        return this.onInitialRender(...args);
    }

    static onPreCreateItem(item, data, options, userId) {
        const containerId = item.getFlag(MODULE_ID, "containedIn");
        if (!containerId || options?.keepId) return;
        const container = item.parent?.items?.get(containerId);
        if (container && this.isContainer(container) && !this.isContainer(item)) return;
        item.updateSource({ [`flags.${MODULE_ID}.-=containedIn`]: null });
    }

    static async clearContents(actor, containerId) {
        const updates = actor.items
            .filter(i => i.getFlag(MODULE_ID, "containedIn") === containerId)
            .map(i => ({ _id: i.id, [`flags.${MODULE_ID}.-=containedIn`]: null }));
        if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    }

    static async cleanupAfterItemDelete(item, userId) {
        if (userId !== game.user.id) return;
        const actor = item.parent;
        if (!actor || actor.documentName !== "Actor" || !this.isContainer(item)) return;
        try {
            await this.clearContents(actor, item.id);
        } catch (e) {
            console.warn("Weight System: Could not clear contents of deleted container", e);
        }
    }

    static async cleanupAfterItemUpdate(item, changes, userId) {
        if (userId !== game.user.id) return;
        const actor = item.parent;
        if (!actor || actor.documentName !== "Actor") return;
        const flagChanges = foundry.utils.getProperty(changes, `flags.${MODULE_ID}`);
        if (!flagChanges) return;
        try {
            if (flagChanges.isContainer === false || "-=isContainer" in flagChanges) {
                await this.clearContents(actor, item.id);
            }
            if (flagChanges.isContainer === true && item.getFlag(MODULE_ID, "containedIn")) {
                await item.unsetFlag(MODULE_ID, "containedIn");
            }
        } catch (e) {
            console.warn("Weight System: Container cleanup failed", e);
        }
    }

    static async onRenderItemSheet(app, html, data) {
        if (!game.settings.get(MODULE_ID, "enableWeightSystem")) return;

        const item = app.item;
        if (!item || NON_PHYSICAL_TYPES.has(item.type)) return;

        const editable = app.isEditable;
        const dis = editable ? "" : " disabled";
        const weightData = item.getFlag(MODULE_ID, "weight") || { value: 0 };
        const isContainer = this.isContainer(item);
        const containerData = this.getContainerData(item);
        const capacityBonus = num(item.getFlag(MODULE_ID, "capacityBonus")?.value, 0);
        const upgradeData = item.getFlag(MODULE_ID, "upgradeData") || {};

        const currentActiveTab = app._tabs?.[0]?.active || html.find(".sheet-tabs .item.active").data("tab");
        if (currentActiveTab) this.itemActiveTabs.set(item.id, currentActiveTab);

        let fields = `
            <div class="weight-system-fields">
                <div class="ws-field-row">
                    <div class="ws-field">
                        <label><strong>Weight:</strong></label>
                        <input type="number" class="weight-input" value="${esc(num(weightData.value, 0))}" step="0.1" min="0"${dis}>
                        <span>units</span>
                    </div>
                    <div class="ws-field">
                        <input type="checkbox" class="container-checkbox"${isContainer ? " checked" : ""}${dis}>
                        <label>Container</label>
                    </div>
                </div>`;

        if (item.type === "cyberware" || item.type === "itemUpgrade") {
            const label = item.type === "cyberware"
                ? "Capacity Bonus (when installed):"
                : "Cargo Capacity Bonus (when mounted on a vehicle):";
            const hint = item.type === "cyberware" ? "units added to max capacity" : "units added to vehicle cargo capacity";
            fields += `
                <div class="ws-field ws-divider">
                    <label><strong>${label}</strong></label>
                    <input type="number" class="capacity-bonus-input" value="${esc(capacityBonus)}" step="1" min="0"${dis}>
                    <span class="ws-hint">${hint}</span>
                </div>`;
        }

        if (item.type === "itemUpgrade") {
            fields += `
                <div class="upgrade-settings ws-subpanel">
                    <div class="ws-subtitle">Upgrade Weight Behavior:</div>
                    <div class="ws-field">
                        <input type="checkbox" class="weightless-when-attached"${upgradeData.weightlessWhenAttached ? " checked" : ""}${dis}>
                        <label>Weightless when attached</label>
                    </div>
                    <div class="ws-field">
                        <label>Additional adjustment to item:</label>
                        <input type="number" class="additional-weight-input" value="${esc(num(upgradeData.additionalWeight, 0))}" step="0.1"${dis}>
                    </div>
                </div>`;
        }

        if (isContainer) {
            const type = containerData.containerType;
            fields += `
                <div class="container-settings ws-subpanel">
                    <div class="ws-field-row">
                        <div class="ws-field">
                            <label><strong>Container Type:</strong></label>
                            <select class="container-type-select"${dis}>
                                ${Object.entries(CONTAINER_TYPE_LABELS).map(([value, label]) =>
                                    `<option value="${value}"${type === value ? " selected" : ""}>${value === "multi" ? "Multi-Functional (All Types)" : label}</option>`).join("")}
                            </select>
                        </div>
                    </div>`;

            if (type === "multi") {
                fields += `
                    <div class="ws-field weight-reduction-row">
                        <label><strong>Weight Reduction:</strong></label>
                        <input type="number" class="weight-reduction-input" value="${esc(containerData.weightReduction)}" step="0.1" min="0" max="1"${dis}>
                        <span class="ws-hint">(0.0=weightless, 1.0=full weight)</span>
                    </div>`;
            } else {
                fields += `
                    <div class="specialized-info">Specialized Container: Items inside are weightless!</div>`;
            }

            fields += `
                    <div class="ws-field capacity-row">
                        <label><strong>Capacity:</strong></label>
                        <input type="number" class="capacity-input" value="${esc(containerData.capacity)}" step="1" min="0"${dis}>
                        <span>units</span>
                    </div>
                    <div class="ws-icon-section">
                        <div class="ws-field">
                            <label><strong>Container Icon:</strong></label>
                            <div class="container-icon-picker">
                                ${CONTAINER_ICON_OPTIONS.map(icon =>
                                    `<button type="button" class="icon-option${containerData.icon === icon ? " selected" : ""}" data-icon="${icon}"${dis}>${this.renderContainerIcon(icon)}</button>`).join("")}
                            </div>
                        </div>
                        <p class="ws-howto-title">To use this container:</p>
                        <p class="ws-hint">1. Put this container on a character<br>2. Drag items onto it in the Containers section, or right-click an item → "Put in Container"</p>
                        ${type !== "multi" ? `<p class="ws-only-holds">This container only holds: ${esc(CONTAINER_TYPE_LABELS[type].replace(" Container", ""))} items</p>` : ""}
                    </div>
                </div>`;
        }
        fields += "</div>";

        html.find(".weight-system-fields").remove();
        const locations = ['.tab[data-tab="description"]', ".item-properties", ".editor-container", ".sheet-body", ".window-content form", ".window-content", "form"];
        let inserted = false;
        for (const selector of locations) {
            const location = html.find(selector).first();
            if (location.length > 0) {
                location.prepend(fields);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            console.warn("Weight System: Could not find insertion point for item sheet");
            return;
        }

        const savedTab = this.itemActiveTabs.get(item.id);
        if (savedTab) {
            const tabController = app._tabs?.[0];
            if (tabController?.activate) tabController.activate(savedTab);
            else html.find(`.item[data-tab="${savedTab}"] a, a.item[data-tab="${savedTab}"]`).trigger("click");
        }
        html.find(".sheet-tabs .item").on("click", (event) => {
            const tab = $(event.currentTarget).data("tab");
            if (tab) this.itemActiveTabs.set(item.id, tab);
        });

        if (!editable) return;

        const setFlag = (key, value, options = { render: false }) =>
            item.update({ [`flags.${MODULE_ID}.${key}`]: value }, options);
        const updateContainerData = (patch, options) => {
            const current = item.getFlag(MODULE_ID, "containerData") || {};
            return setFlag("containerData", { ...current, ...patch }, options);
        };
        const safely = (fn) => async (event) => {
            try {
                await fn(event);
            } catch (error) {
                console.error("Weight System: Error saving item settings:", error);
            }
        };

        html.find(".weight-input").on("change", safely(async (event) => {
            await setFlag("weight", { value: Math.max(0, num(event.target.value, 0)) });
        }));

        html.find(".capacity-bonus-input").on("change", safely(async (event) => {
            await setFlag("capacityBonus", { value: Math.max(0, num(event.target.value, 0)) });
        }));

        html.find(".container-checkbox").on("change", safely(async (event) => {
            if (event.target.checked) {
                const existing = item.getFlag(MODULE_ID, "containerData");
                const update = { [`flags.${MODULE_ID}.isContainer`]: true };
                if (!existing) {
                    update[`flags.${MODULE_ID}.containerData`] = {
                        containerType: "multi",
                        weightReduction: 1,
                        capacity: 50,
                        allowedTypes: [...CONTAINER_CATEGORIES],
                        icon: "fa:box-open"
                    };
                }
                await item.update(update);
            } else {
                await setFlag("isContainer", false, {});
            }
        }));

        html.find(".container-type-select").on("change", safely(async (event) => {
            const type = event.target.value;
            await updateContainerData({
                containerType: type,
                weightReduction: type === "multi" ? 1 : 0,
                allowedTypes: type === "multi" ? [...CONTAINER_CATEGORIES] : [type],
                icon: this.normalizeIcon(item.getFlag(MODULE_ID, "containerData")?.icon)
            }, {});
        }));

        html.find(".weight-reduction-input").on("change", safely(async (event) => {
            const reduction = Math.min(1, Math.max(0, num(event.target.value, 1)));
            event.target.value = reduction;
            await updateContainerData({ weightReduction: reduction });
        }));

        html.find(".capacity-input").on("change", safely(async (event) => {
            const capacity = Math.max(0, num(event.target.value, 50));
            event.target.value = capacity;
            await updateContainerData({ capacity });
        }));

        html.find(".icon-option").on("click", safely(async (event) => {
            event.preventDefault();
            const icon = this.normalizeIcon(event.currentTarget.dataset.icon);
            await updateContainerData({ icon });
            html.find(".icon-option").removeClass("selected");
            $(event.currentTarget).addClass("selected");
        }));

        html.find(".weightless-when-attached").on("change", safely(async (event) => {
            const current = item.getFlag(MODULE_ID, "upgradeData") || {};
            await setFlag("upgradeData", { ...current, weightlessWhenAttached: event.target.checked });
        }));

        html.find(".additional-weight-input").on("change", safely(async (event) => {
            const current = item.getFlag(MODULE_ID, "upgradeData") || {};
            await setFlag("upgradeData", { ...current, additionalWeight: num(event.target.value, 0) });
        }));
    }

    static extractWeightFlags(source) {
        const flags = foundry.utils.getProperty(source, `flags.${MODULE_ID}`) || {};
        const weight = num(flags.weight?.value, 0);
        const result = {};
        if (weight > 0) result.weight = { value: weight };
        if (flags.isContainer === true && flags.containerData) {
            result.isContainer = true;
            result.containerData = foundry.utils.deepClone(flags.containerData);
        }
        if (flags.upgradeData) result.upgradeData = foundry.utils.deepClone(flags.upgradeData);
        if (num(flags.capacityBonus?.value, 0) > 0) result.capacityBonus = { value: num(flags.capacityBonus.value, 0) };
        return Object.keys(result).length ? result : null;
    }

    static async recalculateWeightsFromDirectory(actor) {
        ui.notifications.info("Syncing weights...");
        const field = `flags.${MODULE_ID}`;

        const byName = new Map();
        let compendiumSources = 0;
        const weightedPacks = game.packs.filter(p => p.metadata.type === "Item" && p.metadata.label.includes("(Weighted)"));
        for (const pack of weightedPacks) {
            const index = await pack.getIndex({ fields: [field] });
            for (const entry of index) {
                const flags = this.extractWeightFlags(entry);
                if (flags) {
                    byName.set(entry.name, { flags, source: "compendium" });
                    compendiumSources++;
                }
            }
        }
        for (const worldItem of game.items) {
            const flags = this.extractWeightFlags(worldItem);
            if (flags) byName.set(worldItem.name, { flags, source: "directory" });
        }

        const matches = [];
        for (const item of actor.items) {
            const match = byName.get(item.name);
            if (match) matches.push({ item, ...match });
        }
        if (matches.length === 0) {
            ui.notifications.warn("No matching items found in weighted compendiums or Items Directory.");
            return;
        }

        const conflicts = matches.filter(({ item, flags }) => {
            const current = this.getBaseWeight(item);
            return current > 0 && flags.weight && current !== flags.weight.value;
        });

        let overwrite = true;
        if (conflicts.length > 0) {
            const choice = await new Promise(resolve => {
                new Dialog({
                    title: "Sync Weights",
                    content: `<p>${conflicts.length} item(s) already have a different weight set:</p>
                        <p class="ws-hint">${conflicts.slice(0, 10).map(c => esc(c.item.name)).join(", ")}${conflicts.length > 10 ? ", ..." : ""}</p>
                        <p>Overwrite them, or only fill in items without a weight?</p>`,
                    buttons: {
                        overwrite: { icon: '<i class="fas fa-rotate"></i>', label: "Overwrite", callback: () => resolve("overwrite") },
                        fill: { icon: '<i class="fas fa-fill-drip"></i>', label: "Only Missing", callback: () => resolve("fill") },
                        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
                    },
                    default: "fill",
                    close: () => resolve(null)
                }).render(true);
            });
            if (!choice) return;
            overwrite = choice === "overwrite";
        }

        const updates = [];
        for (const { item, flags } of matches) {
            const update = { _id: item.id };
            const hasWeight = this.getBaseWeight(item) > 0;
            if (flags.weight && (overwrite || !hasWeight)) update[`flags.${MODULE_ID}.weight`] = flags.weight;
            if (flags.isContainer && (overwrite || !this.isContainer(item))) {
                update[`flags.${MODULE_ID}.isContainer`] = true;
                update[`flags.${MODULE_ID}.containerData`] = flags.containerData;
            }
            if (flags.upgradeData && (overwrite || !item.getFlag(MODULE_ID, "upgradeData"))) {
                update[`flags.${MODULE_ID}.upgradeData`] = flags.upgradeData;
            }
            if (flags.capacityBonus && (overwrite || !item.getFlag(MODULE_ID, "capacityBonus"))) {
                update[`flags.${MODULE_ID}.capacityBonus`] = flags.capacityBonus;
            }
            if (Object.keys(update).length > 1) updates.push(update);
        }

        if (updates.length === 0) {
            ui.notifications.info("All matching items are already up to date.");
            return;
        }
        await actor.updateEmbeddedDocuments("Item", updates);
        ui.notifications.info(`Synced ${updates.length} item(s).`);
        console.log(`Weight System: Sync complete. ${matches.length} matched (${compendiumSources} compendium entries scanned), ${updates.length} updated.`);
    }

    static exportWeightedItems() {
        const data = {};
        for (const item of game.items) {
            const weight = this.getBaseWeight(item);
            if (weight > 0) data[item.name] = weight;
        }
        console.log("=== WEIGHTED ITEMS EXPORT ===");
        console.log(JSON.stringify(data, null, 2));
        return data;
    }

    static async exportCompendiumWeights(packName) {
        const pack = game.packs.get(packName);
        if (!pack) {
            console.error(`Pack "${packName}" not found. Available:`, game.packs.map(p => p.collection));
            return;
        }
        const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.weight`] });
        const data = {};
        for (const entry of index) {
            const weight = num(foundry.utils.getProperty(entry, `flags.${MODULE_ID}.weight.value`), 0);
            if (weight > 0) data[entry.name] = weight;
        }
        console.log(`=== EXPORT: ${packName} (${Object.keys(data).length} items) ===`);
        console.log(JSON.stringify(data, null, 2));
        return data;
    }

    static async loadDefaultWeights() {
        try {
            const resp = await fetch(`modules/${MODULE_ID}/data/default-weights.json`);
            if (!resp.ok) {
                console.error("Weight System: Failed to fetch default-weights.json, status:", resp.status);
                return {};
            }
            return await resp.json();
        } catch (e) {
            console.error("Weight System: Failed to load weights:", e);
            return {};
        }
    }

    static buildWeightMatcher(weights, laxMatching) {
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = laxMatching
            ? Object.keys(weights)
                .sort((a, b) => b.length - a.length)
                .map(key => ({ key, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(key)}(?![\\p{L}\\p{N}])`, "iu") }))
            : [];
        return (itemName) => {
            if (weights[itemName] !== undefined) return weights[itemName];
            for (const { key, re } of patterns) {
                if (re.test(itemName)) {
                    console.log(`Weight System: Lax match "${itemName}" ← "${key}"`);
                    return weights[key];
                }
            }
            return null;
        };
    }

    static findWeightData(itemName, weights, laxMatching) {
        return this.buildWeightMatcher(weights, laxMatching)(itemName);
    }

    static async cloneCompendiumWithWeights(sourcePackName, weights, laxMatching = false) {
        const sourcePack = game.packs.get(sourcePackName);
        if (!sourcePack) {
            ui.notifications.error(`Compendium "${sourcePackName}" not found!`);
            return;
        }

        const meta = sourcePack.metadata;
        const newName = `${meta.name}-weighted`;
        const newLabel = `${meta.label} (Weighted)`;

        const existing = game.packs.get(`world.${newName}`);
        if (existing) {
            const confirm = await Dialog.confirm({
                title: "Overwrite?",
                content: `<p>"${esc(newLabel)}" exists. Delete and recreate?</p>`
            });
            if (!confirm) return;
            await existing.deleteCompendium();
        }

        ui.notifications.info(`Creating "${newLabel}"...`);

        const folderName = "Weighted Compendiums";
        let folder = game.folders.find(f => f.name === folderName && f.type === "Compendium");
        if (!folder) {
            folder = await Folder.create({ name: folderName, type: "Compendium", color: "#7a4988" });
            console.log(`Weight System: Created folder "${folderName}"`);
        }

        const newPack = await CompendiumCollection.createCompendium({
            name: newName,
            label: newLabel,
            type: meta.type,
            system: meta.system
        });
        await newPack.configure({ folder: folder.id });

        const sourceItems = await sourcePack.getDocuments();
        const match = this.buildWeightMatcher(weights, laxMatching);
        let weightedCount = 0;
        let containerCount = 0;
        let upgradeCount = 0;
        let bonusCount = 0;

        const itemsToCreate = sourceItems.map(src => {
            const obj = src.toObject();
            delete obj._id;

            const matchedData = match(src.name);
            if (matchedData === null || matchedData === undefined) return obj;

            obj.flags = obj.flags || {};
            const flags = obj.flags[MODULE_ID] = obj.flags[MODULE_ID] || {};

            if (typeof matchedData === "number") {
                flags.weight = { value: matchedData };
                weightedCount++;
                return obj;
            }
            if (typeof matchedData !== "object") return obj;

            if (matchedData.weight !== undefined) {
                flags.weight = { value: num(matchedData.weight, 0) };
                weightedCount++;
            }

            if (matchedData.container) {
                const config = matchedData.container;
                const containerType = CONTAINER_TYPE_LABELS[config.type] ? config.type : "multi";
                flags.isContainer = true;
                flags.containerData = {
                    containerType,
                    capacity: Math.max(0, num(config.capacity, 50)),
                    weightReduction: containerType === "multi" ? Math.min(1, Math.max(0, num(config.reduction, 1))) : 0,
                    allowedTypes: containerType === "multi" ? [...CONTAINER_CATEGORIES] : [containerType],
                    icon: this.normalizeIcon(config.icon)
                };
                containerCount++;
                console.log(`Weight System: Container "${src.name}" (${containerType}, ${flags.containerData.capacity} capacity)`);
            }

            if (matchedData.upgrade) {
                const config = matchedData.upgrade;
                flags.upgradeData = {
                    weightlessWhenAttached: config.weightlessWhenAttached || false,
                    additionalWeight: num(config.additionalWeight, 0)
                };
                upgradeCount++;
                console.log(`Weight System: Upgrade "${src.name}" (weightless: ${flags.upgradeData.weightlessWhenAttached})`);
            }

            if (num(matchedData.capacityBonus, 0) > 0) {
                flags.capacityBonus = { value: num(matchedData.capacityBonus, 0) };
                bonusCount++;
                console.log(`Weight System: Capacity bonus "${src.name}" (+${flags.capacityBonus.value})`);
            }
            return obj;
        });

        await Item.createDocuments(itemsToCreate, { pack: newPack.collection });

        ui.notifications.info(`Done! ${weightedCount} weighted, ${containerCount} containers, ${upgradeCount} upgrades, ${bonusCount} capacity bonuses.`);
        console.log(`Weight System: Cloned ${sourcePackName} -> ${newPack.collection}`);
    }

    static async openCompendiumClonerDialog() {
        const packs = game.packs.filter(p => p.metadata.type === "Item");
        if (!packs.length) {
            ui.notifications.warn("No item compendiums found!");
            return;
        }

        const options = packs.map(p => `<option value="${esc(p.collection)}">${esc(p.metadata.label)}</option>`).join("");
        const run = async (html, lax) => {
            const pack = html.find('[name="pack"]').val();
            const weights = await WeightSystem.loadDefaultWeights();
            if (!Object.keys(weights).length) {
                ui.notifications.error("No weights in default-weights.json!");
                return;
            }
            await WeightSystem.cloneCompendiumWithWeights(pack, weights, lax);
        };

        new Dialog({
            title: "Clone Compendium with Weights",
            content: `
                <form class="ws-cloner-form">
                    <div class="ws-cloner-row">
                        <label><strong>Select Compendium:</strong></label>
                        <select name="pack">${options}</select>
                    </div>
                    <p class="ws-hint">
                        Creates a copy with weights from:<br>
                        <code>modules/${MODULE_ID}/data/default-weights.json</code>
                    </p>
                </form>`,
            buttons: {
                lax: { icon: '<i class="fas fa-copy"></i>', label: "Lax Clone", callback: (html) => run(html, true) },
                strict: { icon: '<i class="fas fa-copy"></i>', label: "Strict Clone", callback: (html) => run(html, false) }
            },
            default: "strict",
            render: (html) => {
                html.find('button[data-button="lax"]').attr("data-tooltip", 'Whole-word matching: "Viper" will also match "Militech Viper" (longest match wins)');
                html.find('button[data-button="strict"]').attr("data-tooltip", "Exact matching: Only items with identical names receive weights");
            }
        }).render(true);
    }
}

Hooks.once("init", () => {
    WeightSystem.initialize();
});

window.WeightSystem = WeightSystem;
