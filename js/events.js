// Replay variety: false alarms (routine plant events that look alarming), everyday background log lines,
// and random plant events. None of this is attack content — it is the noise a real OT SOC must sort
// from the real attacks in data.js.

// ---------- false alarms ----------
// Compact templates; buildFalseAlarm() turns each into a full benign scenario.
// feeders: what an overreaction (isolating the asset) would switch off.
const FA = [
  {
    id: 'fa-lightning', title: 'Feeder A breaker tripped during a thunderstorm', short: 'Lightning trip', targets: ['yard', 'townA'], feeders: ['A'],
    alert: { asset: 'yard', src: 'Relay 21-A', text: 'TRIP distance zone 1 · auto-reclose SUCCESSFUL after 1.2 s', why: 'A trip followed by a successful auto-reclose is the textbook signature of a transient fault.' },
    clues: [
      { asset: 'yard', src: 'Lightning detection', text: 'strike 0.8 km from Feeder A line · 31 kA', chips: ['Strike near the line'], why: 'A strike right next to the line explains the fault.' },
      { asset: 'yard', src: 'Fault recorder', text: 'single-phase fault · duration 70 ms · arc extinguished', chips: ['Real fault current'], why: 'Real fault current was measured: physics, not a command.' },
      { asset: 'scc', src: 'Weather feed', text: 'thunderstorm cell over Bukit Mutiara · 18:00–19:30', chips: ['Storm in progress'], why: 'The weather matches the time of the trip.' },
    ],
    best: ['Confirm the fault record and close as weather', 'Lightning plus measured fault current and a clean reclose. Log it and send a line patrol tomorrow.', 'Logged as a weather event. Patrol finds a scorched insulator and replaces it next morning.'],
    lesson: 'A trip with real fault current and a successful reclose during a storm is the grid protecting itself. Commands with no fault current are what should worry you.',
  },
  {
    id: 'fa-patch', title: 'Unexpected reboot of the historian server', short: 'Patch reboot', targets: ['dmz'], feeders: [],
    alert: { asset: 'dmz', src: 'Monitoring', text: 'HIST-01 unreachable 4 min · then back online', why: 'An outage that resolves on its own deserves a look at maintenance records first.' },
    clues: [
      { asset: 'dmz', src: 'Patch server', text: 'WSUS: monthly patches applied to HIST-01 · reboot scheduled 02:00', chips: ['Scheduled patching'], why: 'A scheduled patch reboot exactly explains the gap.' },
      { asset: 'corp', src: 'Change management', text: 'CHG-3104 APPROVED · DMZ patching window {win}', chips: ['Approved change'], why: 'The change is approved and inside its window.' },
      { asset: 'dmz', src: 'HIST-01', text: 'service historian started · replication resumed · 0 gaps', chips: ['No data lost'], why: 'Replication caught up with no data loss.' },
    ],
    best: ['Match the reboot to the patch window and close', 'CHG-3104 covers it. Confirm replication caught up and close.', 'Closed in five minutes. The historian is patched and fully synced.'],
    lesson: 'Patching causes reboots. Check the change calendar before treating an outage as an attack.',
  },
  {
    id: 'fa-sensor', title: 'Gas pressure reading jumped to zero at the biogas plant', short: 'Stuck sensor', targets: ['biogas'], feeders: ['C'],
    alert: { asset: 'biogas', src: 'PLC alarm', text: 'PIT-301 LOW-LOW · 0.0 mbar · signal 3.6 mA', why: 'A 4–20 mA loop reading below 4 mA usually means a wiring or instrument fault, not a real pressure.' },
    clues: [
      { asset: 'biogas', src: 'PLC diagnostics', text: 'AI channel 5 · under-range · wire-break suspected', chips: ['Loop fault flag'], why: 'The PLC itself flags a broken loop.' },
      { asset: 'biogas', src: 'Field technician', text: 'PIT-301 junction box flooded after rain · water ingress', chips: ['Physical cause found'], why: 'A technician found the physical cause.' },
      { asset: 'biogas', src: 'FIT-301', text: 'gas flow steady 412 Nm³/h · genset at full load', chips: ['Process normal'], why: 'Other instruments show the process running normally.' },
    ],
    best: ['Treat it as an instrument fault and dispatch a technician', 'Bypass the faulty transmitter with an approved override and fix the junction box.', 'The box is dried and resealed in an hour. Pressure reads normally again.'],
    lesson: 'Cross-check one strange reading against neighbouring instruments. One wild value with everything else steady is usually the instrument.',
  },
  {
    id: 'fa-vendor-ok', title: 'Remote vendor session opened to the wind farm controller', short: 'Vendor support', targets: ['wind', 'dmz'], feeders: [],
    alert: { asset: 'dmz', src: 'Remote access gateway', text: 'session vendor_wtg01 → turbine controller WTG-3', why: 'Remote vendor sessions are worth checking every time — most are booked support.' },
    clues: [
      { asset: 'corp', src: 'Ticketing', text: 'TKT-8812 · WTG-3 pitch fault · vendor support booked {win}', chips: ['Booked support'], why: 'Support was booked for this turbine and time.' },
      { asset: 'dmz', src: 'Jump host', text: 'session recorded · approved by ops_day · MFA OK', chips: ['Recorded and approved'], why: 'The session went through the jump host, with approval and MFA.' },
      { asset: 'wind', src: 'WTG-3', text: 'pitch system reset · turbine back to production', chips: ['Fault cleared'], why: 'The work fixed the fault it was booked for.' },
    ],
    best: ['Confirm the ticket and approval, then close', 'Booked, approved, recorded and MFA-protected. Close with the ticket attached.', 'Closed. WTG-3 is generating again.'],
    lesson: 'Remote access through a jump host with a ticket, approval, MFA and recording is how vendor support should look.',
  },
  {
    id: 'fa-clock', title: 'Event logs show time jumping on station devices', short: 'GPS clock resync', targets: ['ctrl'], feeders: ['A', 'B'],
    alert: { asset: 'ctrl', src: 'SIEM', text: 'time discontinuity +1.8 s on 14 IEDs at 03:00', why: 'Time jumps can hide activity, but many devices shifting together points to a shared clock source.' },
    clues: [
      { asset: 'ctrl', src: 'GPS clock', text: 'antenna replaced · resync to satellite time · offset corrected 1.8 s', chips: ['Clock maintenance'], why: 'The station clock was resynchronised after maintenance.' },
      { asset: 'ctrl', src: 'Work order', text: 'WO-552 · replace GPS antenna · eng_lim', chips: ['Work order'], why: 'A work order covers the antenna replacement.' },
      { asset: 'yard', src: 'IEDs', text: 'PTP grandmaster change · all bays locked', chips: ['Devices locked'], why: 'All devices locked onto the corrected time.' },
    ],
    best: ['Tie the jump to the clock maintenance and close', 'WO-552 explains the resync. Note the offset in the event timeline and close.', 'Closed. Timestamps line up across every device again.'],
    lesson: 'When every device shifts by the same amount at once, look at the shared time source first.',
  },
  {
    id: 'fa-solar-cloud', title: 'Solar output dropped by 70% in two minutes', short: 'Cloud front', targets: ['solar'], feeders: [],
    alert: { asset: 'solar', src: 'SCADA', text: 'solar farm export 12.4 MW → 3.6 MW', why: 'A big drop in output can be weather, a fault or a curtailment command.' },
    clues: [
      { asset: 'solar', src: 'Irradiance sensor', text: 'irradiance 940 → 260 W/m² · cloud front', chips: ['Cloud cover'], why: 'Sunlight dropped by the same amount as the output.' },
      { asset: 'solar', src: 'Inverters', text: 'all 22 inverters online · no setpoint change', chips: ['No command sent'], why: 'No curtailment command was sent; inverters simply see less sun.' },
      { asset: 'scc', src: 'Weather feed', text: 'heavy cloud bank moving east · 20 min', chips: ['Forecast match'], why: 'The forecast shows the cloud bank.' },
    ],
    best: ['Confirm it is cloud cover and close', 'Irradiance fell with output and no setpoint changed. Close and watch the recovery.', 'Output climbs back as the clouds pass.'],
    lesson: 'For renewables, compare output with the weather sensors before suspecting a command.',
  },
  {
    id: 'fa-wind-cutout', title: 'All four wind turbines stopped at once', short: 'High-wind cut-out', targets: ['wind'], feeders: [],
    alert: { asset: 'wind', src: 'SCADA', text: 'WTG-1..4 STOPPED · export 0 MW', why: 'All turbines stopping together could be a command — or the weather.' },
    clues: [
      { asset: 'wind', src: 'Met mast', text: 'wind speed 27 m/s · gusts 31 m/s', chips: ['Above cut-out speed'], why: 'Turbines shut down automatically above 25 m/s to protect themselves.' },
      { asset: 'wind', src: 'Turbine controllers', text: 'state: HIGH-WIND CUT-OUT · auto restart below 22 m/s', chips: ['Automatic safety stop'], why: 'The controllers report a normal automatic safety stop.' },
      { asset: 'scc', src: 'Weather feed', text: 'gale warning · coastal waters', chips: ['Gale warning'], why: 'A gale warning matches.' },
    ],
    best: ['Confirm the high-wind cut-out and close', 'A safety stop above cut-out speed. Close and expect an automatic restart.', 'The turbines restart on their own as the gale eases.'],
    lesson: 'Turbines protect themselves in storms. Compare the stop with the met mast before suspecting a command.',
  },
  {
    id: 'fa-backup', title: 'Large data transfer out of the control center at night', short: 'Backup job', targets: ['scc', 'dmz'], feeders: [],
    alert: { asset: 'scc', src: 'Network monitor', text: '48 GB outbound SCADA-SRV → 10.20.5.10 · 01:00', why: 'Big night-time transfers deserve a look: backups and data theft look alike at first.' },
    clues: [
      { asset: 'dmz', src: 'Backup server', text: 'job NIGHTLY-SCADA completed · 48.2 GB · checksum OK', chips: ['Scheduled backup'], why: 'The scheduled backup moved exactly this much data.' },
      { asset: 'dmz', src: 'Asset inventory', text: '10.20.5.10 = BKP-01 (backup server, OT DMZ)', chips: ['Known destination'], why: 'The destination is your own backup server.' },
      { asset: 'scc', src: 'Scheduler', text: 'task NIGHTLY-SCADA · daily 01:00 · owner svc_backup', chips: ['Runs every night'], why: 'This job runs every night at 01:00.' },
    ],
    best: ['Match the transfer to the nightly backup and close', 'Known job, known destination, matching size. Close.', 'Closed. Tonight’s backup is safely stored.'],
    lesson: 'Know your normal: scheduled backups explain most big night-time transfers.',
  },
  {
    id: 'fa-newhire', title: 'Unknown user logged in to the HMI', short: 'New operator', targets: ['ctrl'], feeders: ['A', 'B'],
    alert: { asset: 'ctrl', src: 'Station HMI', text: 'first-ever login: ops_azlan', why: 'A first-time login is worth checking against HR and the roster.' },
    clues: [
      { asset: 'corp', src: 'HR system', text: 'Azlan bin Hamid · joined Monday · control room operator', chips: ['New hire'], why: 'HR shows a new operator.' },
      { asset: 'corp', src: 'Identity', text: 'account ops_azlan created by IAM team · ticket ACC-221', chips: ['Approved account'], why: 'The account was created through the normal process.' },
      { asset: 'ctrl', src: 'Badge system', text: 'ops_azlan badge IN · with supervisor ops_day', chips: ['On site with supervisor'], why: 'They are on site with their supervisor.' },
    ],
    best: ['Confirm with HR and the supervisor, then close', 'A new starter on shadow shift. Welcome them and close.', 'Closed. Azlan finishes his first shift.'],
    lesson: 'New accounts are normal when people join. Verify against HR and the roster, and remove accounts promptly when people leave.',
  },
  {
    id: 'fa-transformer-temp', title: 'Transformer T2 temperature alarm', short: 'Hot transformer', targets: ['yard'], feeders: ['A'],
    alert: { asset: 'yard', src: 'Transformer monitor', text: 'T2 top-oil 92 °C · ALARM (trip at 105 °C)', why: 'High temperature can be load, a cooling fault — or a tampered setpoint.' },
    clues: [
      { asset: 'scc', src: 'Load data', text: 'T2 at 118% load · heatwave evening peak', chips: ['Peak load'], why: 'The transformer is carrying a heavy evening load.' },
      { asset: 'yard', src: 'Cooling control', text: 'fans stage 2 running · pump P2 running', chips: ['Cooling working'], why: 'Cooling is running as designed.' },
      { asset: 'yard', src: 'Ambient sensor', text: 'ambient 36 °C', chips: ['Hot evening'], why: 'A hot evening explains the higher oil temperature.' },
    ],
    best: ['Treat it as heavy load: shift load and monitor', 'Transfer some load to T1 and keep watching. No security issue.', 'Load is balanced and T2 settles at 84 °C.'],
    lesson: 'Heat plus heavy load plus working cooling is an operations problem, not a security one.',
  },
  {
    id: 'fa-usb-approved', title: 'USB drive plugged into an engineering workstation', short: 'Approved USB', targets: ['ctrl'], feeders: ['A', 'B'],
    alert: { asset: 'ctrl', src: 'Endpoint agent', text: 'USB mass storage inserted on EWS-02', why: 'Removable media is a real risk, so every insertion gets checked.' },
    clues: [
      { asset: 'ctrl', src: 'Media kiosk', text: 'drive SN 4A7F scanned CLEAN · 2 files · signed', chips: ['Scanned at the kiosk'], why: 'The drive went through the scanning kiosk first.' },
      { asset: 'ctrl', src: 'Media register', text: 'drive SN 4A7F issued to eng_lim · relay settings file', chips: ['Registered drive'], why: 'It is a registered company drive.' },
      { asset: 'ctrl', src: 'EWS-02', text: 'file opened in relay config tool · no executable run', chips: ['Data file only'], why: 'Only a settings file was opened.' },
    ],
    best: ['Confirm the kiosk scan and register, then close', 'A registered, scanned drive with a settings file. Close.', 'Closed. The settings file is loaded for review.'],
    lesson: 'Removable media done right: registered drives, a scanning kiosk and a log of what was opened.',
  },
  {
    id: 'fa-scan-it', title: 'Port scan detected on the corporate network', short: 'IT vulnerability scan', targets: ['corp'], feeders: [],
    alert: { asset: 'corp', src: 'IDS', text: 'TCP scan from 10.10.9.5 → 1,200 hosts', why: 'Scans can be attacker reconnaissance or your own security team.' },
    clues: [
      { asset: 'corp', src: 'Asset inventory', text: '10.10.9.5 = VULN-SCAN-01 (IT security)', chips: ['Own scanner'], why: 'The source is your own vulnerability scanner.' },
      { asset: 'corp', src: 'Change management', text: 'CHG-3150 · quarterly vulnerability scan · {win}', chips: ['Scheduled scan'], why: 'The quarterly scan is scheduled now.' },
      { asset: 'dmz', src: 'IT/OT firewall', text: 'scanner traffic to OT DMZ: DENIED (policy)', chips: ['OT excluded'], why: 'The firewall kept the scan out of OT, as intended.' },
    ],
    best: ['Confirm it is the scheduled scanner and close', 'Your own scanner, on schedule, blocked from OT. Close.', 'Closed. The scan report arrives tomorrow.'],
    lesson: 'Keep an inventory of your own scanners so their traffic is easy to recognise.',
  },
  {
    id: 'fa-power-dip', title: 'Several station devices rebooted together', short: 'UPS changeover', targets: ['ctrl'], feeders: ['A', 'B'],
    alert: { asset: 'ctrl', src: 'Syslog', text: 'cold start: RTU-1, SW-3, HMI-2 within 5 s', why: 'Simultaneous reboots can mean a power problem or a coordinated action.' },
    clues: [
      { asset: 'ctrl', src: 'UPS', text: 'mains loss 0.4 s · changeover to battery · DC bus dip', chips: ['Power dip'], why: 'A brief power dip during the UPS changeover.' },
      { asset: 'ctrl', src: 'Facilities', text: 'auxiliary supply test by electrician · WO-560', chips: ['Planned test'], why: 'An electrician was testing the auxiliary supply.' },
      { asset: 'ctrl', src: 'RTU-1', text: 'config hash unchanged after restart', chips: ['Config intact'], why: 'Nothing was changed by the restarts.' },
    ],
    best: ['Link the reboots to the power test and close', 'The auxiliary supply test caused a dip. Raise a ticket to fix the UPS changeover.', 'Closed. Facilities book a UPS service.'],
    lesson: 'Devices that share power reboot together. Check facilities and UPS logs before assuming coordination.',
  },
  {
    id: 'fa-genset-start', title: 'Biogas genset G-501 restarted without an operator command', short: 'Auto-start', targets: ['biogas'], feeders: [],
    alert: { asset: 'biogas', src: 'Genset controller', text: 'G-501 START · no HMI command logged', why: 'A start with no operator command needs an explanation.' },
    clues: [
      { asset: 'biogas', src: 'PLC', text: 'gas holder level 92% · auto-start G-501 (high-level rule)', chips: ['Automatic rule'], why: 'The PLC restarts the genset automatically when gas storage is nearly full.' },
      { asset: 'biogas', src: 'Logic baseline', text: 'program checksum matches approved baseline', chips: ['Logic unchanged'], why: 'The PLC program is the approved version.' },
      { asset: 'scc', src: 'SCADA', text: 'Line 1 export +1.2 MW', chips: ['Expected export'], why: 'Extra export appeared exactly as expected.' },
    ],
    best: ['Confirm the automatic rule and close', 'Gas storage triggered the auto-start in approved logic. Close.', 'Closed. The extra gas earns revenue instead of being flared.'],
    lesson: 'Automation acts without people. Know the rules in your logic so automatic actions are not mistaken for intruders.',
  },
  {
    id: 'fa-flare', title: 'Flare burning at the biogas plant', short: 'Flare on', targets: ['biogas'], feeders: [],
    alert: { asset: 'biogas', src: 'Flame detector', text: 'FLARE ON · flow 180 Nm³/h', why: 'The flare lights when gas cannot be used. Find out why.' },
    clues: [
      { asset: 'biogas', src: 'Genset G-501', text: 'planned service stop · 4 h', chips: ['Genset in service'], why: 'One genset is stopped for service, so surplus gas goes to the flare.' },
      { asset: 'biogas', src: 'Maintenance plan', text: 'PM-77 · G-501 oil and spark plugs · today', chips: ['Planned maintenance'], why: 'The service is in the maintenance plan.' },
      { asset: 'biogas', src: 'Gas analyzer', text: 'CH₄ 61% · H₂S 40 ppm after scrubber', chips: ['Gas quality normal'], why: 'Gas quality is normal.' },
    ],
    best: ['Confirm the genset service and close', 'Flaring during planned maintenance is safe and expected. Close.', 'Closed. G-501 returns after its service.'],
    lesson: 'Flaring is the safe route for surplus gas. Tie it to the genset status before raising an alarm.',
  },
  {
    id: 'fa-firewall-rule', title: 'New firewall rule appeared on the IT/OT boundary', short: 'Firewall change', targets: ['dmz'], feeders: [],
    alert: { asset: 'dmz', src: 'Firewall audit', text: 'rule 112 added: HIST-01 → CORP-BI TCP/443', why: 'Boundary rule changes must always be checked.' },
    clues: [
      { asset: 'corp', src: 'Change management', text: 'CHG-3160 APPROVED · historian reports to BI dashboard', chips: ['Approved change'], why: 'The rule was requested and approved.' },
      { asset: 'dmz', src: 'Firewall', text: 'rule 112 · one-way · DMZ → IT only · expires in 90 days', chips: ['Narrow and expiring'], why: 'It is narrow, one-way and has an expiry date.' },
      { asset: 'corp', src: 'Security review', text: 'reviewed by sec_aina · risk LOW', chips: ['Reviewed'], why: 'Security reviewed it.' },
    ],
    best: ['Confirm the approved change and close', 'Narrow, one-way, reviewed and expiring. Close and diary the expiry review.', 'Closed. Dashboards start showing historian data.'],
    lesson: 'A good firewall change is approved, narrow, one-way and set to expire.',
  },
  {
    id: 'fa-cert', title: 'Certificate errors on the SCADA web console', short: 'Expired certificate', targets: ['scc'], feeders: [],
    alert: { asset: 'scc', src: 'Browser warnings', text: 'TLS: certificate expired · SCADA-WEB', why: 'Certificate warnings can mean interception — or just an expired certificate.' },
    clues: [
      { asset: 'scc', src: 'Certificate store', text: 'SCADA-WEB cert expired yesterday 23:59', chips: ['Expired, not replaced'], why: 'The certificate simply expired.' },
      { asset: 'scc', src: 'Fingerprint check', text: 'served cert fingerprint = registered cert', chips: ['Same certificate'], why: 'It is your own certificate, not a substitute.' },
      { asset: 'corp', src: 'Renewal queue', text: 'renewal ticket CRT-90 overdue', chips: ['Renewal overdue'], why: 'Renewal was overdue.' },
    ],
    best: ['Renew the certificate and close', 'Same certificate, just expired. Renew it and add an expiry alert.', 'Renewed in twenty minutes. Warnings disappear.'],
    lesson: 'Compare the fingerprint: same certificate means expiry, a different one means investigate.',
  },
  {
    id: 'fa-mall-load', title: 'Sudden load jump on Feeder D', short: 'Mall event', targets: ['townD'], feeders: ['D'],
    alert: { asset: 'townD', src: 'Feeder meter', text: 'Feeder D load +35% in 10 min', why: 'Large load swings are worth understanding.' },
    clues: [
      { asset: 'townD', src: 'Customer notice', text: 'Mutiara Avenue Mall · concert night · stage lighting', chips: ['Planned event'], why: 'The mall notified you of a concert.' },
      { asset: 'scc', src: 'Load forecast', text: 'Feeder D event peak forecast 19:00–23:00', chips: ['Forecast'], why: 'Planners expected the peak.' },
      { asset: 'yard', src: 'Feeder D relay', text: 'current within rating · no alarms', chips: ['Within limits'], why: 'The feeder is within its rating.' },
    ],
    best: ['Confirm the event and keep monitoring', 'A forecast concert peak within rating. Keep an eye on it.', 'The concert goes on. Load falls back after 23:00.'],
    lesson: 'Customers change their load. Forecasts and notices explain most swings.',
  },
  {
    id: 'fa-college-exam', title: 'Kolej Komuniti requests no outages this week', short: 'Exam week', targets: ['townC'], feeders: ['C'],
    alert: { asset: 'townC', src: 'Customer service', text: 'priority request: avoid Feeder C switching · exams', why: 'Not every alert is technical: some are about protecting customers.' },
    clues: [
      { asset: 'corp', src: 'Planning', text: 'Feeder C maintenance moved to next week', chips: ['Plan adjusted'], why: 'Planning already moved the maintenance.' },
      { asset: 'scc', src: 'SCADA', text: 'Feeder C flagged PRIORITY · switching needs supervisor', chips: ['Extra approval'], why: 'Switching now needs a supervisor.' },
      { asset: 'townC', src: 'College', text: 'exam schedule Mon–Fri 08:00–17:00', chips: ['Exam times'], why: 'The exam times are known.' },
    ],
    best: ['Acknowledge and confirm the priority flag', 'The flag and plan are in place. Close the request.', 'Exams run without interruption.'],
    lesson: 'Knowing which customers are sensitive, and when, is part of keeping the lights on.',
  },
  {
    id: 'fa-hospital-test', title: 'Hospital switched to its own generator', short: 'Hospital test', targets: ['townB'], feeders: ['B'],
    alert: { asset: 'townB', src: 'Feeder meter', text: 'Hospital load −1.4 MW instantly', why: 'A big customer suddenly dropping off the grid needs a check.' },
    clues: [
      { asset: 'townB', src: 'Hospital facilities', text: 'monthly generator test · 30 min · 10:00', chips: ['Monthly test'], why: 'The hospital tests its generator monthly.' },
      { asset: 'townB', src: 'Customer notice', text: 'test notified by email yesterday', chips: ['Notified'], why: 'They told you in advance.' },
      { asset: 'yard', src: 'Feeder B', text: 'breaker closed · voltage normal', chips: ['Grid side normal'], why: 'Your side of the supply is normal.' },
    ],
    best: ['Confirm the generator test and close', 'A notified monthly test. Expect the load back in 30 minutes.', 'The load returns at 10:30 as planned.'],
    lesson: 'Critical customers test their backup power. Keep their test calendar handy.',
  },
  {
    id: 'fa-rnd-beam', title: 'Rectenna output dropped to zero', short: 'Satellite pass', targets: ['rnd'], feeders: [],
    alert: { asset: 'rnd', src: 'R&D telemetry', text: 'rectenna DC output 0 kW', why: 'The test beam stopping could be a fault, a command or orbital mechanics.' },
    clues: [
      { asset: 'rnd', src: 'Ground station', text: 'satellite below 10° elevation · beam paused by design', chips: ['Out of view'], why: 'The beam pauses when the satellite is too low in the sky.' },
      { asset: 'rnd', src: 'Pass schedule', text: 'next acquisition in 38 min', chips: ['Scheduled'], why: 'The next pass is scheduled.' },
      { asset: 'rnd', src: 'TT&C link', text: 'link authenticated · last command 2 h ago', chips: ['No new commands'], why: 'No command was sent recently.' },
    ],
    best: ['Confirm the pass schedule and close', 'The satellite set below the horizon. The beam resumes on the next pass.', 'Output returns on the next pass.'],
    lesson: 'Know the physics of your system. Orbital passes and weather explain most gaps in a space power beam.',
  },
  {
    id: 'fa-relay-test', title: 'Protection relay reports a trip in bay 3', short: 'Relay testing', targets: ['yard'], feeders: ['A', 'B', 'C', 'D'],
    alert: { asset: 'yard', src: 'Relay 50-3', text: 'TRIP signal asserted · bay 3', why: 'Trip signals always get attention.' },
    clues: [
      { asset: 'yard', src: 'Relay 50-3', text: 'TEST mode · trip outputs blocked · injection test', chips: ['Bay in test'], why: 'The relay is in test mode; its trip cannot open a breaker.' },
      { asset: 'scc', src: 'SCADA master', text: 'bay 3 tagged OUT FOR TEST by ops_day', chips: ['Control room aware'], why: 'The control room tagged the bay.' },
      { asset: 'ctrl', src: 'Work order', text: 'WO-571 · 3-yearly relay test · test_team', chips: ['Planned test'], why: 'A routine relay test is planned.' },
    ],
    best: ['Confirm the relay test and close', 'Test mode, tagged bay, planned work order. Close.', 'Closed. The relay passes its test.'],
    lesson: 'Test mode, tags and work orders tell you when a trip signal is an exercise.',
  },
  {
    id: 'fa-config-backup', title: 'Mass configuration download from all relays', short: 'Config backup', targets: ['ctrl', 'yard'], feeders: ['A', 'B'],
    alert: { asset: 'ctrl', src: 'OT monitor', text: 'settings read from 24 IEDs by EWS-01', why: 'Reading every relay’s settings is either backup work or reconnaissance.' },
    clues: [
      { asset: 'ctrl', src: 'Backup tool', text: 'monthly config backup job · 24/24 OK', chips: ['Backup job'], why: 'It is the monthly configuration backup.' },
      { asset: 'ctrl', src: 'Scheduler', text: 'job CFG-MONTHLY · 1st of month 02:00 · svc_cfgbkp', chips: ['Runs monthly'], why: 'The job runs on the first of every month.' },
      { asset: 'ctrl', src: 'Baseline', text: 'all 24 settings match approved baselines', chips: ['No changes'], why: 'Nothing differs from the approved settings.' },
    ],
    best: ['Confirm the backup job and close', 'The monthly backup read every relay, and nothing changed. Close.', 'Closed. A fresh known-good copy is stored.'],
    lesson: 'Regular configuration backups look busy on the network. Recognise them so real reconnaissance stands out.',
  },
  {
    id: 'fa-dnp3-retry', title: 'Communication errors with the RTU', short: 'Radio link fade', targets: ['ctrl', 'scc'], feeders: ['A', 'B'],
    alert: { asset: 'scc', src: 'SCADA master', text: 'RTU-1 comms FAIL · 6 retries · then OK', why: 'Lost comms can be noise, a failing link or interference.' },
    clues: [
      { asset: 'scc', src: 'Radio link', text: 'signal −89 dBm · heavy rain fade', chips: ['Rain fade'], why: 'Heavy rain weakens the radio link.' },
      { asset: 'ctrl', src: 'RTU-1', text: 'no restart · no config change · buffers sent after reconnect', chips: ['No data lost'], why: 'The RTU buffered its data and sent it once reconnected.' },
      { asset: 'scc', src: 'Weather feed', text: 'heavy rain 40 mm/h', chips: ['Rain'], why: 'The rain matches.' },
    ],
    best: ['Log it as rain fade and close', 'Rain fade caused retries. Data buffered and recovered. Raise a link upgrade request.', 'Closed. A fibre backup is added to next year’s plan.'],
    lesson: 'Radio links fade in heavy rain. Buffers and retries are the design working.',
  },
  {
    id: 'fa-ntp-drift', title: 'Corporate login failures spike', short: 'Password expiry', targets: ['corp'], feeders: [],
    alert: { asset: 'corp', src: 'Identity', text: '220 failed logins in 30 min · 180 users', why: 'Login failure spikes can be password guessing or an expiry wave.' },
    clues: [
      { asset: 'corp', src: 'Identity policy', text: '90-day password expiry hit 180 accounts this morning', chips: ['Mass expiry'], why: 'Many passwords expired at the same time.' },
      { asset: 'corp', src: 'Help desk', text: '64 tickets: "my password stopped working"', chips: ['User reports'], why: 'Users are reporting it themselves.' },
      { asset: 'corp', src: 'Identity', text: 'failures from staff laptops on office Wi-Fi only', chips: ['Internal sources'], why: 'All failures come from staff devices inside the office.' },
    ],
    best: ['Confirm the expiry wave and close', 'An expiry wave from staff devices. Close and stagger expiry dates.', 'Closed. Help desk queue clears by lunch.'],
    lesson: 'Spread out password expiry dates so they do not hide real password-guessing attempts.',
  },
  {
    id: 'fa-camera', title: 'Perimeter camera offline at the switchyard', short: 'Camera fault', targets: ['yard'], feeders: ['A'],
    alert: { asset: 'yard', src: 'CCTV', text: 'CAM-07 (yard north) offline', why: 'Cameras going dark around critical equipment must be checked.' },
    clues: [
      { asset: 'yard', src: 'Facilities', text: 'CAM-07 power supply failed · replacement ordered', chips: ['Hardware fault'], why: 'Its power supply failed.' },
      { asset: 'yard', src: 'Guard patrol', text: 'north fence patrolled 21:00 · all secure', chips: ['Fence checked'], why: 'A guard patrolled the fence.' },
      { asset: 'yard', src: 'CAM-06, CAM-08', text: 'overlapping coverage online · no motion events', chips: ['Coverage kept'], why: 'Neighbouring cameras still cover the area.' },
    ],
    best: ['Confirm the fault and add patrols until fixed', 'A failed power supply with coverage kept. Add a patrol and close.', 'The camera is fixed next morning.'],
    lesson: 'Physical security matters in OT. Cover gaps with patrols while equipment is repaired.',
  },
  {
    id: 'fa-inverter-fw', title: 'Solar inverters rebooting one by one', short: 'Inverter update', targets: ['solar'], feeders: [],
    alert: { asset: 'solar', src: 'SCADA', text: 'inverter INV-01..22 restarting sequentially', why: 'Rolling restarts could be an update or something spreading.' },
    clues: [
      { asset: 'solar', src: 'Vendor portal', text: 'firmware 2.8.4 signed · staged rollout 1 inverter / 5 min', chips: ['Signed staged update'], why: 'A signed update rolled out one inverter at a time.' },
      { asset: 'corp', src: 'Change management', text: 'CHG-3171 APPROVED · inverter firmware · {win}', chips: ['Approved change'], why: 'The update is approved for now.' },
      { asset: 'solar', src: 'Export meter', text: 'export dip under 5% during rollout', chips: ['Small impact'], why: 'The staged rollout kept impact small.' },
    ],
    best: ['Confirm the approved rollout and close', 'A signed, approved, staged update. Close.', 'All inverters run the new firmware by lunchtime.'],
    lesson: 'Staged, signed and approved updates are how firmware changes should look.',
  },
  {
    id: 'fa-ews-av', title: 'Antivirus alert on the engineering workstation', short: 'Known false hit', targets: ['ctrl'], feeders: ['A', 'B'],
    alert: { asset: 'ctrl', src: 'Antivirus', text: 'EWS-01: suspicious behaviour · RelayConfig.exe', why: 'Antivirus alerts on an engineering workstation are always taken seriously.' },
    clues: [
      { asset: 'ctrl', src: 'File reputation', text: 'RelayConfig.exe signed by relay vendor · hash on allowlist', chips: ['Signed vendor tool'], why: 'It is the relay vendor’s signed tool.' },
      { asset: 'corp', src: 'Antivirus vendor', text: 'advisory: false positive in signature update 4411', chips: ['Known false hit'], why: 'The antivirus vendor confirmed a false positive.' },
      { asset: 'ctrl', src: 'EWS-01', text: 'no new processes · no network connections', chips: ['Nothing else odd'], why: 'Nothing else unusual happened.' },
    ],
    best: ['Confirm the vendor advisory and restore the tool', 'A known bad signature flagged a signed tool. Restore it from quarantine.', 'The engineer is back at work in ten minutes.'],
    lesson: 'Security tools make mistakes too. Signed binaries and vendor advisories help you close false hits fast.',
  },
  {
    id: 'fa-scrubber', title: 'H₂S reading rose after the scrubber', short: 'Scrubber media', targets: ['biogas'], feeders: [],
    alert: { asset: 'biogas', src: 'Gas analyzer', text: 'AIT-401 H₂S 310 ppm (limit 250)', why: 'High H₂S can damage the gensets. Find the cause.' },
    clues: [
      { asset: 'biogas', src: 'Maintenance log', text: 'scrubber media change due this week · 96% used', chips: ['Media exhausted'], why: 'The scrubber media is nearly used up.' },
      { asset: 'biogas', src: 'AIT-301', text: 'raw biogas H₂S 2,400 ppm · normal', chips: ['Inlet normal'], why: 'The gas going in is normal.' },
      { asset: 'biogas', src: 'Analyzer self-test', text: 'calibration check PASS', chips: ['Analyzer OK'], why: 'The analyzer itself is working.' },
    ],
    best: ['Schedule the media change and reduce genset load', 'Worn-out scrubber media. Bring the media change forward.', 'New media fitted; H₂S drops to 30 ppm.'],
    lesson: 'Consumables wear out. Check maintenance status before suspecting tampering.',
  },
  {
    id: 'fa-ops-handover', title: 'Operator logged in from two consoles at once', short: 'Shift handover', targets: ['scc'], feeders: ['A', 'B'],
    alert: { asset: 'scc', src: 'SCADA', text: 'ops_day active on CONSOLE-1 and CONSOLE-3', why: 'Concurrent sessions can mean a shared or stolen account.' },
    clues: [
      { asset: 'scc', src: 'Roster', text: 'shift handover 19:00 · ops_day staying 30 min', chips: ['Handover'], why: 'It is the shift handover.' },
      { asset: 'scc', src: 'Badge system', text: 'ops_day and ops_night both IN · control room', chips: ['Both on site'], why: 'Both operators are in the room.' },
      { asset: 'scc', src: 'CONSOLE-3', text: 'read-only alarm view · no controls', chips: ['View only'], why: 'The second session is view-only.' },
    ],
    best: ['Confirm the handover and close', 'A view-only session during handover. Remind staff to log out of spare consoles.', 'Closed. The handover finishes at 19:30.'],
    lesson: 'Shared or doubled sessions are worth checking. Here, the roster and badges explain it.',
  },
];

