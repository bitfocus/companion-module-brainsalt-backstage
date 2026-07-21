# Brainsalt Backstage

Controls a Brainsalt Backstage media server over its show-control protocol.

Full Backstage documentation: [help.brainsalt.com](https://help.brainsalt.com)

## Setup

In Backstage, open **Settings → Remote Control** and check **Enable Show-Control Protocol**
(then *Apply / Restart Protocol Server*); leave its **Enable Bitfocus Companion** sub-option
on. Enter the same host, TCP port (default **7400**) and — if configured in Backstage — the
auth token in this connection's settings.

Nothing else is required: all show-control entities are discovered automatically, with
live feedback, variables and ready-made presets:

- **Steppers** — play/pause/stop/restart/bang/next, go to step
- **Sequencers** — transport, fade in/out, seek, jump, tempo, fade level
- **Broadcast schedulers** — enable/disable, force entry, clear
- **Calibrators** — align, black level, cancel, restore snapshots
- **Audio outputs & matrix mixers** — volume (global/per channel), mute
- **NDI inputs** — route sources to input slots
- **Node endpoints** — send values into the node graph, read values back

## Custom typed controls (optional)

For show-specific controls, add **CompanionIO** nodes (UI category) to your Backstage
node graph. Each one appears here as a typed control with matching widgets and presets:

| Type | In Companion |
|---|---|
| Bang | trigger button |
| Float / Int | value display + increment/decrement (encoder-friendly, clamped to min/max/step) |
| Bool | toggle button with on/off feedback |
| Enum | next/previous + one button per choice, with active-choice feedback |
| String | text display / set with variables |
| Color | color picker + live color preview |

Remote Control In/Out nodes and labelled datatype nodes (Bang/String/Float/Color/Int)
are also available as plain value endpoints via the generic *Node: Send Value* action.
