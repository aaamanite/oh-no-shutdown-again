# Oh no! shutdown again?

**ONSA Power & Co.** — OT security simulator

A 3D, browser-based OT/ICS security training game. You are the OT Security Lead at **PMU Bukit Mutiara**, a 132/33 kV substation run by ONSA Power & Co. Keep the lights on, invest in security controls, and triage incidents modelled on real grid attacks.

**Play:** https://oh-no-shutdown-again.aaamanite.workers.dev — free on Cloudflare, redeployed automatically on every push to `main`. It also runs from any static web server (or GitHub Pages). No build step, no install.

## The site

- **Substation** — 132/33 kV switchyard, control house, SCADA control center, OT DMZ and corporate HQ, with four 33 kV feeders.
- **Generation (all operated by ONSA Power & Co.)** — three 132 kV grid lines into the substation: Line 1 from biogas genset G-501, Line 2 from biogas genset G-502 plus the offshore wind farm, Line 3 from the solar farm.
- **Consumers** — Feeder A homes, Feeder B hospital, Feeder C college, Feeder D Mutiara Avenue Mall (shops, cinema, big wheel).
- **ONSA R&D Centre** — Space-Based Solar Power (SBSP) research: a test satellite captures solar power in orbit and beams it as microwaves to a rectenna field; a ground-station dish tracks it. Researcher Prof. Dr. Hanafiya works on site — click her to hear about SBSP.
- **Biogas plant** — raw POME pond (pump, electromagnetic flowmeter) → mixing pit (mixer, level transmitter) → AD tank & covered lagoon → H₂S scrubber → genset, each gas stage with ultrasonic flowmeter, pressure and temperature transmitters on the pipeline, plus a gas analyzer sampling before and after the scrubber. Flowmeters and the gas analyzer talk Modbus; pressure, temperature and level transmitters are 4–20 mA. Flaring system with ultrasonic flowmeter and pilot/ignition system. All valves are motorized (MOV). Zoom in to see every tag; click one for what it measures, its signal to the PLC, and why an attacker cares.
- **You** — a persona named by the player on the start screen: navy coverall with reflective bands, hi-vis vest, white helmet, clear safety glasses, ONSA Power & Co. tags on vest, sleeves, leg and helmet. Idles in a thinking pose; click anywhere on the map and they walk there, click an asset and they walk to it. Tap the name tag to rename.

## How it plays

- **Run the site.** Energized feeders earn revenue. Outages cost revenue, grid reliability and regulator fines. Controls have capex and daily opex.
- **Deception.** The OT honeypot (decoy RTU-99) sits in the switchyard. Nobody legitimate touches it, so a real attack trips it: you get a high-confidence detection and 30 s more to decide. On a false alarm it stays quiet.
- **Invest in controls.** Asset inventory, OT network monitoring, IT/OT firewall, MFA + jump host, station-bus port security, removable-media control, attack-surface review, config backups, IR playbook. Some prevent a scenario outright; visibility controls add context to the logs you read; the playbook annotates response options.
- **Triage incidents.** When an alert fires, the game clock holds and a decision timer starts. Open the magnifier pins on the map, read what each system logged, **mark each line True Positive (part of the attack) or False Positive (benign)** — right calls earn points, wrong calls cost them, then **respond or remediate**.
- **Debrief.** Each incident is graded A–F (60% response quality, 30% detection accuracy, 10% speed). Treating an attack as a routine fault caps you at D; shutting the grid down yourself caps you at C. Every detection is explained with its MITRE ATT&CK for ICS technique.

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

Plain ES modules + [Three.js](https://threejs.org) 0.160 from a CDN, no build step.

Rendering: physically based materials lit by a physical sky (image-based lighting), ACES tone mapping, 4K sun shadows that follow the camera, ground-truth ambient occlusion and bloom, and a reflective animated sea. Geometry is procedural — galvanised lattice towers with glass insulator strings, transformers with radiator banks, porcelain insulators with sheds, broadleaf trees and oil palms, cars — and surfaces use generated world-scaled textures (asphalt, concrete, gravel, sand, plaster, roof tiles). The grass and water normal textures and the rigged, animated worker model (Xbot) load from the three.js examples on jsDelivr. A **HQ / LQ** rail button switches quality; integrated GPUs and phones start on LQ.

- `js/world.js` — 3D scene, camera rig, network overlay, attack rings
- `js/look.js` — sky, lighting, post-processing, generated textures, water
- `js/props.js` — lattice towers, insulators, trees, palms, cars, rigged workers
- `js/game.js` — loop, economy, incidents, grading, HUD and panels
- `js/data.js` — assets, conduits, controls, scenarios, quests

Run locally:

```bash
python -m http.server 8000
```

Bukit Mutiara, its people, IP addresses and logs are fictional.
