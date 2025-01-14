import {SpriteBase} from "./SpriteBase";
import {Classes} from "./Classes";
import {Djinn, djinn_status} from "./Djinn";
import {Effect, effect_types} from "./Effect";
import {Item, item_types} from "./Item";
import {Player, fighter_types, permanent_status, main_stats, effect_type_stat, extra_main_stats} from "./Player";
import {elements, ordered_elements} from "./utils";
import {ELEM_ATTR_MIN, ELEM_ATTR_MAX} from "./magic_numbers";
import * as _ from "lodash";
import {GameInfo, PartyData} from "./initializers/initialize_info";
import {Ability} from "./Ability";
import {GoldenSun} from "./GoldenSun";
import {djinn_actions} from "./main_menus/MainDjinnMenu";

export type ItemSlot = {
    key_name: string;
    quantity: number;
    index?: number;
    equipped?: boolean;
    broken?: boolean;
    addtional_details?: {[detail_key: string]: string};
};

export enum equip_slots {
    WEAPON = "weapon",
    HEAD = "head",
    CHEST = "chest",
    BODY = "body",
    RING = "ring",
    BOOTS = "boots",
    UNDERWEAR = "underwear",
    CLASS_CHANGER = "class_changer",
}

export const item_equip_slot = {
    [item_types.WEAPONS]: equip_slots.WEAPON,
    [item_types.ARMOR]: equip_slots.BODY,
    [item_types.CHEST_PROTECTOR]: equip_slots.CHEST,
    [item_types.HEAD_PROTECTOR]: equip_slots.HEAD,
    [item_types.LEG_PROTECTOR]: equip_slots.BOOTS,
    [item_types.RING]: equip_slots.RING,
    [item_types.UNDERWEAR]: equip_slots.UNDERWEAR,
    [item_types.CLASS_CHANGER]: equip_slots.CLASS_CHANGER,
};

export const main_extra_stat_map = {
    [main_stats.MAX_HP]: extra_main_stats.MAX_HP,
    [main_stats.MAX_PP]: extra_main_stats.MAX_PP,
    [main_stats.ATTACK]: extra_main_stats.ATTACK,
    [main_stats.DEFENSE]: extra_main_stats.DEFENSE,
    [main_stats.AGILITY]: extra_main_stats.AGILITY,
    [main_stats.LUCK]: extra_main_stats.LUCK,
};

export const main_curve_stat_map = {
    [main_stats.MAX_HP]: "hp_curve",
    [main_stats.MAX_PP]: "pp_curve",
    [main_stats.ATTACK]: "atk_curve",
    [main_stats.DEFENSE]: "def_curve",
    [main_stats.AGILITY]: "agi_curve",
    [main_stats.LUCK]: "luk_curve",
};

export const main_boost_stat_map = {
    [main_stats.MAX_HP]: "hp_boost",
    [main_stats.MAX_PP]: "pp_boost",
    [main_stats.ATTACK]: "atk_boost",
    [main_stats.DEFENSE]: "def_boost",
    [main_stats.AGILITY]: "agi_boost",
    [main_stats.LUCK]: "luk_boost",
};

export class MainChar extends Player {
    private static readonly ELEM_LV_DELTA = 1;
    private static readonly ELEM_POWER_DELTA = 5;
    private static readonly ELEM_RESIST_DELTA = 5;
    public static readonly MAX_ITEMS_PER_CHAR = 30;

    public info: GameInfo;
    public sprite_base: SpriteBase;
    public weapons_sprite_base: SpriteBase;
    public starting_level: number;
    public class_table: any;
    public class: Classes;
    public exp_curve: number[];
    public element_afinity: elements;
    public djinn_by_element: {[element in elements]?: string[]};
    public hp_curve: number[];
    public pp_curve: number[];
    public atk_curve: number[];
    public def_curve: number[];
    public agi_curve: number[];
    public luk_curve: number[];
    public hp_extra: number;
    public pp_extra: number;
    public atk_extra: number;
    public def_extra: number;
    public agi_extra: number;
    public luk_extra: number;
    public items: ItemSlot[];
    public equip_slots: {[slot in equip_slots]: ItemSlot};
    public equipped_abilities: string[];
    public innate_abilities: string[];
    public in_party: boolean;
    public abilities: string[];
    public special_class_type: number;
    public weapon_sprite_shift: number;

