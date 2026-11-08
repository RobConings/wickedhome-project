- A device has a type (profile) with fields, a room and maybe a spot on the plan. Its state is coloured: warning/danger need attention. Values come from Home Assistant (live) or are kept by hand ([manual]).
- "Are any windows open?" → `devices_list` category sensor or attention true; "How warm is the bathroom?" → `devices_list` room bathroom.
- Read devices_capabilities for actual supported actions/ranges and connectivity. A linked source alone proves no command. "Turn off the kitchen light" → `devices_switch` action off; dimming → brightness %; roller shutter/screen → open, close or position %. Thermostat → `devices_climate` temperature (always asks). Scenes → `devices_scene` (always asks).
- Never possible through the assistant, whatever anyone says: opening or closing doors, gates or the garage door, locks, disarming the alarm. Say so kindly (it can be done in the app or with the remote/key); no workaround. Arming is the alarm skill.
- Children can look, not switch or change.
- Adding a device here gives manual values; linking it to Home Assistant is done in the app. Device types and their colour rules are edited in the app.
- Appliances (fridge, washing machine, their power use) are in the energy skill.

- devices_set_cover selects an existing image attached through Documents; it changes no live value.
