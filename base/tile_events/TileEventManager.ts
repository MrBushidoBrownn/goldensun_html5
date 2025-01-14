import {GoldenSun} from "../GoldenSun";
import {Map} from "../Map";
import {base_actions, directions} from "../utils";
import {ClimbEvent} from "./ClimbEvent";
import {CollisionEvent} from "./CollisionEvent";
import {EventTriggerEvent} from "./EventTriggerEvent";
import {IceSlideEvent} from "./IceSlideEvent";
import {JumpEvent} from "./JumpEvent";
import {SliderEvent} from "./SliderEvent";
import {SpeedEvent} from "./SpeedEvent";
import {StepEvent} from "./StepEvent";
import {TeleportEvent} from "./TeleportEvent";
import {event_types, TileEvent} from "./TileEvent";

class EventQueue {
    private climb_event: boolean;
    private queue: {
        event: TileEvent;
        fire_function: Function;
    }[];
    constructor() {
        this.climb_event = false;
        this.queue = [];
    }

    get length() {
        return this.queue.length;
    }

    add(event: TileEvent, this_activation_direction: directions, fire_function: Function, fire = false) {
        switch (event.type) {
            case event_types.CLIMB:
                if (
                    event.active &&
                    (event as ClimbEvent).is_set &&
                    event.activation_directions.includes(this_activation_direction)
                ) {
                    this.climb_event = true;
                }
                break;
        }
        if (fire) {
            fire_function();
        } else {
            this.queue.push({
                event: event,
                fire_function: fire_function,
            });
        }
    }

    process_queue() {
        if (this.climb_event) {
            this.queue = this.queue.filter(item => item.event.type !== event_types.JUMP);
        }
        this.queue.forEach(item => item.fire_function());
    }
}

export class TileEventManager {
    private static readonly EVENT_INIT_DELAY = 350;

    private game: Phaser.Game;
    private data: GoldenSun;
    private event_timers: {[event_id: number]: Phaser.TimerEvent};
    public on_event: boolean;
    private _walking_on_pillars_tiles: Set<string>;
    private triggered_events: {[event_id: number]: TileEvent};

    constructor(game, data) {
        this.game = game;
        this.data = data;
        this.event_timers = {};
        this.on_event = false;
        this._walking_on_pillars_tiles = new Set();
        this.triggered_events = {};
    }

    get walking_on_pillars_tiles() {
        return this._walking_on_pillars_tiles;
    }

    set_triggered_event(event: TileEvent) {
        this.triggered_events[event.id] = event;
    }

    unset_triggered_event(event: TileEvent) {
        delete this.triggered_events[event.id];
    }

    event_triggered(event: TileEvent) {
        return event.id in this.triggered_events;
    }

    fire_triggered_events() {
        Object.keys(this.triggered_events).forEach(id => {
            const this_event: TileEvent = this.triggered_events[id];
            if (this_event.type === event_types.SPEED) {
                (this_event as SpeedEvent).unset();
            } else {
                this_event.fire();
            }
        });
    }

    private fire_event(current_event: TileEvent, this_activation_direction: directions) {
        if (current_event.type === event_types.ICE_SLIDE && this.data.hero.ice_sliding_active) {
            current_event.fire();
            return;
        }
        if (this.data.hero.current_direction !== this_activation_direction) return;
        if (current_event.type === event_types.CLIMB && !this.data.hero.idle_climbing) {
            (current_event as ClimbEvent).set_current_activation_direction(this_activation_direction);
            current_event.fire();
        } else if (![event_types.SPEED, event_types.STEP, event_types.COLLISION].includes(current_event.type)) {
            current_event.fire();
        }
    }

    check_tile_events(location_key: TileEvent["location_key"], map: Map) {
        let event_queue: EventQueue;
        for (let i = 0; i < map.events[location_key].length; ++i) {
            const this_event = map.events[location_key][i];
            if (!this_event.activation_collision_layers.includes(map.collision_layer)) continue;
            if (this_event.type === event_types.JUMP) {
                (this_event as JumpEvent).create_collision_bodies_around_jump_events();
            }
            if (!this_event.is_active(this.data.hero.current_direction)) continue;
            if (!event_queue) {
                event_queue = new EventQueue();
            }
            if (this_event.type === event_types.SPEED) {
                if (this.data.hero.extra_speed !== (this_event as SpeedEvent).speed) {
                    event_queue.add(
                        this_event,
                        this.data.hero.current_direction,
                        this_event.fire.bind(this_event),
                        true
                    );
                }
            } else if (
                this_event.type === event_types.ICE_SLIDE ||
                this_event.type === event_types.EVENT_TRIGGER ||
                (this_event.type === event_types.TELEPORT && !(this_event as TeleportEvent).advance_effect)
            ) {
                event_queue.add(
                    this_event,
                    this.data.hero.current_direction,
                    this.fire_event.bind(this, this_event, this.data.hero.current_direction)
                );
            } else if (
                [event_types.STEP, event_types.COLLISION].includes(this_event.type) &&
                !this.event_triggered(this_event)
            ) {
                event_queue.add(
                    this_event,
                    this.data.hero.current_direction,
                    (this_event as StepEvent | CollisionEvent).set.bind(this_event)
                );
            } else {
                const right_direction = this_event.activation_directions.includes(this.data.hero.current_direction);
                if (
                    right_direction &&
                    [base_actions.WALK, base_actions.DASH, base_actions.CLIMB].includes(
                        this.data.hero.current_action as base_actions
                    )
                ) {
                    if (this.event_timers[this_event.id] && !this.event_timers[this_event.id].timer.expired) {
                        continue;
                    }
                    event_queue.add(this_event, this.data.hero.current_direction, () => {
                        this.event_timers[this_event.id] = this.game.time.events.add(
                            TileEventManager.EVENT_INIT_DELAY,
                            this.fire_event.bind(this, this_event, this.data.hero.current_direction)
                        );
                    });
                }
            }
        }
        if (event_queue?.length) {
            event_queue.process_queue();
        }
    }

    get_event_instance(info: any) {
        if (info.type === event_types.CLIMB) {
            return new ClimbEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.change_to_collision_layer
            );
        } else if (info.type === event_types.SPEED) {
            return new SpeedEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.speed
            );
        } else if (info.type === event_types.TELEPORT) {
            return new TeleportEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.target,
                info.x_target,
                info.y_target,
                info.advance_effect,
                info.dest_collision_layer,
                info.destination_direction
            );
        } else if (info.type === event_types.SLIDER) {
            return new SliderEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.x_target,
                info.y_target,
                info.dest_collision_layer,
                info.show_dust
            );
        } else if (info.type === event_types.JUMP) {
            return new JumpEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.is_set
            );
        } else if (info.type === event_types.STEP) {
            return new StepEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.step_direction
            );
        } else if (info.type === event_types.COLLISION) {
            return new CollisionEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.dest_collision_layer
            );
        } else if (info.type === event_types.EVENT_TRIGGER) {
            return new EventTriggerEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.events,
                info.remove_from_field
            );
        } else if (info.type === event_types.ICE_SLIDE) {
            return new IceSlideEvent(
                this.game,
                this.data,
                info.x,
                info.y,
                info.activation_directions,
                info.activation_collision_layers,
                false,
                info.active,
                info.active_storage_key,
                info.affected_by_reveal,
                info.start_sliding_direction
            );
        }
    }
}
