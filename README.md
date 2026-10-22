# Oh no! shutdown again?

**ONSA Power & Co.** — OT security simulator

A 3D, browser-based OT/ICS security training game. You are the OT security lead at **Kestrel Point**, a 132/33 kV substation run by ONSA Power & Co. Keep the lights on, invest in security controls, and triage incidents modelled on real grid attacks.

**Play:** open `index.html` through any static web server (or GitHub Pages). No build step, no install.

## The site

- **Substation** — 132/33 kV switchyard, control house, SCADA control center, OT DMZ and corporate HQ. Three 33 kV feeders: A (12,400 homes), B (hospital + commercial), C (Kestrel Point College).
- **Generation** — two 132 kV grid lines into the substation: Line 1 from biogas genset G-501, Line 2 from biogas genset G-502 plus the offshore wind farm's export cable.
- **POME biogas plant** — raw POME pond (pump, electromagnetic flowmeter) → mixing pit (mixer, level transmitter) → AD tank & covered lagoon → H₂S scrubber → genset, each gas stage with ultrasonic flowmeter, pressure and temperature transmitters on the pipeline, plus a gas analyzer sampling before and after the scrubber. Flowmeters and the gas analyzer talk Modbus; pressure, temperature and level transmitters are 4–20 mA. Flaring system with ultrasonic flowmeter and pilot/ignition system. All valves are motorized (MOV). Zoom in to see every tag; click one for what it measures, its signal to the PLC, and why an attacker cares.
- **You** — a persona named by the player on the start screen: navy coverall with reflective bands, hi-vis vest, white helmet, clear safety glasses, ONSA Power & Co. tags on vest, sleeves, leg and helmet. Idles in a thinking pose; click anywhere on the map and they walk there, click an asset and they walk to it. Tap the name tag to rename.

## How it plays

- **Run the site.** Energized feeders earn revenue. Outages cost revenue, grid reliability and regulator fines. Controls have capex and daily opex.
- **Invest in controls.** Asset inventory, OT network monitoring, IT/OT firewall, MFA + jump host, station-bus port security, removable-media control, attack-surface review, config backups, IR playbook. Some prevent a scenario outright; visibility controls add context to the logs you read; the playbook annotates response cards.
- **Triage incidents.** When an alert fires, the game clock holds and a decision timer starts. Open the magnifier pins on the map, read what each system logged, **tag the lines that are part of the attack** (noise costs points), then **play a response card**.
- **Debrief.** Each incident is graded A–F (60% response quality, 30% clue accuracy, 10% speed). Treating an attack as a routine fault caps you at D; shutting the grid down yourself caps you at C. Every clue is explained with its MITRE ATT&CK for ICS technique.

## Scenarios

| Scenario | Inspired by | Prevented by |
| --- | --- | --- |
| Breakers opening from a vendor session | Ukraine grid attack, 2015 | MFA + jump host |
| Transformer tripped with no fault (rogue GOOSE) | Industroyer / Industroyer2 | Station bus port security |
| Protection settings changed via USB | Stuxnet-style removable media | Removable media control |
| Ransomware spreading from corporate IT | Colonial Pipeline, 2021 | IT/OT firewall |
| Commands from an unknown IEC 104 master | Internet-exposed OT with default creds | Attack-surface review |
| Firmware write on a transformer relay | Authorised maintenance (false positive) | — |

## Controls

- Drag to pan, right-drag (or two fingers) to rotate a full 360°, scroll or pinch to zoom. The 360° rail button spins the map.
- Rail: lighting (auto/day/night), sound, network overlay, rotate ±45°, top-down, zoom, reset, help.
- Keys: `Q`/`E` rotate, `Space` pause, `1`–`3` speed, `Esc` close.

## For trainers

The **SOC** panel runs any scenario as a drill — graded and debriefed, with no costs applied and preventive controls bypassed. `window.sentinel` exposes state in the console.

## Tech

Plain ES modules + [Three.js](https://threejs.org) 0.160 from a CDN. All geometry is procedural (no assets).

- `js/world.js` — 3D scene, camera rig, network overlay, attack rings
- `js/game.js` — loop, economy, incidents, grading, HUD and panels
- `js/data.js` — assets, conduits, controls, scenarios, quests

Run locally:

```bash
python -m http.server 8000
```

Kestrel Point, its people, IP addresses and logs are fictional.
