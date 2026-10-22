// Game loop, economy, incidents and all HUD/panel UI.
import { World } from './world.js';
import { ASSETS, CONDUITS, CONTROLS, SCENARIOS, QUESTS, CHAPTERS, FEEDERS, PURDUE, SITE, PROCESS, INSTRUMENTS, instrumentRisk, HONEYPOT } from './data.js';
import { icon, hydrateIcons } from './icons.js';
import { FALSE_ALARMS, NOISE, PLANT_EVENTS } from './events.js';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const money = v => {
  const sign = v < 0 ? '-' : '';
  v = Math.abs(v);
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${sign}$${Math.round(v / 1e3)}K`;
  return `${sign}$${Math.round(v)}`;
};
const clockOf = T => { const m = ((Math.floor(T) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const clockSec = sec => { const s = ((Math.floor(sec) % 86400) + 86400) % 86400; return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const dayOf = T => Math.floor(T / 1440) + 1;
const hourOf = T => (T % 1440) / 60;
const dur = mins => { mins = Math.max(0, Math.round(mins)); const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h}h ${pad(m)}m` : `${m}m`; };
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const CTRL = Object.fromEntries(CONTROLS.map(c => [c.id, c]));

const GAME_MIN_PER_SEC = 2;   // at 1×
const REV_PER_MIN = 230;      // $ per game minute at full load
const BASE_DECIDE = 150;      // seconds to decide on an incident
const INST = Object.fromEntries(INSTRUMENTS.map(i => [i.tag, i]));
const FEEDER_OF = Object.fromEntries(Object.entries(FEEDERS).map(([f, F]) => [F.asset, f]));
const ALL_SCENARIOS = [...SCENARIOS, ...FALSE_ALARMS];
const scnById = id => ALL_SCENARIOS.find(sc => sc.id === id);
// repair bill when a missed attack damages equipment (by asset); others use DAMAGE_DEFAULT
const REPAIR = { yard: 150000, biogas: 180000, wind: 200000, solar: 120000, ctrl: 90000, scc: 80000, dmz: 60000, corp: 50000 };
const DAMAGE_ORDER = ['yard', 'biogas', 'wind', 'solar', 'ctrl', 'scc', 'dmz', 'corp'];
const DAMAGE_DEFAULT = 60000;

// ---------- state ----------
const S = {
  started: false, over: false,
  T: 7 * 60, speed: 1,
  funds: 1000000, reliability: 80, xp: 0, streak: 0,
  damaged: {},                       // asset id -> { cost } until repaired
  boost: { mult: 1, until: 0 },      // temporary demand change from plant events
  nextEventAt: 11 * 60 + Math.floor(Math.random() * 180),
  owned: new Set(),
  feeders: Object.fromEntries(Object.keys(FEEDERS).map(f => [f, { on: true, until: 0 }])),
  incident: null,
  nextIncidentAt: 8 * 60 + 45 + Math.floor(Math.random() * 90), // first alert lands somewhere 08:45–10:15
  recent: [],
  deck: [],
  history: [],
  alerts: [], unread: 0,
  stats: { revenue: 0, fines: 0, spent: 0, response: 0, outageMin: 0, prevented: 0, customerMin: 0 },
  questIdx: 0, seen: new Set(),
  panel: null, light: 'auto', sound: true, netVisible: true, spin: false,
  player: '',
};

// ---------- sound ----------
const Snd = {
  ctx: null,
  init() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } },
  tone(f, d = 0.12, type = 'sine', v = 0.05, when = 0) {
    if (!S.sound || !this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + d + 0.05);
  },
  alarm() { for (let i = 0; i < 3; i++) { this.tone(880, 0.17, 'square', 0.035, i * 0.42); this.tone(660, 0.17, 'square', 0.035, i * 0.42 + 0.21); } },
  click() { this.tone(560, 0.06, 'triangle', 0.05); },
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.28, 'sine', 0.05, i * 0.09)); },
  bad() { [330, 247].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.025, i * 0.18)); },
};

// ---------- world ----------
const world = new World($('#scene'));
world.buildNetwork(CONDUITS);
world.onPick = id => (id === 'researcher' ? openResearcher() : openAsset(id));
world.controls.addEventListener('start', () => { if (S.spin) setSpin(false); if (S.started) questEvent('camera'); });

// ---------- derived values ----------
const securityLevel = () => Math.min(4, 1 + Math.floor(S.owned.size / 3));
const demand = h => 0.58 + 0.22 * Math.exp(-((h - 9) ** 2) / 6) + 0.38 * Math.exp(-((h - 19) ** 2) / 5) - (h < 5 ? 0.16 : 0);
const daylight = () => {
  if (S.light === 'day') return 1;
  if (S.light === 'night') return 0;
  const h = hourOf(S.T);
  return smooth(5, 7.5, h) * (1 - smooth(18, 20.5, h));
};
// the hour the sun, sky and image lighting are drawn for: forced Day / Night override the game clock,
// otherwise a "day" at 22:00 keeps a black sky and moonlight
const lightHour = () => {
  const h = hourOf(S.T);
  if (S.light === 'day') return h >= 8 && h <= 16.5 ? h : 12;
  if (S.light === 'night') return h >= 20.5 || h < 4.5 ? h : 22;
  return h;
};
const isBlocked = scn => !!scn.blockedBy && S.owned.has(scn.blockedBy);
// later days give less time to decide (down to 60% of the base) and mix in more background noise
const dayPressure = () => Math.max(0.6, 1 - 0.08 * (dayOf(S.T) - 1));
const decideTime = () => Math.round(BASE_DECIDE * dayPressure()) + (S.owned.has('ids') ? 60 : 0) + (S.owned.has('honeypot') ? 30 : 0);
const noiseLines = () => Math.min(4, 1 + Math.floor((dayOf(S.T) - 1) / 2)) + (Math.random() < 0.5 ? 1 : 0);

function conduitState(c) {
  if (c.exposedUntil) return S.owned.has(c.exposedUntil) ? 'hidden' : 'exposed';
  if (c.guard && !S.owned.has(c.guard)) return 'weak';
  return 'ok';
}
function refreshConduits() {
  const attack = S.incident ? S.incident.scn.conduits : [];
  for (const c of CONDUITS) {
    const st = conduitState(c);
    world.setConduit(c.id, st === 'hidden' ? 'hidden' : attack.includes(c.id) ? 'attack' : st);
  }
  world.setModem(!S.owned.has('surface'));
}

function assetStatus(id) {
  const inc = S.incident;
  if (inc && inc.scn.targets.includes(id)) return { text: 'Alert under investigation', cls: 'alert' };
  if (S.damaged[id]) return { text: `Damaged · repair ${money(S.damaged[id].cost)}`, cls: 'off' };
  const f = FEEDER_OF[id];
  if (f) {
    const st = S.feeders[f];
    return st.on ? { text: `Energized · ${FEEDERS[f].label}`, cls: 'ok' } : { text: `De-energized · ${dur(st.until - S.T)} left`, cls: 'off' };
  }
  if (id === 'yard') {
    const off = Object.keys(FEEDERS).filter(k => !S.feeders[k].on);
    return off.length ? { text: `Feeder ${off.join(' + ')} breaker open`, cls: 'warn' } : { text: 'All breakers closed', cls: '' };
  }
  if (id === 'ctrl' && !S.owned.has('surface')) return { text: 'L2 · Station control', cls: '' };
  return { text: ASSETS[id].level, cls: '' };
}

// ---------- labels & pins ----------
const labelsEl = $('#labels');
const labelEls = {};
for (const [id, a] of Object.entries(ASSETS)) {
  const el = document.createElement('button');
  el.className = 'label';
  el.dataset.act = `asset:${id}`;
  el.innerHTML = `<span class="l-ic">${icon(a.icon)}</span><span><b>${esc(a.name)}</b><small></small></span>`;
  labelsEl.appendChild(el);
  labelEls[id] = el;
}
let pinEls = {};

const meEl = document.createElement('div');
meEl.className = 'me';
meEl.dataset.act = 'rename';
meEl.title = 'Change your name';
const NAME_KEY = 'onsa.playerName';
function renderMe() { meEl.innerHTML = `<b>${esc(S.player || 'You')}</b><small>OT Security Lead · ${esc(SITE.utility)}</small>`; }
function setPlayerName(name) {
  S.player = name.trim().slice(0, 24);
  try { localStorage.setItem(NAME_KEY, S.player); } catch { /* storage unavailable */ }
  renderMe();
}
try { S.player = localStorage.getItem(NAME_KEY) || ''; } catch { S.player = ''; }
renderMe();
labelsEl.appendChild(meEl);

const npcEl = document.createElement('button');
npcEl.className = 'me npc';
npcEl.dataset.act = 'researcher';
npcEl.innerHTML = `<b>${esc(SITE.researcher)}</b><small>Researcher · SBSP · ONSA R&amp;D</small>`;
labelsEl.appendChild(npcEl);

const hpEl = document.createElement('div');
hpEl.className = 'itag hp';
hpEl.textContent = 'HONEYPOT · RTU-99 (decoy)';
labelsEl.appendChild(hpEl);

