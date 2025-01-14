import * as numbers from "../magic_numbers";
import {event_types, LocationKey} from "../tile_events/TileEvent";
import {get_surroundings, get_opposite_direction, directions, reverse_directions, base_actions} from "../utils";
import {JumpEvent} from "../tile_events/JumpEvent";
import {GoldenSun} from "../GoldenSun";
import {InteractableObjects} from "../InteractableObjects";

const DUST_COUNT = 7;
const DUST_RADIUS = 18;
const PUSH_SHIFT = 16;
const DUST_KEY = "dust";

export function normal_push(game: Phaser.Game, data: GoldenSun, interactable_object: InteractableObjects) {
    if (
        data.hero.trying_to_push &&
        (data.hero.trying_to_push_direction & 1) === 0 &&
        data.hero.trying_to_push_direction === data.hero.current_direction &&
        !data.hero.in_action()
    ) {
        fire_push_movement(game, data, interactable_object);
    }
}

export function target_only_push(
    game: Phaser.Game,
    data: GoldenSun,
    interactable_object: InteractableObjects,
    before_move,
    push_end,
    enable_physics_at_end = true,
    on_push_update = undefined
) {
    fire_push_movement(
        game,
        data,
        interactable_object,
        push_end,
        before_move,
        true,
        enable_physics_at_end,
        on_push_update
    );
}

export function fire_push_movement(
    game: Phaser.Game,
    data: GoldenSun,
    interactable_object: InteractableObjects,
    push_end?,
    before_move?,
    target_only = false,
    enable_physics_at_end = true,
    on_push_update = undefined
) {
    let expected_position;
    if (!target_only) {
        const positive_limit = data.hero.sprite.x + (-interactable_object.sprite.y - interactable_object.sprite.x);
        const negative_limit = -data.hero.sprite.x + (-interactable_object.sprite.y + interactable_object.sprite.x);
        if (-data.hero.sprite.y >= positive_limit && -data.hero.sprite.y >= negative_limit) {
            expected_position = directions.down;
        } else if (-data.hero.sprite.y <= positive_limit && -data.hero.sprite.y >= negative_limit) {
            expected_position = directions.left;
        } else if (-data.hero.sprite.y <= positive_limit && -data.hero.sprite.y <= negative_limit) {
            expected_position = directions.up;
        } else if (-data.hero.sprite.y >= positive_limit && -data.hero.sprite.y <= negative_limit) {
            expected_position = directions.right;
        }
    }
    if (target_only || expected_position === data.hero.trying_to_push_direction) {
        if (!target_only) {
            data.hero.pushing = true;
            data.audio.play_se("actions/push");
            data.hero.force_action(base_actions.PUSH);
            data.hero.play_current_action();
        } else {
            data.audio.play_se("menu/positive_4");
        }
        game.physics.p2.pause();
        let tween_x = 0,
            tween_y = 0;
        let event_shift_x = 0,
            event_shift_y = 0;
        switch (data.hero.trying_to_push_direction) {
            case directions.up:
                event_shift_y = -1;
                tween_y = -PUSH_SHIFT;
                break;
            case directions.down:
                event_shift_y = 1;
                tween_y = PUSH_SHIFT;
                break;
            case directions.left:
                event_shift_x = -1;
                tween_x = -PUSH_SHIFT;
                break;
            case directions.right:
                event_shift_x = 1;
                tween_x = PUSH_SHIFT;
                break;
        }
        shift_events(data, interactable_object, event_shift_x, event_shift_y);
        const sprites = [interactable_object.sprite.body];
        if (!target_only) {
            sprites.push(...[data.hero.shadow, data.hero.sprite.body]);
        }
        const prev_x = interactable_object.current_x;
        const prev_y = interactable_object.current_y;
        interactable_object.set_tile_position({
            x: interactable_object.current_x + event_shift_x,
            y: interactable_object.current_y + event_shift_y,
        });
        const promises = [];
        if (before_move !== undefined) {
            before_move(tween_x, tween_y);
        }
        if (interactable_object.blocking_stair_block) {
            interactable_object.blocking_stair_block.x += tween_x;
            interactable_object.blocking_stair_block.y += tween_y;
        }
        for (let i = 0; i < sprites.length; ++i) {
            const body = sprites[i];
            let dest_x = body.x + tween_x;
            let dest_y = body.y + tween_y;
            if (body === data.hero.shadow || body === data.hero.sprite.body) {
                if (tween_x === 0) {
                    dest_x = data.map.tile_width * (prev_x + event_shift_x + 0.5);
                } else if (tween_y === 0) {
                    dest_y = data.map.tile_height * (prev_y + event_shift_y + 0.5);
                }
            }
            let promise_resolve;
            promises.push(new Promise(resolve => (promise_resolve = resolve)));
            const this_tween = game.add.tween(body).to(
                {
                    x: dest_x,
                    y: dest_y,
                },
                numbers.PUSH_TIME,
                Phaser.Easing.Linear.None,
                true
            );
            if (on_push_update) {
                this_tween.onUpdateCallback(on_push_update);
            }
            this_tween.onComplete.addOnce(() => {
                let drop_found = false;
                if (i === sprites.length - 1) {
                    interactable_object.object_drop_tiles.forEach(drop_tile => {
                        if (
                            drop_tile.x === interactable_object.current_x &&
                            drop_tile.y === interactable_object.current_y
                        ) {
                            drop_found = true;
                            const dest_y_shift_px =
                                (drop_tile.dest_y - interactable_object.current_y) * data.map.tile_height;
                            shift_events(
                                data,
                                interactable_object,
                                0,
                                drop_tile.dest_y - interactable_object.current_y
                            );
                            interactable_object.set_tile_position({y: drop_tile.dest_y});
                            interactable_object.change_collision_layer(data, drop_tile.destination_collision_layer);
                            game.add
                                .tween(interactable_object.sprite.body)
                                .to(
                                    {
                                        y: interactable_object.sprite.body.y + dest_y_shift_px,
                                    },
                                    drop_tile.animation_duration,
                                    Phaser.Easing.Quadratic.In,
                                    true
                                )
                                .onComplete.addOnce(() => {
                                    data.audio.play_se("misc/rock_drop");
                                    if (drop_tile.dust_animation) {
                                        data.hero.force_action(base_actions.IDLE);
                                        data.hero.play(
                                            data.hero.current_action,
                                            reverse_directions[data.hero.current_direction]
                                        );
                                        dust_animation(game, data, interactable_object, promise_resolve);
                                    } else {
                                        promise_resolve();
                                    }
                                });
                            return;
                        }
                    });
                }
                if (!drop_found) {
                    promise_resolve();
                }
            });
        }
        Promise.all(promises).then(() => {
            data.hero.pushing = false;
            if (enable_physics_at_end) {
                game.physics.p2.resume();
            }
            if (push_end !== undefined) {
                push_end();
            }
        });
    }
}