// alert/evidence times (seconds before the alarm) for templates
const AT = [-90, -600, -1500, -3000];

export function buildFalseAlarm(t) {
  const feederText = t.feeders.length ? `Feeder ${t.feeders.join(' + ')}` : 'the plant';
  const clue = (c, k) => ({
    asset: c.asset, src: c.src, at: AT[k] ?? -60, attack: false,
    text: c.text, chips: (c.chips || []).map(x => ({ t: x, tone: 'ok' })), why: c.why,
  });
  return {
    id: t.id, benign: true, title: t.title, short: t.short,
    inspired: 'Routine operations. Most OT alerts are faults, weather or authorised work — telling them apart quickly is the job.',
    blockedBy: null, targets: t.targets, conduits: [], impact: null,
    clues: [{ ...clue(t.alert, 0), chips: [] }, ...t.clues.map((c, k) => clue(c, k + 1))],
    responses: [
      { id: 'verify', tag: 'Close', q: 'best', cost: 0, title: t.best[0], desc: t.best[1], result: t.best[2] },
      { id: 'escalate', tag: 'Escalate', q: 'weak', cost: 15000, title: 'Escalate to the SOC for full forensics', desc: 'Pull images and logs from every system involved, just in case.', result: 'Forensics confirm what the evidence already showed. Analyst time spent and the case stays open a day.' },
      t.feeders.length
        ? { id: 'isolate', tag: 'Shutdown', q: 'overreact', cost: 25000, outage: { feeders: t.feeders, hours: 2 }, rel: -8, title: 'Isolate and de-energize until proven safe', desc: `Switch out ${feederText} and investigate.`, result: `You cut supply for something harmless. ${feederText} is off for two hours.` }
        : { id: 'isolate', tag: 'Shutdown', q: 'overreact', cost: 40000, rel: -6, title: 'Shut the affected system down until proven safe', desc: 'Stop the system and investigate before restarting.', result: 'A healthy system was stopped for nothing. Lost generation and a costly restart.' },
    ],
    timeout: 'Nobody decided. It was harmless, so nothing broke — but the alert sat open and the team lost time.',
    lesson: t.lesson,
  };
}