    constructor(
        key_name,
        info,
        sprite_base,
        weapons_sprite_base,
        name,
        hp_curve,
        pp_curve,
        atk_curve,
        def_curve,
        agi_curve,
        luk_curve,
        exp_curve,
        starting_level,
        class_table,
        battle_scale,
        base_level,
        base_power,
        base_resist,
        innate_abilities,
        in_party,
        djinni,
        items,
        battle_animations_variations,
        battle_shadow_key,
        status_sprite_shift,
        special_class_type,
        weapon_sprite_shift
    ) {
        super(key_name, name);
        this.info = info;
        this.sprite_base = sprite_base;
        this.weapons_sprite_base = weapons_sprite_base;
        this.starting_level = starting_level;
        this.level = this.starting_level;
        this.special_class_type = special_class_type ?? -1;
        this.class_table = class_table;
        this.battle_scale = battle_scale;
        this.exp_curve = exp_curve;
        this.current_exp = this.exp_curve[this.level - 1];
        this.base_level = _.cloneDeep(base_level);
        this.base_power = _.cloneDeep(base_power);
        this.base_resist = _.cloneDeep(base_resist);
        this.element_afinity = _.maxBy(_.toPairs(this.base_level), pair => pair[1])[0] as elements;
        this.djinn_by_element = {};
        ordered_elements.forEach(element => {
            this.djinn_by_element[element] = [];
        });
        this.init_djinni(djinni);
        this.equip_slots = _.transform(equip_slots, (obj, value) => {
            obj[value] = null;
        });
        this.update_class();
        this.hp_curve = hp_curve;
        this.pp_curve = pp_curve;
        this.atk_curve = atk_curve;
        this.def_curve = def_curve;
        this.agi_curve = agi_curve;
        this.luk_curve = luk_curve;
        this.hp_extra = 0;
        this.pp_extra = 0;
        this.atk_extra = 0;
        this.def_extra = 0;
        this.agi_extra = 0;
        this.luk_extra = 0;
        this.hp_recovery = 0;
        this.pp_recovery = 0;
        this.items = items;
        this.equipped_abilities = [];
        this.innate_abilities = innate_abilities;
        this.init_items();
        this.update_attributes();
        this.update_elemental_attributes();
        this.in_party = in_party;
        this.abilities = [];
        this.update_abilities();
        this.turns = 1;
        this.fighter_type = fighter_types.ALLY;
        this.battle_animations_variations = Object.assign({}, battle_animations_variations);
        this.battle_shadow_key = battle_shadow_key;
        this.status_sprite_shift = status_sprite_shift ?? 0;
        this.weapon_sprite_shift = weapon_sprite_shift ?? 0;
    }

    get djinni() {
        const this_djinni_list = ordered_elements.map(elem => this.djinn_by_element[elem]).flat();
        return this_djinni_list.sort((a, b) => {
            return this.info.djinni_list[a].index - this.info.djinni_list[b].index;
        });
    }

    get granted_class_type() {
        const equiped_class_changer = this.equip_slots[equip_slots.CLASS_CHANGER];
        if (equiped_class_changer) {
            return this.info.items_list[equiped_class_changer.key_name].granted_class_type;
        }
        return -1;
    }

    update_class() {
        this.class = Classes.choose_right_class(
            this.info.classes_list,
            this.class_table,
            this.element_afinity,
            this.current_level,
            this.granted_class_type,
            this.special_class_type
        );
    }

    add_exp(value: number) {
        const return_data = {
            before: {
                level: this.level,
                abilities: this.abilities.slice(),
                stats: [
                    {max_hp: this.max_hp},
                    {max_pp: this.max_pp},
                    {atk: this.atk},
                    {def: this.def},
                    {agi: this.agi},
                    {luk: this.luk},
                ] as {[main_stat in main_stats]?: number}[],
            },
            after: null,
        };
        this.current_exp += value;
        this.level = _.findIndex(this.exp_curve, exp => exp > this.current_exp);
        this.update_all();
        return_data.after = {
            level: this.level,
            abilities: this.abilities.slice(),
            stats: [
                {max_hp: this.max_hp},
                {max_pp: this.max_pp},
                {atk: this.atk},
                {def: this.def},
                {agi: this.agi},
                {luk: this.luk},
            ] as {[main_stat in main_stats]?: number}[],
        };
        return return_data;
    }

    private init_items() {
        this.items.forEach((item_obj, index) => {
            item_obj.index = index;
            if (item_obj.equipped) {
                this.equip_item(index, true);
            }
        });
    }

    add_item(item_key_name: string, quantity: number, equip: boolean) {
        let found = false;
        if (this.info.items_list[item_key_name].type === item_types.GENERAL_ITEM) {
            this.items.forEach(item_obj => {
                if (item_obj.key_name === item_key_name) {
                    found = true;
                    item_obj.quantity += quantity;
                }
            });
        }
        if (found) return;
        this.items.push({
            key_name: item_key_name,
            quantity: quantity,
            equipped: false,
            index: this.items.length,
        });
        if (equip) {
            this.equip_item(this.items.length - 1);
        }
    }

