# Oh no! shutdown again?

**ONSA Power & Co.** — OT security simulator

A 3D, browser-based OT/ICS security training game. You are the OT Security Lead at **PMU Bukit Mutiara**, a 132/33 kV substation run by ONSA Power & Co. Keep the lights on, invest in security controls, and triage incidents modelled on real grid attacks.

**Play:** https://oh-no-shutdown-again.boringproject.workers.dev — free on Cloudflare, redeployed automatically on every push to `main`. It also runs from any static web server (or GitHub Pages). No build step, no install.

**Self-hosted, crowd-ready:** everything a player needs is served from this site, about 5.5 MB per player. That includes three.js 0.160.0 (`vendor/three/`, copied from the npm package after checking its published SHA-512, MIT licence in `vendor/three/LICENSE`) and the r160 example textures and Xbot model (`assets/three-examples/`). Grass textures are resized to 1024 px and unused animation clips are removed. Only the Google Fonts stylesheet is external.

## The site

- **Substation** — 132/33 kV switchyard, control house, SCADA control center, OT DMZ and corporate HQ, with four 33 kV feeders.
- **Generation (all operated by ONSA Power & Co.)** — three 132 kV grid lines into the substation: Line 1 from biogas genset G-501, Line 2 from the offshore wind turbines WTG-1–4 plus the wind farm genset G-502 at the shore station, Line 3 from the solar farm.
- **Consumers** — Feeder A homes, Feeder B hospital, Feeder C college, Feeder D Mutiara Avenue Mall (shops, cinema, big wheel).
- **ONSA R&D Centre** — Space-Based Solar Power (SBSP) research: a test satellite captures solar power in orbit and beams it as microwaves to a rectenna field; a ground-station dish tracks it. Researcher Prof. Dr. Hanafiya works on site — click her to hear about SBSP.
- **Biogas plant** — raw POME pond (pump, electromagnetic flowmeter) → mixing pit (mixer, level transmitter) → AD tank & covered lagoon → H₂S scrubber → genset, each gas stage with ultrasonic flowmeter, pressure and temperature transmitters on the pipeline, plus a gas analyzer sampling before and after the scrubber. Flowmeters and the gas analyzer talk Modbus; pressure, temperature and level transmitters are 4–20 mA. Flaring system with ultrasonic flowmeter and pilot/ignition system. All valves are motorized (MOV). Zoom in to see every tag; click one for what it measures, its signal to the PLC, and why an attacker cares.
- **Unlocked in chapter 3** — the **Sungai Mutiara hydro station** (21 m gravity dam, reservoir, radial spillway gates, penstocks, a glazed generator hall with three 20 MW units, switchyard) exporting on **132 kV Line 4**, which taps **Mutiara Motor Works** on Feeder E: warehouse, press, body shop with a visible robot welding line, paint shop, final assembly, car lot and a ro-ro jetty with a car carrier. Its 17 control systems (robots, cobots, paint shop DCS, warehouse, MES, OPC UA server, IIoT gateway…) and 15 protocols are tagged in 3D, each with its security concerns, MITRE ATT&CK for ICS techniques and defences.
- **Safety** — every 33 kV feeder ends at a fenced distribution substation outside the area it supplies, so no tower stands among homes, the hospital, college or mall. HV yards are fenced with danger signs, every building carries roof air terminals and lightning masts cover every equipment yard.
- **You** — a persona named by the player on the start screen: navy coverall with reflective bands, hi-vis vest, white helmet, clear safety glasses, ONSA Power & Co. tags on vest, sleeves, leg and helmet. Idles in a thinking pose; click anywhere on the map and they walk there, click an asset and they walk to it. Tap the name tag to rename.

## How it plays

