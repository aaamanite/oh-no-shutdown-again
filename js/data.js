// Game content: the site, the security controls you can buy, and the incident scenarios.
// Everything here is fictional; the techniques are real (MITRE ATT&CK for ICS IDs where noted).

export const SITE = {
  game: 'Oh no! shutdown again?',
  utility: 'ONSA Power & Co.',
  station: 'Kestrel Point 132/33 kV',
};

export const ASSETS = {
  internet: {
    name: 'Internet', short: 'Internet', level: 'External', icon: 'globe',
    desc: 'Everything outside your fence: vendors, cloud services, carriers — and attackers scanning for anything that answers.',
    protocols: ['HTTPS', 'SSL VPN', 'Cellular APN'],
  },
  corp: {
    name: 'Corporate HQ', short: 'Corporate IT', level: 'L4–5 · Enterprise IT', icon: 'building',
    desc: 'Email, billing, ERP and file shares for 1,200 staff. The most likely place for an attacker to land first.',
    protocols: ['SMB', 'RDP', 'HTTPS', 'Email'],
  },
  dmz: {
    name: 'OT DMZ · Historian', short: 'OT DMZ', level: 'L3.5 · Industrial DMZ', icon: 'server',
    desc: 'Historian replica, patch server and the vendor remote-access gateway. The only zone that should talk to both IT and OT.',
    protocols: ['OPC UA', 'HTTPS', 'VPN gateway'],
  },
  scc: {
    name: 'SCADA Control Center', short: 'Control Center', level: 'L3 · Operations', icon: 'monitor',
    desc: 'Regional control room: SCADA master, operator consoles and alarm management. Issues switching orders to substations over the WAN.',
    protocols: ['IEC 60870-5-104', 'DNP3', 'ICCP'],
  },
  ctrl: {
    name: 'Substation Control House', short: 'Control House', level: 'L2 · Station control', icon: 'cpu',
    desc: 'Station HMI, RTU/gateway, engineering workstations (EWS) and GPS clock. Commands from here open and close breakers.',
    protocols: ['IEC 61850 MMS', 'DNP3', 'IEC 104', 'Modbus/TCP'],
  },
  yard: {
    name: 'Switchyard', short: 'Switchyard', level: 'L1–0 · Protection & process', icon: 'zap',
    desc: 'Three 132/33 kV transformers, eight circuit breakers and the protection relays (IEDs) that trip them, linked on the IEC 61850 station bus.',
    protocols: ['IEC 61850 GOOSE', 'Sampled Values', 'PTP'],
  },
  townA: {
    name: 'Feeder A · Residential', short: 'Feeder A', level: 'Load · 33 kV', icon: 'home',
    desc: '12,400 homes on 33 kV Feeder A.',
    protocols: [],
  },
  townB: {
    name: 'Feeder B · Hospital', short: 'Feeder B', level: 'Critical load · 33 kV', icon: 'hospital',
    desc: 'St. Brigid Hospital, the water pumping station and 3,100 commercial customers.',
    protocols: [],
  },
  wind: {
    name: 'Offshore wind farm', short: 'Wind farm', level: 'Generation · 33/132 kV', icon: 'wind',
    desc: 'Operated by ONSA Power & Co. Four offshore turbines. The export cable lands at the shore station and feeds grid Line 2 alongside biogas genset G-502. Turbine controllers report to SCADA and take curtailment setpoints from the control center.',
    protocols: ['IEC 61400-25', 'IEC 60870-5-104'],
  },
  solar: {
    name: 'Solar farm', short: 'Solar farm', level: 'Generation · 33/132 kV', icon: 'sun',
    desc: 'Operated by ONSA Power & Co. 132 tilted PV panels in 11 rows, string inverters and a step-up station exporting on grid Line 3. Inverters report over Modbus TCP and take curtailment setpoints from SCADA.',
    protocols: ['Modbus TCP · SunSpec', 'IEC 60870-5-104'],
  },
  rnd: {
    name: 'ONSA R&D Centre', short: 'R&D Centre', level: 'L4 · Research', icon: 'satellite',
    desc: 'ONSA Power & Co. research into Space-Based Solar Power (SBSP): satellites that capture solar power in space and wirelessly deliver 24/7 baseload energy to wherever on Earth. The test satellite overhead beams microwaves down to the rectenna field here, which turns them back into electricity.',
    protocols: ['Satellite TT&C link', 'Microwave power beam (2.45 GHz)', 'HTTPS'],
  },
  townD: {
    name: 'Feeder D · Shopping complex', short: 'Feeder D', level: 'Load · 33 kV', icon: 'bag',
    desc: 'Harbour Point shopping complex: 140 shops, a food court, the cinema and the big wheel. Busiest in the evening.',
    protocols: [],
  },
  townC: {
    name: 'Feeder C · College', short: 'Feeder C', level: 'Load · 33 kV', icon: 'school',
    desc: 'Kestrel Point College: lecture halls, labs, two hostels, a library and the sports ground — 4,800 students and staff on 33 kV Feeder C.',
    protocols: [],
  },
  biogas: {
    name: 'POME biogas plant', short: 'Biogas plant', level: 'Generation · 11/132 kV', icon: 'flame',
    desc: 'Operated by ONSA Power & Co. Palm oil mill effluent (POME) is pumped from the raw pond to the mixing pit, digested in the AD tank and covered lagoon, cleaned of H₂S in the scrubber and burned in the genset. Surplus gas goes to the flare. A PLC in the MCC room reads every transmitter on the pipelines and drives the motorized valves.',
    protocols: ['4–20 mA', 'Modbus RTU', 'Modbus TCP', 'IEC 60870-5-104'],
  },
};