function shift_events(data: GoldenSun, interactable_object: InteractableObjects, event_shift_x, event_shift_y) {
    const object_events = interactable_object.get_events();
    for (let i = 0; i < object_events.length; ++i) {
        const event = object_events[i];
        data.map.events[event.location_key] = data.map.events[event.location_key].filter(e => {
            return e.id !== event.id;
        });
        if (data.map.events[event.location_key].length === 0) {
            delete data.map.events[event.location_key];
        }
        let old_x = event.x;
        let old_y = event.y;
        let new_x = old_x + event_shift_x;
        let new_y = old_y + event_shift_y;
        event.set_position(new_x, new_y);
        if (!(event.location_key in data.map.events)) {
            data.map.events[event.location_key] = [];
        }
        data.map.events[event.location_key].push(event);
        const new_surroundings = get_surroundings(new_x, new_y, false, 2);
        JumpEvent.active_jump_surroundings(
            data,
            new_surroundings,
            event.collision_layer_shift_from_source + interactable_object.base_collision_layer
        );
        const old_surroundings = get_surroundings(old_x, old_y, false, 2);
        for (let j = 0; j < old_surroundings.length; ++j) {
            const old_surrounding = old_surroundings[j];
            const old_key = LocationKey.get_key(old_surrounding.x, old_surrounding.y);
            if (old_key in data.map.events) {
                for (let k = 0; k < data.map.events[old_key].length; ++k) {
                    const old_surr_event = data.map.events[old_key][k];
                    if (old_surr_event.type === event_types.JUMP) {
                        const target_layer =
                            event.collision_layer_shift_from_source + interactable_object.base_collision_layer;
                        if (
                            old_surr_event.activation_collision_layers.includes(target_layer) &&
                            old_surr_event.dynamic === false
                        ) {
                            old_surr_event.deactivate_at(get_opposite_direction(old_surrounding.direction));
                        }
                    }
                }
            }
        }
    }
}

function dust_animation(game: Phaser.Game, data: GoldenSun, interactable_object: InteractableObjects, promise_resolve) {
    const promises = new Array(DUST_COUNT);
    const sprites = new Array(DUST_COUNT);
    const origin_x = (interactable_object.current_x + 0.5) * data.map.tile_width;
    const origin_y = (interactable_object.current_y + 0.5) * data.map.tile_height;
    const dust_sprite_base = data.info.misc_sprite_base_list[DUST_KEY];
    for (let i = 0; i < DUST_COUNT; ++i) {
        const this_angle = ((Math.PI + numbers.degree60) * i) / (DUST_COUNT - 1) - numbers.degree30;
        const x = origin_x + DUST_RADIUS * Math.cos(this_angle);
        const y = origin_y + DUST_RADIUS * Math.sin(this_angle);
        const dust_sprite = data.npc_group.create(origin_x, origin_y, DUST_KEY);
        if (this_angle < 0 || this_angle > Math.PI) {
            data.npc_group.setChildIndex(dust_sprite, data.npc_group.getChildIndex(interactable_object.sprite));
        }
        dust_sprite.anchor.setTo(0.5, 0.5);
        game.add.tween(dust_sprite).to(
            {
                x: x,
                y: y,
            },
            400,
            Phaser.Easing.Linear.None,
            true
        );
        sprites[i] = dust_sprite;
        dust_sprite_base.setAnimation(dust_sprite, DUST_KEY);
        const animation_key = dust_sprite_base.getAnimationKey(DUST_KEY, "spread");
        let resolve_func;
        promises[i] = new Promise(resolve => (resolve_func = resolve));
        dust_sprite.animations.getAnimation(animation_key).onComplete.addOnce(resolve_func);
        dust_sprite.animations.play(animation_key);
    }
    Promise.all(promises).then(() => {
        sprites.forEach(sprite => {
            data.npc_group.remove(sprite, true);
        });
        promise_resolve();
    });
}