- **Six chapters, three real attacks each.** First shift and hardening the station, then *Line 4: water and wheels* (the hydro station and car factory), *Monsoon season* (storms, rain, lightning, spillway in flood), *First power from space* (the SBSP beam at full power) and *Grid of the Year* — finish it for a certificate, then keep running the grid. Every chapter has **three true-positive attack scenarios** drawn from real ICS incidents, plus false alarms. Each chapter opens with a title card; later chapters show as locked teasers in Missions. Every player starts at chapter 1.
- **Run the site.** Energized feeders earn revenue. Outages cost revenue, grid reliability and regulator fines. Controls have capex and daily opex.
- **Deception.** The OT honeypot (decoy RTU-99) sits in the switchyard. Nobody legitimate touches it, so a real attack trips it: you get a high-confidence detection and 30 s more to decide. On a false alarm it stays quiet.
- **Invest in controls.** Asset inventory, OT network monitoring, IT/OT firewall, MFA + jump host, station-bus port security, removable-media control, attack-surface review, config backups, IR playbook. Some prevent a scenario outright; visibility controls add context to the logs you read; the playbook annotates response options.
- **Triage incidents.** When an alert fires, the game clock holds and a decision timer starts. Open the magnifier pins on the map, read what each system logged, **mark each line True Positive (part of the attack) or False Positive (benign)** — right calls earn points, wrong calls cost them, then **respond or remediate**.
- **Debrief.** Each incident is graded A–F (60% response quality, 30% detection accuracy, 10% speed). Treating an attack as a routine fault caps you at D; shutting the grid down yourself caps you at C. Every detection is explained with its MITRE ATT&CK for ICS technique.

## Scenarios

Every chapter has **three true-positive attacks** plus false alarms (authorised work, weather and process faults). All attacks are fictionalised versions of real incidents; each detection in the game carries its MITRE ATT&CK for ICS technique.

| Ch | Attack scenario | Inspired by | Prevented by |
| --- | --- | --- | --- |
| 1 | Breakers opening from a vendor session | Ukraine grid attack, 2015 | MFA + jump host |
| 1 | Tap changer moved from a phished login | Oldsmar, 2021; Havex/Energetic Bear, 2014 | MFA + jump host |
| 1 | Contractor laptop writing to the biogas PLC | Maroochy Water Breach, 2000 | Port security |
| 2 | Commands from an unknown IEC 104 master | Unitronics PLC attacks, 2023 | Attack-surface review |
| 2 | Protection relay left in test mode | TRITON/TRISIS, 2017 | MFA + jump host |
| 2 | Digester pressure hidden while the flare is shut | German steel mill, 2014 | IT/OT firewall |
| 3 | Ransomware spreading from corporate IT | Colonial Pipeline, 2021 | IT/OT firewall |
| 3 | Press line runs with the light curtain muted | PIPEDREAM/INCONTROLLER, 2022 | MFA + jump host |
| 3 | Dam gate opened from a cellular modem | Bowman Avenue Dam, 2013 | Data diode |
| 4 | Transformer tripped with no fault (rogue GOOSE) | Industroyer / Industroyer2, 2016/2022 | Port security |
| 4 | Gas readings driven negative in the storm | FrostyGoop, 2024 | IT/OT firewall |
| 4 | Wind farm goes blind in the storm | Viasat KA-SAT / AcidRain, 2022 | MFA + jump host |
| 5 | Protection settings changed via USB | Stuxnet, 2010 | USB control |
| 5 | A signed vendor update with a backdoor | Havex/Energetic Bear, 2014; SolarWinds, 2020 | MFA + jump host |
| 5 | Rectenna inverters told to reverse power | CosmicEnergy, 2023 | IT/OT firewall |
| 6 | A dormant admin account on award day | Volt Typhoon, 2023–24 | 24/7 managed OT SOC |
| 6 | Historian and HMI drives wiped | Shamoon, 2012 | — (config backups halve the outage) |
| 6 | A supplier’s ransomware stops the car plant | Toyota/Kojima Industries, 2022 | IT/OT firewall |
| — | Firmware write on a transformer relay | Authorised maintenance (false positive) | — |

## Controls

- Drag to pan, right-drag (or two fingers) to rotate a full 360°, scroll or pinch to zoom. The 360° rail button spins the map.
- Rail: lighting (auto/day/night), sound, network overlay, rotate ±45°, top-down, zoom, reset, help. On phones the settings sit behind the sliders button at the top right.
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
