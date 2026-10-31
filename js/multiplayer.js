// Multiplayer co-op SOC: lobby on the title screen, the room connection and the team chat.
// Three roles share one grid. The room creator hosts: their browser runs the simulation and streams it to the
// others, who send their actions back (see the multiplayer section of game.js).
import { icon } from './icons.js';

export const ROLES = {
  analyst: { name: 'OT SOC Analyst', short: 'Analyst', icon: 'search', does: 'Reads the logs and classifies every line True Positive or False Positive.' },
  responder: { name: 'OT Incident Responder', short: 'Responder', icon: 'cards', does: 'Chooses how to respond or remediate once the team has read the evidence.' },
  engineer: { name: 'OT Security Engineer', short: 'Engineer', icon: 'upgrade', does: 'Buys and installs security controls, and repairs damaged equipment.' },
};
export const ROLE_IDS = Object.keys(ROLES);

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const newCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

// one room connection. If it drops after joining (a server restart or deploy, flaky Wi-Fi, a phone going to sleep)
// it reconnects by itself and takes the same seat back; messages sent meanwhile wait in a queue.
function connect(code, join, onMsg, onClose, onLink) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/room/${code}`;
  let ws, ready = false, joined = false, stopped = false, tries = 0;
  const queue = [];
  const open = () => {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'join', ...join, rejoin: joined })));
    ws.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'joined') {
        const again = joined;
        ready = joined = true;
        tries = 0;
        queue.splice(0).forEach(m => ws.send(m));
        if (again) onLink('back');
      }
      try { onMsg(msg); } catch (err) { console.error(err); }
    });
    ws.addEventListener('close', e => {
      if (e.target !== ws) return;                                 // an old socket we already replaced
      ready = false;
      if (stopped || !joined || e.code === 4000) { onClose(e); return; }
      if (tries === 0) onLink('lost');
      setTimeout(open, Math.min(5000, 500 * 2 ** tries++));
    });
  };
  open();
  return {
    send(msg) {
      const s = JSON.stringify(msg);
      if (ready) ws.send(s);
      else if (msg.t !== 'state') queue.push(s);                    // the host sends a fresh state when it is back
    },
    close() { stopped = true; ws.close(); },
  };
}

// ---------- title screen: mode switch, role picker, lobby ----------
export function initLobby({ getName, onStart, onSolo }) {
  const box = $('#mp-setup'), lobby = $('#mp-lobby'), solo = $('#start');
  let role = null, session = null, players = [];

  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
    const multi = b.dataset.mode === 'multi';
    document.querySelectorAll('.mode').forEach(x => x.classList.toggle('on', x === b));
    solo.hidden = multi;
    box.hidden = !multi;
    $('#intro-who').textContent = multi ? 'OT SOC members' : 'OT Security Lead';
    if (!multi) onSolo?.();
  }));

  $('#mp-roles').innerHTML = ROLE_IDS.map(id => `<button class="role-card" data-role="${id}">
      <span class="rc-ic">${icon(ROLES[id].icon)}</span><b>${ROLES[id].name}</b><p>${ROLES[id].does}</p></button>`).join('');
  $('#mp-roles').addEventListener('click', e => {
    const b = e.target.closest('.role-card');
    if (!b) return;
    role = b.dataset.role;
    document.querySelectorAll('.role-card').forEach(x => x.classList.toggle('on', x === b));
    $('#mp-error').textContent = '';
  });
  const codeInput = $('#mp-code');
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });

  const fail = text => { $('#mp-error').textContent = text; };
  const ready = () => {
    const name = getName();
    if (!name) return fail('Enter your name first.'), null;
    if (!role) return fail('Pick a role.'), null;
    return name;
  };

  function renderLobby() {
    const s = session;
    $('#mp-room').textContent = s.code;
    $('#mp-slots').innerHTML = ROLE_IDS.map(id => {
      const p = players.find(x => x.role === id);
      return `<div class="slot ${p ? 'filled' : ''} ${id === s.role ? 'you' : ''}"><span class="rc-ic">${icon(ROLES[id].icon)}</span>
        <div class="grow"><small>${ROLES[id].name}</small><b>${p ? esc(p.name) + (p.host ? ' · host' : '') + (id === s.role ? ' (you)' : '') : 'Waiting for a player…'}</b></div></div>`;
    }).join('');
    const full = ROLE_IDS.every(id => players.some(p => p.role === id));
    const start = $('#mp-start');
    start.hidden = !s.host;
    start.disabled = !full;
    $('#mp-wait').textContent = s.host
      ? (full ? 'Everyone is here. Start when your team is ready.' : 'Share the room code. The mission starts when all three roles are filled.')
      : 'Waiting for the host to start the mission.';
  }

  function enter(code, create) {
    if (session && !session.failed) return;                  // already connecting or in a room
    const name = ready();
    if (!name) return;
    if (location.protocol === 'file:') return fail('Multiplayer needs the game to be served from its website.');
    fail('');
    const handlers = new Set();
    let chat = null;
    const net = connect(code, { name, role, create }, msg => {
      if (msg.t === 'error') { session.failed = true; fail(msg.text); return; }
      if (msg.t === 'joined') {
        if (session.joined) return;                                 // reconnected: same seat, nothing to redraw
        session.joined = true;
        session.chat = chat = mountChat(session);
        box.hidden = true;
        lobby.hidden = false;
        document.querySelector('.modes').hidden = true;
        document.querySelector('.launch').hidden = true;
        const chatEl = $('#chat');                               // the chat sits in the lobby until the mission starts
        chatEl.classList.add('inline');
        lobby.appendChild(chatEl);
        renderLobby();
        return;
      }
      if (msg.t === 'roster') { players = msg.players; session.players = players; if (!session.started) renderLobby(); }
      if (msg.t === 'chat') chat?.add(msg);
      if (msg.t === 'start' && !session.started) begin();
      handlers.forEach(h => h(msg));
    }, e => {
      if (!session.joined) { session.failed = true; if (!$('#mp-error').textContent) fail('Could not reach the room server. Multiplayer needs the game’s main website.'); return; }
      handlers.forEach(h => h({ t: 'closed', code: e.code }));
    }, state => {
      chat?.system(state === 'lost' ? 'Connection lost. Reconnecting…' : 'Reconnected.');
      handlers.forEach(h => h({ t: 'link', state }));
    });
    session = { code, role, host: create, name, net, players, started: false, joined: false, failed: false, on: h => handlers.add(h) };
  }
  function begin() {
    session.started = true;
    const chatEl = $('#chat');
    chatEl.classList.remove('inline');
    document.body.appendChild(chatEl);
    lobby.hidden = true;
    onStart(session);
  }

  $('#mp-create').addEventListener('click', () => enter(newCode(), true));
  $('#mp-join').addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (code.length < 4) { fail('Enter the room code from your host.'); codeInput.focus(); return; }
    enter(code, false);
  });
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') $('#mp-join').click(); });
  $('#mp-start').addEventListener('click', () => { session.net.send({ t: 'start' }); begin(); });
  $('#mp-leave').addEventListener('click', () => location.reload());
}

// ---------- team chat: in the lobby, then docked beside the map during the game ----------
function mountChat(session) {
  const el = $('#chat');
  el.hidden = false;
  const list = $('#chat-list'), input = $('#chat-input');
  let unread = 0;
  const setUnread = n => { unread = n; $('#chat-unread').textContent = n ? String(n) : ''; $('#chat-unread').hidden = !n; };
  $('#chat-head').addEventListener('click', () => { el.classList.toggle('min'); if (!el.classList.contains('min')) setUnread(0); });
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    session.net.send({ t: 'chat', text });
    input.value = '';
  };
  $('#chat-send').addEventListener('click', send);
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); });
  const add = m => {
    const mine = m.role === session.role;
    const row = document.createElement('div');
    row.className = `chat-msg ${m.role || 'sys'}${mine ? ' mine' : ''}`;
    row.innerHTML = m.role
      ? `<small>${esc(m.name)} · ${esc(ROLES[m.role]?.short || '')}</small><span>${esc(m.text)}</span>`
      : `<span>${esc(m.text)}</span>`;
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
    if (el.classList.contains('min') && !mine) setUnread(unread + 1);
  };
  add({ text: `Room ${session.code}. Chat with your team here.` });
  return { add, system: text => add({ text }) };
}