export const FALSE_ALARMS = FA.map(buildFalseAlarm);

// ---------- everyday background lines ----------
// One or more are mixed into every incident, so the same case never reads the same way twice.
export const NOISE = [
  { asset: 'ctrl', src: 'GPS clock', text: 'PTP sync OK · offset 42 ns', why: 'Routine time-sync status.' },
  { asset: 'ctrl', src: 'Station HMI', text: 'alarm list acknowledged by ops_day', why: 'An operator acknowledging alarms is normal work.' },
  { asset: 'scc', src: 'SCADA master', text: 'integrity poll RTU-1 · 312 points · OK', why: 'The regular data poll every station receives.' },
  { asset: 'scc', src: 'Historian', text: 'replication lag 1.8 s · normal', why: 'Normal replication delay.' },
  { asset: 'dmz', src: 'Antivirus', text: 'definitions updated · version 4412', why: 'Routine signature update.' },
  { asset: 'dmz', src: 'Patch server', text: 'catalog sync completed · 0 approvals pending', why: 'Routine patch catalogue sync.' },
  { asset: 'corp', src: 'Email gateway', text: 'daily spam digest sent to 1,180 users', why: 'Routine email housekeeping.' },
  { asset: 'corp', src: 'Identity', text: 'user ops_night password changed (self-service)', why: 'Users change their own passwords all the time.' },
  { asset: 'yard', src: 'Transformer monitor', text: 'T1 top-oil 61 °C · normal', why: 'Normal transformer temperature.' },
  { asset: 'yard', src: 'Battery charger', text: 'DC 125 V · float charge · OK', why: 'Station battery is healthy.' },
  { asset: 'biogas', src: 'PLC', text: 'mixer M-201 run hours 1,204 · OK', why: 'Routine run-hours counter.' },
  { asset: 'biogas', src: 'Gas analyzer', text: 'auto-calibration PASS', why: 'Daily analyzer self-calibration.' },
  { asset: 'wind', src: 'WTG-2', text: 'yaw alignment adjusted to wind 214°', why: 'Turbines turn to face the wind automatically.' },
  { asset: 'solar', src: 'Inverter INV-07', text: 'MPPT tracking · efficiency 98.1%', why: 'Normal inverter operation.' },
  { asset: 'rnd', src: 'Ground station', text: 'dish tracking satellite · elevation 42°', why: 'The dish follows the satellite automatically.' },
  { asset: 'ctrl', src: 'Badge system', text: 'cleaner badge IN · control house lobby', why: 'Cleaning staff on their usual round.' },
  { asset: 'dmz', src: 'Backup server', text: 'retention cleanup · 14 old snapshots removed', why: 'Routine backup housekeeping.' },
  { asset: 'scc', src: 'Weather feed', text: 'forecast updated · light winds', why: 'Routine weather update.' },
  { asset: 'townB', src: 'Feeder B meter', text: 'hospital load 2.1 MW · normal', why: 'Normal customer load.' },
  { asset: 'townA', src: 'Feeder A meter', text: 'residential load following evening curve', why: 'Normal daily load pattern.' },
];