const lineEls = world.lineTags.map(({ text, pos }) => {
  const el = document.createElement('div');
  el.className = 'itag line';
  el.textContent = text;
  labelsEl.appendChild(el);
  return { el, pos };
});

const instEls = world.instruments.map(({ tag, pos }) => {
  const el = document.createElement('button');
  el.className = 'itag';
  el.dataset.act = `inst:${tag}`;
  el.textContent = tag;
  labelsEl.appendChild(el);
  return { el, pos };
});

function refreshLabels() {
  for (const id of Object.keys(ASSETS)) {
    const st = assetStatus(id);
    const el = labelEls[id];
    el.className = `label ${st.cls}`;
    el.querySelector('small').textContent = st.text;
  }
}

function buildPins() {
  for (const el of Object.values(pinEls)) el.remove();
  pinEls = {};
  if (!S.incident) return;
  for (const id of new Set(S.incident.scn.clues.map(c => c.asset))) {
    const el = document.createElement('button');
    el.className = 'pin';
    el.dataset.act = `clues:${id}`;
    labelsEl.appendChild(el);
    pinEls[id] = el;
  }
  refreshPins();
}
function refreshPins() {
  if (!S.incident) return;
  const { scn, tags, fps } = S.incident;
  for (const [id, el] of Object.entries(pinEls)) {
    const idx = scn.clues.map((c, i) => (c.asset === id ? i : -1)).filter(i => i >= 0);
    const t = idx.filter(i => tags.has(i) || fps.has(i)).length;
    el.innerHTML = `${icon('search')} ${t}/${idx.length}`;
  }
}