    remove_item(item_obj_to_remove: ItemSlot, quantity: number) {
        let adjust_index = false;
        this.items = this.items.filter((item_obj, index) => {
            if (item_obj_to_remove.key_name === item_obj.key_name) {
                if (item_obj.equipped) {
                    this.unequip_item(index);
                }
                if (item_obj.quantity - quantity >= 1) {
                    item_obj.quantity = item_obj.quantity - quantity;
                    return true;
                }
                adjust_index = true;
                return false;
            }
            if (adjust_index) {
                --item_obj.index;
            }
            return true;
        });
    }

    equip_item(index: number, initialize: boolean = false) {
        const item_obj = this.items[index];
        if (item_obj.equipped && !initialize) return;
        const item = this.info.items_list[item_obj.key_name];

        if (item.type in item_equip_slot && this.equip_slots[item_equip_slot[item.type]] !== null) {
            this.unequip_item(this.equip_slots[item_equip_slot[item.type]].index);
        }
        if (item.type in item_equip_slot) {
            this.equip_slots[item_equip_slot[item.type]] = item_obj;
        }

        item_obj.equipped = true;
        for (let i = 0; i < item.effects.length; ++i) {
            this.add_effect(item.effects[i], item);
        }

        this.update_elemental_attributes();
        if (item.type === item_types.ABILITY_GRANTOR) {
            this.equipped_abilities.push(item.granted_ability);
            this.update_abilities();
        } else if (item.type === item_types.CLASS_CHANGER) {
            this.update_class();
            this.update_abilities();
        }
        this.update_attributes();
    }

    unequip_item(index: number) {
        const item_obj = this.items[index];
        if (!item_obj.equipped) return;
        const item = this.info.items_list[item_obj.key_name];
        if (item.type in item_equip_slot && this.equip_slots[item_equip_slot[item.type]] !== null) {
            this.equip_slots[item_equip_slot[item.type]] = null;
        }
        item_obj.equipped = false;
        this.effects.forEach(effect => {
            if (effect.effect_owner_instance === item) {
                this.remove_effect(effect);
            }
        });

        this.update_elemental_attributes();
        if (item.type === item_types.ABILITY_GRANTOR) {
            this.equipped_abilities = this.equipped_abilities.filter(ability => {
                return ability !== item.granted_ability;
            });
            this.update_abilities();
        } else if (item.type === item_types.CLASS_CHANGER) {
            this.update_class();
            this.update_abilities();
        }
        this.update_attributes();
    }

    private init_djinni(djinni: string[]) {
        for (let i = 0; i < djinni.length; ++i) {
            const djinn = this.info.djinni_list[djinni[i]];
            this.djinn_by_element[djinn.element].push(djinn.key_name);
        }
        this.update_elemental_attributes();
    }

    add_djinn(djinn_key_name: string) {
        const djinn = this.info.djinni_list[djinn_key_name];
        this.djinn_by_element[djinn.element].push(djinn.key_name);
        this.update_all();
    }

    remove_djinn(djinn_key_name: string) {
        const djinn = this.info.djinni_list[djinn_key_name];
        const this_djinni_list = this.djinn_by_element[djinn.element];
        const index = this_djinni_list.indexOf(djinn_key_name);
        if (index !== -1) this_djinni_list.splice(index, 1);
        this.update_all();
    }

    replace_djinn(old_djinn_key_name: string, new_djinn_key_name: string) {
        this.remove_djinn(old_djinn_key_name);
        this.add_djinn(new_djinn_key_name);
    }