// ---------- random plant events ----------
// Applied by game.js between incidents. effect fields: funds, rel, demand {mult, hours}, outage {feeders, hours}, audit.
export const PLANT_EVENTS = [
  { id: 'storm', icon: 'zap', title: 'Thunderstorm over Bukit Mutiara', text: 'Lightning trips Feeder A for 30 minutes before it auto-recloses.', kind: 'bad', outage: { feeders: ['A'], hours: 0.5 }, rel: -3 },
  { id: 'heatwave', icon: 'sun', title: 'Heatwave', text: 'Air-conditioning load is up 20% for the next 6 hours: more revenue, more stress on the transformers.', kind: 'warn', demand: { mult: 1.2, hours: 6 }, rel: -2 },
  { id: 'audit', icon: 'shield', title: 'Regulator spot audit', text: 'The energy regulator checks your security controls.', kind: 'warn', audit: true },
  { id: 'budgetcut', icon: 'coins', title: 'Head office budget cut', text: 'Finance claws back $60K from the security budget.', kind: 'bad', funds: -60000 },
  { id: 'grant', icon: 'coins', title: 'Government resilience grant', text: 'A national grid-resilience grant pays $80K into your budget.', kind: 'good', funds: 80000 },
  { id: 'festival', icon: 'bag', title: 'Festival at Mutiara Avenue Mall', text: 'A weekend festival lifts demand by 10% for 4 hours.', kind: 'good', demand: { mult: 1.1, hours: 4 } },
  { id: 'ageing', icon: 'alert', title: 'Ageing switchgear', text: 'An old breaker needs early refurbishment: $35K.', kind: 'bad', funds: -35000, rel: -2 },
  { id: 'training', icon: 'trophy', title: 'Team training day', text: 'Your operators finish an incident-response course. Reliability +3.', kind: 'good', rel: 3 },
];