function positionOverlays() {
  const me = world.project(world.personaAnchor());
  meEl.style.display = me.vis ? '' : 'none';
  meEl.style.transform = `translate(${me.x}px, ${me.y}px) translate(-50%, -100%)`;
  const near = world.controls.target.distanceTo(world.centers.biogas) < 45 && world.camera.position.distanceTo(world.centers.biogas) < 140;
  const rp = world.project(world.researcherAnchor());
  npcEl.style.display = rp.vis ? '' : 'none';
  npcEl.style.transform = `translate(${rp.x}px, ${rp.y}px) translate(-50%, -100%)`;
  const hpp = world.honeypot.visible && world.project(world.honeypotAnchor());
  hpEl.style.display = hpp && hpp.vis ? '' : 'none';
  if (hpp) hpEl.style.transform = `translate(${hpp.x}px, ${hpp.y}px) translate(-50%, -100%)`;
  const lineNear = world.camera.position.distanceTo(world.controls.target) < 260;
  for (const { el, pos } of lineEls) {
    const p = lineNear && world.project(pos);
    if (!p || !p.vis) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
  for (const { el, pos } of instEls) {
    const p = near && world.project(pos);
    if (!p || !p.vis) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
  for (const [id, el] of Object.entries(labelEls)) {
    const p = world.project(world.anchors[id]);
    if (!p.vis) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
  for (const [id, el] of Object.entries(pinEls)) {
    const p = world.project(world.anchors[id]);
    if (!p.vis) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${p.x}px, ${p.y - 44}px) translate(-50%, -100%)`;
  }
}

// ---------- HUD ----------
const RANKS = ['Trainee', 'Analyst', 'Responder', 'Defender', 'Guardian', 'Grid Sentinel'];
function renderHUD() {
  $('#funds').textContent = money(S.funds);
  $('#funds').style.color = S.funds < 0 ? 'var(--red)' : '';
  $('#day').textContent = `Day ${dayOf(S.T)}`;
  $('#clock').textContent = clockOf(S.T);
  const rel = Math.round(S.reliability);
  $('#rel-val').textContent = rel;
  const fg = $('#rel .fg');
  fg.style.strokeDasharray = `${rel} 100`;
  fg.style.stroke = rel >= 75 ? 'var(--lime)' : rel >= 50 ? 'var(--amber)' : 'var(--red)';
  const sl = securityLevel();
  $('#sl').textContent = sl;
  $('#sec').title = `Security level ${sl} · ${S.owned.size}/${CONTROLS.length} controls`;
  const soon = S.nextIncidentAt - S.T;
  const [level, text] = S.incident ? ['active', 'Active incident'] : soon < 60 ? ['high', 'High'] : soon < 120 ? ['elevated', 'Elevated'] : ['guarded', 'Guarded'];
  $('#threat').dataset.level = level;
  $('#chip-threat').textContent = text;
  // operator card: rank and XP progress (a level every 250 XP)
  const lvl = Math.floor(S.xp / 250) + 1;
  $('#op-name').textContent = S.player || 'Operator';
  $('#op-level').textContent = lvl;
  $('#op-rank').textContent = RANKS[Math.min(lvl - 1, RANKS.length - 1)] + (S.streak > 1 ? ` · streak ×${S.streak}` : '');
  $('#op-xp').style.width = `${((S.xp % 250) / 250) * 100}%`;
  $('#chip-hold').hidden = !S.incident;
  $('#soc-dot').hidden = !S.incident;
  const ac = $('#alert-count');
  ac.hidden = !S.unread;
  ac.textContent = S.unread > 9 ? '9+' : S.unread;
  document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.speed === S.speed));
  document.querySelectorAll('.dock button[data-act]').forEach(b => b.classList.toggle('on', S.panel && b.dataset.act === `panel:${S.panel.name}`));
  refreshLabels();
}

function renderBanner() {
  const b = $('#banner');
  const inc = S.incident;
  if (!inc) { b.hidden = true; return; }
  b.hidden = false;
  const left = Math.max(0, Math.ceil(inc.left));
  b.classList.toggle('urgent', left <= 30);
  b.innerHTML = `
    <div class="b-ic">${icon('alert')}</div>
    <div class="b-tx"><small>${inc.drill ? 'Drill · ' : ''}Security alert · triage now</small><b>${esc(inc.scn.title)}</b>
      <span class="b-sub">${classified(inc)}/${inc.scn.clues.length} detections classified · clock held${S.speed === 0 ? ' · paused' : ''}</span></div>
    <div class="decide"><small>Decide in</small><b>${pad(Math.floor(left / 60))}:${pad(left % 60)}</b></div>`;
}

function renderAction() {
  const el = $('#action');
  if (S.incident) {
    const inc = S.incident;
    el.innerHTML = `<div class="card inc-card">
      <p>Tap the magnifier pins to read what each system logged. Mark each line True Positive or False Positive, then respond or remediate.</p>
      <div class="row"><button class="btn" data-act="clues">${icon('search')} Detection ${classified(inc)}/${inc.scn.clues.length}</button>
      <button class="btn primary" data-act="respond">${icon('cards')} Respond or Remediate</button></div></div>`;
    return;
  }
  const q = QUESTS[S.questIdx];
  if (!q) {
    el.innerHTML = `<div class="card quest"><div class="q-top"><small>Sandbox · all chapters complete</small></div>
      <div class="q-row" style="margin-top:8px"><span class="q-ic" style="background:var(--mint);color:var(--mint-ink)">${icon('check')}</span>
      <div class="grow"><b>Station hardened</b><p>Keep running shifts, or run drills from the SOC panel to train your team.</p></div>
      <button class="q-go" data-act="panel:soc">${icon('arrow')}</button></div></div>`;
    return;
  }
  const inCh = QUESTS.map((x, i) => ({ x, i })).filter(o => o.x.ch === q.ch);
  const pos = inCh.findIndex(o => o.i === S.questIdx);
  el.innerHTML = `<div class="card quest">
    <div class="q-top"><small>Chapter ${pad(q.ch + 1)} · ${esc(CHAPTERS[q.ch])}</small><small>${pos}/${inCh.length}</small></div>
    <div class="q-bar">${inCh.map((o, k) => `<i class="${k < pos ? 'done' : ''}"></i>`).join('')}</div>
    <div class="q-row"><span class="q-ic">${icon(q.icon)}</span>
      <div class="grow"><small>Next step</small><b>${esc(q.title)}</b><p>${esc(q.desc)}</p></div>
      <button class="q-go" data-act="quest" title="Do it">${icon('arrow')}</button></div></div>`;
}

// ---------- alerts & toasts ----------
function toast(msg, kind = 'good', ic) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(ic || (kind === 'good' ? 'check' : kind === 'bad' ? 'alert' : 'bell'))}<span>${msg}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4200);
}
function alertLog(text, kind = 'info') {
  S.alerts.unshift({ text, kind, day: dayOf(S.T), clock: clockOf(S.T) });
  if (S.alerts.length > 80) S.alerts.pop();
  if (S.panel?.name === 'alerts') renderPanel(); else S.unread++;
}

// ---------- quests ----------
function questEvent(ev) {
  S.seen.add(ev);
  checkQuests();
}
function checkQuests() {
  if (securityLevel() >= 3) S.seen.add('sl3');
  if (S.owned.size) S.seen.add('buy');
  let changed = false;
  while (QUESTS[S.questIdx] && S.seen.has(QUESTS[S.questIdx].event)) {
    const q = QUESTS[S.questIdx];
    S.questIdx++;
    changed = true;
    if (q.reward) S.funds += q.reward;
    toast(`Quest complete: ${esc(q.title)}${q.reward ? ` · +${money(q.reward)}` : ''}`, 'good', 'flag');
    const next = QUESTS[S.questIdx];
    if (next && next.ch !== q.ch) toast(`Chapter ${pad(next.ch + 1)} unlocked: ${esc(CHAPTERS[next.ch])}`, 'good', 'flag');
  }
  if (changed) { Snd.good(); renderAction(); renderHUD(); if (S.panel?.name === 'quests') renderPanel(); }
}
function questAction() {
  const q = QUESTS[S.questIdx];
  if (!q) return;
  const [a, arg] = q.action.split(':');
  if (a === 'rotate') { world.rotate(45); questEvent('camera'); }
  else if (a === 'asset') { openAsset(arg); }
  else if (a === 'panel') openPanel(arg);
  else if (a === 'incident') { if (!S.incident) triggerScheduled(true); }
  else if (a === 'speed') setSpeed(4);
}

// ---------- time & economy ----------
function setSpeed(v) {
  S.speed = v;
  renderHUD();
  renderBanner();
}

function advance(gm) {
  const prevDay = dayOf(S.T);
  S.T += gm;
  const h = hourOf(S.T);
  const served = Object.entries(FEEDERS).reduce((sum, [f, F]) => sum + (S.feeders[f].on ? F.share : 0), 0);
  const damagedCount = Object.keys(S.damaged).length;
  const boost = S.T < S.boost.until ? S.boost.mult : 1;
  const rev = REV_PER_MIN * demand(h) * served * gm * boost * Math.max(0.7, 1 - 0.08 * damagedCount);
  S.funds += rev;
  S.stats.revenue += rev;

  let allOn = true;
  for (const [f, st] of Object.entries(S.feeders)) {
    if (st.on) continue;
    allOn = false;
    S.stats.outageMin += gm;
    S.stats.customerMin += gm * FEEDERS[f].customers;
    S.reliability = clamp(S.reliability - 0.01 * gm, 0, 100);
    if (S.T >= st.until) {
      st.on = true;
      world.setFeeder(f, true);
      toast(`Feeder ${f} re-energized`, 'good', 'zap');
      alertLog(`Feeder ${f} re-energized after restoration.`, 'good');
    }
  }
  if (damagedCount) S.reliability = clamp(S.reliability - 0.006 * damagedCount * gm, 0, 100);
  else if (allOn) S.reliability = clamp(S.reliability + 0.004 * gm, 0, 100);

  if (dayOf(S.T) > prevDay) {
    const opex = CONTROLS.filter(c => S.owned.has(c.id)).reduce((s, c) => s + c.opex, 0);
    S.funds -= opex;
    S.stats.spent += opex;
    alertLog(`Day ${dayOf(S.T)} begins.${opex ? ` Security opex ${money(opex)}.` : ''}`);
    toast(`Day ${dayOf(S.T)} begins${opex ? ` · opex −${money(opex)}` : ''}`, 'warn', 'sun');
    questEvent('day2');
  }
  if (S.T >= S.nextIncidentAt) triggerScheduled(false);
  if (!S.incident && S.T >= S.nextEventAt) plantEvent();
  if (S.funds < -250000 && !S.over) gameOver();
}

// ---------- incidents ----------
// Every session deals the scenarios in a fresh random order; a full round plays before any repeats.
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function pickScenario(first) {
  if (!S.deck.length) {
    const alarms = shuffle(FALSE_ALARMS.map(sc => sc.id)).slice(0, 5);
    S.deck = shuffle([...SCENARIOS.map(sc => sc.id), ...alarms]);
    if (S.deck[0] === S.recent[0]) S.deck.push(S.deck.shift()); // no back-to-back repeat across rounds
  }
  const byId = scnById;
  let id = S.deck[0];
  if (first) id = S.deck.find(d => !byId(d).benign && !isBlocked(byId(d))) || id; // open with a real, unprevented attack
  S.deck.splice(S.deck.indexOf(id), 1);
  return byId(id);
}

function triggerScheduled(now) {
  if (S.incident) return;
  const first = !S.history.some(h => !h.drill);
  const scn = pickScenario(first);
  S.recent = [scn.id, ...S.recent].slice(0, 2);
  if (isBlocked(scn)) {
    S.stats.prevented++;
    S.reliability = clamp(S.reliability + 2, 0, 100);
    S.xp += 25;
    toast(`Prevented by ${esc(CTRL[scn.blockedBy].short)}: ${esc(scn.prevented)}`, 'good', 'shield');
    alertLog(`PREVENTED (${CTRL[scn.blockedBy].short}): ${scn.prevented}`, 'good');
    S.nextIncidentAt = S.T + rand(45, 90);
    questEvent('prevent');
    renderHUD();
    return;
  }
  startIncident(scn, false);
}

// With the honeypot installed, every incident gets one extra log line from the decoy.
function withHoneypot(scn) {
  if (!S.owned.has('honeypot')) return scn;
  const hp = HONEYPOT[scn.id];
  const asset = scn.targets.includes('ctrl') ? 'ctrl' : scn.targets[0];
  const first = Math.min(...scn.clues.map(c => c.at));
  const clue = hp
    ? {
      asset, src: 'Honeypot RTU-99 (decoy)', at: first + 40, attack: true,
      text: `connection from ${hp[0]}\n${hp[1]} · decoy has no legitimate users`,
      chips: [{ t: 'Honeypot tripped' }, { t: 'Zero false positives', tone: 'ok' }],
      why: 'A honeypot is a decoy that nobody legitimate uses, so any touch is an attacker exploring the network. It is one of the earliest, most trustworthy warnings you can get.',
      ttp: 'T0846 Remote System Discovery',
    }
    : {
      asset, src: 'Honeypot RTU-99 (decoy)', at: -60, attack: false,
      text: 'no connections in the last 30 days · decoy quiet',
      chips: [{ t: 'Honeypot quiet', tone: 'ok' }],
      why: 'The decoy saw nothing. Attackers exploring the network usually trip it, so a quiet honeypot supports this being authorised work.',
    };
  return { ...scn, clues: [...scn.clues, clue] };
}

// everyday log lines that have nothing to do with the case, so no two incidents read the same way
function withNoise(scn) {
  const picks = shuffle([...NOISE]).slice(0, noiseLines());
  const lines = picks.map(nz => ({ ...nz, at: -Math.round(rand(20, 1800)), attack: false, chips: [] }));
  return { ...scn, clues: [...scn.clues, ...lines] };
}

function startIncident(base, drill) {
  if (S.incident) return;
  const scn = withNoise(withHoneypot(base));
  const tripped = scn.clues.some(c => c.src.startsWith('Honeypot') && c.attack);
  if (tripped) { if (!drill) S.stats.hpTrips = (S.stats.hpTrips || 0) + 1; world.setHoneypotAlarm(true); toast('Honeypot RTU-99 tripped — something is exploring the OT network', 'bad', 'target'); }
  const total = decideTime();
  S.incident = { scn, drill, tags: new Set(), fps: new Set(), left: total, total, startT: S.T, filter: 'all', clueOrder: shuffle(scn.clues.map((_, i) => i)) };
  world.setAttacked(scn.targets);
  refreshConduits();
  buildPins();
  Snd.alarm();
  alertLog(`${drill ? 'DRILL — ' : ''}Security alert: ${scn.title}`, 'bad');
  renderBanner();
  renderAction();
  renderHUD();
  openPanel('clues', 'all');
}

function clueTime(c) {
  return clockSec(S.incident.startT * 60 + c.at);
}
function clueText(c) {
  const h = Math.floor(hourOf(S.incident.startT));
  return c.text.replace('{win}', `${pad((h + 23) % 24)}:00–${pad((h + 2) % 24)}:00`);
}

const classified = inc => inc.tags.size + inc.fps.size;

// mark a clue True Positive (part of the attack) or False Positive (benign); clicking again clears it
function markClue(i, kind) {
  const inc = S.incident;
  if (!inc) return;
  const [mine, other] = kind === 'tp' ? [inc.tags, inc.fps] : [inc.fps, inc.tags];
  other.delete(i);
  if (mine.has(i)) mine.delete(i); else mine.add(i);
  Snd.click();
  const el = document.querySelector(`.clue[data-i="${i}"]`);
  if (el) el.outerHTML = clueHTML(inc.scn.clues[i], i);
  $('#sheet-eyebrow').textContent = cluesEyebrow();
  refreshPins();
  renderBanner();
  renderAction();
}

const LETTERS = ['A', 'B', 'C', 'D', 'F'];
const letterOf = s => (s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F');

function resolve(resp) {
  const inc = S.incident;
  if (!inc) return;
  const scn = inc.scn;
  const q = resp ? resp.q : 'timeout';
  const attackIdx = scn.clues.map((c, i) => (c.attack ? i : -1)).filter(i => i >= 0);
  const hit = attackIdx.filter(i => inc.tags.has(i)).length;          // attack lines called True Positive
  const fp = [...inc.tags].filter(i => !scn.clues[i].attack).length;  // noise wrongly called True Positive
  const fpOk = [...inc.fps].filter(i => !scn.clues[i].attack).length; // noise correctly called False Positive
  const miss = [...inc.fps].filter(i => scn.clues[i].attack).length;  // attack lines wrongly dismissed
  const n = attackIdx.length, m = scn.clues.length - n;

  const respPts = scn.benign
    ? { best: 60, weak: 24, overreact: 8, timeout: 20 }[q] ?? 20
    : { best: 60, good: 42, weak: 20, overreact: 12, ignore: 0, timeout: 0 }[q];
  const cluePts = (30 * Math.max(0, hit + fpOk - 0.5 * (fp + miss))) / scn.clues.length;
  const timePts = resp ? (10 * inc.left) / inc.total : 0;
  const score = Math.round(respPts + cluePts + timePts);
  let grade = letterOf(score);
  let cap = null, note = null;
  if (!scn.benign && (q === 'ignore' || q === 'timeout')) {
    cap = 'D';
    note = q === 'timeout'
      ? 'No decision was made while the attack ran. Indecision is a decision — and caps the shift at D.'
      : 'A security incident was handled as a routine fault. That is how attacks become outages — it caps the shift at D.';
  } else if (q === 'overreact') {
    cap = 'C';
    note = scn.benign
      ? 'You shut down supply for an approved maintenance job. A self-inflicted outage is still an outage — capped at C.'
      : 'You took the grid down yourself: the attacker’s goal, delivered for free. Capped at C.';
  } else if (scn.benign && q === 'weak') {
    cap = 'B';
    note = 'The evidence showed authorised work. Escalating or rolling back a documented change burns time and goodwill — capped at B.';
  }
  if (cap && LETTERS.indexOf(grade) < LETTERS.indexOf(cap)) grade = cap;

  // consequences
  const factor = { best: 0, good: 0.25, weak: 0.6, ignore: 1, timeout: 1, overreact: 0 }[q] ?? 0;
  let feeders = [], hours = 0, fine = 0, rel = 0;
  if (scn.impact && factor > 0) {
    feeders = scn.impact.feeders;
    hours = scn.impact.hours * factor;
    fine = Math.round((scn.impact.fine * factor) / 1000) * 1000;
    rel = scn.impact.rel * factor;
  }
  if (resp?.outage) {
    feeders = [...new Set([...feeders, ...resp.outage.feeders])];
    hours = Math.max(hours, resp.outage.hours);
    rel += resp.rel ?? -10;
  }
  if (q === 'best') rel += 4;
  if (S.owned.has('backups')) hours *= 0.5;
  hours = Math.round(hours * 2) / 2;
  const cost = resp?.cost || 0;

  if (!inc.drill) {
    S.funds -= cost + fine;
    S.stats.response += cost;
    S.stats.fines += fine;
    S.reliability = clamp(S.reliability + rel, 0, 100);
    if (hours > 0) {
      for (const f of feeders) {
        const st = S.feeders[f];
        st.on = false;
        st.until = Math.max(st.until, S.T + hours * 60);
        world.setFeeder(f, false);
      }
      alertLog(`Feeder ${feeders.join(' + ')} de-energized for ${dur(hours * 60)}.`, 'bad');
    }
    if (fine) alertLog(`Regulatory penalty: ${money(fine)}.`, 'bad');
  }
  // a missed or dismissed attack damages equipment until it is repaired
  let damage = null;
  if (!scn.benign && !inc.drill && (q === 'ignore' || q === 'timeout' || q === 'weak' || miss > 0)) {
    const asset = DAMAGE_ORDER.find(a => scn.targets.includes(a)) || scn.targets[scn.targets.length - 1];
    const full = q === 'ignore' || q === 'timeout';
    const repair = Math.round(((REPAIR[asset] ?? DAMAGE_DEFAULT) * (full ? 1 : 0.5)) / 1000) * 1000;
    damage = { asset, cost: repair };
    S.damaged[asset] = { cost: Math.max(repair, S.damaged[asset]?.cost || 0) };
    world.setDamaged(asset, true);
    S.reliability = clamp(S.reliability - (full ? 8 : 4), 0, 100);
    alertLog(`EQUIPMENT DAMAGED: ${ASSETS[asset].name} · repair ${money(repair)}`, 'bad');
    toast(`${esc(ASSETS[asset].name)} damaged — repair ${money(repair)} from its panel`, 'bad', 'alert');
  }
  // streak: consecutive B-or-better real incidents add up to +50% XP
  if (!inc.drill) S.streak = grade === 'A' || grade === 'B' ? S.streak + 1 : 0;
  const xp = Math.round(score * (1 + 0.1 * Math.min(inc.drill ? 0 : S.streak, 5)));
  S.xp += xp;
  saveBest();

  const record = {
    scnId: scn.id, title: scn.title, drill: inc.drill, grade, score, q,
    respId: resp?.id || null, hit, n, fp, used: Math.round(inc.total - inc.left),
    feeders, hours, fine, cost, rel: Math.round(rel), note, damage, xp, streak: S.streak,
    tags: [...inc.tags], fps: [...inc.fps], fpOk, miss, m, clues: scn.clues, day: dayOf(S.T), clock: clockOf(S.T), startT: inc.startT,
  };
  S.history.push(record);

  S.incident = null;
  world.setAttacked([]);
  world.setHoneypotAlarm(false);
  refreshConduits();
  buildPins();
  closeModal();
  renderBanner();
  if (!inc.drill) S.nextIncidentAt = S.T + rand(150, 260);
  (grade === 'A' || grade === 'B') ? Snd.good() : Snd.bad();
  toast(`${inc.drill ? 'Drill' : 'Incident'} closed · grade ${grade}`, grade <= 'B' ? 'good' : 'bad', 'shield');
  alertLog(`${inc.drill ? 'Drill' : 'Incident'} closed: ${scn.title} · grade ${grade}`, grade <= 'B' ? 'good' : 'bad');
  openPanel('debrief', S.history.length - 1);
  questEvent('incident');
  if (grade === 'A' || grade === 'B') questEvent('gradeB');
  if (scn.benign && q === 'best') questEvent('benign');
  renderAction();
  renderHUD();
}

// ---------- plant events ----------
function plantEvent() {
  const ev = PLANT_EVENTS[Math.floor(Math.random() * PLANT_EVENTS.length)];
  S.nextEventAt = S.T + rand(300, 540);
  let text = ev.text, kind = ev.kind;
  if (ev.funds) { S.funds += ev.funds; if (ev.funds < 0) S.stats.spent -= ev.funds; }
  if (ev.rel) S.reliability = clamp(S.reliability + ev.rel, 0, 100);
  if (ev.demand) S.boost = { mult: ev.demand.mult, until: S.T + ev.demand.hours * 60 };
  if (ev.outage) for (const f of ev.outage.feeders) {
    const st = S.feeders[f];
    st.on = false; st.until = Math.max(st.until, S.T + ev.outage.hours * 60);
    world.setFeeder(f, false);
  }
  if (ev.audit) {
    const lvl = securityLevel();
    if (lvl >= 3) { S.funds += 50000; text += ` Security level ${lvl}: passed with a $50K efficiency bonus.`; kind = 'good'; }
    else if (lvl === 2) { text += ' Security level 2: passed with recommendations.'; }
    else { S.funds -= 75000; S.stats.fines += 75000; text += ' Security level 1: non-compliant, $75K fine.'; kind = 'bad'; }
  }
  toast(`${esc(ev.title)} — ${esc(text)}`, kind === 'good' ? 'good' : kind === 'bad' ? 'bad' : 'warn', ev.icon);
  alertLog(`${ev.title}: ${text}`, kind === 'good' ? 'good' : kind === 'bad' ? 'bad' : 'info');
  renderHUD();
}

// personal best XP, kept in this browser
let bestXP = 0, bestToasted = false;
try { bestXP = +localStorage.getItem('onsa.bestXP') || 0; } catch { /* storage unavailable */ }
function saveBest() {
  if (S.xp <= bestXP) return;
  if (bestXP > 0 && !bestToasted) { toast(`New personal best: ${S.xp} XP`, 'good', 'trophy'); bestToasted = true; }
  bestXP = S.xp;
  try { localStorage.setItem('onsa.bestXP', String(bestXP)); } catch { /* storage unavailable */ }
}

// ---------- panels ----------
const PANELS = {
  site() {
    return {
      eyebrow: SITE.utility, title: SITE.station,
      html: `<p>Everything on the map. Tap an asset to inspect it, or tap its label in the 3D view.</p>
        <div class="alist">${Object.entries(ASSETS).map(([id, a]) => {
          const st = assetStatus(id);
          return `<button data-act="asset:${id}"><span class="a-ic">${icon(a.icon)}</span><span class="grow"><b>${esc(a.name)}</b><span class="st ${st.cls}">${esc(st.text)}</span></span>${icon('arrow')}</button>`;
        }).join('')}</div>`,
    };
  },

  asset(id) {
    const a = ASSETS[id];
    const st = assetStatus(id);
    const links = CONDUITS.filter(c => (c.a === id || c.b === id) && conduitState(c) !== 'hidden');
    const f = FEEDER_OF[id];
    const inc = S.incident;
    const clueCount = inc ? inc.scn.clues.filter(c => c.asset === id).length : 0;
    return {
      eyebrow: a.level, title: a.name,
      html: `
        ${clueCount ? `<button class="btn danger block" data-act="clues:${id}" style="margin-bottom:10px">${icon('search')} ${clueCount} detections logged here</button>` : ''}
        ${S.damaged[id] ? `<div class="box" style="box-shadow:inset 0 0 0 1px var(--red)"><b>Equipment damaged</b><p style="margin:4px 0 8px">A missed attack damaged this asset. Until it is repaired it drags revenue down and reliability cannot recover.</p>
          <button class="btn danger block" data-act="repair:${id}" ${S.funds < S.damaged[id].cost ? 'disabled' : ''}>${icon('zap')} Repair for ${money(S.damaged[id].cost)}</button></div>` : ''}
        <p>${esc(a.desc)}</p>
        <div class="box"><div class="row between"><small>Status</small><span class="pill ${st.cls === 'ok' ? 'ok' : st.cls ? 'bad' : ''}">${esc(st.text)}</span></div>
        ${f ? `<div class="row between" style="margin-top:8px"><small>Load share</small><b>${Math.round(FEEDERS[f].share * 100)}% of revenue</b></div>` : ''}</div>
        ${a.protocols.length ? `<div class="sec"><small>Protocols</small></div><div class="row" style="flex-wrap:wrap;gap:5px">${a.protocols.map(p => `<span class="pill">${esc(p)}</span>`).join('')}</div>` : ''}
        ${id === 'biogas' ? processHTML() : ''}
        ${id === 'rnd' ? sbspHTML() : ''}
        ${links.length ? `<div class="sec"><small>Conduits</small></div>${links.map(conduitRow).join('')}` : ''}
        <div class="row" style="margin-top:12px"><button class="btn" data-act="focus:${id}">${icon('target')} Focus camera</button></div>`,
    };
  },

  inst(tag) {
    const i = INST[tag];
    return {
      eyebrow: `Biogas plant · ${i.stage}`, title: `${i.tag} · ${i.name}`,
      html: `<div class="box"><div class="kv" style="margin:0">
          <span>Measures / does</span><span>${esc(i.kind)}</span>
          <span>Signal to PLC</span><span>${esc(i.signal)}</span>
          <span>Process stage</span><span>${esc(i.stage)}</span></div></div>
        <div class="box"><small>Why an attacker cares</small><p style="margin:5px 0 0">${esc(instrumentRisk(i))}</p></div>
        <div class="row" style="margin-top:10px;gap:8px"><button class="btn" data-act="asset:biogas">${icon('arrow')} All plant instruments</button></div>`,
    };
  },

  researcher() {
    return {
      eyebrow: 'ONSA R&D Centre · SBSP researcher', title: SITE.researcher,
      html: `<p>“I work on <b>Space-Based Solar Power</b>: satellites that capture solar power in space and wirelessly deliver 24/7, baseload energy to wherever on Earth. Up there the sun never sets, so the power doesn’t either.”</p>
        <p>“Our test satellite is overhead right now. Watch the beam — it lands on the rectenna field beside me, and the dish tracks the satellite across the sky.”</p>
        ${sbspHTML().replace(/<button[^]*$/, '')}
        <button class="btn block" data-act="asset:rnd">${icon('arrow')} R&amp;D Centre details</button>`,
    };
  },

  network() {
    return {
      eyebrow: 'Zones & conduits · IEC 62443', title: 'Network',
      html: `<p>The Purdue model splits the site into zones. Conduits are the paths between them — every unprotected conduit is a route an attacker can take.</p>
        <div class="purdue">${PURDUE.map(l => `<div class="lvl"><small>${esc(l.level)}</small><div class="zone">${l.ids.map(id => `<button data-act="asset:${id}">${icon(ASSETS[id].icon)} ${esc(ASSETS[id].short)}</button>`).join('')}</div></div>`).join('')}</div>
        <div class="sec"><small>Conduits</small></div>
        ${CONDUITS.map(conduitRow).join('')}
        <div class="row tiny muted" style="gap:12px;margin-top:8px"><span><span class="pill ok">protected</span></span><span><span class="pill warn">unprotected</span></span><span><span class="pill bad">exposed</span></span></div>`,
    };
  },

  shop() {
    const cats = [...new Set(CONTROLS.map(c => c.cat))];
    return {
      eyebrow: `Security level ${securityLevel()} · ${S.owned.size}/${CONTROLS.length} installed`, title: 'Security upgrades',
      html: `<p>Controls cost capex now and opex every day. Each one prevents an attack technique, gives you better evidence, or speeds recovery.</p>
        ${cats.map(cat => `<div class="sec"><small>${esc(cat)}</small></div>${CONTROLS.filter(c => c.cat === cat).map(c => {
          const owned = S.owned.has(c.id);
          return `<div class="ctl ${owned ? 'owned' : ''}">
            <div class="row between"><h4>${esc(c.name)}</h4><span class="price">${owned ? `<span class="pill ok">${icon('check')} Installed</span>` : money(c.cost)}</span></div>
            <p>${esc(c.desc)}</p><div class="eff">${esc(c.effect)}</div>
            <div class="row between" style="margin-top:8px"><span class="ref">${esc(c.ref)}${c.opex ? ` · opex ${money(c.opex)}/day` : ''}</span>
            ${owned ? '' : `<button class="btn sm primary" data-act="buy:${c.id}" ${S.funds < c.cost ? 'disabled' : ''}>Buy</button>`}</div></div>`;
        }).join('')}`).join('')}`,
    };
  },

  soc() {
    const inc = S.incident;
    return {
      eyebrow: 'Security operations', title: 'SOC',
      html: `${inc ? `<div class="box" style="border:1.5px solid var(--red)"><small style="color:#ffa79e">Open incident</small><b style="display:block;margin:4px 0 8px">${esc(inc.scn.title)}</b>
          <div class="row"><button class="btn sm" data-act="clues">${icon('search')} Detection</button><button class="btn sm primary" data-act="respond">${icon('cards')} Respond or Remediate</button></div></div>`
        : `<div class="box"><small>Status</small><p style="margin:4px 0 8px">No open incidents. Monitoring ${OT_SOURCES()} log sources.${S.owned.has('honeypot') ? ` Honeypot RTU-99 armed · ${S.stats.hpTrips || 0} trips so far.` : ''}</p>
          <button class="btn sm" data-act="skip">${icon('clock')} Skip to next alert</button></div>`}
        <div class="sec"><small>Drills</small></div>
        <p>Run any scenario as a tabletop drill. It is graded and debriefed, but costs, fines and outages are not applied. Drills bypass your preventive controls.</p>
        ${SCENARIOS.map(s => `<div class="box row"><div class="grow"><b style="font-size:13.5px">${esc(s.short)}</b><div class="tiny muted">${esc(s.title)}</div></div>
          <button class="btn sm" data-act="drill:${s.id}" ${inc ? 'disabled' : ''}>Run</button></div>`).join('')}
        ${historyHTML()}`,
    };
  },

  report() {
    const real = S.history.filter(h => !h.drill);
    const avg = real.length ? real.reduce((s, h) => s + h.score, 0) / real.length : null;
    return {
      eyebrow: `Day ${dayOf(S.T)} · ${clockOf(S.T)}`, title: 'Report',
      html: `<div class="kpis">
          <div class="kpi"><small>Revenue</small><b>${money(S.stats.revenue)}</b></div>
          <div class="kpi"><small>Fines</small><b style="color:${S.stats.fines ? 'var(--red)' : ''}">${money(S.stats.fines)}</b></div>
          <div class="kpi"><small>Security spend</small><b>${money(S.stats.spent)}</b></div>
          <div class="kpi"><small>Response cost</small><b>${money(S.stats.response)}</b></div>
          <div class="kpi"><small>Feeder outage</small><b>${dur(S.stats.outageMin)}</b></div>
          <div class="kpi"><small>Customer-hours lost</small><b>${Math.round(S.stats.customerMin / 60).toLocaleString()}</b></div>
          <div class="kpi"><small>Incidents handled</small><b>${real.length}</b></div>
          <div class="kpi"><small>Attacks prevented</small><b>${S.stats.prevented}</b></div>
          <div class="kpi"><small>Honeypot trips</small><b>${S.owned.has('honeypot') ? S.stats.hpTrips || 0 : '—'}</b></div>
          <div class="kpi"><small>Average grade</small><b>${avg === null ? '—' : letterOf(avg)}</b></div>
          <div class="kpi"><small>XP · best</small><b>${S.xp} · ${Math.max(bestXP, S.xp)}</b></div>
          <div class="kpi"><small>Streak · damaged assets</small><b>${S.streak} · ${Object.keys(S.damaged).length}</b></div>
        </div>
        <div class="box"><small>Grid reliability</small><p style="margin:4px 0 0">${Math.round(S.reliability)}/100 — drops during outages and bad calls, recovers while every feeder is energized.</p></div>
        ${historyHTML()}`,
    };
  },

  alerts() {
    S.unread = 0;
    return {
      eyebrow: `${S.alerts.length} events`, title: 'Alerts',
      html: S.alerts.length
        ? S.alerts.map(a => `<div class="box row" style="align-items:flex-start"><span class="pill ${a.kind === 'bad' ? 'bad' : a.kind === 'good' ? 'ok' : ''}">D${a.day} ${a.clock}</span><span class="grow tiny" style="line-height:1.45">${esc(a.text)}</span></div>`).join('')
        : '<p>No events yet.</p>',
    };
  },

  quests() {
    return {
      eyebrow: `${Math.min(S.questIdx, QUESTS.length)}/${QUESTS.length} complete`, title: 'Quests',
      html: CHAPTERS.map((name, ch) => `<div class="sec"><small>Chapter ${pad(ch + 1)} · ${esc(name)}</small></div>
        ${QUESTS.map((q, i) => ({ q, i })).filter(o => o.q.ch === ch).map(({ q, i }) => `<div class="box row">
          <span class="a-ic" style="${i < S.questIdx ? 'background:var(--mint);color:var(--mint-ink)' : i === S.questIdx ? 'background:var(--red);color:#fff' : ''}">${icon(i < S.questIdx ? 'check' : q.icon)}</span>
          <div class="grow"><b style="font-size:13.5px">${esc(q.title)}</b><div class="tiny muted">${esc(q.desc)}</div></div>
          ${q.reward ? `<span class="pill">${money(q.reward)}</span>` : ''}</div>`).join('')}`).join(''),
    };
  },

  clues(filter = 'all') {
    const inc = S.incident;
    if (!inc) return { eyebrow: '', title: 'Detection', html: '<p>No open incident.</p>' };
    inc.filter = filter;
    const assets = [...new Set(inc.scn.clues.map(c => c.asset))];
    const missing = ['inventory', 'ids', 'backups'].filter(id => !S.owned.has(id) && inc.scn.clues.some(c => c.chips.some(ch => ch.need === id)));
    return {
      danger: true,
      eyebrow: cluesEyebrow(), title: 'Detection',
      html: `<p>Classify every line: <b>True Positive</b> if it is part of the attack, <b>False Positive</b> if it is benign or routine. Right calls earn points, wrong calls cost them. Your calls and how you respond or remediate decide the grade.</p>
        <div class="filters"><button class="${filter === 'all' ? 'on' : ''}" data-act="clues:all">All</button>${assets.map(id => `<button class="${filter === id ? 'on' : ''}" data-act="clues:${id}">${esc(ASSETS[id].short)}</button>`).join('')}</div>
        ${inc.clueOrder.map(i => inc.scn.clues[i]).map((c, k) => (filter === 'all' || c.asset === filter ? clueHTML(c, inc.clueOrder[k]) : '')).join('')}
        ${missing.length ? `<div class="box tiny muted">${icon('lock')} Some context is hidden. ${missing.map(id => esc(CTRL[id].short)).join(', ')} would add more detail to these logs.</div>` : ''}
        <div class="sticky-foot"><button class="btn primary block" data-act="respond">${icon('cards')} Respond or Remediate</button></div>`,
    };
  },

  debrief(idx) {
    const r = S.history[idx];
    const scn = scnById(r.scnId);
    const resp = scn.responses.find(x => x.id === r.respId);
    const best = scn.responses.find(x => x.q === 'best');
    const outage = r.hours > 0 ? `Feeder ${r.feeders.join(' + ')} · ${dur(r.hours * 60)}` : 'None';
    return {
      eyebrow: `${r.drill ? 'Drill' : 'Incident'} debrief · Day ${r.day} · ${r.clock}`, title: `Shift grade ${r.grade}`,
      html: `<div class="row"><div class="grade ${r.grade}">${r.grade}</div><div class="grow"><b>${esc(scn.title)}</b><div class="tiny muted">Score ${r.score}/100${r.drill ? ' · drill, no costs applied' : ''}</div></div></div>
        <div class="kv">
          <span>Attack lines → True Positive</span><span class="${r.n && r.hit < r.n ? 'bad' : 'good'}">${scn.benign ? '— (no attack)' : `${r.hit}/${r.n}`}</span>
          <span>Benign lines → False Positive</span><span class="${(r.fpOk ?? 0) < (r.m ?? 0) ? 'bad' : 'good'}">${r.fpOk ?? 0}/${r.m ?? 0}</span>
          <span>Wrong calls</span><span class="${r.fp + (r.miss || 0) ? 'bad' : 'good'}">${r.fp + (r.miss || 0)}</span>
          <span>Response</span><span>${resp ? esc(resp.tag) : '<span class="bad">Timed out</span>'}</span>
          <span>Decision time</span><span>${r.used}s</span>
          <span>Outage</span><span class="${r.hours ? 'bad' : 'good'}">${outage}</span>
          <span>Response cost + fines</span><span class="${r.fine ? 'bad' : ''}">${money(r.cost + r.fine)}</span>
          <span>Reliability</span><span class="${r.rel < 0 ? 'bad' : 'good'}">${r.rel > 0 ? '+' : ''}${r.rel}</span>
          <span>Equipment damage</span><span class="${r.damage ? 'bad' : 'good'}">${r.damage ? `${esc(ASSETS[r.damage.asset].short)} · repair ${money(r.damage.cost)}` : 'None'}</span>
          <span>XP${r.streak > 1 ? ` · streak ×${r.streak}` : ''}</span><span class="good">+${r.xp ?? r.score}</span>
        </div>
        ${r.note ? `<div class="capnote">${esc(r.note)}</div>` : ''}
        <div class="box"><small>What happened</small><p style="margin:5px 0 0">${resp ? `<b>${esc(resp.title)}.</b> ${esc(resp.result)}` : esc(scn.timeout)}</p></div>
        ${resp?.q !== 'best' ? `<div class="box"><small>Best response</small><p style="margin:5px 0 0"><b>${esc(best.title)}.</b> ${esc(best.result)}</p></div>` : ''}
        <div class="sec"><small>Every detection, explained</small></div>
        <div class="box">${(r.clues || scn.clues).map((c, i) => {
          const call = r.tags.includes(i) ? 'tp' : (r.fps || []).includes(i) ? 'fp' : null;
          const right = call === (c.attack ? 'tp' : 'fp');
          const said = call === 'tp' ? 'you said True Positive' : call === 'fp' ? 'you said False Positive' : 'not classified';
          return `<div class="explain"><h5>${esc(c.src)} <span class="pill ${c.attack ? 'bad' : 'ok'}">${c.attack ? 'True Positive' : 'False Positive'}</span>
            <span class="${right ? 'verdict-ok' : 'verdict-bad'}">${right ? '✓' : '✗'} ${said}</span></h5>
            <p>${esc(c.why)}</p>${c.ttp ? `<div class="ttp">${esc(c.ttp)}</div>` : ''}</div>`;
        }).join('')}</div>
        <div class="box"><small>Lesson</small><p style="margin:5px 0 6px">${esc(scn.lesson)}</p><div class="tiny muted">Inspired by: ${esc(scn.inspired)}</div></div>
        ${scn.blockedBy ? `<div class="box row"><span class="grow tiny">${S.owned.has(scn.blockedBy) ? `${icon('check')} You own <b>${esc(CTRL[scn.blockedBy].short)}</b> — next time this is prevented.` : `<b>${esc(CTRL[scn.blockedBy].name)}</b> would have prevented this attack.`}</span>
          ${S.owned.has(scn.blockedBy) ? '' : `<button class="btn sm" data-act="panel:shop">Shop</button>`}</div>` : ''}
        <button class="btn primary block" data-act="close" style="margin-top:6px">Continue shift</button>`,
    };
  },
};

const OT_SOURCES = () => 14 + (S.owned.has('ids') ? 22 : 0) + (S.owned.has('inventory') ? 9 : 0);

function conduitRow(c) {
  const st = conduitState(c);
  if (st === 'hidden') return `<div class="box row"><div class="grow"><b style="font-size:13px;text-decoration:line-through">${esc(c.name)}</b><div class="tiny muted">Removed by ${esc(CTRL[c.exposedUntil].short)}</div></div><span class="pill ok">${icon('check')} closed</span></div>`;
  const pill = st === 'ok' ? `<span class="pill ok">${c.guard ? esc(CTRL[c.guard].short) : 'baseline'}</span>`
    : st === 'weak' ? `<span class="pill warn">needs ${esc(CTRL[c.guard].short)}</span>`
    : `<span class="pill bad">internet-exposed</span>`;
  return `<div class="box row"><div class="grow"><b style="font-size:13px">${esc(c.name)}</b><div class="tiny muted">${esc(ASSETS[c.a].short)} ↔ ${esc(ASSETS[c.b].short)} · ${esc(c.proto)}</div></div>${pill}</div>`;
}

function sbspHTML() {
  const steps = [
    ['Capture', 'Solar arrays in orbit see the sun almost all the time — no night, no clouds, no seasons.'],
    ['Convert', 'Onboard electronics turn the DC power into a 2.45 GHz microwave beam.'],
    ['Beam', 'A steerable transmitter points the beam at a rectenna anywhere on Earth.'],
    ['Receive', 'The rectenna rectifies the microwaves back to DC; inverters feed the grid — 24/7 baseload.'],
  ];
  return `<div class="sec"><small>Space-Based Solar Power (SBSP)</small></div>
    <div class="box"><div class="row between"><small>Test beam</small><span class="pill ok">Locked on rectenna</span></div>
      <div class="row between" style="margin-top:6px"><small>Rectenna output</small><b>${world.rndOutput} kW · test scale</b></div></div>
    ${steps.map(([t, d], i) => `<div class="box row" style="align-items:flex-start;margin-bottom:5px"><span class="pill">${i + 1}</span><div class="grow"><b style="font-size:13px">${t}</b><div class="tiny muted" style="line-height:1.45">${d}</div></div></div>`).join('')}
    <div class="box"><small>Why OT security cares</small><p style="margin:5px 0 0">The beam is pointed by commands sent over the satellite control (TT&amp;C) link. Authenticating and encrypting that link matters as much as any substation conduit.</p></div>
    <button class="btn block" data-act="researcher">${icon('satellite')} Talk to ${esc(SITE.researcher)}</button>`;
}

function processHTML() {
  const flow = PROCESS.slice(0, 5).map(p => `<span class="pill">${esc(p)}</span>`).join(` <span class="muted">→</span> `);
  return `<div class="sec"><small>Process flow</small></div>
    <div class="row" style="flex-wrap:wrap;gap:5px">${flow}</div>
    <p class="tiny muted" style="margin-top:6px">Surplus biogas goes to the flaring system. Zoom in on the plant to see every tag on the pipelines.</p>
    ${PROCESS.map(stage => `<div class="sec"><small>${esc(stage)}</small></div>${INSTRUMENTS.filter(i => i.stage === stage).map(i =>
      `<button class="box row" style="width:100%;text-align:left;margin-bottom:5px;padding:8px 10px" data-act="inst:${i.tag}">
        <span class="pill" style="font-family:var(--mono)">${esc(i.tag)}</span><span class="grow"><b style="font-size:12.5px">${esc(i.name)}</b><div class="tiny muted">${esc(i.kind)}</div></span>${icon('arrow')}</button>`).join('')}`).join('')}`;
}

function historyHTML() {
  if (!S.history.length) return '';
  return `<div class="sec"><small>Debriefs</small></div>${S.history.map((h, i) => ({ h, i })).reverse().map(({ h, i }) =>
    `<button class="box row" style="width:100%;text-align:left" data-act="debrief:${i}"><div class="grade ${h.grade}" style="width:32px;height:32px;font-size:17px;border-radius:9px">${h.grade}</div>
      <div class="grow"><b style="font-size:13px">${esc(h.title)}</b><div class="tiny muted">Day ${h.day} · ${h.clock}${h.drill ? ' · drill' : ''}</div></div>${icon('arrow')}</button>`).join('')}`;
}

function cluesEyebrow() {
  const inc = S.incident;
  return inc ? `${classified(inc)} of ${inc.scn.clues.length} classified · ${inc.scn.short}` : '';
}

function clueHTML(c, i) {
  const tp = S.incident.tags.has(i), fp = S.incident.fps.has(i);
  const chips = c.chips.filter(ch => !ch.need || S.owned.has(ch.need))
    .map(ch => `<span class="cchip ${ch.tone || ''}">${esc(ch.t)}</span>`).join('');
  return `<div class="clue ${tp ? 'tagged' : fp ? 'benign' : ''}" data-i="${i}">
    <div class="clue-h"><span>${clueTime(c)} · ${esc(c.src)}</span><span>${esc(ASSETS[c.asset].short)}</span></div>
    <pre>${esc(clueText(c))}</pre>${chips ? `<div class="cchips">${chips}</div>` : ''}
    <div class="row" style="gap:6px">
      <button class="btn-tag tp ${tp ? 'on' : ''}" data-act="tp:${i}">${icon(tp ? 'check' : 'alert')} True Positive</button>
      <button class="btn-tag fp ${fp ? 'on' : ''}" data-act="fp:${i}">${icon(fp ? 'check' : 'shield')} False Positive</button>
    </div></div>`;
}

function openPanel(name, arg) {
  S.panel = { name, arg };
  if (name === 'network') { questEvent('network'); setNetVisible(true); }
  if (name === 'asset') questEvent(`inspect:${arg}`);
  renderPanel(true);
  renderHUD();
}
let lastPanelHTML = '';
function renderPanel(fresh = false) {
  const sheet = $('#sheet');
  if (!S.panel) { sheet.hidden = true; return; }
  const p = PANELS[S.panel.name](S.panel.arg);
  const body = $('#sheet-body');
  // periodic refreshes skip unchanged content so clicks are never swallowed by a re-render
  if (!fresh && p.html === lastPanelHTML) return;
  lastPanelHTML = p.html;
  const scroll = fresh ? 0 : body.scrollTop;
  sheet.hidden = false;
  sheet.classList.toggle('danger', !!p.danger);
  $('#sheet-eyebrow').textContent = p.eyebrow;
  $('#sheet-title').textContent = p.title;
  body.innerHTML = p.html;
  body.scrollTop = scroll;
}
function closePanel() {
  S.panel = null;
  $('#sheet').hidden = true;
  renderHUD();
}
function openResearcher() {
  const r = world.researcher.position;
  world.walkTo(r.x + 2.2, r.z + 2.2);
  world.animateTo(r.clone(), { radius: 45, phi: 0.95, theta: world.spherical().theta }, 0.7);
  openPanel('researcher');
}
function openAsset(id) {
  world.walkToAsset(id);
  world.focus(id);
  openPanel('asset', id);
}

// ---------- modals ----------
function openModal(html) {
  $('#modal-inner').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

function openRespond() {
  const inc = S.incident;
  if (!inc) return;
  if (!inc.order) inc.order = [...inc.scn.responses].sort(() => Math.random() - 0.5);
  const pb = S.owned.has('playbook');
  const hint = r => {
    if (!pb) return '';
    if (r.q === 'best') return '<div class="pb ok">Playbook: recommended</div>';
    if (r.q === 'overreact') return '<div class="pb bad">Playbook: disproportionate</div>';
    if (r.q === 'ignore') return '<div class="pb bad">Playbook: ignores the evidence</div>';
    return '';
  };
  openModal(`<small>${esc(inc.scn.short)} · ${inc.tags.size} True Positive · ${inc.fps.size} False Positive</small>
    <h3>Respond or Remediate</h3>
    <p>Pick the response that fits the evidence. Under-reacting lets the attack land; over-reacting causes the outage yourself.${S.owned.has('backups') ? ' Config backups will halve any outage.' : ''}</p>
    <div class="rcards">${inc.order.map(r => `<button class="rcard" data-act="play:${r.id}">
      <div class="r-top"><span class="r-tag ${r.tag}">${esc(r.tag)}</span><span class="r-cost">${r.cost ? money(r.cost) : 'Free'}</span></div>
      <h4>${esc(r.title)}</h4><p>${esc(r.desc)}</p>${hint(r)}</button>`).join('')}</div>
    <div class="modal-foot"><button class="btn ghost" data-act="close-modal">Back to Detection</button></div>`);
}

function openHelp() {
  openModal(`<small>How to play</small><h3>${esc(SITE.game)}</h3>
    <p>Run ${esc(SITE.station)} for ${esc(SITE.utility)}. Earn revenue while feeders are energized, invest in controls, and triage incidents correctly.</p>
    <div class="help-grid">
      <div class="box"><b>Camera</b><p>Drag to pan · right-drag or two fingers to rotate · scroll or pinch to zoom. The map rotates a full 360° — the camera bar on the right rotates 45°, spins 360°, toggles top-down and resets the view. Tap your persona’s name tag to change your name. Keys: <kbd>Q</kbd>/<kbd>E</kbd> rotate, <kbd>Space</kbd> pause, <kbd>1</kbd>–<kbd>3</kbd> speed, <kbd>Esc</kbd> close.</p></div>
      <div class="box"><b>Incidents</b><p>When an alert fires the game clock stops and a decision timer starts. Open the magnifier pins, read each log line, mark it True Positive (part of the attack) or False Positive (benign), then respond or remediate. Most alarms are faults, weather or authorised work; real attacks hide among them.</p></div>
      <div class="box"><b>Consequences</b><p>Miss an attack, dismiss one of its lines as a False Positive or respond weakly, and equipment is damaged: smoke on the map, lower revenue and no reliability recovery until you repair it from its panel. Each day gets harder: less time to decide and more noise in the logs. B-or-better streaks add up to +50% XP.</p></div>
      <div class="box"><b>Grading</b><p>60% response quality, 30% detection accuracy (right True/False Positive calls earn points, wrong calls cost them), 10% speed. Treating an attack as a routine fault caps you at D; shutting the grid down yourself caps you at C.</p></div>
      <div class="box"><b>Controls</b><p>Some controls prevent a scenario outright. Visibility controls (inventory, monitoring, backups) add context chips to logs. The playbook annotates response options. Opex is charged daily.</p></div>
      <div class="box"><b>Network overlay</b><p>Blue conduits are protected or baseline, amber need a control, orange is internet-exposed. Red pulses are an attack path in progress.</p></div>
      <div class="box"><b>For trainers</b><p>The SOC panel runs any scenario as a drill (graded, no costs). Every debrief explains each detection with its MITRE ATT&amp;CK for ICS technique.</p></div>
    </div>
    <div class="modal-foot"><button class="btn primary" data-act="close-modal">Got it</button></div>`);
}

function gameOver() {
  S.over = true;
  S.speed = 0;
  openModal(`<small>Board meeting</small><h3>You have been replaced</h3>
    <p>Funds fell below −$250K. Fines and outages outran the budget. Revenue ${money(S.stats.revenue)}, fines ${money(S.stats.fines)}, ${S.history.filter(h => !h.drill).length} incidents handled, ${S.stats.prevented} prevented.</p>
    <div class="modal-foot"><button class="btn primary" data-act="restart">Start a new shift</button></div>`);
}

// ---------- actions ----------
function buy(id) {
  const c = CTRL[id];
  if (!c || S.owned.has(id)) return;
  if (S.funds < c.cost) { toast(`Not enough funds for ${esc(c.short)}`, 'bad'); return; }
  S.funds -= c.cost;
  S.stats.spent += c.cost;
  S.owned.add(id);
  Snd.good();
  toast(`Installed ${esc(c.name)}`, 'good', 'shield');
  alertLog(`Installed control: ${c.name} (${money(c.cost)}).`, 'good');
  if (id === 'ids' && S.incident) { S.incident.left += 60; S.incident.total += 60; }
  refreshConduits();
  world.setHoneypot(S.owned.has('honeypot'));
  checkQuests();
  renderPanel();
  renderHUD();
}

function setNetVisible(v) {
  S.netVisible = v;
  world.setNetworkVisible(v);
  $('#rb-layers').classList.toggle('on', v);
}

function setSpin(on) {
  S.spin = on;
  world.setSpin(on);
  $('#rb-spin').classList.toggle('on', on);
}

function openRename() {
  openModal(`<small>Persona</small><h3>Your name</h3><p>Shown above your persona on the map.</p>
    <input id="rename-input" class="text-input" maxlength="24" value="${esc(S.player)}" autocomplete="off" spellcheck="false">
    <div class="modal-foot"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" data-act="save-name">Save</button></div>`);
  const inp = $('#rename-input');
  inp.focus();
  inp.select();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') ACTS['save-name'](); });
}

const LIGHT_MODES = ['auto', 'night', 'day'];
function renderRail() {
  $('#rb-light').innerHTML = icon(S.light === 'auto' ? 'auto' : S.light === 'day' ? 'sun' : 'moon');
  $('#rb-light').title = `Lighting: ${S.light}`;
  $('#rb-sound').innerHTML = icon(S.sound ? 'volume' : 'mute');
  $('#rb-sound').classList.toggle('on', S.sound);
}

const ACTS = {
  panel: name => (S.panel?.name === name ? closePanel() : openPanel(name)),
  asset: id => openAsset(id),
  inst: tag => {
    const at = world.instruments.find(x => x.tag === tag);
    if (at) { world.walkTo(at.pos.x, at.pos.z + 1.6); world.animateTo(at.pos.clone().setY(0), { radius: 45, phi: 0.9, theta: world.spherical().theta }, 0.7); }
    openPanel('inst', tag);
  },
  focus: id => world.focus(id),
  buy: id => buy(id),
  clues: arg => { if (!S.incident) return; openPanel('clues', arg || 'all'); if (arg && arg !== 'all' && ASSETS[arg]) world.focus(arg); },
  tp: i => markClue(+i, 'tp'),
  fp: i => markClue(+i, 'fp'),
  respond: () => openRespond(),
  play: id => { const r = S.incident?.scn.responses.find(x => x.id === id); if (r) resolve(r); },
  drill: id => { const s = scnById(id); if (s) startIncident(s, true); },
  repair: id => {
    const d = S.damaged[id];
    if (!d) return;
    if (S.funds < d.cost) { toast(`Not enough funds to repair ${esc(ASSETS[id].short)}`, 'bad'); return; }
    S.funds -= d.cost;
    S.stats.response += d.cost;
    delete S.damaged[id];
    world.setDamaged(id, false);
    toast(`${esc(ASSETS[id].name)} repaired`, 'good', 'check');
    alertLog(`${ASSETS[id].name} repaired for ${money(d.cost)}.`, 'good');
    renderPanel(); renderHUD();
  },
  skip: () => { if (!S.incident) { S.nextIncidentAt = S.T; triggerScheduled(false); } },
  debrief: i => openPanel('debrief', +i),
  close: () => closePanel(),
  'close-modal': () => closeModal(),
  quest: () => questAction(),
  restart: () => location.reload(),
  rename: () => openRename(),
  researcher: () => openResearcher(),
  'save-name': () => {
    const v = $('#rename-input')?.value.trim();
    if (!v) { $('#rename-input')?.focus(); return; }
    setPlayerName(v);
    closeModal();
    toast(`Name set: ${esc(S.player)}`, 'good', 'check');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const raw = el.dataset.act;
  const i = raw.indexOf(':');
  const act = i < 0 ? raw : raw.slice(0, i), arg = i < 0 ? undefined : raw.slice(i + 1);
  ACTS[act]?.(arg, el);
});

$('#sheet-close').addEventListener('click', closePanel);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && !S.over) closeModal(); });
document.querySelectorAll('#speeds button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
$('#rb-light').addEventListener('click', () => { S.light = LIGHT_MODES[(LIGHT_MODES.indexOf(S.light) + 1) % 3]; renderRail(); toast(`Lighting: ${S.light}`, 'warn', S.light === 'night' ? 'moon' : 'sun'); });
$('#rb-sound').addEventListener('click', () => { S.sound = !S.sound; renderRail(); });
$('#rb-layers').addEventListener('click', () => setNetVisible(!S.netVisible));
$('#rb-rotl').addEventListener('click', () => { world.rotate(-45); questEvent('camera'); });
$('#rb-rotr').addEventListener('click', () => { world.rotate(45); questEvent('camera'); });
$('#rb-top').addEventListener('click', () => { world.toggleTop(); questEvent('camera'); });
$('#rb-zin').addEventListener('click', () => world.zoom(0.75));
$('#rb-zout').addEventListener('click', () => world.zoom(1.33));
$('#rb-reset').addEventListener('click', () => world.resetView());
$('#rb-spin').addEventListener('click', () => { setSpin(!S.spin); questEvent('camera'); });
const renderQuality = () => {
  const hq = world.quality === 'high';
  $('#rb-quality').textContent = hq ? 'HQ' : 'LQ';
  $('#rb-quality').title = hq ? 'Graphics: high (ambient occlusion, reflections, 4K shadows) — click for faster' : 'Graphics: low (faster) — click for high quality';
  $('#rb-quality').classList.toggle('on', hq);
};
$('#rb-quality').addEventListener('click', () => {
  world.setQuality(world.quality === 'high' ? 'low' : 'high');
  renderQuality();
  toast(`Graphics: ${world.quality === 'high' ? 'high quality' : 'low (faster)'}`, 'good', 'layers');
});
renderQuality();
$('#rb-help').addEventListener('click', openHelp);

window.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'Escape') { if (!$('#modal').hidden && !S.over) closeModal(); else closePanel(); }
  else if (!S.started) return;
  else if (e.key === ' ') { e.preventDefault(); setSpeed(S.speed ? 0 : 1); }
  else if (e.key === '1') setSpeed(1);
  else if (e.key === '2') setSpeed(2);
  else if (e.key === '3') setSpeed(4);
  else if (e.key === 'q' || e.key === 'Q') { world.rotate(-45); questEvent('camera'); }
  else if (e.key === 'e' || e.key === 'E') { world.rotate(45); questEvent('camera'); }
});