    preview_djinn_change(
        stats: main_stats[],
        djinni_key_name: string[],
        djinni_next_status: djinn_status[],
        action?: djinn_actions
    ) {
        const previous_class = this.class;
        const lvls: Player["current_level"] = _.cloneDeep(this.current_level);
        for (let i = 0; i < djinni_key_name.length; ++i) {
            const djinn = this.info.djinni_list[djinni_key_name[i]];
            let lv_shift;
            switch (djinni_next_status[i]) {
                case djinn_status.SET:
                    lv_shift = MainChar.ELEM_LV_DELTA;
                    break;
                case djinn_status.RECOVERY:
                case djinn_status.ANY:
                    lv_shift = 0;
                    break;
                default:
                    lv_shift = -MainChar.ELEM_LV_DELTA;
            }
            lvls[djinn.element] += lv_shift;
        }
        this.class = Classes.choose_right_class(
            this.info.classes_list,
            this.class_table,
            this.element_afinity,
            lvls,
            this.granted_class_type,
            this.special_class_type
        );
        const return_obj = {
            class_name: this.class.name,
            class_key_name: this.class.key_name,
            abilities: null,
        };
        return_obj.abilities = this.innate_abilities.concat(
            this.class.ability_level_pairs
                .filter(pair => {
                    return pair.level <= this.level && !this.innate_abilities.includes(pair.ability);
                })
                .map(pair => pair.ability),
            this.equipped_abilities
        );
        djinni_next_status = djinni_next_status.map(status =>
            status === djinn_status.ANY ? djinn_status.STANDBY : status
        );
        stats.forEach(stat => {
            return_obj[stat] = this.preview_stats_by_djinn(stat, djinni_key_name, djinni_next_status, action);
        });
        this.class = previous_class;
        return return_obj;
    }

    private preview_stats_by_djinn(
        stat: main_stats,
        djinni_key_name: string[],
        djinni_next_status: djinn_status[],
        action: djinn_actions
    ) {
        const preview_obj = {
            djinni_key_name: djinni_key_name,
            djinni_next_status: djinni_next_status,
            action: action,
        };
        return this.set_main_stat(stat, true, preview_obj);
    }

    preview_stats_by_effect(effect_type: effect_types, effect_obj: any, item_key_name: string) {
        const preview_obj = {
            effect_obj: effect_obj,
            item_key_name: item_key_name,
        };
        return this.set_main_stat(effect_type_stat[effect_type], true, preview_obj);
    }

    preview_stat_without_abilities_effect(stat: main_stats) {
        return this.set_main_stat(stat, true, {ignore_ability_effect: true});
    }

    private set_main_stat(
        stat: main_stats,
        preview = false,
        preview_obj: {
            action?: djinn_actions;
            djinni_key_name?: string[];
            item_key_name?: string;
            ignore_ability_effect?: boolean;
            effect_obj?: any;
            djinni_next_status?: djinn_status[];
        } = {}
    ) {
        const boost_key = main_boost_stat_map[stat];
        const curve_key = main_curve_stat_map[stat];
        const extra_key = main_extra_stat_map[stat];
        const previous_value = this[stat];

        //setting stats by current level, current class and extra values
        this[stat] = (this[curve_key][this.level] * this.class[boost_key] + this[extra_key]) | 0;

        const this_djinni = this.djinni;
        if (preview) {
            if (preview_obj.action === djinn_actions.TRADE) {
                const first_index = this_djinni.indexOf(preview_obj.djinni_key_name[0]);
                if (first_index >= 0) {
                    this_djinni[first_index] = preview_obj.djinni_key_name[1];
                } else {
                    this_djinni[this_djinni.indexOf(preview_obj.djinni_key_name[1])] = preview_obj.djinni_key_name[0];
                }
            } else if (preview_obj.action === djinn_actions.GIVE) {
                this_djinni.push(preview_obj.djinni_key_name[0]);
            }
        }
        for (let i = 0; i < this_djinni.length; ++i) {
            const djinn_key_name = this_djinni[i];
            const djinn = this.info.djinni_list[djinn_key_name];
            let status = djinn.status;
            if (preview && preview_obj.djinni_key_name && preview_obj.djinni_key_name.includes(djinn_key_name)) {
                status = preview_obj.djinni_next_status[preview_obj.djinni_key_name.indexOf(djinn_key_name)];
            }
            if (status !== djinn_status.SET) continue;
            this[stat] += djinn[boost_key];
        }
        this.effects.forEach(effect => {
            if (
                preview &&
                effect.effect_owner_instance &&
                preview_obj.item_key_name === effect.effect_owner_instance.key_name
            )
                return;
            if (preview && preview_obj.ignore_ability_effect && effect.effect_owner_instance instanceof Ability) return;
            const effect_type = _.invert(effect_type_stat)[stat];
            if (effect.type === effect_type) {
                effect.apply_effect();
            }
        });
        if (preview) {
            const preview_value = preview_obj.effect_obj
                ? Effect.preview_value_applied(preview_obj.effect_obj, this[stat])
                : this[stat];
            this[stat] = previous_value;
            return preview_value;
        }
        if ([main_stats.MAX_HP, main_stats.MAX_PP].includes(stat)) {
            const current_key = stat === main_stats.MAX_HP ? main_stats.CURRENT_HP : main_stats.CURRENT_PP;
            if (this[current_key] === undefined) {
                this[current_key] = this[stat];
            } else {
                this[current_key] = Math.round((this[current_key] * this[stat]) / previous_value);
            }
        }
    }

