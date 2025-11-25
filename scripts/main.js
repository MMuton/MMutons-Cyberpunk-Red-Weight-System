// MMuton's Cyberpunk RED Weight System
// Main Module Script
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
    static MODULE_ID = "mmutons-cyberpunk-red-weight-system";
    
    static initialize() {
        console.log("MMuton's Weight System | Initializing...");
        this.registerSettings();
        this.registerHooks();
    }

    static registerSettings() {
        game.settings.register(this.MODULE_ID, "enableWeightSystem", {
            name: "Enable Weight System",
            hint: "Enable weight tracking for player characters",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            requiresReload: true
        });

        game.settings.register(this.MODULE_ID, "capacityCalculation", {
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

        game.settings.register(this.MODULE_ID, "baseWeightMultiplier", {
            name: "Capacity Multiplier (BODY × N)", 
            hint: "Multiply BODY stat by this value (only used if calculation method is BODY × Multiplier)",
            scope: "world",
            config: true,
            type: Number,
            default: 3,
            range: { min: 1, max: 10, step: 0.5 }
        });

        game.settings.register(this.MODULE_ID, "customCapacity", {
            name: "Custom Capacity Value",
            hint: "Fixed carry capacity for all characters (only used if calculation method is Custom Fixed Value)",
            scope: "world",
            config: true,
            type: Number,
            default: 30,
            range: { min: 5, max: 200, step: 5 }
        });

        game.settings.register(this.MODULE_ID, "enableContainers", {
            name: "Enable Container System",
            hint: "Allow items to be containers that reduce weight",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register(this.MODULE_ID, "equippedWeaponWeight", {
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
		
		game.settings.registerMenu(this.MODULE_ID, "compendiumClonerMenu", {
            name: "Clone Compendium with Weights",
            label: "Open Cloner",
            hint: "Create a copy of a compendium with preset item weights applied.",
            icon: "fas fa-copy",
            type: WeightSystemCompendiumCloner,
            restricted: true
        });
    }

    static registerHooks() {
        Hooks.on("ready", this.onReady.bind(this));
        Hooks.on("renderActorSheet", this.onInitialRender.bind(this));
        Hooks.on("renderItemSheet", this.onRenderItemSheet.bind(this));
        Hooks.on("createItem", this.onItemChange.bind(this));
        Hooks.on("updateItem", this.onItemChange.bind(this));
        Hooks.on("deleteItem", this.onItemChange.bind(this));
        Hooks.on("dropActorSheetData", this.onItemChange.bind(this));
    }

    static addItemContextMenus(app, html, data) {
        if (!game.settings.get(this.MODULE_ID, "enableWeightSystem")) return;
        if (app.actor.type !== "character") return;

        // Right-click context menu
        html.find('.item').each((index, element) => {
            const $element = $(element);
            
            $element.off('contextmenu.weight-system').on('contextmenu.weight-system', (event) => {
                event.preventDefault();
                
                const itemId = $element.data('item-id') || $element.data('document-id');
                const item = app.actor.items.get(itemId);
                
                if (!item) return;
                
                const isContained = item.getFlag(this.MODULE_ID, "containedIn");
                const containers = app.actor.items.filter(i => i.getFlag(this.MODULE_ID, "isContainer"));
                
                // Create context menu
                const menuItems = [];
                
                if (!isContained && containers.length > 0) {
                    menuItems.push({
                        icon: '<i class="fas fa-box"></i>',
                        name: "Put in Container",
                        callback: () => this.showContainerDialog(item)
                    });
                }
                
                if (isContained) {
                    menuItems.push({
                        icon: '<i class="fas fa-box-open"></i>',
                        name: "Remove from Container",
                        callback: () => this.removeFromContainer(item)
                    });
                }
                
                if (menuItems.length > 0) {
                    const menuHtml = `
                        <div class="weight-system-context-menu" style="
                            position: fixed; 
                            left: ${event.pageX}px; 
                            top: ${event.pageY}px; 
                            background: white; 
                            border: 1px solid #ccc; 
                            border-radius: 4px;
                            padding: 4px 0;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                            z-index: 10000;
                            min-width: 150px;
                        ">
                            ${menuItems.map(item => 
                                `<div class="menu-item" data-action="${item.name}" style="
                                    padding: 6px 12px; 
                                    cursor: pointer; 
                                    border-bottom: 1px solid #eee;
                                    font-size: 13px;
                                ">
                                    ${item.icon} ${item.name}
                                </div>`
                            ).join('')}
                        </div>
                    `;
                    
                    $('.weight-system-context-menu').remove();
                    $('body').append(menuHtml);
                    
                    // Clicks
                    $('.weight-system-context-menu .menu-item').on('click', function() {
                        const action = $(this).data('action');
                        const menuItem = menuItems.find(i => i.name === action);
                        if (menuItem) menuItem.callback();
                        $('.weight-system-context-menu').remove();
                    });
                    
                    // Hover effects
                    $('.weight-system-context-menu .menu-item').on('mouseenter', function() {
                        $(this).css('background', '#f0f0f0');
                    }).on('mouseleave', function() {
                        $(this).css('background', 'white');
                    });
                    
                    // Remove menu when clicking elsewhere
                    setTimeout(() => {
                        $(document).one('click', () => $('.weight-system-context-menu').remove());
                    }, 100);
                }
            });
        });
    }

    static async showContainerDialog(item) {
        if (!item.parent || item.parent.type !== "character") return;

        const actor = item.parent;
        
        // Map item type to container compatibility
        const itemTypeMap = {
            "weapon": "weapon",
            "armor": "armor", 
            "gear": "gear",
            "ammo": "ammo",
            "cyberware": "cyberware",
            "clothing": "clothing",
            "cyberdeck": "cyberdeck",
            "drug": "drug",
            "upgrade": "upgrade",
            "program": "program"
        };
        
        const mappedItemType = itemTypeMap[item.type] || item.type;
        
        // Find compatible containers
        const compatibleContainers = actor.items.filter(i => {
            if (!i.getFlag(this.MODULE_ID, "isContainer") || i.id === item.id) return false;
            
            const containerData = i.getFlag(this.MODULE_ID, "containerData") || {};
            const allowedTypes = containerData.allowedTypes || [];
            
            return allowedTypes.includes(mappedItemType);
        });

        if (compatibleContainers.length === 0) {
            ui.notifications.warn(`No compatible containers found for ${item.type} items!`);
            return;
        }

        // Create button-based content
        const cancelButton = `
            <button class="container-button cancel-button" style="
                width: 100%; 
                padding: 10px; 
                margin-bottom: 8px; 
                background: #dc3545; 
                color: white; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer;
                font-size: 14px;
            " data-action="cancel">Cancel</button>
        `;
        
        const containerButtons = compatibleContainers.map(container => {
            const containerData = container.getFlag(this.MODULE_ID, "containerData") || {};
            const containerType = containerData.containerType || "multi";
            const containerIcon = containerData.icon || "box-open";
            const typeLabel = this.getContainerTypeLabel(containerType);
            const isWeightless = containerData.weightReduction === 0.0;
            const capacity = containerData.capacity || 50;
            const currentWeight = this.getContainerContentsWeight(container);

            return `
                <button class="container-button" style="
                    width: 100%;
                    padding: 10px;
                    margin-bottom: 4px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    text-align: left;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                " data-container-id="${container.id}">
                    <span style="font-size: 18px; width: 22px; text-align: center;">
                        <i class="fas fa-${containerIcon}"></i>
                    </span>
                    <span style="flex: 1 1 auto;">
                        <div style="font-weight: bold;">${container.name}</div>
                        <div style="font-size: 12px; opacity: 0.9;">
                            ${typeLabel}${isWeightless ? ' - Weightless!' : ''} | ${currentWeight.toFixed(1)}/${capacity} units
                        </div>
                    </span>
                </button>
            `;
        }).join('');

        const dialogContent = `
            <div style="padding: 10px;">
                <h3 style="margin-top: 0;">Select Container for ${item.name}</h3>
                <p style="margin-bottom: 15px; color: #666; font-size: 13px;">Moving <strong>${item.name}</strong> (${item.type}) into container...</p>
                ${cancelButton}
                ${containerButtons}
            </div>
        `;

        const dialog = new Dialog({
            title: "Put Item in Container",
            content: dialogContent,
            buttons: {},
            render: (html) => {
                html.find('.cancel-button').on('click', () => {
                    dialog.close();
                });
                
                html.find('.container-button[data-container-id]').on('click', async (event) => {
                    const containerId = $(event.currentTarget).data('container-id');
                    await this.putItemInContainer(item, containerId);
                    dialog.close();
                });
            }
        });
        
        dialog.render(true);
    }

    static async putItemInContainer(item, containerId) {
        const container = item.parent.items.get(containerId);
        if (!container) {
            ui.notifications.error("Container not found!");
            return;
        }

        const containerData = container.getFlag(this.MODULE_ID, "containerData") || {};
        const itemWeight = this.getItemWeight(item);

        // Check capacity
        const currentContentsWeight = this.getContainerContentsWeight(container);
        if (currentContentsWeight + itemWeight > (containerData.capacity || 50)) {
            ui.notifications.warn(`Container capacity exceeded! (${currentContentsWeight + itemWeight}/${containerData.capacity || 50} kg)`);
            return;
        }

        // Check item type restrictions based on container type
        const containerType = containerData.containerType || "multi";
        const allowedTypes = containerData.allowedTypes || [];
        
        // Convert item type to match container types
        const itemTypeMap = {
            "weapon": "weapon",
            "armor": "armor", 
            "gear": "gear",
            "ammo": "ammo",
            "cyberware": "cyberware",
            "clothing": "clothing",
            "cyberdeck": "cyberdeck",
            "drug": "drug",
            "upgrade": "upgrade",
            "program": "program"
        };
        
        const mappedItemType = itemTypeMap[item.type] || item.type;
        
        if (!allowedTypes.includes(mappedItemType)) {
            const containerTypeLabel = this.getContainerTypeLabel(containerType);
            ui.notifications.warn(`This ${containerTypeLabel} cannot hold ${item.type} items!`);
            return;
        }

        // Put item in container
        await item.setFlag(this.MODULE_ID, "containedIn", containerId);
        
        const containerTypeLabel = this.getContainerTypeLabel(containerType);
        if (containerType !== "multi" && containerData.weightReduction === 0.0) {
            ui.notifications.info(`${item.name} put into ${container.name} (${containerTypeLabel} - weightless!)`);
        } else {
            ui.notifications.info(`${item.name} put into ${container.name}`);
        }

        // Update character sheet display
        const sheet = item.parent.sheet;
        if (sheet && sheet.rendered) {
            setTimeout(() => sheet.render(false), 100);
        }
    }

    static getContainerTypeLabel(containerType) {
        const typeLabels = {
            "multi": "Multi-Functional Container",
            "ammo": "Ammo Container",
            "armor": "Armor Container", 
            "clothing": "Clothing Container",
            "cyberdeck": "Cyberdeck Container",
            "cyberware": "Cyberware Container",
            "drug": "Drug Container",
            "gear": "Gear Container",
            "upgrade": "Upgrade Container",
            "program": "Program Container",
            "weapon": "Weapon Container"
        };
        
        return typeLabels[containerType] || "Container";
    }

    static async recalculateWeightsFromDirectory(actor) {
        let updatedCount = 0;
        let notFoundCount = 0;
        const updatedItems = [];

        ui.notifications.info("Recalculating weights from Items Directory...");

        // Get all items from the actor
        for (const actorItem of actor.items) {
            const currentWeight = actorItem.getFlag(this.MODULE_ID, "weight");
            
            // Find matching item in game.items by exact name match
            const directoryItem = game.items.find(item => item.name === actorItem.name);
            
            if (directoryItem) {
                const directoryWeight = directoryItem.getFlag(this.MODULE_ID, "weight");
                
                if (directoryWeight && directoryWeight.value > 0) {
                    // Copy weight from directory item to actor item
                    await actorItem.setFlag(this.MODULE_ID, "weight", directoryWeight);
                    updatedCount++;
                    updatedItems.push(`${actorItem.name}: ${directoryWeight.value} units`);
                }
            } else {
                notFoundCount++;
            }
        }

        // Show results
        if (updatedCount > 0) {
            ui.notifications.info(`Updated ${updatedCount} item weights from directory.`);
            console.log("Weight System: Updated items:", updatedItems);
            
            // Refresh the actor sheet display
            const sheet = actor.sheet;
            if (sheet && sheet.rendered) {
                setTimeout(() => sheet.render(false), 100);
            }
        } else {
            ui.notifications.warn("No items found in directory with matching names and weights.");
        }

        if (notFoundCount > 0) {
            console.log(`Weight System: ${notFoundCount} items not found in directory.`);
        }
    }

    static async removeFromContainer(item) {
        const containerId = item.getFlag(this.MODULE_ID, "containedIn");
        const container = item.parent?.items.get(containerId);
        
        await item.unsetFlag(this.MODULE_ID, "containedIn");
        ui.notifications.info(`${item.name} removed from ${container?.name || "container"}`);

        // Update character sheet display  
        const sheet = item.parent?.sheet;
        if (sheet && sheet.rendered) {
            setTimeout(() => sheet.render(false), 100);
        }
    }

    static getContainerContentsWeight(container) {
        if (!container.parent) return 0;

        const containedItems = container.parent.items.filter(item => 
            item.getFlag(this.MODULE_ID, "containedIn") === container.id
        );

        return containedItems.reduce((total, item) => total + this.getItemWeight(item), 0);
    }

    static updateTimeouts = new Map();
    static notificationCooldowns = new Map();
    static itemActiveTabs = new Map();

    static onReady() {
        if (!game.settings.get(this.MODULE_ID, "enableWeightSystem")) return;
        console.log("MMuton's Weight System | Ready and enabled");
    }

    static async onInitialRender(app, html, data) {
        if (!game.settings.get(this.MODULE_ID, "enableWeightSystem")) return;
        if (app.actor.type !== "character") return;
        
        // Set up the weight display and context menus on initial render
        await this.addWeightDisplay(app, html, data);
        this.addItemContextMenus(app, html, data);
    }

    static scheduleWeightUpdate(actor) {
        // Debounce rapid updates
        const existing = this.updateTimeouts.get(actor.id);
        if (existing) clearTimeout(existing);
        
        this.updateTimeouts.set(actor.id, setTimeout(async () => {
            const sheet = actor.sheet;
            if (sheet && sheet.rendered) {
                await this.updateWeightDisplayOnly(actor, sheet.element);
            }
            this.updateTimeouts.delete(actor.id);
        }, 50));
    }

    static async updateWeightDisplayOnly(actor, html) {
        const weightData = await this.calculateActorWeight(actor);
        const containerInfo = this.getContainerInfo(actor);
        
        const existingDisplay = html.find('.weight-system-container');
        if (existingDisplay.length > 0) {
            const capacityText = existingDisplay.find('span').last();
            capacityText.text(`${weightData.current}/${weightData.max} units`);
            capacityText.css('color', weightData.status === 'overweight' ? 'red' : 'inherit');
            
            const progressBar = existingDisplay.find('.weight-fill');
            const barColor = this.getWeightBarColor(weightData.percentage);
            progressBar.css({
                'width': `${Math.min(weightData.percentage, 100)}%`,
                'background': barColor
            });
            
            // Overweight warning with cooldown
            const warningDiv = existingDisplay.find('div:contains("OVERWEIGHT!")');
            if (weightData.status === 'overweight' && warningDiv.length === 0) {
                existingDisplay.find('.weight-display').append('<div style="color: red; font-size: 12px; font-weight: bold;">⚠️ OVERWEIGHT!</div>');
                
                if (!this.isNotificationOnCooldown(actor.id)) {
                    ui.notifications.warn(`${actor.name} is carrying too much weight! (${weightData.current}/${weightData.max} units)`);
                    this.setNotificationCooldown(actor.id);
                }
            } else if (weightData.status !== 'overweight' && warningDiv.length > 0) {
                warningDiv.remove();
                this.clearNotificationCooldown(actor.id);
            }
            
            this.addInlineWeights(html, actor);
            this.addItemContainerIndicators(html, actor);
        }
    }

    static getWeightBarColor(percentage) {
        if (percentage >= 69) return '#de453b'; // Red
        if (percentage >= 39) return '#fbcc76'; // Yellow
        return '#52606d'; // Gray
    }

    static isNotificationOnCooldown(actorId) {
        const cooldownTime = this.notificationCooldowns.get(actorId);
        if (!cooldownTime) return false;
        
        const now = Date.now();
        const cooldownDuration = 30000; // 30 seconds
        return (now - cooldownTime) < cooldownDuration;
    }

    static setNotificationCooldown(actorId) {
        this.notificationCooldowns.set(actorId, Date.now());
    }

    static clearNotificationCooldown(actorId) {
        this.notificationCooldowns.delete(actorId);
    }

    static async addWeightDisplay(app, html, data) {
        const actor = app.actor;
        const weightData = await this.calculateActorWeight(actor);
        
        html.find('.weight-system-container').remove();
        
        const containerInfo = this.getContainerInfo(actor);
        
        // Weight bar color based on percentage
        let barColor = '#52606d'; 
        if (weightData.percentage >= 39 && weightData.percentage < 69) {
            barColor = '#fbcc76'; 
        } else if (weightData.percentage >= 69) {
            barColor = '#de453b'; 
        }
        
        const weightHtml = `
            <div class="weight-system-container" style="margin: 8px 0; clear: both;">
                <div class="weight-display ${weightData.status}" style="
                    padding: 6px; 
                    border-radius: 4px; 
                    background: ${weightData.status === 'overweight' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
                    border-left: none !important;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span><strong>Capacity:</strong></span>
                        <span style="color: ${weightData.status === 'overweight' ? 'red' : 'inherit'}; font-weight: bold;">
                            ${weightData.current}/${weightData.max} units
                        </span>
                    </div>
                    <div class="weight-bar" style="
                        height: 8px; 
                        background: rgba(0, 0, 0, 0.2); 
                        border-radius: 4px; 
                        overflow: hidden; 
                        margin: 4px 0;
                    ">
                        <div class="weight-fill" style="
                            height: 100%; 
                            width: ${Math.min(weightData.percentage, 100)}%;
                            background: ${barColor};
                            transition: all 0.3s ease;
                        "></div>
                    </div>
                    ${weightData.status === 'overweight' ? 
                        '<div style="color: red; font-size: 12px; font-weight: bold;">⚠️ OVERWEIGHT!</div>' : ''}
                    ${/* containerInfo.length > 0 ? 
                        '<div style="font-size: 11px; color: #666; margin-top: 4px;">📦 ' + containerInfo.length + ' containers reducing weight</div>' : '' */ ''}
                </div>
            </div>
        `;
        
        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length > 0) {
            gearTab.prepend(weightHtml);
            
            this.addInlineWeights(html, actor);
            this.addItemContainerIndicators(html, actor);
            
            html.find('.weight-recalculate-btn').on('click', () => {
                this.recalculateWeightsFromDirectory(actor);
            });
            
            if (weightData.status === 'overweight' && !html.find('.weight-system-container').data('warning-shown')) {
                html.find('.weight-system-container').data('warning-shown', true);
                
                if (!this.isNotificationOnCooldown(actor.id)) {
                    ui.notifications.warn(`${actor.name} is carrying too much weight! (${weightData.current}/${weightData.max} units)`);
                    this.setNotificationCooldown(actor.id);
                }
            }
        }
    }

    static addInlineWeights(html, actor) {
        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length === 0) return;
        
        gearTab.find('.item-detail.gear-data.text-nowrap').each(function() {
            const $this = $(this);
            const text = $this.text();
            const cleanedText = text.replace(/^[\d.]+u\s+/, '');
            if (cleanedText !== text) {
                $this.text(cleanedText);
            }
        });
        
        // Add weight display to items that have weight >0
        const items = actor.items;
        items.forEach(item => {
            const itemRow = gearTab.find(`[data-item-id="${item.id}"]`).closest('.item');
            
            if (itemRow.length > 0) {
                const weightData = item.getFlag(this.MODULE_ID, "weight") || { value: 0 };
                const itemWeight = weightData.value || 0;
                
                if (itemWeight > 0) {
                    const quantity = item.system.amount ?? 1;
                    const totalWeight = itemWeight * quantity;
                    
                    const formatWeight = (weight) => {
                        const rounded = weight.toFixed(1);
                        return rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded;
                    };
                    
                    let weightDisplay = quantity > 1 ? 
                        `${formatWeight(totalWeight)}u` : 
                        `${formatWeight(totalWeight)}u`;
                    
                    const dataElement = itemRow.find('.item-detail.gear-data.text-nowrap').first();
                    if (dataElement.length > 0) {
                        const existingText = dataElement.text();
                        if (!existingText.includes(`${weightDisplay} -`)) {
                            const styledWeight = `<span style="color: white; font-size: 12px; font-weight: bold; padding: 1px 3px; background: rgba(0,0,0,0.3); border-radius: 2px;">${weightDisplay}</span> `;
                            const newHtml = styledWeight + existingText;
                            dataElement.html(newHtml);
                        }
                    }
                }
            }
        });
    }

    static addItemContainerIndicators(html, actor) {
        const gearTab = html.find('.tab[data-tab="gear"]');
        if (gearTab.length === 0) return;
        
        gearTab.find('[data-weight-system-indicator]').remove();
        gearTab.find('.item').css('margin-left', '');
        gearTab.find('.item .item-name').css({'padding-left': '', 'position': ''});
        
        const items = actor.items;
        
        items.forEach(item => {
            const isContainer = item.getFlag(this.MODULE_ID, "isContainer");
            const containedIn = item.getFlag(this.MODULE_ID, "containedIn");

            const itemElement = gearTab.find(`.item[data-item-id="${item.id}"]`).first();
            
            if (isContainer && itemElement.length > 0) {
                const containerData = item.getFlag(this.MODULE_ID, "containerData") || {};
                const containerType = containerData.containerType || "multi";
                const containerContents = items.filter(i => i.getFlag(this.MODULE_ID, "containedIn") === item.id);
                const contentCount = containerContents.length;
                const containerIcon = containerData.icon || "box-open";
                
                // Calculate container fullness for progress bar
                const capacity = containerData.capacity || 50;
                const contentsWeight = this.getContainerContentsWeight(item);
                const percentage = Math.min((contentsWeight / capacity) * 100, 100);
                
                let barColor = '#52606d';
                if (percentage >= 39 && percentage < 69) {
                    barColor = '#fbcc76';
                } else if (percentage >= 69) {
                    barColor = '#de453b';
                }
                
                const typeLabel = this.getContainerTypeLabel(containerType);
                const isWeightless = containerData.weightReduction === 0.0;
                const shortLabels = {
                    "multi": "MULT",
                    "ammo": "AMMO",
                    "armor": "ARMR",
                    "clothing": "CLTH",
                    "cyberdeck": "CYBD",
                    "cyberware": "CYBW",
                    "drug": "DRUG",
                    "gear": "GEAR",
                    "upgrade": "UPGD",
                    "program": "PRGM",
                    "weapon": "WEAP"
                };

                const shortLabel = shortLabels[containerType] || "CONT";
                
                // List of contained items for tooltip
                const itemNames = containerContents.map(i => i.name).join(', ');
                const contentsText = contentCount > 0 ? `\nContains: ${itemNames}` : '\nEmpty';
                
                itemElement.find('.item-name [data-weight-system-indicator]').remove();

                const progressBar = `<div data-weight-system-indicator="true" style="display: inline-block; margin-left: 6px; vertical-align: middle;">
                    <span style="color: #999; font-size: 10px; margin-right: 4px;">
                        <i class="fas fa-${containerIcon}" style="margin-right: 4px;"></i>${shortLabel}:
                    </span>
                    <div style="display: inline-block; width: 150px !important; height: 8px !important; background: rgba(0,0,0,0.2); border-radius: 3px; overflow: hidden; vertical-align: middle;" title="${typeLabel}: ${contentsWeight.toFixed(1)}/${capacity} units (${contentCount} items)${isWeightless ? ' - Weightless!' : ''}${contentsText}">
                        <div style="height: 100%; width: ${percentage}%; background: ${barColor}; transition: all 0.3s ease;"></div>
                    </div>
                </div>`;

                itemElement.find('.item-name').append(progressBar);
            }

            if (containedIn && itemElement.length > 0) {
                const container = items.get(containedIn);
                const containerData = container?.getFlag(this.MODULE_ID, "containerData") || {};
                const isWeightless = containerData.weightReduction === 0.0;
                const containerIcon = containerData.icon || "box-open";
                const nameCell = itemElement.find('.item-name');

                nameCell.find('[data-weight-system-indicator]').remove();

                const indicator = `<span data-weight-system-indicator="true" style="position: absolute; left: 2px; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; gap: 4px; color: #999; font-size: 11px; line-height: 1;" title="In container: ${container?.name}${isWeightless ? ' (Weightless)' : ''}">` +
                    `<span aria-hidden="true">↳</span>` +
                    `<i class="fas fa-${containerIcon}"></i>` +
                `</span>`;

                nameCell.css({ position: 'relative', 'padding-left': '30px' });
                nameCell.prepend(indicator);
            }
        });
    }

    static getContainerInfo(actor) {
        const containers = actor.items.filter(item => item.getFlag(this.MODULE_ID, "isContainer"));
        return containers.map(container => {
            const contents = actor.items.filter(item => 
                item.getFlag(this.MODULE_ID, "containedIn") === container.id
            );
            const contentsWeight = contents.reduce((total, item) => total + this.getItemWeight(item), 0);
            const containerData = container.getFlag(this.MODULE_ID, "containerData") || {};
            const reducedWeight = contentsWeight * (containerData.weightReduction || 1.0);
            
            return {
                name: container.name,
                contents: contents.length,
                originalWeight: contentsWeight,
                reducedWeight: reducedWeight,
                savings: contentsWeight - reducedWeight
            };
        });
    }

    static async calculateActorWeight(actor) {
        const items = actor.items.filter(item => item.type !== "criticalinjury");
        let totalWeight = 0;
        const processedContainers = new Set();

        for (const item of items) {
            const containerId = item.getFlag(this.MODULE_ID, "containedIn");
            if (containerId && processedContainers.has(containerId)) {
                continue;
            }

            if (this.isContainer(item)) {
                totalWeight += await this.calculateContainerWeight(item, actor);
                processedContainers.add(item.id);
            } else if (!containerId) {
                totalWeight += this.getItemWeight(item);
            }
        }

        const maxWeight = this.calculateMaxWeight(actor);
        const percentage = (totalWeight / maxWeight) * 100;
        const status = percentage > 100 ? 'overweight' : 'normal';

        return {
            current: Math.round(totalWeight * 10) / 10,
            max: maxWeight,
            percentage: Math.round(percentage),
            status: status
        };
    }

    static calculateMaxWeight(actor) {
        const calculationMethod = game.settings.get(this.MODULE_ID, "capacityCalculation");
        
        let baseCapacity;
        if (calculationMethod === "custom") {
            baseCapacity = game.settings.get(this.MODULE_ID, "customCapacity");
        } else {
            const body = actor.system.stats?.body?.value ?? 10;
            const multiplier = game.settings.get(this.MODULE_ID, "baseWeightMultiplier");
            baseCapacity = body * multiplier;
        }
        
        const capacityBonus = this.getCapacityBonus(actor);
        
        return baseCapacity + capacityBonus;
    }

    static getCapacityBonus(actor) {
        let bonus = 0;
        
        for (const item of actor.items) {
            if (item.type === "cyberware" && item.system.isInstalled === true) {
                const capacityBonus = item.getFlag(this.MODULE_ID, "capacityBonus");
                if (capacityBonus && capacityBonus.value > 0) {
                    bonus += capacityBonus.value;
                }
            }
        }
        
        return bonus;
    }

    static getItemWeight(item) {
        const weightData = item.getFlag(this.MODULE_ID, "weight");
        if (!weightData) return 0;
        
        let weight = parseFloat(weightData.value) || 0;
        const quantity = item.system.amount ?? 1;
        
        // Exclude installed cyberware/upgrades
        if ((item.type === "cyberware" || item.type === "upgrade") && item.system.isInstalled === true) {
            return 0;
        }
        
        // Exclude equipped clothing from weight
        if (item.type === "clothing" && item.system.equipped === "equipped") {
            return 0;
        }

        // Apply configurable weight reduction
        if ((item.type === "weapon" || item.type === "armor") && item.system.equipped === "equipped") {
            const equippedSetting = game.settings.get(this.MODULE_ID, "equippedWeaponWeight");
            const multiplier = Number(equippedSetting);
            const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
            weight = Math.round((weight * safeMultiplier) * 10) / 10;
        }

        return weight * quantity;
    }

    static isContainer(item) {
        return item.getFlag(this.MODULE_ID, "isContainer") === true;
    }

    static async calculateContainerWeight(container, actor) {
        const containerWeight = this.getItemWeight(container);
        const containerData = container.getFlag(this.MODULE_ID, "containerData") || {};
        const weightReduction = containerData.weightReduction ?? 1.0;

        const containedItems = actor.items.filter(item => 
            item.getFlag(this.MODULE_ID, "containedIn") === container.id
        );

        let contentsWeight = 0;
        for (const item of containedItems) {
            contentsWeight += this.getItemWeight(item);
        }

        return containerWeight + (contentsWeight * weightReduction);
    }

    static async onRenderItemSheet(app, html, data) {
        if (!game.settings.get(this.MODULE_ID, "enableWeightSystem")) return;

        const item = app.item;
        const weightData = item.getFlag(this.MODULE_ID, "weight") || { value: 0 };
            const isContainer = item.getFlag(this.MODULE_ID, "isContainer") || false;
            const containerData = item.getFlag(this.MODULE_ID, "containerData") || {};
            const containerIcon = containerData.icon || "box-open";

        const currentActiveTab = app._tabs?.[0]?.active || html.find('.sheet-tabs .item.active').data('tab');
        if (currentActiveTab) {
            this.itemActiveTabs.set(item.id, currentActiveTab);
        }

            const containerTypes = [
                { value: "multi", label: "Multi-Functional (All Types)", reduction: 1.0 },
            { value: "ammo", label: "Ammo Container", reduction: 0.0 },
            { value: "armor", label: "Armor Container", reduction: 0.0 },
            { value: "clothing", label: "Clothing Container", reduction: 0.0 },
            { value: "cyberdeck", label: "Cyberdeck Container", reduction: 0.0 },
            { value: "cyberware", label: "Cyberware Container", reduction: 0.0 },
            { value: "drug", label: "Drug Container", reduction: 0.0 },
            { value: "gear", label: "Gear Container", reduction: 0.0 },
            { value: "upgrade", label: "Upgrade Container", reduction: 0.0 },
            { value: "program", label: "Program Container", reduction: 0.0 },
            { value: "weapon", label: "Weapon Container", reduction: 0.0 }
        ];

        const capacityBonusData = item.getFlag(this.MODULE_ID, "capacityBonus") || { value: 0 };
        const isCyberware = item.type === "cyberware";

        let weightFieldsHtml =
            '<div class="weight-system-fields" style="border: 1px solid #ccc; padding: 6px; margin: 6px 0; border-radius: 4px;">' +
                '<div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">' +
                    '<div style="display: flex; align-items: center; gap: 5px;">' +
                        '<label><strong>Weight:</strong></label>' +
                        '<input type="number" class="weight-input" value="' + (weightData.value || 0) + '" step="0.1" min="0" style="width: 80px; padding: 2px;">' +
                        '<span>kg</span>' +
                    '</div>' +
                    '<div style="display: flex; align-items: center; gap: 5px;">' +
                        '<input type="checkbox" class="container-checkbox" ' + (isContainer ? 'checked' : '') + '>' +
                        '<label>Container</label>' +
                    '</div>' +
                '</div>' +
                (isCyberware ? 
                    '<div style="display: flex; align-items: center; gap: 5px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #ccc;">' +
                        '<label><strong>Capacity Bonus (when installed):</strong></label>' +
                        '<input type="number" class="capacity-bonus-input" value="' + (capacityBonusData.value || 0) + '" step="1" min="0" style="width: 60px; padding: 2px;">' +
                        '<span style="font-size: 11px; color: #666;">units added to max capacity</span>' +
                    '</div>'
                : '');

            if (isContainer) {
                const currentContainerType = containerData.containerType || "multi";
                const currentTypeData = containerTypes.find(t => t.value === currentContainerType) || containerTypes[0];
                const iconOptions = [
                    { value: "box-open", label: "Box" },
                    { value: "briefcase", label: "Briefcase" },
                    { value: "backpack", label: "Backpack" },
                    { value: "shopping-bag", label: "Bag" },
                    { value: "suitcase-rolling", label: "Suitcase" },
                    { value: "toolbox", label: "Toolbox" },
                    { value: "first-aid", label: "Medkit" },
                    { value: "radiation", label: "Hazard" },
                    { value: "bullseye", label: "Target" },
                    { value: "shield-alt", label: "Shield" }
                ];
            
            weightFieldsHtml += 
                '<div class="container-settings" style="margin-top: 8px; padding: 6px; border: 1px dashed #999; border-radius: 3px; background: rgba(0,0,0,0.05);">' +
                    '<div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: center; margin-bottom: 6px;">' +
                        '<div style="display: flex; align-items: center; gap: 5px;">' +
                            '<label><strong>Container Type:</strong></label>' +
                            '<select class="container-type-select" style="padding: 2px; font-size: 12px;">' +
                                containerTypes.map(type => 
                                    '<option value="' + type.value + '" ' + (currentContainerType === type.value ? 'selected' : '') + '>' + type.label + '</option>'
                                ).join('') +
                            '</select>' +
                        '</div>' +
                    '</div>';
            
            if (currentContainerType === "multi") {
                weightFieldsHtml += 
                    '<div class="weight-reduction-row" style="display: flex; gap: 15px; flex-wrap: wrap; align-items: center; margin-bottom: 6px;">' +
                        '<div style="display: flex; align-items: center; gap: 5px;">' +
                            '<label><strong>Weight Reduction:</strong></label>' +
                            '<input type="number" class="weight-reduction-input" value="' + (containerData.weightReduction || 1.0) + '" step="0.1" min="0" max="1" style="width: 60px; padding: 2px;">' +
                            '<span style="font-size: 10px; color: #666;">(0.0=weightless, 1.0=full weight)</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="capacity-row" style="display: flex; align-items: center; gap: 5px; margin-bottom: 6px;">' +
                        '<label><strong>Capacity:</strong></label>' +
                        '<input type="number" class="capacity-input" value="' + (containerData.capacity || 50) + '" step="1" min="0" style="width: 60px; padding: 2px;">' +
                        '<span>kg</span>' +
                    '</div>';
            } else {
                weightFieldsHtml += 
                    '<div class="specialized-info" style="margin-bottom: 6px; padding: 4px; background: rgba(0,255,0,0.1); border-radius: 3px;">' +
                        '<p style="margin: 0; font-size: 11px; color: #006600; font-weight: bold;">Specialized Container: Items inside are weightless!</p>' +
                    '</div>' +
                    '<div class="capacity-row" style="display: flex; align-items: center; gap: 5px; margin-bottom: 6px;">' +
                        '<label><strong>Capacity:</strong></label>' +
                        '<input type="number" class="capacity-input" value="' + (containerData.capacity || 50) + '" step="1" min="0" style="width: 60px; padding: 2px;">' +
                        '<span>kg</span>' +
                    '</div>';
            }
            
            weightFieldsHtml +=
                    '<div style="border-top: 1px solid #ccc; padding-top: 6px;">' +
                        '<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">' +
                            '<label><strong>Container Icon:</strong></label>' +
                            '<select class="container-icon-select" style="padding: 2px; font-size: 12px;">' +
                                iconOptions.map(icon =>
                                    '<option value="' + icon.value + '" ' + (containerIcon === icon.value ? 'selected' : '') + '>' +
                                        icon.label +
                                    '</option>'
                                ).join('') +
                            '</select>' +
                            '<span class="container-icon-preview" style="font-size: 14px; color: #666;"><i class="fas fa-' + containerIcon + '"></i></span>' +
                        '</div>' +
                        '<p style="margin: 0 0 4px 0; font-size: 12px; font-weight: bold;">To use this container:</p>' +
                        '<p style="margin: 0; font-size: 11px; color: #666;">1. Put this container on a character<br>2. Right-click compatible items → "Put in Container"</p>' +
                        (currentContainerType !== "multi" ?
                            '<p style="margin: 4px 0 0 0; font-size: 10px; color: #006600; font-weight: bold;">This container only holds: ' + currentTypeData.label.replace(' Container', '') + ' items</p>'
                            : '') +
                    '</div>' +
                '</div>';
        }
        
        weightFieldsHtml += '</div>';

        let inserted = false;
        const possibleLocations = ['.item-properties', '.sheet-body', '.window-content', 'form'];

        html.find('.weight-system-fields').remove();

        for (const selector of possibleLocations) {
            const location = html.find(selector).last();
            if (location.length > 0) {
                location.append(weightFieldsHtml);
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
            if (tabController?.activate) {
                tabController.activate(savedTab);
            } else {
                html.find(`.item[data-tab="${savedTab}"] a, a.item[data-tab="${savedTab}"]`).trigger('click');
            }
        }

        const updateFlag = (key, value, options = {}) =>
            item.update({ [`flags.${this.MODULE_ID}.${key}`]: value }, options);

        html.find('.capacity-bonus-input').on('change', async (event) => {
            const newBonus = parseFloat(event.target.value) || 0;
            try {
                await updateFlag("capacityBonus", { value: newBonus }, { render: false });
                console.log(`Weight System: Set capacity bonus to ${newBonus} for ${item.name}`);
            } catch (error) {
                console.error("Weight System: Error setting capacity bonus:", error);
            }
        });


        html.find('.sheet-tabs .item').on('click', (event) => {
            const tab = $(event.currentTarget).data('tab');
            if (tab) this.itemActiveTabs.set(item.id, tab);
        });

        html.find('.container-checkbox').on('change', async (event) => {
            const isChecked = event.target.checked;
            try {
                await updateFlag("isContainer", isChecked, { render: false });
                console.log(`Weight System: Set container to ${isChecked} for ${item.name}`);

                if (isChecked) {
                    await updateFlag("containerData", {
                        containerType: "multi",
                        weightReduction: 1.0,
                        capacity: 50,
                        allowedTypes: ['ammo', 'armor', 'clothing', 'cyberdeck', 'cyberware', 'drug', 'gear', 'upgrade', 'program', 'weapon'],
                        icon: "box-open"
                    }, { render: false });
                    
                    if (html.find('.container-settings').length === 0) {
                        setTimeout(() => app.render(false), 50);
                    }
                } else {
                    html.find('.container-settings').slideUp(200, function() {
                        $(this).remove();
                    });
                }
            } catch (error) {
                console.error("Weight System: Error setting container flag:", error);
            }
        });

        html.find('.container-type-select').on('change', async (event) => {
            const selectedType = event.target.value;
            const typeData = containerTypes.find(t => t.value === selectedType);
            
            if (typeData) {
                const currentData = item.getFlag(this.MODULE_ID, "containerData") || {};
                const newData = {
                    ...currentData,
                    containerType: selectedType,
                    weightReduction: typeData.reduction,
                    allowedTypes: selectedType === "multi" ?
                        ['ammo', 'armor', 'clothing', 'cyberdeck', 'cyberware', 'drug', 'gear', 'upgrade', 'program', 'weapon'] :
                        [selectedType],
                    icon: currentData.icon || "box-open"
                };
                
                await updateFlag("containerData", newData, { render: false });
                console.log(`Weight System: Set container type to ${selectedType} for ${item.name}`);

                const settingsDiv = html.find('.container-settings');
                const weightReductionRow = settingsDiv.find('.weight-reduction-row');
                const specializedInfo = settingsDiv.find('.specialized-info');
                
                if (selectedType === "multi") {
                    if (weightReductionRow.length) {
                        weightReductionRow.show();
                        html.find('.weight-reduction-input').val(newData.weightReduction);
                    } else {
                        settingsDiv.find('.capacity-row').before(
                            '<div class="weight-reduction-row" style="display: flex; gap: 15px; flex-wrap: wrap; align-items: center; margin-bottom: 6px;">' +
                                '<div style="display: flex; align-items: center; gap: 5px;">' +
                                    '<label><strong>Weight Reduction:</strong></label>' +
                                    '<input type="number" class="weight-reduction-input" value="' + (newData.weightReduction || 1.0) + '" step="0.1" min="0" max="1" style="width: 60px; padding: 2px;">' +
                                    '<span style="font-size: 10px; color: #666;">(0.0=weightless, 1.0=full weight)</span>' +
                                '</div>' +
                            '</div>'
                        );
                        html.find('.weight-reduction-input').on('change', async (evt) => {
                            const reduction = Math.max(0, Math.min(1, parseFloat(evt.target.value) || 1.0));
                            const data = item.getFlag(this.MODULE_ID, "containerData") || {};
                            await updateFlag("containerData", { ...data, weightReduction: reduction }, { render: false });
                        });
                    }
                    specializedInfo.hide();
                } else {
                    weightReductionRow.hide();
                    if (specializedInfo.length === 0) {
                        settingsDiv.find('.capacity-row').before(
                            '<div class="specialized-info" style="margin-bottom: 6px; padding: 4px; background: rgba(0,255,0,0.1); border-radius: 3px;">' +
                                '<p style="margin: 0; font-size: 11px; color: #006600; font-weight: bold;">Specialized Container: Items inside are weightless!</p>' +
                            '</div>'
                        );
                    } else {
                        specializedInfo.show();
                    }
                }
            }
        });

        html.find('.weight-reduction-input').on('change', async (event) => {
            const reduction = Math.max(0, Math.min(1, parseFloat(event.target.value) || 1.0));
            const currentData = item.getFlag(this.MODULE_ID, "containerData") || {};
            await updateFlag("containerData", { ...currentData, weightReduction: reduction }, { render: false });
            console.log(`Weight System: Set weight reduction to ${reduction} for ${item.name}`);
        });

        html.find('.capacity-input').on('change', async (event) => {
            const capacity = parseFloat(event.target.value) || 50;
            const currentData = item.getFlag(this.MODULE_ID, "containerData") || {};
            await updateFlag("containerData", { ...currentData, capacity: capacity }, { render: false });
            console.log(`Weight System: Set capacity to ${capacity} for ${item.name}`);
        });

        html.find('.container-icon-select').on('change', async (event) => {
            const selectedIcon = event.target.value;
            const currentData = item.getFlag(this.MODULE_ID, "containerData") || {};
            await updateFlag("containerData", { ...currentData, icon: selectedIcon }, { render: false });
            console.log(`Weight System: Set container icon to ${selectedIcon} for ${item.name}`);
            html.find('.container-icon-preview i').attr('class', 'fas fa-' + selectedIcon);
        });
    }

    static async onItemChange(document, options, userId) {
        if (!game.settings.get(this.MODULE_ID, "enableWeightSystem")) return;
        
        let actor = null;
        
        if (document.documentName === "Item" && document.parent?.documentName === "Actor") {
            actor = document.parent;
        } else if (document.documentName === "Actor") {
            actor = document;
        } else if (options && options.parent && options.parent.documentName === "Actor") {
            actor = options.parent;
        }
        
        if (!actor || actor.type !== "character") return;
        
        const isWeightChange = this.isWeightRelevantChange(document, options);
        if (isWeightChange) {
            this.scheduleWeightUpdate(actor);
        }
    }

    static isWeightRelevantChange(document, options) {
        if (document.documentName === "Item") {
            // Weight flag changes
            const flagChanges = foundry.utils.getProperty(options, "flags.mmutons-cyberpunk-red-weight-system");
            if (flagChanges !== undefined) return true;
            
            // Amount/quantity changes
            const amountChange = foundry.utils.getProperty(options, "system.amount");
            if (amountChange !== undefined) return true;
            
            return true;
        }
        
        return false;
    }

    static exportWeightedItems() {
        const items = game.items.filter(i => {
            const w = i.getFlag(this.MODULE_ID, "weight");
            return w && w.value > 0;
        });
        const data = {};
        items.forEach(i => { data[i.name] = i.getFlag(this.MODULE_ID, "weight").value; });
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
        const items = await pack.getDocuments();
        const data = {};
        items.forEach(i => {
            const w = i.getFlag(this.MODULE_ID, "weight");
            if (w?.value > 0) data[i.name] = w.value;
        });
        console.log(`=== EXPORT: ${packName} (${Object.keys(data).length} items) ===`);
        console.log(JSON.stringify(data, null, 2));
        return data;
    }

    static async loadDefaultWeights() {
        try {
            const resp = await fetch(`modules/mmutons-cyberpunk-red-weight-system/data/default-weights.json`);
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

    static async cloneCompendiumWithWeights(sourcePackName, weights) {
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
                content: `<p>"${newLabel}" exists. Delete and recreate?</p>`
            });
            if (!confirm) return;
            await existing.deleteCompendium();
        }

        ui.notifications.info(`Creating "${newLabel}"...`);

        const newPack = await CompendiumCollection.createCompendium({
            name: newName,
            label: newLabel,
            type: meta.type,
            system: meta.system
        });

        const sourceItems = await sourcePack.getDocuments();
        let weightedCount = 0;

        const itemsToCreate = sourceItems.map(src => {
            const obj = src.toObject();
            delete obj._id;

            if (weights[src.name] !== undefined) {
                obj.flags = obj.flags || {};
                obj.flags[WeightSystem.MODULE_ID] = obj.flags[WeightSystem.MODULE_ID] || {};
                obj.flags[WeightSystem.MODULE_ID].weight = { value: weights[src.name] };
                weightedCount++;
            }
            return obj;
        });

        await Item.createDocuments(itemsToCreate, { pack: newPack.collection });

        ui.notifications.info(`Done! ${weightedCount}/${sourceItems.length} items weighted.`);
        console.log(`Weight System: Cloned ${sourcePackName} -> ${newPack.collection}`);
    }

    static async openCompendiumClonerDialog() {
        const packs = game.packs.filter(p => p.metadata.type === "Item");
        if (!packs.length) {
            ui.notifications.warn("No item compendiums found!");
            return;
        }

        const options = packs.map(p => `<option value="${p.collection}">${p.metadata.label}</option>`).join('');

        new Dialog({
            title: "Clone Compendium with Weights",
            content: `
                <form style="padding: 10px;">
                    <div style="margin-bottom: 10px;">
                        <label><strong>Select Compendium:</strong></label>
                        <select name="pack" style="width: 100%; margin-top: 4px;">${options}</select>
                    </div>
                    <p style="font-size: 11px; color: #666;">
                        Creates a copy with weights from:<br>
                        <code>modules/${this.MODULE_ID}/data/default-weights.json</code>
                    </p>
                </form>
            `,
            buttons: {
                clone: {
                    icon: '<i class="fas fa-copy"></i>',
                    label: "Clone",
                    callback: async (html) => {
                        const pack = html.find('[name="pack"]').val();
                        const weights = await WeightSystem.loadDefaultWeights();
                        if (!Object.keys(weights).length) {
                            ui.notifications.error("No weights in default-weights.json!");
                            return;
                        }
                        await WeightSystem.cloneCompendiumWithWeights(pack, weights);
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
            },
            default: "clone"
        }).render(true);
    }
}

Hooks.once("init", () => {
    WeightSystem.initialize();
});

window.WeightSystem = WeightSystem;