// Biogas plant instruments, in process order. Positions live in world.js (by tag).
export const PROCESS = ['Raw POME pond', 'Mixing pit', 'AD tank & covered lagoon', 'Scrubber', 'Genset', 'Flaring system', 'Control'];
const MOV = 'DO open/close · DI limit switches';
const MB = 'Modbus RTU (RS-485)';
const AI = '4–20 mA analog';
export const INSTRUMENTS = [
  { tag: 'P-101', stage: 'Raw POME pond', name: 'POME feed pump', kind: 'Pump · VFD driven', signal: 'Modbus RTU (VFD)' },
  { tag: 'MOV-101', stage: 'Raw POME pond', name: 'Feed line motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'FIT-101', stage: 'Raw POME pond', name: 'Electromagnetic flowmeter', kind: 'Flow · raw POME (m³/h)', signal: MB },
  { tag: 'M-201', stage: 'Mixing pit', name: 'Mixer', kind: 'Agitator motor', signal: 'MCC starter · run/trip' },
  { tag: 'LIT-201', stage: 'Mixing pit', name: 'Level transmitter', kind: 'Level · radar (m)', signal: AI },
  { tag: 'MOV-201', stage: 'Mixing pit', name: 'Digester feed motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'MOV-301', stage: 'AD tank & covered lagoon', name: 'Tank-to-lagoon motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'FIT-301', stage: 'AD tank & covered lagoon', name: 'Ultrasonic flowmeter', kind: 'Flow · raw biogas (Nm³/h)', signal: MB },
  { tag: 'PIT-301', stage: 'AD tank & covered lagoon', name: 'Pressure transmitter', kind: 'Pressure · gas header (mbar)', signal: AI },
  { tag: 'TIT-301', stage: 'AD tank & covered lagoon', name: 'Temperature transmitter', kind: 'Temperature · gas header (°C)', signal: AI },
  { tag: 'MOV-302', stage: 'Scrubber', name: 'Scrubber inlet motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'AIT-301', stage: 'Scrubber', name: 'Gas analyzer · scrubber inlet', kind: 'CH₄ · CO₂ · H₂S · O₂ — raw biogas', signal: MB },
  { tag: 'AIT-401', stage: 'Scrubber', name: 'Gas analyzer · scrubber outlet', kind: 'CH₄ · CO₂ · H₂S · O₂ — cleaned biogas', signal: MB },
  { tag: 'MOV-401', stage: 'Scrubber', name: 'Scrubber outlet motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'FIT-401', stage: 'Scrubber', name: 'Ultrasonic flowmeter', kind: 'Flow · scrubbed biogas (Nm³/h)', signal: MB },
  { tag: 'PIT-401', stage: 'Scrubber', name: 'Pressure transmitter', kind: 'Pressure · scrubber outlet (mbar)', signal: AI },
  { tag: 'TIT-401', stage: 'Scrubber', name: 'Temperature transmitter', kind: 'Temperature · scrubber outlet (°C)', signal: AI },
  { tag: 'MOV-501', stage: 'Genset', name: 'Genset gas train motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'FIT-501', stage: 'Genset', name: 'Ultrasonic flowmeter', kind: 'Flow · genset fuel gas (Nm³/h)', signal: MB },
  { tag: 'PIT-501', stage: 'Genset', name: 'Pressure transmitter', kind: 'Pressure · genset inlet (mbar)', signal: AI },
  { tag: 'TIT-501', stage: 'Genset', name: 'Temperature transmitter', kind: 'Temperature · genset inlet (°C)', signal: AI },
  { tag: 'G-501', stage: 'Genset', name: 'Biogas genset 1', kind: 'Gas engine-generator · exports on grid Line 1', signal: 'Genset controller · Modbus TCP' },
  { tag: 'MOV-502', stage: 'Genset', name: 'Genset 2 gas train motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'FIT-502', stage: 'Genset', name: 'Ultrasonic flowmeter', kind: 'Flow · genset 2 fuel gas (Nm³/h)', signal: MB },
  { tag: 'PIT-502', stage: 'Genset', name: 'Pressure transmitter', kind: 'Pressure · genset 2 inlet (mbar)', signal: AI },
  { tag: 'TIT-502', stage: 'Genset', name: 'Temperature transmitter', kind: 'Temperature · genset 2 inlet (°C)', signal: AI },
  { tag: 'G-502', stage: 'Genset', name: 'Biogas genset 2', kind: 'Gas engine-generator · exports on grid Line 2', signal: 'Genset controller · Modbus TCP' },
  { tag: 'MOV-601', stage: 'Flaring system', name: 'Flare motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'FIT-601', stage: 'Flaring system', name: 'Ultrasonic flowmeter', kind: 'Flow · flared biogas (Nm³/h)', signal: MB },
  { tag: 'MOV-602', stage: 'Flaring system', name: 'Pilot gas motorized valve', kind: 'Motorized valve', signal: MOV },
  { tag: 'BMS-601', stage: 'Flaring system', name: 'Pilot & ignition panel', kind: 'Pilot burner, igniter, flame detection', signal: 'Hardwired to PLC' },
  { tag: 'PLC-01', stage: 'Control', name: 'Plant PLC / MCC room', kind: 'PLC, motor control centre, Modbus gateway', signal: 'Modbus TCP · IEC 104 to SCADA' },
];

// Why each instrument matters to an attacker.
export function instrumentRisk(i) {
  if (i.tag.startsWith('MOV')) return 'One PLC output opens or closes this valve. Unauthorised commands can starve the genset, back up the digester or send biogas to the flare.';
  if (i.tag.startsWith('AIT')) return 'Inlet vs outlet readings tell operators whether the scrubber is working. Spoof them over Modbus and the genset runs on sour gas (engine damage) or trips for nothing.';
  if (i.tag === 'BMS-601') return 'Lose the pilot while the PLC still believes it is lit and raw methane vents unburned — a safety and emissions event.';
  if (i.tag === 'PLC-01') return 'The crown jewel: every reading and valve in the plant passes through here, and it is reachable from SCADA over IEC 104.';
  if (i.signal === MB) return 'Readings cross a serial gateway on Modbus RTU: no authentication, so any master on the bus can read or write registers.';
  if (i.signal === AI) return 'Analog 4–20 mA loop into a PLC input card — no network on the wire itself. But whoever can change the PLC’s scaling or alarm limits changes what operators see.';
  return 'Started and stopped from the MCC by the PLC. A forced stop or run breaks the process upstream or downstream.';
}

export const FEEDERS = {
  A: { asset: 'townA', share: 0.3, customers: 12400, label: '12,400 homes' },
  B: { asset: 'townB', share: 0.33, customers: 3100, label: 'hospital + 3,100 customers' },
  C: { asset: 'townC', share: 0.15, customers: 4800, label: 'college · 4,800 students' },
  D: { asset: 'townD', share: 0.22, customers: 140, label: 'mall · 140 shops + cinema' },
};

export const PURDUE = [
  { level: 'External', ids: ['internet'] },
  { level: 'L4–5 Enterprise', ids: ['corp', 'rnd'] },
  { level: 'L3.5 OT DMZ', ids: ['dmz'] },
  { level: 'L3 Operations', ids: ['scc'] },
  { level: 'L2 Station control', ids: ['ctrl'] },
  { level: 'L1–0 Protection & process', ids: ['yard', 'biogas', 'wind', 'solar'] },
];

// guard: the control that protects this conduit. exposedUntil: conduit disappears once that control is owned.
export const CONDUITS = [
  { id: 'inet-corp', a: 'internet', b: 'corp', name: 'Internet edge', proto: 'HTTPS, email' },
  { id: 'inet-dmz', a: 'internet', b: 'dmz', name: 'Vendor remote access', proto: 'SSL VPN → RDP', guard: 'mfa' },
  { id: 'corp-dmz', a: 'corp', b: 'dmz', name: 'IT ↔ OT DMZ', proto: 'SMB, HTTPS, OPC UA', guard: 'itotfw' },
  { id: 'dmz-scc', a: 'dmz', b: 'scc', name: 'DMZ ↔ Control Center', proto: 'Historian replication', guard: 'itotfw' },
  { id: 'scc-solar', a: 'scc', b: 'solar', name: 'Solar farm telecontrol', proto: 'Modbus TCP / IEC 104' },
  { id: 'corp-rnd', a: 'corp', b: 'rnd', name: 'R&D lab network', proto: 'HTTPS, satellite ops VPN' },
  { id: 'scc-wind', a: 'scc', b: 'wind', name: 'Wind farm telecontrol', proto: 'IEC 61400-25 / IEC 104' },
  { id: 'scc-bio', a: 'scc', b: 'biogas', name: 'Generator telecontrol', proto: 'IEC 104 output setpoints' },
  { id: 'scc-ctrl', a: 'scc', b: 'ctrl', name: 'SCADA WAN', proto: 'IEC 60870-5-104, DNP3' },
  { id: 'ctrl-yard', a: 'ctrl', b: 'yard', name: 'Station bus', proto: 'IEC 61850 MMS + GOOSE', guard: 'portsec' },
  { id: 'inet-ctrl', a: 'internet', b: 'ctrl', name: 'Forgotten cellular modem', proto: 'IEC 104 on TCP/2404', exposedUntil: 'surface' },
];

export const CONTROLS = [
  {
    id: 'inventory', cat: 'Visibility', name: 'OT asset inventory', short: 'Asset inventory', cost: 40000, opex: 1000,
    desc: 'Passive discovery of every relay, RTU, HMI and switch. You can tell known devices from strangers.',
    effect: 'Clues show "known asset" / "not in inventory" context.', ref: 'IEC 62443-2-1 · NERC CIP-002',
  },
  {
    id: 'ids', cat: 'Visibility', name: 'OT network monitoring', short: 'OT monitoring', cost: 140000, opex: 4000,
    desc: 'Passive deep-packet sensors on SPAN ports that understand IEC 61850, DNP3 and IEC 104.',
    effect: 'Protocol-aware clue context and +60 s to decide on every incident.', ref: 'NERC CIP-015 (INSM)',
  },
  {
    id: 'itotfw', cat: 'Segmentation', name: 'IT/OT firewall & DMZ rules', short: 'IT/OT firewall', cost: 110000, opex: 3000,
    desc: 'Default-deny conduit between enterprise and OT. The "temporary" any-any rule goes away.',
    effect: 'Prevents IT ransomware from crossing into OT.', ref: 'IEC 62443-3-2 zones & conduits',
  },
  {
    id: 'mfa', cat: 'Access', name: 'MFA + jump host for remote access', short: 'MFA + jump host', cost: 75000, opex: 2000,
    desc: 'Vendors land on a recorded jump host with MFA and time-boxed accounts — never straight on the HMI.',
    effect: 'Prevents hijacked vendor sessions.', ref: 'NERC CIP-005 R2',
  },
  {
    id: 'portsec', cat: 'Segmentation', name: 'Station bus port security', short: 'Port security', cost: 60000, opex: 1000,
    desc: '802.1X / MAC locking on substation switches. Unused ports are shut.',
    effect: 'Prevents rogue devices from publishing GOOSE.', ref: 'IEC 62351-6 · IEC 62443-4-2',
  },
  {
    id: 'usb', cat: 'Endpoint', name: 'Removable media control', short: 'USB control', cost: 30000, opex: 500,
    desc: 'Scanning kiosks for every drive; engineering workstations only mount approved, scanned media.',
    effect: 'Prevents USB-borne malware on the EWS.', ref: 'NERC CIP-010 R4',
  },
  {
    id: 'surface', cat: 'Access', name: 'Attack-surface review', short: 'Surface review', cost: 20000, opex: 0,
    desc: 'Hunt for internet-exposed OT. Finds the cellular modem someone bolted onto an RTU years ago.',
    effect: 'Removes the internet-exposed IEC 104 modem.', ref: 'MITRE T0883 · CISA exposure guidance',
  },
  {
    id: 'backups', cat: 'Recovery', name: 'Known-good config backups', short: 'Config backups', cost: 25000, opex: 500,
    desc: 'Versioned relay settings, HMI projects and RTU configs, verified and kept offline.',
    effect: 'Halves outage time after any incident; settings checksums appear in clues.', ref: 'NERC CIP-009 · CIP-010',
  },
  {
    id: 'playbook', cat: 'People', name: 'IR playbook & tabletop drills', short: 'IR playbook', cost: 35000, opex: 1000,
    desc: 'Operators, protection engineers and the SOC rehearse OT-specific responses together.',
    effect: 'Response cards show playbook guidance.', ref: 'NERC CIP-008',
  },
];

// Clue fields: asset (where the pin sits), src (log source), at (seconds relative to the alert),
// text (log line), attack (is it part of the attack?), chips ({t, need?, tone?}), why, ttp.
// Response q: best | good | weak | ignore | overreact. Outage/fine scale from scenario.impact by quality,
// unless the response sets its own outage (self-inflicted).
export const SCENARIOS = [
  {
    id: 'vendor-rdp',
    title: 'Breakers opening from a vendor session',
    short: 'Vendor remote access',
    inspired: 'Ukraine power grid attack, December 2015 — stolen VPN credentials, then the operators’ own HMIs were used to open breakers.',
    blockedBy: 'mfa',
    prevented: 'A vendor_svc login from an anonymising network was refused at the jump host: no MFA token.',
    targets: ['dmz', 'ctrl', 'yard'],
    conduits: ['inet-dmz', 'dmz-scc', 'scc-ctrl', 'ctrl-yard'],
    impact: { feeders: ['A', 'B'], hours: 5, fine: 300000, rel: -22 },
    clues: [
      {
        asset: 'dmz', src: 'VPN gateway', at: -170, attack: true,
        text: 'AUTH OK user=vendor_svc src=185.220.101.47\nmethod=password-only  profile=vendor-full',
        chips: [{ t: 'Outside maintenance window' }, { t: 'No MFA' }, { t: 'Tor exit node', need: 'ids' }],
        why: 'Valid vendor credentials, used from an anonymising network with no change ticket. Stolen credentials into a remote-access path is exactly how the 2015 Ukraine attackers got in.',
        ttp: 'T0822 External Remote Services',
      },
      {
        asset: 'dmz', src: 'Firewall FW-DMZ', at: -138, attack: true,
        text: 'ALLOW tcp 10.30.1.5:51122 -> 10.50.2.10:3389\nzone vpn-pool -> station-HMI',
        chips: [{ t: 'RDP straight into L2' }, { t: 'Bypasses jump host', need: 'ids' }],
        why: 'The VPN pool can reach the station HMI directly. The conduit is far too wide: a vendor should land on a jump host, not on the console that switches breakers.',
        ttp: 'T0886 Remote Services',
      },
      {
        asset: 'ctrl', src: 'Station HMI', at: -15, attack: true,
        text: 'session=vendor_svc (RDP)\nCB-A1 OPEN command issued · operator confirm: auto',
        chips: [{ t: 'No switching order' }],
        why: 'The attacker is clicking your own HMI. No malware needed — the legitimate tool does the damage.',
        ttp: 'T0823 Graphical User Interface',
      },
      {
        asset: 'ctrl', src: 'RTU-1', at: -14, attack: true,
        text: 'DNP3 OPERATE CROB idx=12 code=TRIP_PULSE\nfrom 10.50.2.10 (station HMI) -> outstation 7',
        chips: [{ t: 'Command from local HMI, not SCADA master', need: 'ids' }],
        why: 'Switching normally comes from the control center under a switching order. A trip from the local HMI at night is the attacker using your own control path.',
        ttp: 'T0855 Unauthorized Command Message',
      },
      {
        asset: 'yard', src: 'Relay 51-A1', at: -13, attack: true,
        text: 'CB-A1 OPENED · cause: remote command\nfault current: none (Ia=0.00 kA)',
        chips: [{ t: 'Trip without fault' }],
        why: 'A trip with no fault current means no protection logic decided this — a command did.',
        ttp: 'T0831 Manipulation of Control',
      },
      {
        asset: 'dmz', src: 'Historian', at: -300, attack: false,
        text: 'poll cycle OK · 4,812 tags · latency 42 ms',
        chips: [],
        why: 'Routine polling. Normal traffic is the baseline you compare against, not part of the attack.',
      },
      {
        asset: 'yard', src: 'Weather feed', at: -600, attack: false,
        text: 'wind 11 m/s · no lightning within 40 km',
        chips: [],
        why: 'Not an attack line, but useful: it rules out weather as the cause of the trip.',
      },
    ],
    responses: [
      {
        id: 'contain', tag: 'Contain', q: 'best', cost: 10000,
        title: 'Kill the session, disable vendor_svc, go to local control',
        desc: 'Terminate the RDP session, disable the account at the VPN, switch the station to local, then reclose CB-A1 under a switching order.',
        result: 'The attacker is cut off mid-session. CB-A1 is reclosed within 20 minutes and the vendor account is rebuilt with MFA.',
      },
      {
        id: 'block-vpn', tag: 'Contain', q: 'good', cost: 5000,
        title: 'Block the VPN at the firewall',
        desc: 'Drop all vendor VPN traffic at the DMZ firewall.',
        result: 'New logins stop, but the live RDP session survives a few minutes and opens one more breaker before it times out.',
      },
      {
        id: 'reboot', tag: 'Recover', q: 'weak', cost: 3000,
        title: 'Reboot the station HMI',
        desc: 'Restart the HMI to clear whatever is happening.',
        result: 'The HMI comes back — and so does the attacker, with the same credentials, ten minutes later.',
      },
      {
        id: 'reclose', tag: 'Restore', q: 'ignore', cost: 0,
        title: 'Reclose CB-A1 and log a spurious trip',
        desc: 'Probably a glitch. Get customers back on and investigate tomorrow.',
        result: 'You reclose; the attacker opens it again, then the Feeder B incomer, then wipes the HMI. Crews drive out to switch by hand.',
      },
      {
        id: 'deenergize', tag: 'Shutdown', q: 'overreact', cost: 40000, outage: { feeders: ['A', 'B', 'C', 'D'], hours: 6 }, rel: -12,
        title: 'De-energize the substation until forensics finish',
        desc: 'Take everything out of service until the investigation is complete.',
        result: 'The attacker has nothing left to switch — because you switched it all off. 15,500 customers, the college and the mall dark for six hours.',
      },
    ],
    timeout: 'Nobody acted. The attacker opened the second incomer and wiped the HMI, and crews had to switch by hand.',
    lesson: 'Remote access is the front door to most OT incidents. Valid credentials are not proof of a valid user: check time, source and change records, and cut the session before you restore power.',
  },

  {
    id: 'goose-trip',
    title: 'Transformer tripped with no fault on the line',
    short: 'Station bus',
    inspired: 'Industroyer / CrashOverride (Kyiv, 2016) and Industroyer2 (2022) — malware that speaks grid protocols natively to command switchgear.',
    blockedBy: 'portsec',
    prevented: 'Port security shut switch port Gi1/0/14 the moment an unknown laptop was plugged into the station bus.',
    targets: ['yard', 'ctrl', 'scc'],
    conduits: ['ctrl-yard'],
    impact: { feeders: ['A', 'B'], hours: 4, fine: 200000, rel: -18 },
    clues: [
      {
        asset: 'yard', src: 'Station switch SW-2', at: -540, attack: true,
        text: '%LINK-3-UPDOWN: Gi1/0/14 changed state to up\n%SW_MATM: new MAC 00:0c:29:7a:11:e3 on Gi1/0/14',
        chips: [{ t: 'Port was unused at last audit' }, { t: 'Not in asset inventory', need: 'inventory' }, { t: 'VMware MAC vendor', need: 'ids' }],
        why: 'A new device on a substation switch, with a virtual-machine MAC. Station buses are static: new MACs should be rare and always ticketed.',
        ttp: 'T0848 Rogue Master',
      },
      {
        asset: 'ctrl', src: 'Relay 87T-1 (MMS)', at: -300, attack: true,
        text: 'MMS GetNamedVariableListAttributes\nclient 10.50.2.99 -> LLN0$GO$TripT1 dataset',
        chips: [{ t: 'Client not in station config (SCD)', need: 'inventory' }],
        why: 'Before tripping anything, the rogue laptop browsed the relay’s GOOSE datasets to learn exactly what to spoof.',
        ttp: 'T0861 Point & Tag Identification',
      },
      {
        asset: 'yard', src: 'Relay 87T-1 (GOOSE)', at: -12, attack: true,
        text: 'gcRef=KPT_87T1/LLN0$GO$TripT1 stNum 18 -> 19\nsrc MAC 00:0c:29:7a:11:e3 (expected 00:30:a7:12:4c:01)',
        chips: [{ t: 'Publisher MAC mismatch', need: 'ids' }],
        why: 'GOOSE has no authentication by default. Anyone on the bus can publish a “trip” frame with the right name. The source is not the relay.',
        ttp: 'T0855 Unauthorized Command Message',
      },
      {
        asset: 'yard', src: 'Breaker CB-T1', at: -11, attack: true,
        text: '52a OPEN · trip coil TC1 energised\n87T diff current Id=0.02 pu (pickup 0.30 pu)',
        chips: [{ t: 'No differential current' }],
        why: 'A real transformer fault shows differential current far above pickup. 0.02 pu is noise: the breaker was told to open, not forced to.',
        ttp: 'T0831 Manipulation of Control',
      },
      {
        asset: 'scc', src: 'Lightning network', at: -20, attack: false,
        text: 'STRIKE · 3.2 km SW of Kestrel Point · 18 kA',
        chips: [{ t: 'Nearby strike' }],
        why: 'A real strike, and a coincidence. Lightning faults leave fault current, a distance-to-fault and a recloser cycle. This trip has none.',
      },
      {
        asset: 'ctrl', src: 'Work orders', at: -64800, attack: false,
        text: 'WO-4471 relay testing bay 4 · contractor Voltline\nstatus CLOSED',
        chips: [],
        why: 'Not part of the attack, but good context: it tells you who last had physical access, and where to look for the laptop.',
      },
      {
        asset: 'scc', src: 'SCADA master', at: -10, attack: false,
        text: 'IEC104 spontaneous: CB-T1 OPEN (cot=3)\nFeeder A load 0.0 MW',
        chips: [],
        why: 'SCADA correctly reporting the trip. It is the symptom you already knew about, not evidence of how it happened.',
      },
    ],
    responses: [
      {
        id: 'port', tag: 'Contain', q: 'best', cost: 15000,
        title: 'Shut Gi1/0/14, seize the laptop, verify relays, reclose',
        desc: 'Disable the rogue port, put bay protection in test while you compare GOOSE publishers against the SCD, then reclose under a switching order.',
        result: 'The trip frames stop at once. Relays check clean, CB-T1 recloses after 25 minutes and the contractor laptop goes to forensics.',
      },
      {
        id: 'hardwired', tag: 'Contain', q: 'good', cost: 25000,
        title: 'Block GOOSE, fall back to hardwired trips',
        desc: 'Drop to the copper backup trip scheme until the bus is trusted again.',
        result: 'The attacker loses their lever, but you run on degraded protection and the laptop stays plugged in for another hour.',
      },
      {
        id: 'it-ticket', tag: 'Escalate', q: 'weak', cost: 2000,
        title: 'Raise an IT ticket for the switch',
        desc: 'Corporate IT owns network gear. Let them check the port logs.',
        result: 'The ticket sits in a queue while the laptop keeps publishing. Operators reclose by hand twice.',
      },
      {
        id: 'lightning', tag: 'Restore', q: 'ignore', cost: 0,
        title: 'Log it as lightning and reclose',
        desc: 'A strike was recorded nearby. Reclose CB-T1 and close the alarm.',
        result: 'CB-T1 recloses — and trips again 40 seconds later, followed by T2. Both feeders go dark.',
      },
      {
        id: 'rebuild', tag: 'Shutdown', q: 'overreact', cost: 60000, outage: { feeders: ['A', 'B', 'C', 'D'], hours: 7 }, rel: -12,
        title: 'De-energize and re-commission every relay',
        desc: 'Take all bays out of service and rebuild protection from scratch.',
        result: 'The attack ends because there is nothing left to attack. 15,500 customers, the college and the mall lose power for seven hours on your order.',
      },
    ],
    timeout: 'With no decision, the rogue publisher tripped T2 as well. Crews reclosed by hand after someone found the laptop by chance.',
    lesson: 'Protocol-native attacks look like faults. Before you reclose, ask the protection question — was there fault current? — then the network question: who published that command?',
  },

  {
    id: 'usb-relay',
    title: 'Protection settings changed on Feeder B',
    short: 'Engineering workstation',
    inspired: 'Stuxnet (2010) crossed an air gap on USB and quietly changed setpoints while operators saw normal values.',
    blockedBy: 'usb',
    prevented: 'The USB kiosk flagged relaycfg_update.exe as malicious before the drive ever reached the engineering workstation.',
    targets: ['ctrl', 'yard'],
    conduits: ['ctrl-yard'],
    impact: { feeders: ['B'], hours: 8, fine: 450000, rel: -25 },
    clues: [
      {
        asset: 'ctrl', src: 'EWS-01', at: -2700, attack: true,
        text: 'USB mass storage attached: SanDisk Cruzer 32GB (E:)\nuser=eng_jdoe · no kiosk scan record',
        chips: [{ t: 'Unscanned removable media' }],
        why: 'Air gaps leak through USB. This drive never passed the scanning kiosk.',
        ttp: 'T0847 Replication Through Removable Media',
      },
      {
        asset: 'ctrl', src: 'EWS-01', at: -2650, attack: true,
        text: 'process start: E:\\tools\\relaycfg_update.exe\nsigned=false parent=explorer.exe',
        chips: [{ t: 'Unsigned binary' }],
        why: 'An unsigned “update” tool launched by hand from the USB. Real relay software is installed and signed.',
        ttp: 'T0863 User Execution',
      },
      {
        asset: 'yard', src: 'Relay 51-B1', at: -2400, attack: true,
        text: 'MMS SetDataValues from 10.50.2.20 (EWS-01)\nSG1 51P pickup 600 A -> 6000 A · 50P1 enable 1 -> 0',
        chips: [{ t: 'No change ticket' }, { t: 'Write to protection settings', need: 'ids' }],
        why: 'Overcurrent pickup raised tenfold and instantaneous protection disabled. Nothing trips now — that is the danger: the next real fault will not be cleared.',
        ttp: 'T0836 Modify Parameter',
      },
      {
        asset: 'yard', src: 'Relay 51-B1', at: -2390, attack: true,
        text: 'settings checksum 0x4F1A -> 0x9C03',
        chips: [{ t: 'Differs from approved baseline', need: 'backups' }],
        why: 'The settings fingerprint no longer matches the approved version. With baselines you can prove a change in seconds.',
        ttp: 'T0836 Modify Parameter',
      },
      {
        asset: 'ctrl', src: 'EWS-01', at: -3600, attack: false,
        text: 'Defender: definitions updated to 1.401.233.0',
        chips: [],
        why: 'Routine. Note that antivirus did not catch the tool — signatures are a weak control against custom OT tooling.',
      },
      {
        asset: 'scc', src: 'SCADA master', at: -30, attack: false,
        text: 'all 38 RTUs healthy · 0 comm failures\nFeeder B 18.4 MW',
        chips: [],
        why: 'Everything looks fine because nothing has tripped. Silent setting changes do not show on SCADA until a real fault.',
      },
      {
        asset: 'ctrl', src: 'Badge system', at: -3000, attack: false,
        text: 'eng_jdoe badge IN · substation gate',
        chips: [],
        why: 'The engineer was genuinely on site. The question is what came in with them.',
      },
    ],
    responses: [
      {
        id: 'restore', tag: 'Recover', q: 'best', cost: 30000,
        title: 'Quarantine EWS-01, restore 51-B1 from known-good settings',
        desc: 'Pull the EWS off the network, restore the approved settings file, verify with a test set before returning to service.',
        result: 'Feeder B runs on an alternate supply for 40 minutes while 51-B1 is restored and tested. Protection matches the study again.',
      },
      {
        id: 'manual', tag: 'Recover', q: 'good', cost: 45000,
        title: 'Quarantine EWS-01, re-key settings by hand',
        desc: 'Rebuild the settings manually from the protection coordination study.',
        result: 'Right outcome, slow path: a protection engineer spends the afternoon re-keying and double-checking settings.',
      },
      {
        id: 'scan', tag: 'Monitor', q: 'weak', cost: 3000,
        title: 'Run a full antivirus scan on EWS-01',
        desc: 'Clean the workstation and keep operating.',
        result: 'The scan finds nothing. 51-B1 keeps the bad settings and the next fault takes far too long to clear.',
      },
      {
        id: 'close', tag: 'Close', q: 'ignore', cost: 0,
        title: 'Close as false alarm — nothing tripped',
        desc: 'SCADA is green and no customers are affected.',
        result: 'Days later a tree hits Feeder B. 51-B1 does not trip; the fault burns until upstream protection operates. Transformer damaged, hospital on generators.',
      },
      {
        id: 'audit', tag: 'Shutdown', q: 'overreact', cost: 80000, outage: { feeders: ['A', 'B', 'C', 'D'], hours: 8 }, rel: -12,
        title: 'Take the substation offline for a full audit',
        desc: 'Every relay, every setting, before anything is energized again.',
        result: 'Every relay gets audited — with 15,500 customers, the college and the mall off supply while you do it.',
      },
    ],
    timeout: 'No one acted and the bad settings stayed in. The next real fault was not cleared in time and damaged equipment.',
    lesson: 'The most dangerous OT attacks are silent: they remove protection instead of causing trips. Baselines of relay settings turn “is this right?” into a checksum comparison.',
  },

  {
    id: 'ransomware',
    title: 'Ransomware spreading from corporate IT',
    short: 'IT/OT boundary',
    inspired: 'Colonial Pipeline (2021): ransomware hit IT, and operations were shut down as a precaution although the pipeline control system was not encrypted.',
    blockedBy: 'itotfw',
    prevented: 'Ransomware hit a corporate file server, but the IT/OT firewall dropped every SMB attempt toward the OT DMZ. The grid never noticed.',
    targets: ['corp', 'dmz', 'scc'],
    conduits: ['corp-dmz', 'dmz-scc'],
    impact: { feeders: ['A', 'B'], hours: 6, fine: 150000, rel: -15 },
    clues: [
      {
        asset: 'corp', src: 'File server FS-02', at: -480, attack: true,
        text: '14,982 files renamed *.lockbit in 6 min\nREADME_RESTORE.txt dropped in 212 folders',
        chips: [{ t: 'Mass rename' }],
        why: 'Mass renames and ransom notes: IT is already compromised. The question for OT is whether it can cross over.',
        ttp: 'Enterprise T1486 Data Encrypted for Impact',
      },
      {
        asset: 'corp', src: 'EDR console', at: -500, attack: true,
        text: 'FS-02: vssadmin delete shadows /all /quiet',
        chips: [{ t: 'Recovery sabotage' }],
        why: 'Deleting shadow copies is a ransomware hallmark: kill local recovery first, then encrypt.',
        ttp: 'Enterprise T1490 Inhibit System Recovery',
      },
      {
        asset: 'dmz', src: 'Historian HIST-01', at: -120, attack: true,
        text: 'SMB session from 10.10.4.22 (FS-02)\nADMIN$ write: svc_upd.exe',
        chips: [{ t: 'IT host writing into L3.5' }, { t: 'Server is dual-homed (IT + OT NICs)', need: 'inventory' }],
        why: 'The historian has one leg in IT and one in OT. It is the bridge the ransomware is trying to walk across.',
        ttp: 'T0867 Lateral Tool Transfer',
      },
      {
        asset: 'dmz', src: 'Firewall FW-DMZ', at: -60, attack: true,
        text: 'rule 47 ANY -> ANY ALLOW · hits=3,201 (10 min)\ncomment: "temp for vendor"',
        chips: [{ t: 'Temporary rule never removed' }, { t: 'Hit-count spike', need: 'ids' }],
        why: 'A temporary any-any rule turned the DMZ into a flat network. Most IT-to-OT incidents ride on configuration debt like this.',
        ttp: 'T0886 Remote Services',
      },
      {
        asset: 'scc', src: 'SCADA master', at: -30, attack: false,
        text: 'IEC 104 polling normal · 38 RTUs online\n0 failed commands',
        chips: [],
        why: 'OT is still healthy — which is exactly why you have a choice: isolate now and keep the grid running.',
      },
      {
        asset: 'scc', src: 'Operator console', at: -900, attack: false,
        text: 'login ops_night · shift handover complete',
        chips: [],
        why: 'Normal shift activity. Not every login during an incident is suspicious.',
      },
      {
        asset: 'corp', src: 'Mail gateway', at: -1800, attack: false,
        text: 'quarantined 31 messages · phishing-simulation campaign Q4',
        chips: [],
        why: 'A scheduled awareness campaign — background noise, not part of this attack.',
      },
    ],
    responses: [
      {
        id: 'sever', tag: 'Contain', q: 'best', cost: 20000,
        title: 'Cut the IT/OT conduit, run OT islanded',
        desc: 'Kill rule 47, unplug HIST-01’s IT leg and keep SCADA running on its own while IT restores from backups.',
        result: 'SMB attempts die at the boundary. The grid never notices; billing is restored from backup over two days.',
      },
      {
        id: 'historian', tag: 'Contain', q: 'good', cost: 8000,
        title: 'Isolate only the historian',
        desc: 'Shut HIST-01 down and leave the firewall as it is.',
        result: 'You cut the bridge you could see. Rule 47 stays open, so the night is spent watching for the next one.',
      },
      {
        id: 'ransom', tag: 'Recover', q: 'weak', cost: 450000,
        title: 'Pay the ransom to get billing back',
        desc: 'The attackers promise a decryptor within hours.',
        result: 'The decryptor half-works, the firewall is still open, and you are now on a list of companies that pay.',
      },
      {
        id: 'it-only', tag: 'Close', q: 'ignore', cost: 0,
        title: 'Leave it to IT — OT is not affected',
        desc: 'IT owns the file servers, and SCADA is green.',
        result: 'svc_upd.exe runs on HIST-01 and reaches the SCADA servers through rule 47. Operators lose their screens and run manual for hours.',
      },
      {
        id: 'shutdown', tag: 'Shutdown', q: 'overreact', cost: 0, outage: { feeders: ['A', 'B', 'C', 'D'], hours: 10 }, rel: -15,
        title: 'Halt grid operations until IT is clean',
        desc: 'Better safe than sorry: no grid operations until the IT incident is over.',
        result: 'OT was never infected, but customers were off supply for ten hours. You turned an IT incident into a grid outage.',
      },
    ],
    timeout: 'With no decision, svc_upd.exe crossed rule 47 and encrypted the SCADA servers. Operators ran blind on manual for hours.',
    lesson: 'Most OT incidents start in IT. A strong IT/OT boundary lets you keep the grid running while IT burns — without one, your options shrink to “hope” or “shut down”.',
  },

  {
    id: 'exposed-rtu',
    title: 'Commands from an unknown IEC 104 master',
    short: 'Internet-exposed RTU',
    inspired: 'Internet-exposed OT such as the 2023 attacks on Unitronics PLCs at US water utilities — default passwords, found by scanners.',
    blockedBy: 'surface',
    prevented: 'Scanners hammered the old cellular modem IP and found nothing: the modem was removed during your attack-surface review.',
    targets: ['internet', 'ctrl'],
    conduits: ['inet-ctrl'],
    impact: { feeders: ['B'], hours: 3, fine: 250000, rel: -18 },
    clues: [
      {
        asset: 'ctrl', src: 'Cellular modem LTE-7', at: -600, attack: true,
        text: 'NAT inbound TCP 92.63.197.18:51772 -> 10.50.2.7:2404\nstate ESTABLISHED',
        chips: [{ t: 'Internet source' }, { t: 'Modem not in asset inventory', need: 'inventory' }],
        why: 'Someone fitted a cellular modem years ago for “temporary” access. TCP/2404 is IEC 104: the RTU answers to the whole internet.',
        ttp: 'T0883 Internet Accessible Device',
      },
      {
        asset: 'ctrl', src: 'RTU-7 web UI', at: -560, attack: true,
        text: 'login OK user=admin (factory default)\nsrc=92.63.197.18',
        chips: [{ t: 'Default credentials' }],
        why: 'Default credentials on an internet-facing device are found by automated scanners within hours.',
        ttp: 'T0812 Default Credentials',
      },
      {
        asset: 'ctrl', src: 'RTU-7', at: -300, attack: true,
        text: 'IEC104 C_IC_NA_1 general interrogation\nfrom master 92.63.197.18 (not configured)',
        chips: [{ t: 'Unknown master address', need: 'ids' }],
        why: 'A general interrogation dumps every point the RTU knows. The attacker is mapping what they can switch.',
        ttp: 'T0861 Point & Tag Identification',
      },
      {
        asset: 'ctrl', src: 'RTU-7', at: -20, attack: true,
        text: 'IEC104 C_SC_NA_1 IOA 3012 = OFF (Feeder B CB)\nselect-before-operate: not used',
        chips: [{ t: 'Direct operate' }],
        why: 'A direct single command to open Feeder B. The attacker is now switching your grid.',
        ttp: 'T0855 Unauthorized Command Message',
      },
      {
        asset: 'scc', src: 'SCADA master', at: -18, attack: true,
        text: 'WARN RTU-7: state change not commanded by this master',
        chips: [],
        why: 'Your own SCADA master noticed a command it did not send. An RTU obeying a second master is always worth chasing.',
        ttp: 'T0855 Unauthorized Command Message',
      },
      {
        asset: 'scc', src: 'GPS clock', at: -1200, attack: false,
        text: 'NTP offset 3 ms · stratum 1 · locked',
        chips: [],
        why: 'Time sync is healthy. Good to know when you line up timestamps, but not part of the attack.',
      },
      {
        asset: 'ctrl', src: 'Station HMI', at: -400, attack: false,
        text: 'operator ops_day changed trend view: Feeder B load',
        chips: [],
        why: 'A real operator doing normal work.',
      },
    ],
    responses: [
      {
        id: 'kill-modem', tag: 'Contain', q: 'best', cost: 12000,
        title: 'Kill the modem, block 2404 at the carrier, reset RTU creds',
        desc: 'Remove the exposure, rotate credentials and review every command RTU-7 accepted in the last 30 days.',
        result: 'The session drops. Feeder B is reclosed from the real SCADA master within 30 minutes, and the modem goes in the bin.',
      },
      {
        id: 'password', tag: 'Contain', q: 'good', cost: 1000,
        title: 'Change the RTU-7 password',
        desc: 'Lock the attacker out by rotating the admin credentials.',
        result: 'The web login is blocked — but IEC 104 has no authentication, so port 2404 still accepts commands until someone finds the modem.',
      },
      {
        id: 'abuse', tag: 'Escalate', q: 'weak', cost: 0,
        title: 'Report the IP to the ISP abuse desk',
        desc: 'Get the attacker’s connection shut down at the source.',
        result: 'The ISP thanks you. The attacker switches to another IP within minutes.',
      },
      {
        id: 'glitch', tag: 'Restore', q: 'ignore', cost: 0,
        title: 'Reclose Feeder B and blame a comms glitch',
        desc: 'RTU-7 has always been flaky.',
        result: 'Feeder B is reclosed — and reopened four minutes later. The attacker plays this game for hours.',
      },
      {
        id: 'wan', tag: 'Shutdown', q: 'overreact', cost: 30000, outage: { feeders: ['A', 'B', 'C', 'D'], hours: 4 }, rel: -10,
        title: 'Shut down the SCADA WAN to every substation',
        desc: 'Nothing gets in if nothing is connected.',
        result: 'Every station drops to local control. Without remote switching, the evening peak forces load shedding for four hours.',
      },
    ],
    timeout: 'With no decision, the attacker kept toggling Feeder B until a crew pulled the modem by hand.',
    lesson: 'If an OT device answers from the internet with a default password, it is a question of when, not if. Inventory finds the shadow devices; attack-surface reviews remove them.',
  },

  {
    id: 'firmware-ok',
    benign: true,
    title: 'Firmware write detected on a transformer relay',
    short: 'Relay firmware',
    inspired: 'Every real OT SOC: most alerts are authorised work. Telling the difference quickly is the job.',
    blockedBy: null,
    targets: ['ctrl', 'yard', 'scc'],
    conduits: [],
    impact: null,
    clues: [
      {
        asset: 'ctrl', src: 'Security alert', at: -60, attack: false,
        text: 'ALERT FW-001: firmware download to protection IED R-87T-2',
        chips: [{ t: 'Matches IED firmware rule', need: 'ids' }],
        why: 'The alert that opened this case. A correct detection — of an authorised action. Worth checking, not worth panicking.',
      },
      {
        asset: 'ctrl', src: 'EWS-02', at: -90, attack: false,
        text: 'firmware upload R-87T-2 v3.4.1 -> v3.4.2\nsignature VALID (vendor code-signing cert)',
        chips: [{ t: 'Signed firmware', tone: 'ok' }, { t: 'Known asset', need: 'inventory', tone: 'ok' }],
        why: 'Signed vendor firmware pushed from a registered engineering workstation.',
      },
      {
        asset: 'ctrl', src: 'Change management', at: -86400, attack: false,
        text: 'CHG-2291 APPROVED · bay 2 relay firmware\nwindow {win} today · owner eng_mokoena',
        chips: [{ t: 'Approved change', tone: 'ok' }],
        why: 'An approved change matching the asset, the time window and the engineer. The single most useful clue here.',
      },
      {
        asset: 'yard', src: 'Relay 87T-2', at: -40, attack: false,
        text: 'restart after firmware update\nTEST mode ON · trip outputs blocked',
        chips: [{ t: 'Bay in test', tone: 'ok' }],
        why: 'Putting the relay in test before touching firmware is good practice — it cannot trip anything during the work.',
      },
      {
        asset: 'ctrl', src: 'Badge system', at: -3000, attack: false,
        text: 'eng_mokoena badge IN · substation gate',
        chips: [],
        why: 'The engineer named on the change is physically on site.',
      },
      {
        asset: 'scc', src: 'SCADA master', at: -1500, attack: false,
        text: 'bay 2 tagged OUT FOR MAINTENANCE by ops_day',
        chips: [{ t: 'Control room aware', tone: 'ok' }],
        why: 'The control room knows about the job and has tagged the bay. Operations and engineering agree.',
      },
    ],
    responses: [
      {
        id: 'verify', tag: 'Close', q: 'best', cost: 0,
        title: 'Verify the change record and close as authorised',
        desc: 'CHG-2291 matches the asset, engineer and window. Confirm with eng_mokoena by phone and close.',
        result: 'A two-minute phone call, ticket closed with evidence attached. The update finishes on time.',
      },
      {
        id: 'escalate', tag: 'Escalate', q: 'weak', cost: 15000,
        title: 'Escalate to the SOC for full forensics',
        desc: 'Image EWS-02 and pull relay logs, just in case.',
        result: 'Forensics confirm what the change record already said. Twelve analyst-hours spent; the job is delayed a day.',
      },
      {
        id: 'rollback', tag: 'Recover', q: 'weak', cost: 20000, outage: { feeders: ['B'], hours: 1 }, rel: -4,
        title: 'Roll back the firmware immediately',
        desc: 'Revert to v3.4.1 until someone explains.',
        result: 'The rollback interrupts a supervised update; Feeder B is switched out for an hour while bay 2 is re-tested.',
      },
      {
        id: 'isolate', tag: 'Shutdown', q: 'overreact', cost: 25000, outage: { feeders: ['A', 'B', 'C', 'D'], hours: 3 }, rel: -10,
        title: 'Isolate the substation until the firmware is proven safe',
        desc: 'Disconnect and de-energize until a full review is done.',
        result: 'You cut a healthy station off for an approved job. Three hours without supply while it is brought back.',
      },
    ],
    timeout: 'Nobody decided. The work was legitimate so nothing broke — but the alert stayed open and the engineer waited an hour for a callback.',
    lesson: 'Not every alert is an attack. Change records, badge data and control-room tags let you close true-but-authorised alerts in minutes, and save escalation for the ones that matter.',
  },
];

export const CHAPTERS = ['First shift at Kestrel Point', 'Harden the station'];

export const QUESTS = [
  { ch: 0, event: 'camera', icon: 'compass', reward: 0, action: 'rotate', title: 'Look around the site', desc: 'Drag to pan. Right-drag or two fingers to rotate. Scroll or pinch to zoom.' },
  { ch: 0, event: 'inspect:ctrl', icon: 'cpu', reward: 10000, action: 'asset:ctrl', title: 'Inspect the control house', desc: 'Tap the Substation Control House. Breaker commands start there.' },
  { ch: 0, event: 'network', icon: 'share', reward: 10000, action: 'panel:network', title: 'Map your zones and conduits', desc: 'Open Network to see the Purdue levels and which conduits are unprotected.' },
  { ch: 0, event: 'buy', icon: 'bag', reward: 0, action: 'panel:shop', title: 'Buy your first security control', desc: 'Open the Shop. Visibility first: you can’t defend what you can’t see.' },
  { ch: 0, event: 'incident', icon: 'shield', reward: 25000, action: 'incident', title: 'Handle your first incident', desc: 'When the alarm fires, read the clues, tag the attack, then play a response card.' },
  { ch: 0, event: 'day2', icon: 'zap', reward: 30000, action: 'speed', title: 'Keep the lights on until midnight', desc: 'Finish Day 1. Fines and outages eat your budget.' },
  { ch: 1, event: 'sl3', icon: 'shield', reward: 40000, action: 'panel:shop', title: 'Reach Security Level 3', desc: 'Six controls installed. Mix visibility, segmentation, access and recovery.' },
  { ch: 1, event: 'prevent', icon: 'lock', reward: 30000, action: 'panel:network', title: 'Stop an attack before it starts', desc: 'Have the right control in place when an attack arrives.' },
  { ch: 1, event: 'gradeB', icon: 'chart', reward: 30000, action: 'panel:soc', title: 'Score B or better on an incident', desc: 'Tag precisely, respond proportionately, decide quickly.' },
  { ch: 1, event: 'benign', icon: 'check', reward: 30000, action: 'panel:soc', title: 'Close a false alarm without escalating', desc: 'Some alerts are authorised work. Prove it from the evidence.' },
];