const nameInput = $('#player-name');
nameInput.value = S.player;
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') $('#start').click(); });
nameInput.addEventListener('input', () => nameInput.classList.remove('error'));
$('#start').addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.classList.add('error'); nameInput.focus(); return; }
  setPlayerName(name);
  Snd.init();
  $('#intro').remove();
  S.started = true;
  alertLog(`${SITE.utility}: shift started at ${SITE.station}.`);
  toast(`Welcome to Bukit Mutiara, ${esc(S.player)}. Follow the quest card to get started.`, 'good', 'zap');
  renderAction();
  renderHUD();
});

// ---------- main loop ----------
let last = performance.now(), hudTimer = 0, bannerSec = -1;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.started && !S.over && S.speed > 0) {
    if (S.incident) {
      S.incident.left -= dt;
      if (S.incident.left <= 0) resolve(null);
      else if (Math.ceil(S.incident.left) !== bannerSec) { bannerSec = Math.ceil(S.incident.left); renderBanner(); }
    } else {
      advance(dt * S.speed * GAME_MIN_PER_SEC);
    }
  }
  hudTimer += dt;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    renderHUD();
    if (S.panel && ['site', 'report', 'asset', 'researcher'].includes(S.panel.name)) renderPanel();
  }
  world.update(dt, daylight(), lightHour());
  positionOverlays();
  requestAnimationFrame(frame);
}

hydrateIcons();
renderRail();
refreshConduits();
renderHUD();
renderAction();
requestAnimationFrame(frame);

// exposed for debugging / trainer tooling in the console
window.sentinel = { S, world, startIncident: id => startIncident(scnById(id), true) };