    update_attributes() {
        this.set_main_stat(main_stats.MAX_HP);
        this.set_main_stat(main_stats.MAX_PP);
        this.set_main_stat(main_stats.ATTACK);
        this.set_main_stat(main_stats.DEFENSE);
        this.set_main_stat(main_stats.AGILITY);
        this.set_main_stat(main_stats.LUCK);
    }

    add_extra_stat(stat: extra_main_stats, amount: number) {
        this[stat] += amount;
    }

    preview_elemental_stats_without_abilities_effect() {
        return this.update_elemental_attributes(true, true);
    }

    update_elemental_attributes(preview: boolean = false, ignore_ability_effects: boolean = false) {
        const previous_stats = {};
        ordered_elements.forEach(element => {
            if (preview) {
                previous_stats[element] = {
                    power: this.current_power[element],
                    resist: this.current_resist[element],
                    level: this.current_level[element],
                };
            }
            this.current_power[element] = this.base_power[element];
            this.current_resist[element] = this.base_resist[element];
            this.current_level[element] = this.base_level[element];
        });

        for (let i = 0; i < this.djinni.length; ++i) {
            let djinn = this.info.djinni_list[this.djinni[i]];
            if (djinn.status !== djinn_status.SET) continue;
            this.current_power[djinn.element] += MainChar.ELEM_POWER_DELTA;
            this.current_resist[djinn.element] += MainChar.ELEM_RESIST_DELTA;
            this.current_level[djinn.element] += MainChar.ELEM_LV_DELTA;
        }

        this.effects.forEach(effect => {
            if (effect.type === effect_types.POWER || effect.type === effect_types.RESIST) {
                if (ignore_ability_effects && effect.effect_owner_instance instanceof Ability) return;
                effect.apply_effect();
            }
        });

        for (let i = 0; i < ordered_elements.length; ++i) {
            const element = ordered_elements[i];
            this.current_power[element] = _.clamp(this.current_power[element], ELEM_ATTR_MIN, ELEM_ATTR_MAX);
            this.current_resist[element] = _.clamp(this.current_resist[element], ELEM_ATTR_MIN, ELEM_ATTR_MAX);
        }

        if (preview) {
            const elemental_stats = Object.fromEntries(
                ordered_elements.map(element => {
                    const return_data = [
                        element,
                        {
                            power: this.current_power[element],
                            resist: this.current_resist[element],
                            level: this.current_level[element],
                        },
                    ];
                    this.current_power[element] = previous_stats[element].power;
                    this.current_resist[element] = previous_stats[element].resist;
                    this.current_level[element] = previous_stats[element].level;
                    return return_data;
                })
            );
            return elemental_stats;
        } else {
            return null;
        }
    }

    update_abilities() {
        this.abilities = this.innate_abilities.concat(
            this.class.ability_level_pairs
                .filter(pair => {
                    return pair.level <= this.level && !this.innate_abilities.includes(pair.ability);
                })
                .map(pair => pair.ability),
            this.equipped_abilities
        );
    }

    update_all() {
        this.update_elemental_attributes();
        this.update_class();
        this.update_attributes();
        this.update_abilities();
    }

    static get_active_players(party_data: PartyData, max: number) {
        return party_data.members.slice(0, max).filter(char => {
            return !char.has_permanent_status(permanent_status.DOWNED);
        });
    }

    static add_item_to_party(party_data: PartyData, item: Item, quantity: number) {
        for (let i = 0; i < party_data.members.length; ++i) {
            const char = party_data.members[i];
            if (char.items.length < MainChar.MAX_ITEMS_PER_CHAR) {
                char.add_item(item.key_name, quantity, false);
                return true;
            }
        }
        return false;
    }

    static add_djinn_to_party(party_data: PartyData, djinn: Djinn) {
        let this_char = party_data.members[0];
        for (let i = 0; i < party_data.members.length; ++i) {
            if (party_data.members[i].djinni.length < this_char.djinni.length) {
                this_char = party_data.members[i];
                break;
            }
        }
        this_char.add_djinn(djinn.key_name);
        return this_char;
    }

    static add_member_to_party(data: GoldenSun, party_data: PartyData, char_key_name: string) {
        const char = data.info.main_char_list[char_key_name];
        char.in_party = true;
        party_data.members.push(char);
    }

    static remove_member_from_party(data: GoldenSun, party_data: PartyData, char_key_name: string) {
        const char = data.info.main_char_list[char_key_name];
        char.in_party = false;
        party_data.members = party_data.members.filter(member => {
            return member.key_name !== char_key_name;
        });
    }
}
