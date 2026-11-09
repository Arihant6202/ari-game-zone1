(function () {
'use strict';
const SRC = document.currentScript ? document.currentScript.src : '';
const BASE = SRC.replace(/az\.js.*$/, '');
const KEY = 'az2';
const OWNER_ID = '97835276';   // reserved: only the verified owner Gmail may ever hold this Player ID
// Global reward multiplier. Lower = slower coin earning = items feel more valuable (was 1.0 before).
const COIN_RATE = 0.5;
const DAILY_BONUS = 50;
/* ---- safe localStorage helpers + account keys ----
   Every account has its OWN local record:
     guest   -> az2:guest:<guestId>   (many guests can live on one device; logout NEVER deletes them)
     google  -> az2:user:<firebaseUid> (different Gmail = different record, never shared)         */
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const newId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
function guestId() { let id = LS.get('az_guest_id'); if (!id) { id = newId(); LS.set('az_guest_id', id); } return id; }
const guestKey = () => 'az2:guest:' + guestId();
const rotateGuest = () => { LS.set('az_guest_id', newId()); };
const GPFX = 'az2:guest:';
// Every guest profile saved on this device (a guest that never played is hidden, unless it is the current one).
function listGuests() {
  const out = [], cur = guestId();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!k || k.indexOf(GPFX) !== 0) continue;
      let r = null; try { r = JSON.parse(localStorage.getItem(k)); } catch (e) {}
      if (!r || typeof r !== 'object') continue;
      const id = k.slice(GPFX.length), uid = String(r.uid || '');
      out.push({ id, uid, name: (typeof r.name === 'string' && r.name) || ('Player-' + uid.slice(-4)), coins: +r.coins || 0, xp: +r.xp || 0, rev: +r.rev || 0, ts: +r.ts || 0, cur: id === cur });
    }
  } catch (e) {}
  return out.filter(g => g.cur || g.rev > 0).sort((a, b) => (b.cur - a.cur) || (b.ts - a.ts) || (b.rev - a.rev));
}
// If a login session existed last time, start straight on that account's local record (no guest flash).
let ACTIVE_KEY = (() => { const k = LS.get('az_active_key'); return (LS.get('az_login') && k && k.indexOf('az2:user:') === 0) ? k : guestKey(); })();
const $ = (s, r) => (r || document).querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

/* ------------------------------ storage ------------------------------ */
function genUid() {
  let s = '';
  try { const r = new Uint8Array(8); crypto.getRandomValues(r); r.forEach((b, i) => s += i === 0 ? 1 + (b % 9) : b % 10); }
  catch (e) { s = String(10000000 + Math.floor(Math.random() * 89999999)); }
  return s === OWNER_ID ? genUid() : s;
}
// One-time Gold Coin gifts, keyed by Player ID. Applied once per ID (d.bonus[uid] flag), then synced to the cloud.
const BONUS = { '49019468': 199999, '56067071': 299999 };
let bonusJustApplied = 0;
const bonusPending = raw => !!(raw && BONUS[String(raw.uid || '')] && !(raw.bonus && raw.bonus[String(raw.uid)]));
function announceBonus() {
  const n = bonusJustApplied; bonusJustApplied = 0; if (!n) return;
  setTimeout(() => { try { Az.toast && Az.toast('🎁 Gift: +' + n + ' Gold Coins added!', 5000); Az.sfx && Az.sfx('coin'); } catch (e) {} }, 1200);
}
// Firebase Realtime DB drops empty objects ({}), so cloud data must be re-filled before use.
function normalize(d) {
  if (!d || typeof d !== 'object') d = {};
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  d.coins = (typeof d.coins === 'number' && isFinite(d.coins) && d.coins >= 0) ? d.coins : (d.coins == null ? 150 : 0);
  d.starter49019468 = !!d.starter49019468;
  if (String(d.uid || '') === '49019468' && !d.starter49019468) { d.coins = Math.max(d.coins, 100000); d.starter49019468 = true; }
  d.xp = (typeof d.xp === 'number' && isFinite(d.xp) && d.xp > 0) ? d.xp : 0;
  d.spins = 0;   // spin price is a flat 2000 Gold for everyone (old raised prices are reset)
  d.lv = obj(d.lv); d.best = obj(d.best); d.own = obj(d.own); d.eq = obj(d.eq); d.levelRewards = obj(d.levelRewards); d.mail = Array.isArray(d.mail) ? d.mail : [];
  d.theme = d.theme || 'neon'; d.diff = d.diff || 'medium'; d.sound = d.sound !== false; d.daily = d.daily || '';
  if (!/^\d{8}$/.test(String(d.uid || ''))) d.uid = genUid();
  d.uid = String(d.uid);
  d.bonus = obj(d.bonus);
  if (BONUS[d.uid] && !d.bonus[d.uid]) {            // one-time Gold Coin gift for this Player ID (flag is saved, so it can never repeat)
    d.coins = Math.min(999999999, d.coins + BONUS[d.uid]); d.bonus[d.uid] = 1; bonusJustApplied = BONUS[d.uid];
  }
  d.name = typeof d.name === 'string' ? d.name : ''; d.nameSet = !!d.nameSet; d.nameAsked = !!d.nameAsked;
  d.rev = (typeof d.rev === 'number' && d.rev > 0) ? d.rev : 0;
  d.ts = (typeof d.ts === 'number' && d.ts > 0) ? d.ts : 0;
  return d;
}
let D = null;
function db() {
  if (D) return D;
  let raw = null, had = false;
  try { raw = JSON.parse(LS.get(ACTIVE_KEY) || 'null'); had = !!raw; } catch (e) { raw = null; }
  const pend = bonusPending(raw);
  D = normalize(raw);
  if (!had || pend) LS.set(ACTIVE_KEY, JSON.stringify(D));   // brand-new account (NEW uid) or a gift was just applied: store it
  announceBonus();
  return D;
}
function save() { db().rev++; D.ts = Date.now(); LS.set(ACTIVE_KEY, JSON.stringify(D)); if (window.__azPush) window.__azPush(); }

/* ------------------------------ games registry ------------------------------ */
// modes: single (vs computer) | local (2 players, one device) | online (room code)
const GAMES = [
  { id: 'br', file: 'battle-royale.html', name: 'Zone Survivor', emoji: '🪂', cat: 'Shooter', max: 100, modes: ['single', 'online'], shop: ['gun', 'outfit'], desc: 'Battle royale! Drop in, loot, shoot and be the last one alive as the zone shrinks.' },
  { id: 'arena', file: 'arena-strike.html', name: 'Arena Strike', emoji: '🔫', cat: 'Shooter', max: 100, modes: ['single', 'online'], shop: ['gun', 'outfit'], desc: 'Fast team deathmatch. Respawn, fight bots and reach the kill target first. Online: 1v1 duel or 🤝 2-player co-op vs bots.' },
  { id: 'race', file: 'turbo-racing.html', name: 'Turbo Racing', emoji: '🏎️', cat: 'Racing', max: 100, modes: ['single', 'local', 'online'], shop: ['car'], desc: 'Dodge traffic at crazy speed. Solo, 2 players on one device, or race a friend online!' },
  { id: 'chess', file: 'chess.html', name: 'Royal Chess', emoji: '♟️', cat: 'Board', max: 50, modes: ['single', 'local', 'online'], shop: ['piece'], desc: 'Full chess with a smart computer (50 levels), 2 players, or play online.' },
  { id: 'ttt', file: 'tic-tac-toe.html', name: 'Tic Tac Toe', emoji: '⭕', cat: 'Board', max: 50, modes: ['single', 'local', 'online'], shop: ['xo'], desc: 'Classic X and O. Beat the AI, play a friend or go online.' },
  { id: 'c4', file: 'connect-four.html', name: 'Connect Four', emoji: '🔴', cat: 'Board', max: 50, modes: ['single', 'local', 'online'], shop: ['disc'], desc: 'Drop discs and connect four. AI levels, 2 players or online.' },
  { id: 'ludo', file: 'ludo.html', name: 'Ludo', emoji: '🎲', cat: 'Board', max: 1, modes: ['single', 'local', 'online'], shop: ['dice', 'token'], desc: 'Classic Ludo for 2-4 players: vs computer, on one phone, or online with a friend. Shop: dice & token skins.' },
  { id: 'flyer', file: 'sky-flyer.html', name: 'Sky Flyer', emoji: '🐤', cat: 'Arcade', max: 1, modes: ['single'], shop: ['bird'], desc: 'Tap to fly through the gaps. Pick a cool bird skin.' },
  { id: 'snake', file: 'snake-evolution.html', name: 'Snake Evolution', emoji: '🐍', cat: 'Arcade', max: 100, modes: ['single'], shop: ['snake'], desc: 'Eat, grow and avoid walls. Obstacles and speed grow each level.' },
  { id: 'brick', file: 'brick-breaker.html', name: 'Brick Breaker', emoji: '🧱', cat: 'Arcade', max: 100, modes: ['single'], shop: ['ball'], desc: 'Break all bricks, catch power-ups. 100 different layouts.' },
  { id: 'mole', file: 'whack-a-mole.html', name: 'Whack-a-Mole', emoji: '🐹', cat: 'Fun', max: 100, modes: ['single'], shop: ['hammer'], desc: 'Tap the moles fast, avoid bombs and grab golden moles.' },
  { id: 'leveldevil', file: 'level-devil.html', name: 'Level Devil', emoji: '😈', cat: 'Platformer', max: 20, modes: ['single', 'online'], shop: ['hero'], desc: 'A tricky platform challenge with hidden surprises and 20 stages. Race a friend online to the door!' },
  { id: 'uno', file: 'uno.html', name: 'UNO', emoji: '🃏', cat: 'Cards', max: 1, modes: ['single', 'local', 'online'], shop: ['cardback'], desc: 'Classic colour-and-number card game: vs computer bots, pass-and-play, or online 1v1 with a friend.' },
  { id: 'runner', file: 'runner.html', name: 'Neon Runner', emoji: '🏃', cat: 'Arcade', max: 1, modes: ['single', 'online'], shop: ['runner', 'trail'], desc: 'Endless runner v2: jump, slide, double-jump, grab coins & shields. Race a friend online!' },
  { id: 'badminton', file: 'badminton.html', name: 'Badminton Rally', emoji: '🏸', cat: 'Sports', max: 100, modes: ['single', 'online'], shop: ['racket', 'shuttle'], desc: 'Move, clear, drop and smash against a smart AI.' },
  { id: 'memory', file: 'memory-match.html', name: 'Memory Match', emoji: '🧠', cat: 'Puzzle', max: 100, modes: ['single'], shop: [], desc: 'Flip cards and find matching pairs with the fewest moves.' },
  { id: 'quickmath', file: 'quick-math.html', name: 'Quick Math', emoji: '➗', cat: 'Puzzle', max: 100, modes: ['single'], shop: [], desc: 'Solve rapid-fire arithmetic before the timer runs out.' },
  { id: 'colordash', file: 'color-dash.html', name: 'Color Dash', emoji: '🎨', cat: 'Arcade', max: 100, modes: ['single'], shop: [], desc: 'Match the target color as the pace gets faster.' },
  { id: 'rps', file: 'stone-paper-scissor.html', name: 'Stone Paper Scissor', emoji: '✊', cat: 'Online', max: 1, modes: ['single', 'local', 'online'], shop: [], desc: 'Classic Rock Paper Scissors: challenge the computer, play on one device, or battle a friend online.' },
  { id: 'taprush', file: 'tap-rush.html', name: 'Tap Rush', emoji: '⚡', cat: 'Fun', max: 100, modes: ['single'], shop: [], desc: 'Hit the targets quickly and build a high score.' },
];

/* ------------------------------ places (change as levels go up) ------------------------------ */
const PLACES = [
  { name: 'Sunny City', emoji: '🏙️', sky: ['#5ec8ff', '#d6f3ff'], ground: '#3b3f51', accent: '#ffd166' },
  { name: 'Green Forest', emoji: '🌲', sky: ['#7fd68c', '#d8f5c9'], ground: '#2f6b3a', accent: '#ffe066' },
  { name: 'Golden Desert', emoji: '🏜️', sky: ['#ffb36b', '#ffe8b8'], ground: '#c98f4a', accent: '#ff6b35' },
  { name: 'Snow Land', emoji: '❄️', sky: ['#a9d8ff', '#f2fbff'], ground: '#dfeaf5', accent: '#3a86ff' },
  { name: 'Night City', emoji: '🌃', sky: ['#0b1030', '#2a1d5e'], ground: '#1a1a2e', accent: '#ff3d9a' },
  { name: 'Neon Grid', emoji: '🌐', sky: ['#14002e', '#4b0082'], ground: '#0b0020', accent: '#00e5ff' },
  { name: 'Volcano', emoji: '🌋', sky: ['#3a0d0d', '#8b2500'], ground: '#2b1a14', accent: '#ff5a1f' },
  { name: 'Deep Ocean', emoji: '🌊', sky: ['#05324f', '#0f7fa8'], ground: '#0b4a63', accent: '#34f5b0' },
  { name: 'Outer Space', emoji: '🪐', sky: ['#02020a', '#12123a'], ground: '#1b1b3a', accent: '#a78bfa' },
  { name: 'Candy Land', emoji: '🍭', sky: ['#ffc2e2', '#fff0fa'], ground: '#ff7eb6', accent: '#7c4dff' },
  { name: 'Wild Jungle', emoji: '🦜', sky: ['#2e8b57', '#9be08b'], ground: '#1d5c34', accent: '#ffcc00' },
  { name: 'Galaxy Core', emoji: '🌌', sky: ['#0a0020', '#3d1a78'], ground: '#150a30', accent: '#ff9bf5' },
];

/* ------------------------------ shop catalog ------------------------------ */
const SHOP = {
  char: { title: 'Characters', emoji: '🧑‍🎤', items: [
    { id: 'ch_arnav', name: 'Arnav', price: 0, color: '#3a86ff', look: { skin: '#f1c27d', hair: '#2b1b12', hs: 'short', acc: 'cap' }, perk: { xp: .06, coin: .02 }, desc: 'Starter buddy. Backwards-cap rookie. +6% XP, +2% Gold.' },
    { id: 'ch_atharv', name: 'Atharv', price: 3500, color: '#ff9f1c', look: { skin: '#e8b58a', hair: '#111', hs: 'spiky', acc: 'band' }, perk: { coin: .09, xp: .03 }, desc: 'Fast hustler. +9% Gold from every game, +3% XP.' },
    { id: 'ch_sahil', name: 'Sahil', price: 8000, color: '#10b981', look: { skin: '#f1c27d', hair: '#5a3a1a', hs: 'side', acc: 'glasses' }, perk: { coin: .07, xp: .03, luck: .04 }, rarity: 'rare', desc: 'Smart & lucky. +7% Gold, +3% XP, +4% Lucky Spin item chance.' },
    { id: 'ch_dhiraj', name: 'Dhiraj', price: 15000, color: '#64748b', look: { skin: '#d9a066', hair: '#1a1a1a', hs: 'buzz', acc: 'beard' }, perk: { hp: 45, xp: .06, coin: .03 }, rarity: 'epic', lvl: 12, desc: 'Iron guard. +45 HP in shooters, +6% XP, +3% Gold. LEVEL 12 REWARD.' },
    { id: 'ch_himanshu', name: 'Himanshu', price: 25000, color: '#a855f7', look: { skin: '#f1c27d', hair: '#3b2314', hs: 'curly', acc: 'phones' }, perk: { xp: .14, coin: .06, luck: .02 }, rarity: 'epic', spin: true, desc: 'Music-loving brain. +14% XP, +6% Gold, +2% luck. LUCKY SPIN ONLY.' },
    { id: 'ch_manish', name: 'Manish', price: 60000, color: '#ef4444', look: { skin: '#e8b58a', hair: '#141414', hs: 'buzz', acc: 'band' }, perk: { coin: .10, xp: .10, hp: 45, luck: .03 }, rarity: 'legendary', spin: true, desc: 'Fearless all-rounder. +10% Gold & XP, +45 HP, +3% luck. LUCKY SPIN ONLY.' },
    { id: 'ch_arihant', name: 'Arihant', price: 150000, color: '#facc15', look: { skin: '#f1c27d', hair: '#0b0b0f', hs: 'swoop', acc: 'crown', cape: 1 }, perk: { coin: .14, xp: .14, hp: 60, luck: .05 }, rarity: 'mythic', lvl: 77, desc: 'The Founder. +14% Gold & XP, +60 HP, +5% luck. Strongest character. LEVEL 77 REWARD (free for the owner ID).' },
  ] },
  gun: { title: 'Guns', emoji: '🔫', items: [
    { id: 'g_pistol', name: 'Pistol', price: 0, color: '#ffd166', dmg: 20, rate: 3, pellets: 1, spread: .04, speed: 9, desc: 'Starter. Balanced.' },
    { id: 'g_smg', name: 'SMG Viper', price: 400, color: '#4cc9f0', dmg: 12, rate: 10, pellets: 1, spread: .14, speed: 9, desc: 'Very fast fire, low damage.' },
    { id: 'g_ar', name: 'AR Thunder', price: 900, color: '#80ed99', dmg: 22, rate: 7, pellets: 1, spread: .07, speed: 11, desc: 'All-rounder rifle.' },
    { id: 'g_shotgun', name: 'Shotgun Blast', price: 1300, color: '#ff9f1c', dmg: 11, rate: 1.4, pellets: 6, spread: .34, speed: 9, desc: 'Deadly up close.' },
    { id: 'g_sniper', name: 'Sniper Eagle', price: 2200, color: '#c77dff', dmg: 90, rate: .9, pellets: 1, spread: 0, speed: 20, desc: 'One shot, huge damage.' },
    { id: 'g_golden', name: 'Golden AR', price: 6000, color: '#ffd700', dmg: 34, rate: 9, pellets: 1, spread: .05, speed: 13, desc: 'Legendary. Best of everything.' },
    /* ---- PREMIUM guns (heavy prices). Added after the 6 old guns, so bots & loot are unchanged. ---- */
    { id: 'g_twin', name: 'Twin Fang', price: 9000, color: '#ff5d8f', dmg: 17, rate: 6.5, pellets: 2, spread: .05, speed: 12, mag: 26, desc: '2 bullets per shot. Double hits.' },
    { id: 'g_laser', name: 'Laser Storm', price: 15000, color: '#00f5ff', dmg: 15, rate: 14, pellets: 1, spread: .02, speed: 19, mag: 60, range: 1100, desc: 'Super-fast laser. Long range.' },
    { id: 'g_inferno', name: 'Inferno Blaster', price: 22000, color: '#ff4500', dmg: 13, rate: 2.2, pellets: 9, spread: .38, speed: 10, mag: 10, desc: '9 fire pellets. Melts anything close.' },
    { id: 'g_mini', name: 'Hurricane Minigun', price: 30000, color: '#b5ff3b', dmg: 11, rate: 20, pellets: 1, spread: .16, speed: 13, mag: 100, desc: '100 rounds. Bullet rain!' },
    { id: 'g_rail', name: 'Rail Cannon', price: 40000, color: '#c77dff', dmg: 140, rate: .65, pellets: 1, spread: 0, speed: 28, mag: 4, range: 1400, desc: 'One shot, deletes enemies. 4 shots.' },
    { id: 'g_dragon', name: 'Dragon Breath', price: 55000, color: '#ff7b00', dmg: 18, rate: 5, pellets: 6, spread: .22, speed: 11, mag: 18, range: 700, desc: 'Dragon fire cone. Mid range monster.' },
    { id: 'g_void', name: 'Void Ripper', price: 80000, color: '#7c3aed', dmg: 48, rate: 8.5, pellets: 1, spread: .025, speed: 21, mag: 40, range: 1200, desc: 'Dark-matter rifle. Fast & deadly.' },
    { id: 'g_divine', name: 'Divine Cannon', price: 150000, color: '#fff4a3', dmg: 70, rate: 10, pellets: 2, spread: .03, speed: 24, mag: 50, range: 1300, desc: 'THE ULTIMATE. Only for true legends.' },
    /* ---- NEW (v14): rare guns. Appended last so bots & loot stay the same. lvl = reward only, cannot be bought ---- */
    { id: 'g_frost', name: 'Frost Bite', price: 12000, color: '#9be7ff', dmg: 26, rate: 7, pellets: 1, spread: .035, speed: 15, mag: 30, range: 1000, desc: 'Icy rifle. Cold, clean precision.' },
    { id: 'g_plasma', name: 'Plasma Pulse', price: 26000, color: '#39ff14', dmg: 24, rate: 12, pellets: 1, spread: .05, speed: 18, mag: 45, range: 1100, rarity: 'epic', desc: 'Green plasma bolts. Rapid and deadly.' },
    { id: 'g_storm', name: 'Storm Breaker', price: 60000, color: '#fde047', dmg: 55, rate: 6, pellets: 3, spread: .09, speed: 20, mag: 24, range: 1200, rarity: 'legendary', lvl: 25, desc: '3 lightning bolts per shot. LEVEL 25 REWARD.' },
    { id: 'g_nebula', name: 'Nebula Reaper', price: 120000, color: '#e879f9', dmg: 62, rate: 11, pellets: 2, spread: .025, speed: 26, mag: 60, range: 1500, rarity: 'mythic', lvl: 60, desc: 'Cosmic twin-beam. LEVEL 60 REWARD.' },
  ] },
  outfit: { title: 'Outfits', emoji: '🧥', items: [
    { id: 'o_rookie', name: 'Rookie', price: 0, color: '#4cc9f0', hat: '', hp: 100, desc: 'Starter. 100 HP.' },
    { id: 'o_ninja', name: 'Shadow Ninja', price: 500, color: '#2b2d42', hat: '🥷', hp: 115, desc: '+15 HP' },
    { id: 'o_soldier', name: 'Commando', price: 900, color: '#6a994e', hat: '🪖', hp: 130, desc: '+30 HP' },
    { id: 'o_robot', name: 'Cyber Bot', price: 1500, color: '#adb5bd', hat: '🤖', hp: 150, desc: '+50 HP' },
    { id: 'o_king', name: 'Battle King', price: 3000, color: '#ffd166', hat: '👑', hp: 175, desc: '+75 HP' },
    { id: 'o_ghost', name: 'Ghost Lord', price: 4500, color: '#e0aaff', hat: '👻', hp: 200, desc: '+100 HP' },
    { id: 'o_wizard', name: 'Dark Wizard', price: 2000, color: '#6a4c93', hat: '🧙', hp: 140, desc: '+40 HP' },
    { id: 'o_pumpkin', name: 'Pumpkin Knight', price: 3500, color: '#ff7f11', hat: '🎃', hp: 160, desc: '+60 HP' },
    { id: 'o_shinobu', name: 'Shinobu', price: 7000, color: '#b794f4', hat: '🦋', hp: 180, desc: 'Butterfly Hashira. +80 HP' },
    { id: 'o_karate', name: 'Karate Master', price: 600, color: '#f1f1f1', hat: '🥋', hp: 120, desc: '+20 HP' },
    { id: 'o_cowboy', name: 'Outlaw Cowboy', price: 900, color: '#a0693a', hat: '🤠', hp: 125, desc: '+25 HP' },
    { id: 'o_alien', name: 'Alien Invader', price: 1800, color: '#3a7d44', hat: '👽', hp: 145, desc: '+45 HP' },
    { id: 'o_zombie', name: 'Zombie Brute', price: 2500, color: '#556b2f', hat: '🧟', hp: 155, desc: '+55 HP' },
    { id: 'o_vampire', name: 'Night Vampire', price: 3200, color: '#7a0f2b', hat: '🧛', hp: 165, desc: '+65 HP' },
    { id: 'o_hero', name: 'Super Hero', price: 5000, color: '#1d4ed8', hat: '🦸', hp: 190, desc: '+90 HP' },
    { id: 'o_dragon', name: 'Dragon Warrior', price: 6500, color: '#b91c1c', hat: '🐲', hp: 210, desc: '+110 HP' },
    { id: 'o_phoenix', name: 'Phoenix Legend', price: 9000, color: '#ff6a00', hat: '🔥', hp: 230, desc: '+130 HP. Legendary.' },
    /* ---- NEW (v14) ---- */
    { id: 'o_samurai', name: 'Ronin Samurai', price: 4200, color: '#c1121f', hat: '⚔️', hp: 170, desc: '+70 HP. Honour & steel.' },
    { id: 'o_frost', name: 'Frost Giant', price: 12000, color: '#7dd3fc', hat: '❄️', hp: 220, desc: '+120 HP. Cold as ice.' },
    { id: 'o_reaper', name: 'Shadow Reaper', price: 40000, color: '#1f1235', hat: '💀', hp: 260, rarity: 'epic', desc: '+160 HP. Silent harvest.' },
    { id: 'o_thunder', name: 'Thunder Lord', price: 70000, color: '#fde047', hat: '⚡', hp: 280, rarity: 'legendary', lvl: 30, desc: '+180 HP. LEVEL 30 REWARD.' },
    { id: 'o_cosmos', name: 'Cosmic Emperor', price: 150000, color: '#7c3aed', hat: '🌌', hp: 320, rarity: 'mythic', lvl: 75, desc: '+220 HP. LEVEL 75 REWARD.' },
  ] },
  car: { title: 'Cars', emoji: '🏎️', items: [
    { id: 'c_red', name: 'Red Spark', price: 0, color: '#ef233c', speed: 1, desc: 'Starter car.' },
    { id: 'c_blue', name: 'Blue Wave', price: 300, color: '#3a86ff', speed: 1.02, desc: 'Slightly faster.' },
    { id: 'c_yellow', name: 'Yellow Bee', price: 500, color: '#ffbe0b', speed: 1.04, desc: 'Quick & nimble.' },
    { id: 'c_sport', name: 'Pink Sport', price: 1200, color: '#ff006e', speed: 1.08, desc: '+8% speed.' },
    { id: 'c_police', name: 'Patrol X', price: 1800, color: '#1d3557', speed: 1.12, desc: '+12% speed.' },
    { id: 'c_gold', name: 'Golden GT', price: 4000, color: '#ffd700', speed: 1.18, desc: '+18% speed. Legend.' },
    /* ---- NEW (v14) ---- */
    { id: 'c_ice', name: 'Frost Racer', price: 2600, color: '#7dd3fc', speed: 1.14, desc: '+14% speed. Ice cold.' },
    { id: 'c_inferno', name: 'Inferno RS', price: 6500, color: '#ff4500', speed: 1.22, desc: '+22% speed. Burns the road.' },
    { id: 'c_phantom', name: 'Phantom GT', price: 14000, color: '#7c3aed', speed: 1.26, rarity: 'epic', desc: '+26% speed. A ghost on wheels.' },
    { id: 'c_royal', name: 'Royal Chariot', price: 40000, color: '#fbbf24', speed: 1.3, rarity: 'legendary', lvl: 20, desc: '+30% speed. LEVEL 20 REWARD.' },
  ] },
  ship: { title: 'Spaceships', emoji: '🚀', items: [
    { id: 's_scout', name: 'Scout', price: 0, color: '#4cc9f0', power: 1, desc: 'Starter ship.' },
    { id: 's_falcon', name: 'Falcon', price: 400, color: '#80ed99', power: 1.1, desc: '+10% damage.' },
    { id: 's_nova', name: 'Nova', price: 1200, color: '#ff9f1c', power: 1.25, desc: '+25% damage.' },
    { id: 's_phantom', name: 'Phantom', price: 2500, color: '#c77dff', power: 1.45, desc: '+45% damage.' },
    { id: 's_titan', name: 'Titan', price: 5000, color: '#ffd700', power: 1.7, desc: '+70% damage.' },
  ] },
  bird: { title: 'Birds', emoji: '🐤', items: [
    { id: 'b_chick', name: 'Chick', price: 0, emoji: '🐤', desc: 'Starter.' },
    { id: 'b_eagle', name: 'Eagle', price: 300, emoji: '🦅', desc: 'Sharp & proud.' },
    { id: 'b_owl', name: 'Owl', price: 500, emoji: '🦉', desc: 'Night flyer.' },
    { id: 'b_penguin', name: 'Penguin', price: 700, emoji: '🐧', desc: 'Funny flyer.' },
    { id: 'b_unicorn', name: 'Unicorn', price: 1500, emoji: '🦄', desc: 'Magic!' },
    { id: 'b_dragon', name: 'Dragon', price: 3000, emoji: '🐉', desc: 'Legendary.' },
    /* ---- NEW (v14) ---- */
    { id: 'b_flamingo', name: 'Flamingo', price: 1100, emoji: '🦩', desc: 'Pretty in pink.' },
    { id: 'b_peacock', name: 'Royal Peacock', price: 2200, emoji: '🦚', desc: 'Show-off feathers.' },
    { id: 'b_invader', name: 'Space Invader', price: 6000, emoji: '👾', rarity: 'epic', desc: 'From another galaxy.' },
    { id: 'b_ghost', name: 'Ghost Bird', price: 25000, emoji: '👻', rarity: 'legendary', lvl: 15, desc: 'LEVEL 15 REWARD. Boo!' },
  ] },
  runner: { title: 'Runners', emoji: '🏃', items: [
    { id: 'r_boy', name: 'Runner', price: 0, emoji: '🏃', desc: 'Starter.' },
    { id: 'r_ninja', name: 'Ninja', price: 400, emoji: '🥷', desc: 'Silent & fast.' },
    { id: 'r_hero', name: 'Super Hero', price: 900, emoji: '🦸', desc: 'Saves the day.' },
    { id: 'r_astro', name: 'Astronaut', price: 1500, emoji: '🧑‍🚀', desc: 'Out of this world.' },
    { id: 'r_dog', name: 'Speedy Dog', price: 600, emoji: '🐕', desc: 'Good boy!' },
    { id: 'r_dino', name: 'Dino', price: 2500, emoji: '🦖', desc: 'Roar!' },
    /* ---- NEW (v14) ---- */
    { id: 'r_robot', name: 'Robo Runner', price: 1200, emoji: '🤖', desc: 'Beep boop, go!' },
    { id: 'r_wizard', name: 'Wizard', price: 1800, emoji: '🧙', desc: 'Runs on magic.' },
    { id: 'r_zombie', name: 'Zombie', price: 2000, emoji: '🧟', desc: 'Slow? Never.' },
    { id: 'r_genie', name: 'Genie', price: 4500, emoji: '🧞', rarity: 'rare', desc: 'Your wish is a fast run.' },
    { id: 'r_unicorn', name: 'Unicorn', price: 8000, emoji: '🦄', rarity: 'epic', desc: 'Gallops through rainbows.' },
    { id: 'r_dragon', name: 'Fire Dragon', price: 20000, emoji: '🐉', rarity: 'epic', desc: 'Breathes fire as it runs.' },
    { id: 'r_alien', name: 'Alien', price: 45000, emoji: '👽', rarity: 'legendary', lvl: 35, desc: 'LEVEL 35 REWARD.' },
  ] },
  trail: { title: 'Run trails', emoji: '✨', items: [
    { id: 't_none', name: 'No trail', price: 0, color: '#9aa4b2', fx: 'none', desc: 'Clean and simple.' },
    { id: 't_spark', name: 'Sparkle', price: 300, color: '#ffe066', fx: 'spark', desc: 'Little golden sparks.' },
    { id: 't_fire', name: 'Fire Trail', price: 900, color: '#ff6b35', fx: 'fire', desc: 'Leave flames behind.' },
    { id: 't_ice', name: 'Frost Trail', price: 900, color: '#9be7ff', fx: 'ice', desc: 'Icy crystals.' },
    { id: 't_neon', name: 'Neon Pulse', price: 1500, color: '#00e5ff', fx: 'neon', desc: 'Glowing neon streaks.' },
    { id: 't_rainbow', name: 'Rainbow Road', price: 3500, color: '#ff4d6d', fx: 'rainbow', rarity: 'rare', desc: 'All the colours.' },
    { id: 't_galaxy', name: 'Galaxy Dust', price: 9000, color: '#b794f4', fx: 'galaxy', rarity: 'epic', desc: 'Stardust follows you.' },
    { id: 't_aura', name: 'Golden Aura', price: 50000, color: '#ffd700', fx: 'gold', rarity: 'legendary', lvl: 45, desc: 'LEVEL 45 REWARD.' },
  ] },
  snake: { title: 'Snake skins', emoji: '🐍', items: [
    { id: 'n_green', name: 'Green', price: 0, c1: '#57d6a0', c2: '#1b9c6b', desc: 'Starter.' },
    { id: 'n_blue', name: 'Ice Blue', price: 200, c1: '#63b3ff', c2: '#2a6fd6', desc: 'Cool.' },
    { id: 'n_fire', name: 'Fire', price: 800, c1: '#ffb347', c2: '#ff3d2e', desc: 'Hot!' },
    { id: 'n_rainbow', name: 'Rainbow', price: 1200, c1: 'rainbow', c2: '#fff', desc: 'Colours cycle.' },
    { id: 'n_gold', name: 'Golden', price: 2500, c1: '#ffe066', c2: '#e0a100', desc: 'Shiny.' },
    /* ---- NEW (v14) ---- */
    { id: 'n_lava', name: 'Lava', price: 1800, c1: '#ff9a3c', c2: '#c1121f', desc: 'Molten scales.' },
    { id: 'n_toxic', name: 'Toxic', price: 3000, c1: '#b6ff3b', c2: '#2d6a4f', desc: 'Radioactive green.' },
    { id: 'n_galaxy', name: 'Galaxy', price: 6000, c1: '#b794f4', c2: '#3a0ca3', rarity: 'epic', desc: 'Purple space snake.' },
    { id: 'n_diamond', name: 'Diamond', price: 30000, c1: '#bff3ff', c2: '#38bdf8', rarity: 'legendary', lvl: 40, desc: 'LEVEL 40 REWARD.' },
  ] },
  piece: { title: 'Chess pieces', emoji: '♟️', items: [
    { id: 'p_classic', name: 'Classic', price: 0, w: '#ffffff', b: '#1a1a24', glow: '', desc: 'Starter set.' },
    { id: 'p_wood', name: 'Wood', price: 600, w: '#f1d9a8', b: '#5b3a1e', glow: '', desc: 'Warm wooden look.' },
    { id: 'p_neon', name: 'Neon', price: 400, w: '#00e5ff', b: '#ff3d9a', glow: '1', desc: 'Glowing pieces.' },
    { id: 'p_gold', name: 'Royal Gold', price: 1000, w: '#ffe066', b: '#6a1b9a', glow: '1', desc: 'Gold vs purple.' },
    { id: 'p_ice', name: 'Ice & Fire', price: 1500, w: '#bfeaff', b: '#ff5a1f', glow: '1', desc: 'Frozen vs flames.' },
    /* ---- NEW (v14) ---- */
    { id: 'p_marble', name: 'Marble', price: 1200, w: '#f5f5f4', b: '#44403c', glow: '', desc: 'Museum quality.' },
    { id: 'p_jade', name: 'Jade', price: 2800, w: '#bbf7d0', b: '#14532d', glow: '1', desc: 'Glowing green jade.' },
    { id: 'p_flame', name: 'Obsidian Flame', price: 6500, w: '#fca5a5', b: '#111111', glow: '1', rarity: 'epic', desc: 'Red fire vs black glass.' },
    { id: 'p_cosmic', name: 'Cosmic Set', price: 35000, w: '#c4b5fd', b: '#1e1b4b', glow: '1', rarity: 'legendary', lvl: 50, desc: 'LEVEL 50 REWARD.' },
  ] },
  ball: { title: 'Balls', emoji: '⚪', items: [
    { id: 'l_white', name: 'White', price: 0, color: '#ffffff', desc: 'Starter.' },
    { id: 'l_fire', name: 'Fire Ball', price: 300, color: '#ff6b35', desc: 'Burning!' },
    { id: 'l_ice', name: 'Ice Ball', price: 300, color: '#9be7ff', desc: 'Frozen.' },
    { id: 'l_rainbow', name: 'Rainbow', price: 900, color: 'rainbow', desc: 'Colours cycle.' },
    { id: 'l_gold', name: 'Gold', price: 2000, color: '#ffd700', desc: 'Pure gold.' },
    /* ---- NEW (v14) ---- */
    { id: 'l_neon', name: 'Neon Green', price: 600, color: '#7cfc00', desc: 'Glows green.' },
    { id: 'l_plasma', name: 'Plasma', price: 1800, color: '#d946ef', desc: 'Electric purple.' },
    { id: 'l_diamond', name: 'Diamond', price: 5000, color: '#bff3ff', rarity: 'epic', desc: 'Sparkling ice-blue.' },
    { id: 'l_cosmic', name: 'Cosmic Orb', price: 30000, color: '#a78bfa', rarity: 'legendary', lvl: 55, desc: 'LEVEL 55 REWARD.' },
  ] },
  dice: { title: 'Ludo dice', emoji: '🎲', items: [
    { id: 'd_classic', name: 'Classic', price: 0, bg: 'linear-gradient(135deg,#00e5ff,#ff3d9a)', fg: '#10061f', glow: '', desc: 'Starter dice.' },
    { id: 'd_gold', name: 'Gold Dice', price: 300, bg: '#ffd700', fg: '#5a3b00', glow: '', desc: 'Shiny gold.' },
    { id: 'd_ruby', name: 'Ruby Dice', price: 600, bg: '#e63946', fg: '#ffffff', glow: '', desc: 'Deep red ruby.' },
    { id: 'd_neon', name: 'Neon Dice', price: 900, bg: '#10002b', fg: '#00e5ff', glow: '#00e5ff', desc: 'Glowing neon.' },
    { id: 'd_galaxy', name: 'Galaxy Dice', price: 1500, bg: '#3a0ca3', fg: '#ffd6ff', glow: '#b5179e', desc: 'Purple galaxy glow.' },
    { id: 'd_diamond', name: 'Diamond Dice', price: 2500, bg: '#bff3ff', fg: '#0077b6', glow: '#7ee8ff', desc: 'Legendary diamond.' },
    /* ---- NEW (v14) ---- */
    { id: 'd_emerald', name: 'Emerald Dice', price: 1200, bg: '#10b981', fg: '#064e3b', glow: '', desc: 'Deep green gem.' },
    { id: 'd_obsidian', name: 'Obsidian Dice', price: 4000, bg: '#111827', fg: '#f87171', glow: '#ef4444', rarity: 'epic', desc: 'Black glass, red pips.' },
    { id: 'd_cosmic', name: 'Cosmic Dice', price: 30000, bg: '#1e1b4b', fg: '#fde68a', glow: '#a78bfa', rarity: 'legendary', lvl: 65, desc: 'LEVEL 65 REWARD.' },
  ] },
  token: { title: 'Ludo tokens', emoji: '♟', items: [
    { id: 'k_classic', name: 'Classic', price: 0, ring: '#ffffff', dot: '#ffffff', desc: 'Starter tokens.' },
    { id: 'k_gold', name: 'Gold Ring', price: 400, ring: '#ffd700', dot: '#ffd700', desc: 'Golden outline.' },
    { id: 'k_black', name: 'Shadow', price: 700, ring: '#0b0b0f', dot: '#8d99ae', desc: 'Dark outline.' },
    { id: 'k_neon', name: 'Neon', price: 1000, ring: '#00e5ff', dot: '#ff3d9a', desc: 'Neon glow ring.' },
    { id: 'k_royal', name: 'Royal', price: 1800, ring: '#ffd700', dot: '#6a1b9a', desc: 'Gold ring, purple jewel.' },
    /* ---- NEW (v14) ---- */
    { id: 'k_emerald', name: 'Emerald', price: 1100, ring: '#10b981', dot: '#6ee7b7', desc: 'Green gem tokens.' },
    { id: 'k_crystal', name: 'Crystal', price: 3500, ring: '#67e8f9', dot: '#a5f3fc', rarity: 'rare', desc: 'Clear crystal glow.' },
    { id: 'k_dragon', name: 'Dragon Scale', price: 35000, ring: '#ef4444', dot: '#fbbf24', rarity: 'legendary', lvl: 70, desc: 'LEVEL 70 REWARD.' },
  ] },
  cardback: { title: 'UNO card backs', emoji: '🃏', items: [
    { id: 'u_classic', name: 'Classic', price: 0, c1: '#e53935', c2: '#111111', desc: 'Starter back.' },
    { id: 'u_ocean', name: 'Ocean', price: 300, c1: '#2dd4ff', c2: '#03324f', desc: 'Cool blue.' },
    { id: 'u_neon', name: 'Neon Pink', price: 600, c1: '#ff3d9a', c2: '#1a0033', desc: 'Pink neon.' },
    { id: 'u_forest', name: 'Forest', price: 900, c1: '#80ed99', c2: '#0b3d20', desc: 'Green woods.' },
    { id: 'u_galaxy', name: 'Galaxy', price: 1500, c1: '#b794f4', c2: '#0a0020', desc: 'Purple space.' },
    { id: 'u_gold', name: 'Royal Gold', price: 2500, c1: '#ffd700', c2: '#4a2c00', desc: 'Legendary gold.' },
    /* ---- NEW (v14) ---- */
    { id: 'u_sakura', name: 'Sakura', price: 900, c1: '#f9a8d4', c2: '#831843', desc: 'Pink blossoms.' },
    { id: 'u_lava', name: 'Lava', price: 1800, c1: '#fb923c', c2: '#450a0a', desc: 'Hot magma.' },
    { id: 'u_diamond', name: 'Diamond', price: 5000, c1: '#a5f3fc', c2: '#0c4a6e', rarity: 'epic', desc: 'Icy diamond shine.' },
    { id: 'u_cosmic', name: 'Cosmic Void', price: 30000, c1: '#c084fc', c2: '#020617', rarity: 'legendary', lvl: 80, desc: 'LEVEL 80 REWARD.' },
  ] },
  hero: { title: 'Devil heroes', emoji: '😈', items: [
    { id: 'h_shadow', name: 'Shadow', price: 0, color: '#1d2433', hat: '', desc: 'Starter hero.' },
    { id: 'h_red', name: 'Red Rascal', price: 250, color: '#c1121f', hat: '', desc: 'Bold red.' },
    { id: 'h_robot', name: 'Robo', price: 700, color: '#8d99ae', hat: '🤖', desc: 'Metal hero.' },
    { id: 'h_ninja', name: 'Ninja', price: 1000, color: '#0b0b0f', hat: '🥷', desc: 'Silent & deadly.' },
    { id: 'h_pumpkin', name: 'Pumpkin', price: 1500, color: '#ff7f11', hat: '🎃', desc: 'Spooky orange.' },
    { id: 'h_ghost', name: 'Ghost', price: 2000, color: '#f1faee', hat: '👻', desc: 'Boo!' },
    { id: 'h_king', name: 'King', price: 3000, color: '#ffb703', hat: '👑', desc: 'Royal hero.' },
    /* ---- NEW (v14) ---- */
    { id: 'h_zombie', name: 'Zombie', price: 1200, color: '#6b8e23', hat: '🧟', desc: 'Undead hero.' },
    { id: 'h_wizard', name: 'Wizard', price: 2400, color: '#6d28d9', hat: '🧙', desc: 'Casts jump spells.' },
    { id: 'h_dragon', name: 'Dragon Knight', price: 6000, color: '#b91c1c', hat: '🐲', rarity: 'epic', desc: 'Fierce red knight.' },
    { id: 'h_cosmic', name: 'Cosmic Hero', price: 40000, color: '#7c3aed', hat: '🌌', rarity: 'legendary', lvl: 85, desc: 'LEVEL 85 REWARD.' },
  ] },
  racket: { title: 'Rackets', emoji: '🏸', items: [
    { id: 'rk_club', name: 'Club Racket', price: 0, color: '#60e8ff', reach: 1, power: 1, desc: 'Starter racket.' },
    { id: 'rk_red', name: 'Red Smash', price: 400, color: '#ef4444', reach: 1.05, power: 1.05, desc: '+5% reach.' },
    { id: 'rk_green', name: 'Carbon Green', price: 900, color: '#34d399', reach: 1.1, power: 1.08, desc: '+10% reach.' },
    { id: 'rk_gold', name: 'Golden Pro', price: 2500, color: '#ffd700', reach: 1.18, power: 1.12, desc: '+18% reach. Pro level.' },
    { id: 'rk_neon', name: 'Neon Blade', price: 5000, color: '#d946ef', reach: 1.25, power: 1.15, glow: 1, rarity: 'epic', desc: '+25% reach. Glows.' },
    { id: 'rk_dragon', name: 'Dragon Fang', price: 12000, color: '#ff4500', reach: 1.32, power: 1.2, glow: 1, rarity: 'epic', desc: '+32% reach. Fiery.' },
    { id: 'rk_galaxy', name: 'Galaxy Strike', price: 60000, color: '#a78bfa', reach: 1.42, power: 1.3, glow: 1, rarity: 'legendary', lvl: 90, desc: '+42% reach. LEVEL 90 REWARD.' },
  ] },
  shuttle: { title: 'Shuttles', emoji: '🪶', items: [
    { id: 'sh_white', name: 'Classic', price: 0, color: '#ffffff', fx: 'none', desc: 'Standard shuttle.' },
    { id: 'sh_yellow', name: 'Tournament', price: 300, color: '#ffe066', fx: 'none', desc: 'Bright yellow.' },
    { id: 'sh_fire', name: 'Fire Shuttle', price: 900, color: '#ff6b35', fx: 'trail', desc: 'Flaming trail.' },
    { id: 'sh_ice', name: 'Ice Shuttle', price: 900, color: '#9be7ff', fx: 'trail', desc: 'Frozen trail.' },
    { id: 'sh_rainbow', name: 'Rainbow', price: 2500, color: '#ff4d6d', fx: 'rainbow', rarity: 'rare', desc: 'All the colours.' },
    { id: 'sh_comet', name: 'Comet', price: 8000, color: '#fbbf24', fx: 'comet', rarity: 'epic', desc: 'Long blazing tail.' },
    { id: 'sh_galaxy', name: 'Galaxy Shuttle', price: 40000, color: '#c084fc', fx: 'comet', rarity: 'legendary', lvl: 95, desc: 'LEVEL 95 REWARD.' },
  ] },
  disc: { title: 'C4 discs', emoji: '🔴', items: [
    { id: 'dc_classic', name: 'Classic', price: 0, r: ['#ff9aae', '#ff2d55', '#a80027'], y: ['#fff3a8', '#ffd23f', '#b98600'], desc: 'Red & yellow.' },
    { id: 'dc_ocean', name: 'Ocean', price: 500, r: ['#a5f3fc', '#06b6d4', '#0e7490'], y: ['#bbf7d0', '#22c55e', '#166534'], desc: 'Blue vs green.' },
    { id: 'dc_candy', name: 'Candy', price: 900, r: ['#fbcfe8', '#ec4899', '#9d174d'], y: ['#fde68a', '#f59e0b', '#92400e'], desc: 'Sweet colours.' },
    { id: 'dc_neon', name: 'Neon', price: 2000, r: ['#f0abfc', '#d946ef', '#701a75'], y: ['#a5f3fc', '#22d3ee', '#155e75'], rarity: 'rare', desc: 'Pink vs cyan glow.' },
    { id: 'dc_gold', name: 'Gold & Silver', price: 6000, r: ['#fff7ae', '#ffd700', '#a16207'], y: ['#f8fafc', '#cbd5e1', '#64748b'], rarity: 'epic', desc: 'Precious metals.' },
    { id: 'dc_cosmic', name: 'Cosmic', price: 30000, r: ['#ddd6fe', '#8b5cf6', '#3b0764'], y: ['#fecdd3', '#fb7185', '#881337'], rarity: 'legendary', lvl: 100, desc: 'LEVEL 100 REWARD.' },
  ] },
  xo: { title: 'X / O styles', emoji: '❌', items: [
    { id: 'xo_classic', name: 'Classic', price: 0, x: '#ff4d9a', o: '#3de1ff', desc: 'Pink X, blue O.' },
    { id: 'xo_fire', name: 'Fire & Ice', price: 500, x: '#ff6b35', o: '#9be7ff', desc: 'Hot vs cold.' },
    { id: 'xo_lime', name: 'Lime & Violet', price: 900, x: '#b6ff3b', o: '#a78bfa', desc: 'Fresh combo.' },
    { id: 'xo_gold', name: 'Gold & Silver', price: 2500, x: '#ffd700', o: '#e2e8f0', rarity: 'rare', desc: 'Shiny marks.' },
    { id: 'xo_plasma', name: 'Plasma', price: 7000, x: '#39ff14', o: '#f472b6', rarity: 'epic', desc: 'Electric glow.' },
  ] },
  hammer: { title: 'Hammers', emoji: '🔨', items: [
    { id: 'hm_wood', name: 'Wood Hammer', price: 0, emoji: '🔨', fx: '#ffffff', desc: 'Starter hammer.' },
    { id: 'hm_bat', name: 'Baseball Bat', price: 400, emoji: '🏏', fx: '#ffd166', desc: 'Home run!' },
    { id: 'hm_axe', name: 'Battle Axe', price: 1200, emoji: '🪓', fx: '#ff9f1c', desc: 'Chop chop.' },
    { id: 'hm_sword', name: 'Hero Sword', price: 2500, emoji: '🗡️', fx: '#9be7ff', rarity: 'rare', desc: 'Slash the moles.' },
    { id: 'hm_wand', name: 'Magic Wand', price: 6000, emoji: '🪄', fx: '#e879f9', rarity: 'epic', desc: 'Sparkly whacks.' },
    { id: 'hm_trident', name: 'Golden Trident', price: 25000, emoji: '🔱', fx: '#ffd700', rarity: 'legendary', desc: 'Poseidon\'s power.' },
  ] },
};
/* Rarity: explicit it.rarity, otherwise worked out from the price. Level-reward items carry it.lvl. */
const RARITY = { common: { n: 'COMMON', c: '#9aa4b2' }, rare: { n: 'RARE', c: '#38bdf8' }, epic: { n: 'EPIC', c: '#c084fc' }, legendary: { n: 'LEGENDARY', c: '#ffb82e' }, mythic: { n: 'MYTHIC', c: '#ff3d9a' } };
const rarityOf = it => it.rarity || (it.price >= 60000 ? 'legendary' : it.price >= 5000 ? 'epic' : it.price >= 2500 ? 'rare' : 'common');
const ALL_ITEMS = {};
Object.keys(SHOP).forEach(s => SHOP[s].items.forEach(i => { i.slot = s; ALL_ITEMS[i.id] = i; }));
GAMES.forEach(g => { if (g.shop.indexOf('char') < 0) g.shop.push('char'); });          // every game can use a character
const USED = {}; GAMES.forEach(g => g.shop.forEach(k => USED[k] = 1));                   // slots no game uses (old Spaceships) are hidden from shop + Lucky Spin
const perkText = p => [p.coin && '+' + Math.round(p.coin * 100) + '% Gold', p.xp && '+' + Math.round(p.xp * 100) + '% XP', p.hp && '+' + p.hp + ' HP', p.luck && '+' + Math.round(p.luck * 100) + '% spin luck'].filter(Boolean).join(' · ');

/* ------------------------------ figures: pictures for shop items + in-game gun skins ------------------------------ */
const hx = c => { c = String(c || '#888').replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c, 16); return isNaN(n) ? [136, 136, 136] : [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const shade = (c, f) => { if (!/^#/.test(c || '')) return c; const [r, g, b] = hx(c); const m = v => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)))); return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join(''); };
/* gun shapes: [x, y, w, h, colour]  (64 x 30 box, barrel points right). c=skin colour a=light accent k=gunmetal m=metal g=glow */
const GUN_PARTS = {
  g_pistol: [[10,8,30,8,'c'],[40,9,8,4,'m'],[14,16,9,13,'k'],[10,8,30,2,'a']],
  g_smg: [[2,9,8,6,'k'],[10,8,34,9,'c'],[44,10,12,4,'m'],[22,17,6,12,'k'],[12,17,6,8,'k'],[14,5,16,3,'a']],
  g_ar: [[0,9,12,9,'k'],[12,8,30,9,'c'],[42,9,14,7,'k'],[56,11,8,3,'m'],[26,17,6,12,'k'],[18,4,12,4,'m'],[14,17,5,8,'k'],[12,8,30,2,'a']],
  g_shotgun: [[0,10,12,8,'k'],[12,10,26,8,'c'],[38,10,26,4,'m'],[38,14,26,3,'m'],[42,17,12,5,'k'],[14,18,6,8,'k']],
  g_sniper: [[0,10,14,9,'k'],[14,10,28,6,'c'],[42,11,22,3,'m'],[18,2,20,6,'m'],[20,4,4,2,'g'],[34,16,3,10,'k'],[22,16,5,10,'k']],
  g_golden: [[0,9,12,9,'k'],[12,8,30,9,'c'],[42,9,14,7,'a'],[56,11,8,3,'m'],[26,17,6,12,'k'],[18,4,12,4,'a'],[14,17,5,8,'k'],[18,12,20,2,'a'],[12,8,30,2,'a']],
  g_twin: [[4,8,14,9,'k'],[18,5,30,7,'c'],[18,13,30,7,'c'],[48,6,14,4,'m'],[48,14,14,4,'m'],[10,17,6,11,'k'],[20,9,24,2,'a']],
  g_laser: [[2,10,12,8,'k'],[14,8,30,11,'c'],[44,11,16,5,'m'],[60,12,4,3,'g'],[18,10,22,2,'g'],[18,15,22,2,'g'],[24,19,6,10,'k']],
  g_inferno: [[2,10,12,9,'k'],[14,7,22,14,'c'],[36,5,24,18,'m'],[58,9,6,10,'g'],[40,9,14,3,'g'],[40,16,14,3,'g'],[18,21,6,8,'k']],
  g_mini: [[2,9,10,12,'k'],[12,6,22,18,'c'],[34,7,26,3,'m'],[34,12,26,3,'m'],[34,17,26,3,'m'],[60,6,4,15,'g'],[16,24,10,5,'k'],[16,9,14,3,'a']],
  g_rail: [[0,11,12,8,'k'],[12,9,30,12,'c'],[42,8,22,3,'m'],[42,19,22,3,'m'],[42,12,22,6,'g'],[18,12,16,2,'a'],[16,21,6,8,'k']],
  g_dragon: [[0,10,12,8,'k'],[12,8,26,11,'c'],[38,6,12,15,'a'],[50,9,12,9,'c'],[60,10,4,7,'g'],[44,3,6,4,'c'],[18,19,6,9,'k']],
  g_void: [[0,9,13,10,'k'],[13,8,32,10,'c'],[45,10,18,5,'m'],[22,3,14,5,'k'],[26,5,6,2,'g'],[20,11,20,2,'g'],[28,18,6,11,'k']],
  g_frost: [[0,10,12,8,'k'],[12,9,30,9,'c'],[42,10,16,5,'m'],[58,11,6,3,'g'],[18,5,16,4,'a'],[22,18,6,10,'k'],[14,9,26,2,'a'],[30,3,6,3,'g']],
  g_plasma: [[2,10,10,9,'k'],[12,7,26,14,'c'],[38,10,18,6,'m'],[56,9,8,8,'g'],[16,9,18,3,'g'],[16,15,18,3,'g'],[20,21,6,8,'k'],[26,3,8,4,'a']],
  g_storm: [[0,10,12,9,'k'],[12,6,26,16,'c'],[38,5,22,4,'g'],[38,12,24,4,'g'],[38,19,22,4,'g'],[14,10,20,3,'a'],[22,22,6,8,'k'],[28,2,10,4,'a']],
  g_nebula: [[0,9,12,12,'a'],[12,6,24,16,'c'],[36,8,12,5,'g'],[36,15,12,5,'g'],[48,9,16,3,'m'],[48,16,16,3,'m'],[16,9,16,3,'g'],[20,22,6,8,'k'],[14,3,10,4,'a'],[26,3,6,3,'g']],
  g_divine: [[0,9,13,11,'a'],[13,7,34,13,'c'],[47,9,16,7,'a'],[63,10,1,5,'g'],[22,3,16,4,'a'],[24,11,22,3,'g'],[26,20,7,9,'k'],[16,4,3,3,'g']],
};
const gunItem = g => (g && (ALL_ITEMS[g.id] || Object.values(ALL_ITEMS).find(i => i.slot === 'gun' && i.name === g.name))) || ALL_ITEMS.g_pistol;
function gunParts(g) {
  const it = gunItem(g), c = it.color || '#ffd166', pal = { c, a: shade(c, 1.55), k: '#2a2d34', m: '#aeb6c2', g: shade(c, 1.25) };
  return (GUN_PARTS[it.id] || GUN_PARTS.g_pistol).map(p => ({ x: p[0], y: p[1], w: p[2], h: p[3], col: pal[p[4]], glow: p[4] === 'g' }));
}
function drawGun(ctx, g, len) {
  const ps = gunParts(g); let W = 0; ps.forEach(q => W = Math.max(W, q.x + q.w)); const s = (len || W * .5) / W;
  ctx.save(); ctx.translate(4, -14 * s); ctx.scale(s, s); ctx.lineWidth = 1.2; ctx.strokeStyle = '#0b0b12';
  ps.forEach(q => { ctx.fillStyle = q.col; if (q.glow) { ctx.shadowColor = q.col; ctx.shadowBlur = 8; } else ctx.shadowBlur = 0; ctx.fillRect(q.x, q.y, q.w, q.h); ctx.shadowBlur = 0; ctx.strokeRect(q.x, q.y, q.w, q.h); });
  ctx.restore();
}
const gunSVG = (g, h) => { const ps = gunParts(g), c = gunItem(g).color;
  return `<svg viewBox="-2 -1 68 32" height="${h || 44}" style="filter:drop-shadow(0 0 5px ${c}88)">` + ps.map(p => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1.5" fill="${p.col}" stroke="#0b0b12" stroke-width=".9"/>`).join('') + '</svg>'; };
/* hat drawing on a 60 x 80 character (head centre 30,20) */
function hatSVG(hat, col) {
  const R = (x, y, w, h, f, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx || 1}" fill="${f}"/>`;
  switch (hat) {
    case '🥷': return R(18, 15, 24, 6, '#111') + R(18, 12, 24, 3, '#e63946') + '<rect x="40" y="14" width="10" height="3" fill="#e63946" transform="rotate(20 40 15)"/>';
    case '🪖': return '<path d="M17 19a13 13 0 0 1 26 0z" fill="#4f772d" stroke="#2f4a1a"/>' + R(15, 18, 30, 3, '#3a5a22');
    case '🤖': return R(29, 4, 2, 7, '#adb5bd') + '<circle cx="30" cy="3" r="3" fill="#ff3d3d"/>';
    case '👑': return '<path d="M19 12l3-10 4 7 4-9 4 9 4-7 3 10z" fill="#ffd700" stroke="#b8860b"/>';
    case '🎩': return R(16, 11, 28, 3, '#222') + R(21, -2, 18, 13, '#222') + R(21, 6, 18, 3, '#c1121f');
    case '🧢': return '<path d="M18 17a12 10 0 0 1 24 0z" fill="#3a86ff"/>' + R(30, 15, 17, 3, '#2a63c4');
    case '🧙': return '<path d="M14 15h32l-16-26z" fill="#4b2e83" stroke="#2c1a52"/>' + R(14, 13, 32, 3, '#4b2e83') + R(21, 8, 18, 2, '#ffd166');
    case '🎃': return R(28, 5, 4, 6, '#2d6a4f');
    case '🤠': return '<path d="M8 14q22 8 44 0l-4-3q-18 5-36 0z" fill="#8b5a2b"/><path d="M19 12q-1-9 11-9t11 9z" fill="#a0693a"/>' + R(19, 9, 22, 2, '#5a3a1a');
    case '👽': return '<path d="M23 11l-5-9M37 11l5-9" stroke="#7cfc00" stroke-width="2"/><circle cx="18" cy="2" r="2.5" fill="#7cfc00"/><circle cx="42" cy="2" r="2.5" fill="#7cfc00"/>';
    case '🧟': return '<path d="M19 14q3-6 6-3t5-3 6 3 5-1l1 5z" fill="#3b4a3b"/>';
    case '🧛': return '<path d="M18 18q0-12 12-12t12 12l-6-5-6 4-6-4z" fill="#101018"/>';
    case '🦸': return R(18, 15, 24, 5, '#d00000', 2) + R(20, 3, 20, 3, '#222');
    case '🐲': return '<path d="M20 12l-5-12 9 7zM40 12l5-12-9 7z" fill="#ffd166" stroke="#a66b00"/>';
    case '🔥': return '<path d="M20 12q-2-9 4-11-1 6 3 7 0-8 4-10 1 7 5 8 3-3 4-6 2 8-1 12z" fill="#ff7b00"/><path d="M25 12q0-5 5-7 1 4 4 7z" fill="#ffd166"/>';
    case '🥋': return R(18, 13, 24, 4, '#ffffff') + R(40, 13, 4, 10, '#ffffff');
    case '⚔️': return '<path d="M20 12l20-12M40 12L20 0" stroke="#e2e8f0" stroke-width="3"/><rect x="18" y="13" width="24" height="4" fill="#7f1d1d"/>';
    case '❄️': return '<path d="M20 15l5-9 5 6 5-8 5 11z" fill="#bae6fd" stroke="#7dd3fc"/>';
    case '💀': return '<path d="M17 18q0-14 13-14t13 14z" fill="#1f1235"/><circle cx="25" cy="10" r="2" fill="#a78bfa"/><circle cx="35" cy="10" r="2" fill="#a78bfa"/>';
    case '⚡': return '<path d="M30 -4l-9 14h7l-3 10 12-16h-8z" fill="#fde047" stroke="#ca8a04"/>';
    case '🌌': return '<path d="M16 17q0-14 14-14t14 14l-4-3-4 3-6-4-6 4-4-3z" fill="#4c1d95"/><circle cx="24" cy="9" r="1.4" fill="#fff"/><circle cx="34" cy="7" r="1.1" fill="#fff"/><circle cx="38" cy="12" r="1.2" fill="#fbcfe8"/>';
    case '👻': return '';
    case '🦋': return '<path d="M17 20q-3-16 13-17t13 17q0 14 5 24-9-1-10-10l-2-8H24l-2 8q-1 9-10 10 5-10 5-24z" fill="#5b3a9e"/><text x="23" y="9" font-size="10">🦋</text>';
    default: return '<path d="M19 17q0-9 11-9t11 9q-6-5-11-4t-11 4z" fill="#4a2f1b"/>';
  }
}
function personSVG(it, h) {
  const col = it.color || '#4cc9f0', hat = it.hat || '', dk = shade(col, .55);
  const headCol = { '🤖': '#adb5bd', '🎃': '#ff7f11', '👽': '#7cfc00', '🧟': '#8fbc8f', '🧛': '#efe3e3', '🐲': '#e63946' }[hat] || '#f1c27d';
  const cape = hat === '🦸' ? '<path d="M18 30l-8 36h40l-8-36z" fill="#d00000"/>' : hat === '🧛' ? '<path d="M18 30l-9 38h42l-9-38z" fill="#5a0a18"/>' : '';
  const eye = hat === '🤖' ? '#00e5ff' : '#1b1b1b';
  const op = hat === '👻' ? ' opacity=".6"' : '';
  const wings = hat === '🦋' ? '<path d="M22 40l8 6 8-6-4 12H26z" fill="#e0c3ff" opacity=".85"/>' : '';
  return `<svg viewBox="-6 -12 72 96" height="${h || 66}" style="filter:drop-shadow(0 2px 4px #0008)"><g${op}>${cape}` +
    `<rect x="22" y="52" width="7" height="20" rx="2" fill="${dk}"/><rect x="31" y="52" width="7" height="20" rx="2" fill="${dk}"/><rect x="20" y="70" width="10" height="6" rx="2" fill="#222"/><rect x="30" y="70" width="10" height="6" rx="2" fill="#222"/>` +
    `<rect x="18" y="30" width="24" height="25" rx="5" fill="${col}"/><rect x="18" y="48" width="24" height="3" fill="${shade(col, .7)}"/>${wings}` +
    `<rect x="9" y="31" width="9" height="21" rx="4" fill="${col}"/><rect x="42" y="31" width="9" height="21" rx="4" fill="${col}"/><circle cx="13.5" cy="53" r="4" fill="#f1c27d"/><circle cx="46.5" cy="53" r="4" fill="#f1c27d"/>` +
    `<circle cx="30" cy="21" r="11" fill="${headCol}"/><circle cx="26" cy="21" r="1.6" fill="${eye}"/><circle cx="34" cy="21" r="1.6" fill="${eye}"/><path d="M27 26q3 2 6 0" stroke="#7a3b1e" stroke-width="1.2" fill="none"/>` +
    hatSVG(hat, col) + '</g></svg>';
}

/* ---- Characters (Arihant, Atharv, Arnav, Dhiraj, Sahil, Himanshu) ---- */
function charSVG(it, h) {
  const L = it.look || {}, skin = L.skin || '#f1c27d', hc = L.hair || '#222', col = it.color || '#4cc9f0', dk = shade(col, .55);
  const hs = { short: `<path d="M19 19q0-11 11-11t11 11q-5-5-11-4t-11 4z" fill="${hc}"/>`,
    spiky: `<path d="M19 19l1-10 5 5 5-9 5 9 5-5 1 10q-5-5-11-4t-11 4z" fill="${hc}"/>`,
    side: `<path d="M19 19q0-12 12-11t10 11q-3-6-9-5-6 0-13 5z" fill="${hc}"/><path d="M19 19q2-8 11-8" stroke="${shade(hc, 1.5)}" fill="none"/>`,
    buzz: `<path d="M19 17q0-9 11-9t11 9q-5-3-11-3t-11 3z" fill="${hc}" opacity=".85"/>`,
    curly: [[21, 12, 5], [30, 9, 6], [39, 12, 5], [19, 18, 3.5], [41, 18, 3.5]].map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fill="${hc}"/>`).join(''),
    swoop: `<path d="M18 20q-2-13 12-13 13 0 12 13-3-8-10-8-5 0-9 3-3 2-5 5z" fill="${hc}"/><path d="M24 10q6-2 12 1" stroke="#facc15" stroke-width="1.6" fill="none"/>` }[L.hs] || '';
  const acc = { cap: `<path d="M18 16a12 9 0 0 1 24 0z" fill="#e63946"/><rect x="11" y="15" width="13" height="3" rx="1.5" fill="#b91c2c"/>`,
    band: `<rect x="19" y="12" width="22" height="3.5" fill="#fff"/><circle cx="30" cy="13.7" r="1.6" fill="#e63946"/>`,
    glasses: `<circle cx="26" cy="21" r="3.6" fill="#ffffff22" stroke="#111" stroke-width="1.2"/><circle cx="34" cy="21" r="3.6" fill="#ffffff22" stroke="#111" stroke-width="1.2"/><path d="M29.6 21h.8" stroke="#111"/>`,
    beard: `<path d="M20 23q0 11 10 11t10-11q-4 5-10 5t-10-5z" fill="${hc}"/>`,
    phones: `<path d="M18 21a12 12 0 0 1 24 0" stroke="#222" stroke-width="2.6" fill="none"/><rect x="15" y="19" width="4.5" height="8" rx="2" fill="#a855f7"/><rect x="40.5" y="19" width="4.5" height="8" rx="2" fill="#a855f7"/>`,
    crown: `<path d="M19 12l3-10 4 7 4-9 4 9 4-7 3 10z" fill="#ffd700" stroke="#b8860b"/>` }[L.acc] || '';
  const cape = L.cape ? `<path d="M18 30l-9 38h42l-9-38z" fill="#7f1d1d"/>` : '';
  const chain = L.cape ? `<path d="M23 32q7 9 14 0" stroke="#ffd700" stroke-width="2" fill="none"/>` : '';
  return `<svg viewBox="-6 -12 72 96" height="${h || 68}" style="filter:drop-shadow(0 2px 4px #0008)"><g>${cape}` +
    `<rect x="22" y="52" width="7" height="20" rx="2" fill="#1f2937"/><rect x="31" y="52" width="7" height="20" rx="2" fill="#1f2937"/><rect x="20" y="70" width="10" height="6" rx="2" fill="#f8fafc"/><rect x="30" y="70" width="10" height="6" rx="2" fill="#f8fafc"/>` +
    `<rect x="18" y="30" width="24" height="25" rx="5" fill="${col}"/><rect x="18" y="48" width="24" height="3" fill="${dk}"/>${chain}` +
    `<text x="30" y="46" text-anchor="middle" font-size="11" font-weight="800" fill="#ffffffcc" font-family="Orbitron,Arial,sans-serif">${esc(String(it.name || '?').charAt(0))}</text>` +
    `<rect x="9" y="31" width="9" height="21" rx="4" fill="${col}"/><rect x="42" y="31" width="9" height="21" rx="4" fill="${col}"/><circle cx="13.5" cy="53" r="4" fill="${skin}"/><circle cx="46.5" cy="53" r="4" fill="${skin}"/>` +
    `<circle cx="30" cy="21" r="11" fill="${skin}"/>${hs}<circle cx="26" cy="21" r="1.6" fill="#1b1b1b"/><circle cx="34" cy="21" r="1.6" fill="#1b1b1b"/><path d="M27 26q3 2 6 0" stroke="#7a3b1e" stroke-width="1.2" fill="none"/>${acc}</g></svg>`;
}
const pip = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor"/>`;
const racketSVG = it => `<svg viewBox="0 0 60 84" height="64" style="filter:drop-shadow(0 0 ${it.glow ? 9 : 3}px ${it.color}aa)"><g transform="rotate(28 30 42)"><rect x="27.5" y="44" width="5" height="34" rx="2.5" fill="#3b3b47"/><rect x="26" y="62" width="8" height="15" rx="3" fill="${it.color}"/><path d="M30 46L21 34M30 46L39 34" stroke="${it.color}" stroke-width="2.6"/><ellipse cx="30" cy="22" rx="15" ry="20" fill="rgba(255,255,255,.08)" stroke="${it.color}" stroke-width="4"/><g stroke="#ffffff99" stroke-width=".8"><path d="M30 3v38M22 6v32M38 6v32M16 14h28M15 22h30M16 30h28"/></g></g></svg>`;
const shuttleSVG = it => `<svg viewBox="0 0 50 60" height="58" style="filter:drop-shadow(0 0 6px ${it.color}99)"><path d="M25 38L8 6q17-7 34 0z" fill="${it.color === '#ff4d6d' ? '#fff' : it.color}" fill-opacity=".92" stroke="#0b0b12" stroke-width="1.2"/><path d="M25 38L16 7M25 38L25 6M25 38L34 7" stroke="#0b0b1255" stroke-width="1"/><ellipse cx="25" cy="42" rx="9" ry="8" fill="#f8e7c0" stroke="#0b0b12" stroke-width="1.2"/></svg>`;
const discSVG = c => `<svg viewBox="0 0 50 50" height="46"><defs><radialGradient id="dg${c[1].slice(1)}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient></defs><circle cx="25" cy="25" r="21" fill="url(#dg${c[1].slice(1)})"/><circle cx="25" cy="25" r="14" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
const xoSVG = it => `<svg viewBox="0 0 110 54" height="50"><g stroke="${it.x}" stroke-width="7" stroke-linecap="round" style="filter:drop-shadow(0 0 4px ${it.x})"><path d="M8 8l38 38M46 8L8 46"/></g><circle cx="82" cy="27" r="19" fill="none" stroke="${it.o}" stroke-width="7" style="filter:drop-shadow(0 0 4px ${it.o})"/></svg>`;
const trailSVG = it => `<svg viewBox="0 0 90 40" height="40">` + [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${12 + i * 14}" cy="${20 + Math.sin(i * 1.4) * 8}" r="${3 + i * .9}" fill="${it.fx === 'rainbow' ? `hsl(${i * 55},90%,60%)` : it.color}" opacity="${.25 + i * .14}"/>`).join('') + `</svg>`;
function figure(it) {
  const s = it.slot, bgc = it.color || it.c1 || it.ring || it.w || (it.r && it.r[1]) || it.x || '#7c5cff';
  let svg = '';
  if (s === 'gun') svg = gunSVG(it, 46);
  else if (s === 'outfit' || s === 'hero') svg = personSVG(it, 68);
  else if (s === 'char') svg = charSVG(it, 74);
  else if (s === 'car') svg = `<svg viewBox="0 0 90 44" height="46"><ellipse cx="45" cy="40" rx="36" ry="3" fill="#0006"/><path d="M6 30l4-10q2-5 8-6l14-2 12-8q3-2 8-2h12q6 0 9 5l6 12 5 2q4 1 4 6v4H6z" transform="translate(-4 4) scale(.95)" fill="${it.color}" stroke="#0b0b12" stroke-width="1.4"/><path d="M34 13l10-6h14l7 7-5 3H34z" fill="#bfe9ff" stroke="#0b0b12" stroke-width="1"/><rect x="20" y="30" width="52" height="2" fill="${shade(it.color, 1.5)}"/><circle cx="24" cy="36" r="7" fill="#15151d"/><circle cx="24" cy="36" r="3" fill="#aab"/><circle cx="68" cy="36" r="7" fill="#15151d"/><circle cx="68" cy="36" r="3" fill="#aab"/></svg>`;
  else if (s === 'ship') svg = `<svg viewBox="0 0 70 70" height="62" style="filter:drop-shadow(0 0 6px ${it.color}99)"><path d="M35 4l9 28 20 20-4 8-18-8-7 12-7-12-18 8-4-8 20-20z" fill="${it.color}" stroke="#0b0b12" stroke-width="1.4"/><ellipse cx="35" cy="30" rx="5" ry="9" fill="#d7f6ff"/><path d="M30 62l5 8 5-8z" fill="#ff9f1c"/><path d="M33 62l2 6 2-6z" fill="#fff3b0"/></svg>`;
  else if (s === 'snake') { const g = it.c1 === 'rainbow' ? null : it.c1, g2 = it.c2; const cols = i => g ? shade(g, .75 + i * .06) : `hsl(${i * 50},90%,58%)`; svg = '<svg viewBox="0 0 100 50" height="50">' + [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${12 + i * 14}" cy="${30 + Math.sin(i * 1.3) * 11}" r="${8 - i * .2}" fill="${cols(i)}" stroke="${g2}" stroke-width="1.5"/>`).join('') + `<circle cx="92" cy="${30 + Math.sin(7.8) * 11}" r="9" fill="${g || '#ffd54a'}" stroke="${g2}" stroke-width="1.5"/><circle cx="95" cy="${27 + Math.sin(7.8) * 11}" r="2" fill="#111"/><path d="M99 ${31 + Math.sin(7.8) * 11}l6 2" stroke="#e63946" stroke-width="1.5"/></svg>`; }
  else if (s === 'piece') svg = ['w', 'b'].map(k => `<svg viewBox="0 0 40 56" height="54" style="${it.glow ? 'filter:drop-shadow(0 0 5px ' + it[k] + ')' : ''}"><path d="M20 3v8M16 7h8" stroke="${it[k]}" stroke-width="3"/><path d="M12 18q0-7 8-7t8 7q0 6-5 9 5 4 6 14h4v7H7v-7h4q1-10 6-14-5-3-5-9z" fill="${it[k]}" stroke="${k === 'w' ? '#222' : '#ddd'}" stroke-width="1.4"/></svg>`).join('');
  else if (s === 'ball') { const c = it.color === 'rainbow' ? '#ff4d6d' : it.color; svg = `<svg viewBox="0 0 50 50" height="50"><defs><radialGradient id="rb${it.id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, .45)}"/></radialGradient></defs><circle cx="25" cy="25" r="21" fill="url(#rb${it.id})"/>${it.color === 'rainbow' ? '<path d="M5 25a20 20 0 0 1 40 0z" fill="#ffd54a88"/><path d="M5 25a20 20 0 0 0 40 0z" fill="#3a86ff88"/>' : ''}</svg>`; }
  else if (s === 'dice') svg = `<div style="width:52px;height:52px;border-radius:12px;background:${it.bg};color:${it.fg};display:grid;place-items:center;${it.glow ? 'box-shadow:0 0 16px ' + it.glow : 'box-shadow:0 3px 8px #0006'}"><svg viewBox="0 0 30 30" width="38" height="38">${pip(7, 7)}${pip(23, 7)}${pip(15, 15)}${pip(7, 23)}${pip(23, 23)}</svg></div>`;
  else if (s === 'token') svg = `<svg viewBox="0 0 40 52" height="54" style="filter:drop-shadow(0 0 4px ${it.ring}aa)"><ellipse cx="20" cy="46" rx="14" ry="5" fill="${it.ring}"/><path d="M12 44q1-16 8-16t8 16z" fill="${it.dot}" stroke="${it.ring}" stroke-width="2.5"/><circle cx="20" cy="16" r="10" fill="${it.dot}" stroke="${it.ring}" stroke-width="3"/><circle cx="17" cy="13" r="3" fill="#fff8"/></svg>`;
  else if (s === 'cardback') svg = `<svg viewBox="0 0 44 62" height="60" style="filter:drop-shadow(0 3px 5px #0007)"><rect x="2" y="2" width="40" height="58" rx="6" fill="${it.c2}" stroke="#fff" stroke-width="2"/><ellipse cx="22" cy="31" rx="15" ry="22" fill="${it.c1}" transform="rotate(25 22 31)"/><text x="22" y="37" text-anchor="middle" font-size="15" font-weight="900" fill="#fff" stroke="#000" stroke-width=".8" font-family="Arial Black,sans-serif">UNO</text></svg>`;
  else if (s === 'racket') svg = racketSVG(it);
  else if (s === 'shuttle') svg = shuttleSVG(it);
  else if (s === 'disc') svg = discSVG(it.r) + discSVG(it.y);
  else if (s === 'xo') svg = xoSVG(it);
  else if (s === 'trail') svg = trailSVG(it);
  else if (it.emoji) svg = `<div style="font-size:42px;line-height:1;filter:drop-shadow(0 3px 4px #0007)">${it.emoji}</div>`;
  else svg = `<div class="sw" style="background:${it.color || '#888'}"></div>`;
  return `<div class="fig" style="background:radial-gradient(circle at 50% 60%,${bgc}33,transparent 70%)">${svg}</div>`;
}

/* ------------------------------ level reward items (every 5th level) ------------------------------ */
// Different kinds of items: trails, guns, birds, cars, outfits, runners, snakes, chess sets, balls, dice, tokens, cards, heroes, rackets, shuttles, discs.
const LEVEL_ITEMS = { 5: 't_fire', 12: 'ch_dhiraj', 77: 'ch_arihant', 10: 'g_ar', 15: 'b_ghost', 20: 'c_royal', 25: 'g_storm', 30: 'o_thunder', 35: 'r_alien', 40: 'n_diamond', 45: 't_aura', 50: 'p_cosmic',
  55: 'l_cosmic', 60: 'g_nebula', 65: 'd_cosmic', 70: 'k_dragon', 75: 'o_cosmos', 80: 'u_cosmic', 85: 'h_cosmic', 90: 'rk_galaxy', 95: 'sh_galaxy', 100: 'dc_cosmic' };
const isLvlItem = it => !!(it && (it.lvl || Object.values(LEVEL_ITEMS).includes(it.id)));   // level-reward items are never spin prizes
function grantLevelItems(upto) {
  const got = [];
  Object.keys(LEVEL_ITEMS).map(Number).sort((a, b) => a - b).forEach(lv => {
    if (lv > upto || db().levelRewards['i' + lv]) return;
    db().levelRewards['i' + lv] = true;
    const it = ALL_ITEMS[LEVEL_ITEMS[lv]]; if (!it) return;
    if (db().own[it.id]) { db().coins = Math.min(MAXC, db().coins + 500); return; }   // already owned -> 500 coins instead
    db().own[it.id] = 1; got.push(it);
  });
  return got;
}

/* ------------------------------ mail rewards (coins + items) ------------------------------ */
const rewardText = (coins, items) => [coins > 0 ? '+' + coins + ' coins' : '', ...items.map(it => it.name)].filter(Boolean).join(' + ') || 'nothing';
function mailItemIds(m) {
  const a = Array.isArray(m.items) ? m.items : (typeof m.items === 'string' ? m.items.split(',') : []);
  return [...new Set(a.map(x => String(x).trim()))].filter(id => ALL_ITEMS[id]).slice(0, 10);
}
const mailReward = m => !!m && !m.claimed && (Math.round(+m.coins || 0) > 0 || mailItemIds(m).length > 0);
function applyMail(m) {          // give the coins + items of one mail to the account (an item the player already owns becomes 500 coins, like level rewards)
  const n = Math.max(0, Math.round(+m.coins || 0)), got = []; let dup = 0;
  if (m.mode === 'set') db().coins = Math.max(0, Math.min(MAXC, n)); else db().coins = Math.max(0, Math.min(MAXC, db().coins + n));
  mailItemIds(m).forEach(id => { if (Az.owned(id)) dup += 500; else { db().own[id] = 1; got.push(ALL_ITEMS[id]); } });
  if (dup) db().coins = Math.min(MAXC, db().coins + dup);
  m.claimed = true; m.read = true; m.claimedAt = Date.now();
  return { coins: n + dup, items: got, text: rewardText(n + dup, got) };
}

/* ------------------------------ core API ------------------------------ */
const Az = window.Az = {
  BASE, GAMES, PLACES, SHOP, COIN_RATE, DAILY_BONUS, figure, gunSVG, gunParts, personSVG, drawGun, gunItem,
  game: id => GAMES.find(g => g.id === id),
  get: k => db()[k],
  set: (k, v) => { db()[k] = v; save(); },

  coins: () => db().coins,
  addCoins(n) { db().coins = Math.max(0, db().coins + Math.round(n)); save(); Az.refresh(); },
  xp: () => db().xp,
  addXp(n) {
    const before = Az.plvl();
    db().xp = Math.max(0, db().xp + Math.round(n));
    const after = Az.plvl();
    for (let lv = before + 1; lv <= after; lv++) {
      if (db().levelRewards[lv]) continue;
      db().levelRewards[lv] = true;
      db().coins = Math.min(MAXC, db().coins + 100);
    }
    const items = grantLevelItems(after);
    save(); Az.refresh();
    if (after > before) Az.toast('🎉 Level ' + after + '! +100 coins' + (items.length ? ' + 🎁 ' + items.map(i => i.name).join(', ') : ''), 4500);
  },
  syncLevelItems() {          // give any level-reward item the player already earned (also covers players from older versions)
    const got = grantLevelItems(Az.plvl());
    if (got.length) { save(); Az.refresh(); Az.toast('🎁 Level reward unlocked: ' + got.map(i => i.name).join(', '), 4500); }
    return got;
  },
  levelItem: lv => ALL_ITEMS[LEVEL_ITEMS[lv]] || null,
  rarity: it => RARITY[rarityOf(it)],
  plvl: () => Math.floor(Math.sqrt(db().xp / 40)) + 1,
  plProgress() { const L = Az.plvl(), a = 40 * (L - 1) * (L - 1), b = 40 * L * L; return { lvl: L, cur: db().xp - a, need: b - a }; },
  rewardPreview(from = Az.plvl(), count = 5) { return Array.from({length:count},(_,i)=>{const lv=from+i;return {level:lv,coins:100,item:Az.levelItem(lv),unlocked:!!db().levelRewards[lv]};}); },

  mailCount: () => db().mail.filter(m => !m.claimed && !m.read).length,
  markMailRead(i) { const m=db().mail[i]; if(!m || m.claimed || m.read) return false; m.read=true; m.readAt=Date.now(); save(); Az.refresh(); return true; },
  /* Mail rewards: coins and/or shop items. Claiming adds them to the account. Deleting a mail that still has an unclaimed reward claims it first, so nothing is ever lost. */
  mailItems: m => mailItemIds(m),
  mailHasReward: m => mailReward(m),
  claimMail(i, quiet) {
    const m = db().mail[i]; if (!m || m.claimed) return false;
    const r = applyMail(m); save(); Az.refresh(); if (!quiet) Az.toast('🎁 Mail claimed: ' + r.text, 3500); return true;
  },
  deleteMail(i) {
    const m = db().mail[i]; if (!m) return false;
    let r = null; if (mailReward(m)) r = applyMail(m);
    db().mail.splice(i, 1); save(); Az.refresh();
    Az.toast(r ? '🗑 Mail deleted — auto-claimed: ' + r.text : '🗑 Mail deleted', 3500); return true;
  },
  claimAllMail() {
    let n = 0; const tot = { coins: 0, items: [] };
    db().mail.forEach(m => { if (!m.claimed && mailReward(m)) { const r = applyMail(m); tot.coins += r.coins; tot.items.push(...r.items); n++; } else if (!m.claimed) { m.read = true; m.claimed = true; } });
    save(); Az.refresh(); if (n) Az.toast('🎁 Claimed ' + n + ' mail(s): ' + rewardText(tot.coins, tot.items), 4000); return n;
  },
  deleteAllMail() {
    const n = db().mail.length; if (!n) return 0;
    const tot = { coins: 0, items: [] }, had = [];
    db().mail.forEach(m => { if (!m.claimed && mailReward(m)) { const r = applyMail(m); tot.coins += r.coins; tot.items.push(...r.items); had.push(1); } });
    db().mail = []; save(); Az.refresh();
    Az.toast('🗑 ' + n + ' mail(s) deleted' + (had.length ? ' — auto-claimed: ' + rewardText(tot.coins, tot.items) : ''), 4000); return n;
  },
  mailbox() {
    const m = Az.modal('<div id="azmailbox"></div>');
    const draw = () => {
      const all = db().mail, list = all.slice().reverse();
      const rows = list.length ? list.map((v,j) => {
        const i = all.length-1-j, ids = mailItemIds(v), coins = Math.round(+v.coins||0), rew = mailReward(v);
        const what = [coins > 0 ? `🪙 ${coins} Gold Coins` : '', ...ids.map(id => (SHOP[ALL_ITEMS[id].slot].emoji || '🎁') + ' ' + esc(ALL_ITEMS[id].name))].filter(Boolean);
        const state = v.claimed ? '<span class="azpill">✅ Claimed / Read</span>' : (rew ? `<button class="azbtn sm" data-claim="${i}">🎁 Claim</button>` : `<button class="azbtn sm ghost" data-read="${i}">Mark as read</button>`);
        const del = `<button class="azbtn sm ghost" data-del="${i}" title="${rew ? 'Deleting claims the reward automatically' : 'Delete'}">🗑 Delete${rew ? ' (auto-claims)' : ''}</button>`;
        return `<div class="azitem"><b>✉️ ${esc(v.title || 'Message from Ari Game Zone')}</b>${v.message?`<p class="sub">${esc(v.message)}</p>`:''}<small>${what.length ? what.join(' · ') : 'Game update / announcement'}</small><div class="azrow c" style="margin-top:6px">${state}${del}</div></div>`;
      }).join('') : '<p class="sub">No messages yet. Gifts and updates will appear here.</p>';
      const bulk = all.length ? '<div class="azrow c"><button class="azbtn sm" id="mailclaimall">🎁 Claim all</button><button class="azbtn sm ghost" id="maildelall">🗑 Delete all</button></div>' : '';
      document.getElementById('azmailbox').innerHTML = `<h2>✉️ Mail</h2><p class="sub">Claim gifts sent to your Player ID. Deleting a mail with an unclaimed coin / item reward claims it automatically.</p>${bulk}<div class="azshopgrid">${rows}</div><div class="azrow c"><button class="azbtn ghost" id="mailclose">Close</button></div>`;
    };
    m.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.dataset.claim!==undefined){Az.claimMail(+b.dataset.claim);draw();}
      else if(b.dataset.read!==undefined){Az.markMailRead(+b.dataset.read);draw();}
      else if(b.dataset.del!==undefined){Az.deleteMail(+b.dataset.del);draw();}
      else if(b.id==='mailclaimall'){Az.claimAllMail();draw();}
      else if(b.id==='maildelall'){if(confirm('Delete ALL mail? Any unclaimed coins / items will be claimed automatically first.')){Az.deleteAllMail();draw();}}
      else if(b.id==='mailclose')m.close();});
    draw(); return m;
  },
  level: id => db().lv[id] || 1,                       // highest unlocked level of a game
  unlock(id, n) { const g = Az.game(id); db().lv[id] = Math.min(g ? g.max : 999, Math.max(Az.level(id), n)); save(); },
  best: (id, k) => (db().best[id + ':' + (k || 'score')]) || 0,
  setBest(id, v, k) { const key = id + ':' + (k || 'score'); if (v > (db().best[key] || 0)) { db().best[key] = v; save(); return true; } return false; },
  place: level => PLACES[Math.floor((Math.max(1, level) - 1) / 4) % PLACES.length],

  diff: () => db().diff,
  diffMul: d => ({ easy: .7, medium: 1, hard: 1.6 }[d] || 1),
  pick: (d, easy, med, hard) => d === 'easy' ? easy : d === 'hard' ? hard : med,

  /* shop */
  items: slot => SHOP[slot] ? SHOP[slot].items : [],
  owned: id => !!(ALL_ITEMS[id] && (ALL_ITEMS[id].price === 0 || db().own[id] || (id === 'ch_arihant' && String(db().uid) === OWNER_ID))),
  eq(slot) { const it = SHOP[slot].items, id = db().eq[slot]; return (id && Az.owned(id) && ALL_ITEMS[id]) || it[0]; },
  equip(id) { if (!Az.owned(id)) return false; db().eq[ALL_ITEMS[id].slot] = id; save(); return true; },
  buy(id) { const it = ALL_ITEMS[id]; if (!it || it.lvl || it.spin || Az.owned(id) || Az.coins() < it.price) return false; db().coins -= it.price; db().own[id] = 1; db().eq[it.slot] = id; save(); Az.refresh(); return true; },

  char() { return Az.eq('char'); },
  perk() { const p = (Az.eq('char') || {}).perk || {}; return { coin: +p.coin || 0, xp: +p.xp || 0, hp: +p.hp || 0, luck: +p.luck || 0 }; },
  perkText: p => perkText(p || Az.perk()),
  /* Lucky Spin: every spin costs a flat 2000 Gold (never increases). Level-reward items are never in the spin. Items are rarer than Gold but do drop. */
  SPIN_BASE: 2000, SPIN_STEP: 0, SPIN_MAX: 2000, ITEM_CHANCE: 0.18,
  spinCost() { return Az.SPIN_BASE; },
  luckySpin() {
    const cost = Az.spinCost();
    if (Az.coins() < cost) { Az.toast('Not enough Gold. This spin costs ' + cost + '.'); return null; }
    const pool = Object.values(SHOP).flatMap(s => s.items).filter(it => it && it.id && USED[it.slot] && !isLvlItem(it) && it.price > 0 && !Az.owned(it.id));
    db().coins -= cost; db().spins = (db().spins || 0) + 1;
    const wpick = (arr, wf) => { let t = arr.reduce((a, x) => a + wf(x), 0), r = Math.random() * t; for (const x of arr) { r -= wf(x); if (r < 0) return x; } return arr[arr.length - 1]; };
    let reward;
    if (pool.length && Math.random() < Az.ITEM_CHANCE + Az.perk().luck) {     // ~18% chance to win an item
      const RW = { common: 62, rare: 26, epic: 9, legendary: 3, mythic: 0.5 };
      const it = wpick(pool, x => RW[rarityOf(x)] || 1);
      db().own[it.id] = 1; db().eq[it.slot] = it.id;
      reward = { name: it.name, slot: it.slot, item: it, rarity: rarityOf(it) };
    } else {                                              // mostly small Gold prizes, far below the spin cost
      const T = [[300, 36], [600, 28], [1000, 18], [1500, 10], [2500, 6], [5000, 2]];
      const c = wpick(T, x => x[1])[0];
      db().coins = Math.min(MAXC, db().coins + c);
      reward = { name: c + ' Gold', slot: 'coins', coins: c };
    }
    save(); Az.refresh(); return reward;
  },
  coinFigure(n) {
    return '<div class="fig" style="background:radial-gradient(circle at 50% 60%,#ffcf3a55,transparent 70%)"><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="Gold" style="width:78px;height:78px;filter:drop-shadow(0 4px 10px rgba(255,190,30,.55))"><b style="font-size:20px;color:#ffd54a">+' + n + '</b></div></div>';
  },
  /* app version: bump here AND in version.json for every update */
  VERSION: '1.01.01',
  /* spin with animation + popup showing the figure of what was won */
  spinPlay(onDone) {
    const cost = Az.spinCost();
    if (Az.coins() < cost) { Az.toast('Not enough Gold. This spin costs ' + cost + '.', 3000); return; }
    const r = Az.luckySpin(); if (!r) return;
    const all = Object.values(SHOP).flatMap(s => s.items).filter(i => i && i.id && USED[i.slot] && !isLvlItem(i));
    const m = Az.modal('<div id="spinin" style="text-align:center"></div>', { sticky: true });
    const box = $('#spinin', m);
    let n = 0;
    const fig = x => (x && x.id) ? figure(x) : Az.coinFigure(x);
    const frame = () => {
      if (n < 14) {
        const pick = Math.random() < .35 ? [300, 600, 1000, 1500][Math.floor(Math.random() * 4)] : all[Math.floor(Math.random() * all.length)];
        box.innerHTML = '<h2>🎡 Spinning…</h2><div class="azitem" style="margin:12px auto;max-width:180px"><div class="pv" style="height:100px">' + fig(pick) + '</div></div>';
        n++; Az.sfx('click'); setTimeout(frame, 60 + n * 16);
      } else reveal();
    };
    const reveal = () => {
      const isItem = !!r.item, rr = isItem ? Az.rarity(r.item) : { n: 'GOLD', c: '#ffd54a' };
      Az.sfx(isItem ? 'win' : 'coin');
      const next = Az.spinCost();
      box.innerHTML = '<h2>🎉 You won!</h2><div class="azitem" style="margin:12px auto;max-width:210px;border-color:' + rr.c + '88;box-shadow:0 0 22px -6px ' + rr.c + '"><div class="pv" style="height:110px">' + (isItem ? figure(r.item) : Az.coinFigure(r.coins)) + '</div>' +
        '<span class="azrar" style="color:' + rr.c + ';border-color:' + rr.c + '66">' + rr.n + '</span><b>' + r.name + '</b>' +
        '<small>' + (isItem ? 'New item added and equipped! Find it in the Shop.' : r.coins + ' Gold added to your balance.') + '</small></div>' +
        '<p class="sub" style="margin:6px 0 10px">Every spin costs <b style="color:var(--a4)">' + next + '</b> Gold · You have <b>' + Az.coins() + '</b></p>' +
        '<div class="azrow c"><button class="azbtn" id="spagain"' + (Az.coins() < next ? ' disabled' : '') + '>🎡 Spin again (' + next + ')</button><button class="azbtn ghost" id="spclose">OK</button></div>';
      $('#spclose', m).onclick = () => { m.close(); onDone && onDone(r); };
      $('#spagain', m).onclick = () => { m.close(); onDone && onDone(r); Az.spinPlay(onDone); };
    };
    frame();
  },
  /* utils */
  rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  toast(msg, ms) { if (!msg) return; const old = document.querySelector('.aztoast'); if (old) { if (old.textContent === msg) return; old.remove(); } const t = el('div', 'aztoast', msg); document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2200); },
  sfx(t) {
    if (!db().sound) return;
    try {
      Az._ac = Az._ac || new (window.AudioContext || window.webkitAudioContext)();
      const ac = Az._ac, P = { coin: [[880, .08], [1320, .12]], hit: [[180, .08]], shoot: [[520, .04]], win: [[523, .12], [659, .12], [784, .22]], lose: [[300, .15], [200, .3]], click: [[600, .03]], jump: [[420, .07]], pop: [[700, .05]], boom: [[120, .2]] }[t] || [[500, .05]];
      let tm = ac.currentTime;
      P.forEach(([f, d]) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = (t === 'shoot' || t === 'hit' || t === 'boom') ? 'square' : 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.07, tm); g.gain.exponentialRampToValueAtTime(.0001, tm + d); o.connect(g); g.connect(ac.destination); o.start(tm); o.stop(tm + d); tm += d * .9; });
    } catch (e) {}
  },
  modal(html, o) {
    const m = el('div', 'azmodal', '<div class="azbox">' + html + '</div>');
    document.body.appendChild(m); m.close = () => m.remove();
    if (!(o && o.sticky)) m.addEventListener('pointerdown', e => { if (e.target === m) m.remove(); });
    return m;
  },
  setBadge(text) { const b = $('#azlv'); if (b) b.textContent = text; },
  refresh() {
    const c = $('#azcoins'); if (c) c.innerHTML = '<img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="Gold A coin"> ' + Az.coins();
    document.querySelectorAll('[data-az=coins]').forEach(e => e.textContent = Az.coins());
    document.querySelectorAll('[data-az=plvl]').forEach(e => e.textContent = Az.plvl());
    document.querySelectorAll('[data-az=name]').forEach(e => e.textContent = Az.name());
    try { setLoginBtn(); } catch (e) {}
    document.querySelectorAll('[data-az=avatar]').forEach(e => Az.avatarFill(e));
    document.querySelectorAll('[data-az=uid]').forEach(e => e.textContent = Az.uid());
    const mc = $('#mailcount'); if (mc) mc.textContent = Az.mailCount() ? '(' + Az.mailCount() + ')' : '';
    const mb = $('#azmailtop'); if (mb) mb.setAttribute('aria-label', Az.mailCount() + ' unread mail messages');
  },
  applyTheme(t) { document.documentElement.dataset.theme = t; const m = $('meta[name=theme-color]'); if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg1').trim() || '#0a0614'; },
  setTheme(t) { const ch = db().theme !== t; db().theme = t; if (ch) save(); Az.applyTheme(t); },
  cycleTheme() { const T = ['neon', 'sunset', 'ocean', 'forest']; Az.setTheme(T[(T.indexOf(db().theme) + 1) % T.length]); Az.toast('🎨 Theme: ' + db().theme); },
};

/* ------------------------------ player profile (numeric UID + name + photo) ------------------------------ */
{ const st = document.createElement('style'); st.textContent = '.azav{display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,var(--a1),var(--a2));flex:none}.azav img,.avatar img{width:100%;height:100%;object-fit:cover;display:block}.avatar{overflow:hidden}.azvs{display:flex;justify-content:center;align-items:center;gap:10px;padding:6px 10px;font-size:13px;background:rgba(255,255,255,.05);border-bottom:1px solid var(--line)}.azvsp{display:flex;align-items:center;gap:6px;min-width:0}.azvsp .azav{width:26px;height:26px;border-radius:50%;font-size:14px}.azvsp b{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.azvs i{color:var(--muted);font-style:normal;font-weight:900;letter-spacing:1px}'; document.head.appendChild(st); }
Az.photo = () => { const p = db().photo; return (typeof p === 'string' && p.indexOf('data:image/') === 0) ? p : ''; };
Az.avatarFill = (el, photo, emoji) => { el.textContent = ''; const p = photo === undefined ? Az.photo() : photo; if (p && p.indexOf('data:image/') === 0 && p.length < 30000) { const i = new Image(); i.alt = ''; i.src = p; el.appendChild(i); } else el.textContent = emoji || '😎'; };
Az.setPhoto = function (file) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('image'));
    const fr = new FileReader(); fr.onerror = () => rej(new Error('read'));
    fr.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('img'));
      im.onload = () => { const S = 96, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), m = Math.min(im.width, im.height);
        x.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S); db().photo = c.toDataURL('image/jpeg', .72); save(); Az.refresh(); res(); };
      im.src = fr.result; };
    fr.readAsDataURL(file);
  });
};
Az.showVs = function (n) {
  if (!n || !n.peer) return; const bar = document.querySelector('.azbar'); if (!bar) { setTimeout(() => Az.showVs(n), 400); return; }
  let v = document.getElementById('azvs'); if (!v) { v = document.createElement('div'); v.id = 'azvs'; v.className = 'azvs'; bar.insertAdjacentElement('afterend', v); }
  const me = { name: Az.name(), photo: Az.photo() }, op = n.peer, L = n.host ? me : op, R = n.host ? op : me; v.textContent = '';
  const side = (p, right) => { const s = document.createElement('span'); s.className = 'azvsp'; const a = document.createElement('span'); a.className = 'azav'; Az.avatarFill(a, p.photo, '🙂'); const b = document.createElement('b'); b.textContent = p.name; if (right) s.append(b, a); else s.append(a, b); return s; };
  const mid = document.createElement('i'); mid.textContent = 'vs'; v.append(side(L, false), mid, side(R, true));
  if(n.sendEmoji && !document.getElementById('azemojis')){const e=document.createElement('div');e.id='azemojis';e.className='azrow c';e.style.cssText='width:100%;margin:6px 0;';e.innerHTML=['😀','😂','🔥','👏','😎','❤️'].map(x=>`<button class=\"azbtn-i\" type=\"button\" data-emoji=\"${x}\">${x}</button>`).join('');v.insertAdjacentElement('afterend',e);e.addEventListener('click',ev=>{const b=ev.target.closest('[data-emoji]');if(b){n.sendEmoji(b.dataset.emoji);Az.toast('You sent '+b.dataset.emoji);}});}
};
document.addEventListener('az-peer-emoji',e=>Az.toast((e.detail.name||'Player')+' '+e.detail.emoji,1800));

Az.uid = () => db().uid;
// Player's own name (if they set one) is the ONLY name shown. Gmail's name is used only while the player has not chosen a name.
Az.name = () => (db().nameSet && db().name) ? db().name : ((fbUser && Az.cleanName(fbUser.displayName)) || db().name || ('Player-' + db().uid.slice(-4)));
Az.cleanName = n => String(n || '').replace(/[\u0000-\u001f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
Az.setName = function (n) {
  n = Az.cleanName(n); if (n.length < 2) return false;
  db().name = n; db().nameSet = true; db().nameAsked = true; save(); Az.refresh(); return true;
};
Az.profile = function (first) {
  const m = Az.modal('<div class="azbig">🆔</div><h2 style="text-align:center">' + (first ? 'Welcome! 👋' : 'Your Profile') + '</h2>' +
    '<p class="sub" style="text-align:center">' + (first ? 'You got a unique Player ID. Now enter your name.' : 'This is your unique Player ID.') + '</p>' +
    '<div class="azrow c"><span class="azpill" id="pfuid" style="font-size:16px;letter-spacing:1px;cursor:pointer" title="Tap to copy"></span></div>' +
    '<div class="azrow c" style="margin-top:12px"><input id="pfname" maxlength="14" autocomplete="off" placeholder="Your name (2-14 letters)" style="width:100%;max-width:260px;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:inherit;font:inherit;text-align:center"></div>' +
    '<p class="sub" id="pferr" style="text-align:center;color:#ff6b6b;min-height:18px"></p>' +
    '<div class="azrow c"><button class="azbtn" id="pfsave">✅ Save</button><button class="azbtn ghost" id="pfskip">' + (first ? 'Skip' : 'Close') + '</button></div>',
    { sticky: !!first });
  m.querySelector('#pfuid').textContent = Az.uid();
  { const row = document.createElement('div'); row.className = 'azrow c'; row.style.cssText = 'flex-direction:column;align-items:center;gap:8px;margin-bottom:8px';
    const av = document.createElement('div'); av.className = 'azav'; av.style.cssText = 'width:84px;height:84px;border-radius:50%;font-size:44px'; Az.avatarFill(av);
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.hidden = true;
    const bt = document.createElement('button'); bt.className = 'azbtn ghost sm'; bt.textContent = '📷 Phone se photo chuno';
    const rm = document.createElement('button'); rm.className = 'azbtn ghost sm'; rm.textContent = '✖ Photo hatao';
    bt.onclick = () => fi.click(); rm.onclick = () => { db().photo = ''; save(); Az.refresh(); Az.avatarFill(av); };
    fi.onchange = () => { const f = fi.files && fi.files[0]; if (f) Az.setPhoto(f).then(() => { Az.avatarFill(av); Az.toast('✅ Photo saved'); }).catch(() => Az.toast('❌ That photo did not work, try another one')); };
    const r2 = document.createElement('div'); r2.className = 'azrow c'; r2.append(bt, rm); row.append(av, r2, fi); m.querySelector('#pfuid').parentNode.before(row); }
  const inp = m.querySelector('#pfname'); inp.value = db().nameSet ? db().name : (fbUser && fbUser.displayName ? Az.cleanName(fbUser.displayName) : '');
  if (fbUser) { const ac = document.createElement('p'); ac.className = 'sub'; ac.style.textAlign = 'center'; ac.textContent = '☁️ ' + (fbUser.email || fbUser.phoneNumber || 'Logged in'); m.querySelector('#pfuid').parentNode.after(ac); }
  if (Az.isOwner()) { const dv = document.createElement('div'); dv.className = 'azrow c'; const db2 = document.createElement('button'); db2.className = 'azbtn sm'; db2.textContent = '👑 Developer Mode'; db2.onclick = () => { location.href = BASE + 'owner-admin.html'; }; dv.appendChild(db2); m.querySelector('#pferr').after(dv); }
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50);
  const doSave = () => { if (Az.setName(inp.value)) { m.close(); Az.toast('✅ Name saved: ' + Az.name()); } else m.querySelector('#pferr').textContent = 'Name must be at least 2 characters.'; };
  m.addEventListener('click', e => {
    if (e.target.id === 'pfsave') doSave();
    else if (e.target.id === 'pfskip') { db().nameAsked = true; save(); Az.refresh(); m.close(); }
    else if (e.target.id === 'pfuid') { try { navigator.clipboard.writeText(Az.uid()); Az.toast('📋 ID copied'); } catch (x) {} }
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
  return m;
};

/* ------------------------------ shop modal ------------------------------ */
Az.shop = function (slots, startSlot) {
  if (!document.getElementById('azrarcss')) { const st = document.createElement('style'); st.id = 'azrarcss'; st.textContent = '.azrar{display:inline-block;font-size:9px;font-weight:800;letter-spacing:1px;padding:2px 8px;border-radius:99px;border:1px solid;margin:4px 0 2px}.azitem small{display:block;margin:2px 0 4px}'; document.head.appendChild(st); }
  slots = ((slots && slots.length) ? slots : Object.keys(SHOP)).filter(k => SHOP[k] && USED[k]);
  if (!slots.length) slots = Object.keys(SHOP).filter(k => USED[k]);
  let cur = startSlot && slots.includes(startSlot) ? startSlot : slots[0];
  const m = Az.modal('<div id="shopin"></div>');
  function draw() {
   try {
    const tabs = slots.map(s => `<button class="azchip ${s === cur ? 'on' : ''}" data-s="${s}">${SHOP[s].emoji} ${SHOP[s].title}</button>`).join('');
    const items = SHOP[cur].items.slice().sort((a, b) => { const g = x => x.lvl ? 2 : x.spin ? 1 : 0; return (g(a) - g(b)) || (g(a) === 2 ? (a.lvl - b.lvl) : (a.price - b.price)) || 0; }).map(it => {
      const own = Az.owned(it.id), eq = Az.eq(cur).id === it.id;
      const pv = `<div class="pv">${figure(it)}</div>`;
      const btn = (!own && it.spin) ? '<button class="azbtn sm ghost" disabled>🎡 Lucky Spin only</button>' : (!own && it.lvl) ? ('<button class="azbtn sm ghost" disabled>🔒 Level ' + it.lvl + ' reward</button>') : eq ? '<button class="azbtn sm ghost" disabled>✔ Equipped</button>' : own ? `<button class="azbtn sm" data-eq="${it.id}">Equip</button>` : `<button class="azbtn sm" data-buy="${it.id}" ${Az.coins() < it.price ? 'disabled' : ''}><img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="Gold A coin"> ${it.price}</button>`;
      const rr = Az.rarity(it), rk = rarityOf(it);
      const badge = `<span class="azrar" style="color:${rr.c};border-color:${rr.c}66">${it.lvl ? '🏆 ' : rk === 'common' ? '' : '💎 '}${rr.n}</span>`;
      return `<div class="azitem ${eq ? 'eq' : ''}" style="${rk === 'common' ? '' : 'border-color:' + rr.c + '88;box-shadow:0 0 14px -6px ' + rr.c}">${pv}${badge}<b>${it.name}</b><small>${it.desc || ''}</small>${btn}</div>`;
    }).join('');
    $('#shopin', m).innerHTML = `<h2>🛒 Shop</h2><p class="sub">You have <b style="color:var(--a4)"><img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="Gold A coin"> ${Az.coins()}</b> coins. Buy items with coins!</p><div class="azrow">${tabs}</div><div class="azshopgrid">${items}</div><div class="azrow c" style="margin-top:14px"><button class="azbtn ghost" id="shopx">Close</button></div>`;
   } catch (err) { $('#shopin', m).innerHTML = '<h2>🛒 Shop</h2><p class="sub">Could not load the shop: ' + String(err && err.message || err).replace(/[<>&]/g, '') + '</p><div class="azrow c"><button class="azbtn ghost" id="shopx">Close</button></div>'; }
  }
  m.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.s) { cur = t.dataset.s; draw(); }
    else if (t.dataset.buy) { if (Az.buy(t.dataset.buy)) { Az.sfx('coin'); Az.toast('✅ Bought & equipped!'); } else { Az.sfx('lose'); Az.toast('Not enough coins — earn more by playing!'); } draw(); }
    else if (t.dataset.eq) { Az.equip(t.dataset.eq); Az.sfx('click'); draw(); }
    else if (t.id === 'shopx') m.close();
  });
  draw(); return m;
};

/* ------------------------------ online (PeerJS room codes) ------------------------------ */
const PCFG = { debug: 1, config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' } ], iceCandidatePoolSize: 4 } };
function loadPeer() {
  return new Promise((res, rej) => {
    if (window.Peer) return res();
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.2/peerjs.min.js';
    s.onload = () => window.Peer ? res() : rej(new Error('PeerJS failed')); s.onerror = () => rej(new Error('Could not load online service. Check internet.'));
    document.head.appendChild(s);
  });
}
function mkNet(conn, isHost) {
  const q = []; let fn = null, cl = null;
  const n = {
    host: isHost, open: true, _start: null,
    send(o) { try { conn.send(o); } catch (e) {} },
    sendEmoji(emoji) { try { conn.send({__az:'emoji',emoji:String(emoji||'').slice(0,8),name:Az.name()}); } catch(e){} },
    on(f) { fn = f; q.splice(0).forEach(f); },
    onclose(f) { cl = f; if (!n.open) f(); },
    close() { try { conn.close(); } catch (e) {} },
  };
  const hello = () => { try { conn.send({ __az: 'hello', name: Az.name(), uid: Az.uid(), photo: Az.photo() }); } catch (e) {} };
  if (conn.open) hello(); else conn.on('open', hello);
  conn.on('data', d => { if (d && d.__az === 'emoji') { document.dispatchEvent(new CustomEvent('az-peer-emoji',{detail:{emoji:String(d.emoji||'🙂').slice(0,8),name:Az.cleanName(d.name)||'Player'}})); return; } if (d && d.__az === 'hello') { n.peer = { name: Az.cleanName(d.name) || 'Player', uid: String(d.uid || '').replace(/\D/g, '').slice(0, 10), photo: (typeof d.photo === 'string' && d.photo.indexOf('data:image/') === 0 && d.photo.length < 30000) ? d.photo : '' }; Az.showVs && Az.showVs(n); return; } if (d && d.__az === 'start') { n._start && n._start(d); return; } if (fn) fn(d); else q.push(d); });
  const gone = () => { if (n.open) { n.open = false; cl && cl(); } };
  conn.on('close', gone); conn.on('error', gone);
  return n;
}
const code4 = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

/* ------------------------------ login (Google / phone) + per-account cloud save ------------------------------
   Cloud path: users/{firebaseAuthUid}/gameData  (rules: only that user can read/write it).
   - Different Gmail  -> different uid -> different local record + different cloud record.
   - Same Gmail       -> same record on every device.
   - Logout           -> a brand-new guest id (fresh coins, fresh progress, fresh player ID).            */
let linkG = null, fbUser = null, fbDb = null, pushT = null, fbP = null, loadSeq = 0, cloudUid = null, nameTimer = null, grantRef = null;
const OWNER_UID = OWNER_ID, MAXC = 999999999, seenGrants = {};
Az.OWNER_UID = OWNER_UID; Az.ownerOK = false;
const FBV = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
const gdPath = uid => 'users/' + uid + '/gameData';

function accountChanged() {            // tell the page (home screen) to repaint everything for the new account
  try { Az.applyTheme(db().theme); } catch (e) {}
  try { Az.syncLevelItems(); } catch (e) {}
  Az.refresh && Az.refresh();
  if (typeof drawTop === 'function') { try { drawTop(); } catch (e) {} }
  try { Az.ownerBtn && Az.ownerBtn(); } catch (e) {}
  try { document.dispatchEvent(new Event('az-account')); } catch (e) {}
}
function setLoginBtn() {
  const b = document.getElementById('azlogin'); if (!b) return;
  b.textContent = fbUser ? '👤 ' + String((db().nameSet && db().name) ? db().name : (fbUser.displayName || fbUser.email || fbUser.phoneNumber || 'Me')).split(' ')[0].slice(0, 8) : '👤 Guest / Login';
}
function doPush() {                    // write the CURRENT account's data to its own cloud node
  if (!fbUser || !fbDb || cloudUid !== fbUser.uid || !D) return Promise.resolve(false);
  try { return fbDb.ref(gdPath(fbUser.uid)).set(JSON.parse(JSON.stringify(D))).then(() => true).catch(e => { if (!Az.isBanned || !Az.isBanned()) Az.toast && Az.toast('Cloud save failed: ' + (e.message || 'check database rules')); return false; }); }
  catch (e) { return Promise.resolve(false); }
}
function flushPush() { if (pushT) { clearTimeout(pushT); pushT = null; return doPush(); } return Promise.resolve(); }
window.__azPush = () => { if (!fbUser || !fbDb) return; clearTimeout(pushT); pushT = setTimeout(() => { pushT = null; doPush(); }, 1200); };
// don't lose the last coins if the player leaves the page within the 1.2s debounce
window.addEventListener('pagehide', () => { flushPush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPush(); });

function askNameIfNeeded() {           // welcome / name popup, only for accounts that never saw it
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => { try { if (!db().nameAsked && !document.querySelector('#pfname')) Az.profile(true); } catch (e) {} }, 500);
}

function loadFb() {
  if (fbP) return fbP;
  fbP = new Promise((res, rej) => {
    const c = window.AZ_FIREBASE;
    if (!c || !c.apiKey || /PASTE/.test(c.apiKey)) return rej(new Error('Firebase keys missing. Add your keys in firebase-config.js.'));
    const L = ['app', 'auth', 'database'];
    const next = i => {
      if (i === L.length) {
        try {
          if (!firebase.apps.length) firebase.initializeApp(c);
          fbDb = firebase.database();
          firebase.auth().onAuthStateChanged(u => { if (u) afterLogin(u); else afterLogout(); });
          res();
        } catch (e) { rej(e); }
        return;
      }
      const s = document.createElement('script'); s.src = FBV + L[i] + '-compat.js'; s.onload = () => next(i + 1);
      s.onerror = () => rej(new Error('Login service could not load. Check your internet.')); document.head.appendChild(s);
    };
    next(0);
  });
  fbP.catch(() => { fbP = null; });
  return fbP;
}

/* ---- Owner / Developer mode + player gifts (Spark-plan safe: enforced by Firebase Database RULES, not by this file) ----
   admin/ping          : readable ONLY by the owner's Firebase account (rules)  -> proves "this is the owner"
   uidIndex/<gameUid>  : maps a player's 8-digit ID -> Firebase uid (written by that player)
   adminGrants/<uid>   : owner writes coin gifts here; the receiving player applies + deletes them                 */
function stopGrants() { if (grantRef) { try { grantRef.off(); } catch (e) {} grantRef = null; } }
function applyGrant(g) {
  const n = Math.round(+g.coins || 0);
  if (!isFinite(n)) return;
  const was = db().coins;
  db().coins = Math.max(0, Math.min(MAXC, g.mode === 'set' ? n : was + n));
  save(); Az.refresh();
  const dc = db().coins - was;
  Az.toast && Az.toast('🎁 Mail claimed: ' + (dc >= 0 ? '+' : '') + dc + ' coins', 4000);
  try { Az.sfx('coin'); } catch (e) {}
}
function startGrants(u) {
  stopGrants(); if (!fbDb) return;
  const ref = grantRef = fbDb.ref('adminGrants/' + u.uid);
  ref.on('value', snap => {
    if (!fbUser || fbUser.uid !== u.uid || cloudUid !== u.uid) return;
    const v = snap.val(); if (!v || typeof v !== 'object') return;
    let added = 0; const ids = [];
    Object.keys(v).forEach(id => {
      if (seenGrants[id]) return; seenGrants[id] = 1; const g = v[id]; ids.push(id);
      if (!g || typeof g !== 'object') return;
      if (db().mail.some(m => m.gid === id)) return;                       // already delivered earlier (queue entry could not be removed last time)
      db().mail.push({ gid: id, title: String(g.title || 'Gift from Ari Game Zone').slice(0,60), message: String(g.message || '').slice(0,240), coins: Math.max(0, Math.min(1e9, Math.round(+g.coins||0))), items: mailItemIds({ items: g.items }), mode: 'add', ts: (typeof g.ts === 'number' ? g.ts : Date.now()), claimed: false });
      added++;
    });
    if (!ids.length) return;
    if (db().mail.length > 150) { const keep = db().mail.filter(m => !m.claimed), old = db().mail.filter(m => m.claimed).slice(-(150 - Math.min(keep.length, 150))); db().mail = db().mail.filter(m => keep.includes(m) || old.includes(m)); }
    if (added) { save(); Az.refresh(); Az.toast('✉️ New mail received! Open Mail to read or claim it.', 4500); document.dispatchEvent(new Event('az-mail')); }
    // Remove the queue entries ONLY after the mail is safely saved in the cloud, so a closed tab can never lose a gift.
    clearTimeout(pushT); pushT = null;
    doPush().then(ok => {
      if (ok || !added) { ids.forEach(id => { ref.child(id).remove().catch(() => { delete seenGrants[id]; }); }); }
      else ids.forEach(id => { delete seenGrants[id]; });                       // cloud save failed: keep the queue entries, retry on the next update
    });
  }, () => {});
}
const OWNER_EMAIL = 'kumararihant625@gmail.com';
const isOwnerAcct = u => !!(u && u.email && String(u.email).toLowerCase() === OWNER_EMAIL && u.emailVerified !== false);
function postLogin(u, seq) {
  if (!fbDb) return;
  const alive = () => seq === loadSeq && fbUser && fbUser.uid === u.uid;
  const owner = isOwnerAcct(u);
  /* The OWNER ID is decided by the Gmail address itself (client side), so it never depends on whether the Firebase rules
     were published yet. The Firebase RULES still decide the real powers (coins to other players, admin nodes). */
  if (owner && String(db().uid) !== OWNER_UID) { db().uid = OWNER_UID; save(); accountChanged(); }
  else if (!owner && String(db().uid) === OWNER_UID) { db().uid = genUid(); save(); accountChanged(); Az.toast && Az.toast('🆔 That ID belongs to the owner only — you got a new Player ID: ' + db().uid, 4000); }
  (owner ? fbDb.ref('admin/ping').once('value').then(() => { if (alive()) Az.ownerOK = true; }) : Promise.resolve())
    .catch(() => { if (alive()) Az.ownerOK = false; })
    .then(() => (alive() && owner) ? fbDb.ref('uidIndex/' + OWNER_UID).set(u.uid).catch(() => {}) : null)
    .then(() => {
      if (!alive()) return;
      if (String(db().uid) !== OWNER_UID) fbDb.ref('uidIndex/' + db().uid).set(u.uid).catch(() => {});
      startGrants(u);
      try { Az.ownerBtn && Az.ownerBtn(); document.dispatchEvent(new Event('az-owner')); } catch (e) {}
    });
}
Az.isOwner = () => String(db().uid) === OWNER_UID;
Az.devSetCoins = function (n) { if (!Az.isOwner()) return false; n = Math.round(+n); if (!isFinite(n)) return false; db().coins = Math.max(0, Math.min(MAXC, n)); save(); Az.refresh(); return true; };
Az.devAddCoins = function (n) { n = Math.round(+n); return isFinite(n) && Az.devSetCoins(db().coins + n); };
Az.devSetPlayerLevel = function (level) {
  if (!Az.isOwner()) return false;
  level = Math.floor(Number(level));
  if (!Number.isFinite(level) || level < 1 || level > 100000) return false;
  const before = Az.plvl();
  db().xp = Math.max(0, 40 * (level - 1) * (level - 1));
  const after = Az.plvl();
  for (let lv = before + 1; lv <= after; lv++) {
    if (!db().levelRewards[lv]) { db().levelRewards[lv] = true; db().coins = Math.min(MAXC, db().coins + 100); }
  }
  const items = grantLevelItems(after); save(); Az.refresh();
  return { level: after, rewards: items.length };
};
const cleanGrantItems = items => [...new Set((Array.isArray(items) ? items : String(items || '').split(',')).map(x => String(x).trim()))].filter(id => ALL_ITEMS[id]).slice(0, 10);
function grantBody(coins, title, message, items) {
  coins = Math.round(+coins || 0); title = String(title || 'Ari Game Zone Mail').slice(0, 60); message = String(message || '').slice(0, 240); items = cleanGrantItems(items);
  if (!isFinite(coins) || coins < 0 || coins > 1e9) throw new Error('Enter a valid positive coin amount.');
  if (!coins && !message.trim() && !items.length) throw new Error('Write a message, or add coins / an item.');
  const b = { coins, title, message, ts: firebase.database.ServerValue.TIMESTAMP }; if (items.length) b.items = items.join(',');
  return b;
}
const needOwner = () => { if (!Az.isOwner()) throw new Error('This is only for the owner account.'); if (!fbUser || !fbDb) throw new Error('Log in with Google first.'); if (!Az.ownerOK) throw new Error('Owner not verified. Publish database.rules.json in Firebase and log in with the owner Gmail.'); };
const lookupUid = gid => { gid = String(gid || '').replace(/\D/g, ''); if (!/^\d{8}$/.test(gid)) return Promise.reject(new Error('Player ID must be 8 digits.')); return fbDb.ref('uidIndex/' + gid).once('value').then(s => { const t = s.val(); if (!t || typeof t !== 'string') throw new Error('Player ' + gid + ' not found. They must log in with Google once.'); return { gid, uid: t }; }); };
Az.devGiveMail = function (gid, coins, title, message, items) {
  return Promise.resolve().then(() => { needOwner(); const body = grantBody(coins, title || 'Gift from Ari Game Zone', message, items); return lookupUid(gid).then(t => fbDb.ref('adminGrants/' + t.uid).push(body).then(() => t.gid)); });
};
/* Mail to EVERY existing registered player (every Player ID in uidIndex). Written in chunks so a big player list never exceeds one write. */
Az.devBroadcastMail = function (coins, title, message, items) {
  return Promise.resolve().then(async () => {
    needOwner(); const body = grantBody(coins, title || 'Ari Game Zone Mail', message, items);
    const snap = await fbDb.ref('uidIndex').once('value'), ids = snap.val() || {}, targets = [...new Set(Object.values(ids).filter(x => typeof x === 'string' && x))];
    if (!targets.length) throw new Error('No registered Player IDs found.');
    for (let i = 0; i < targets.length; i += 200) {
      const batch = {}; targets.slice(i, i + 200).forEach(uid => { const key = fbDb.ref('adminGrants/' + uid).push().key; batch['adminGrants/' + uid + '/' + key] = body; });
      await fbDb.ref().update(batch);
    }
    return targets.length;
  });
};
Az.devItemCatalog = () => Object.keys(SHOP).filter(k => USED[k]).map(k => ({ slot: k, title: SHOP[k].title, emoji: SHOP[k].emoji || '🎁', items: SHOP[k].items.filter(i => i.price !== 0 || i.lvl || i.spin).map(i => ({ id: i.id, name: i.name, rarity: rarityOf(i) })) })).filter(g => g.items.length);
/* ---- Ban / unban (stored at banned/<firebaseUid>; Firebase rules then block that account's cloud saves; the game shows a ban screen) ---- */
Az.devBan = function (gid, reason) {
  return Promise.resolve().then(() => { needOwner(); gid = String(gid || '').replace(/\D/g, ''); if (gid === OWNER_UID) throw new Error('The owner ID cannot be banned.'); return lookupUid(gid); })
    .then(t => { if (t.uid === fbUser.uid) throw new Error('You cannot ban your own account.'); return fbDb.ref('banned/' + t.uid).set({ id: t.gid, reason: String(reason || '').slice(0, 140), ts: firebase.database.ServerValue.TIMESTAMP }).then(() => t.gid); });
};
Az.devUnban = function (gid) {
  return Promise.resolve().then(() => { needOwner(); gid = String(gid || '').replace(/\D/g, ''); if (!/^\d{8}$/.test(gid)) throw new Error('Player ID must be 8 digits.'); return fbDb.ref('banned').once('value'); })
    .then(s => { const v = s.val() || {}, uid = Object.keys(v).find(k => v[k] && String(v[k].id) === gid); if (!uid) throw new Error('Player ' + gid + ' is not banned.'); return fbDb.ref('banned/' + uid).remove().then(() => gid); });
};
Az.devListBans = function () {
  return Promise.resolve().then(() => { needOwner(); return fbDb.ref('banned').once('value'); })
    .then(s => { const v = s.val() || {}; return Object.keys(v).map(k => ({ uid: k, id: String(v[k] && v[k].id || '?'), reason: String(v[k] && v[k].reason || ''), ts: +(v[k] && v[k].ts) || 0 })).sort((a, b) => b.ts - a.ts); });
};
let banRef = null, banInfo = null, banEl = null;
function hideBan() { if (banEl) { banEl.remove(); banEl = null; } }
function showBan(v) {
  hideBan(); banEl = el('div', 'azmodal', '<div class="azbox" style="text-align:center"><div class="azbig">🚫</div><h2>Account banned</h2><p class="sub">Your account (Player ID <b>' + esc(db().uid) + '</b>) has been banned from Ari Game Zone.' + (v && v.reason ? '<br><br>Reason: <b>' + esc(v.reason) + '</b>' : '') + '</p><p class="sub" style="font-size:12px">Progress is not saved to the cloud while banned. Contact the owner if you think this is a mistake.</p><div class="azrow c"><button class="azbtn ghost" id="banout">Logout</button></div></div>');
  banEl.style.zIndex = 2147483000; document.body.appendChild(banEl);
  const b = banEl.querySelector('#banout'); b.onclick = () => { b.disabled = true; Az.logout && Az.logout(); };
}
function stopBanWatch() { if (banRef) { try { banRef.off(); } catch (e) {} banRef = null; } banInfo = null; hideBan(); }
function startBanWatch(u) {
  stopBanWatch(); if (!fbDb || isOwnerAcct(u)) return;
  const ref = banRef = fbDb.ref('banned/' + u.uid);
  ref.on('value', snap => { if (!fbUser || fbUser.uid !== u.uid) return; const v = snap.val(); if (v) { banInfo = (typeof v === 'object') ? v : {}; if (!banEl || !document.body.contains(banEl)) showBan(banInfo); } else { banInfo = null; hideBan(); } }, () => {});
}
Az.isBanned = () => !!banInfo;

Az.ownerBtn = function () {       // home-page button: visible ONLY on the owner ID
  const cb = document.getElementById('admincoins'); if (!cb) return;
  if (!Az.isOwner()) { cb.style.display = 'none'; cb.onclick = null; return; }
  cb.style.display = ''; cb.textContent = '👑 Developer Mode'; cb.onclick = () => { location.href = BASE + 'owner-admin.html'; };
};
Az.whenAuth = () => { if (!LS.get('az_login')) return Promise.resolve(null); return loadFb().then(() => null).catch(() => null); };

function afterLogout() {
  // 'az_login' is the cross-tab "a session is still open" flag: whoever sees it first does the cleanup once.
  fbUser = null; cloudUid = null; loadSeq++; clearTimeout(pushT); pushT = null; stopGrants(); try { stopBanWatch(); } catch (e) {} Az.ownerOK = false;
  // NOTE: the guest id is NOT rotated any more: after logout you are back on the SAME guest you had before,
  // and every other guest stays saved on this device (see Az.guests / Az.switchGuest / Az.newGuest).
  LS.del('az_login'); LS.del('az_active_key');
  ACTIVE_KEY = guestKey(); D = null; db();
  setLoginBtn(); accountChanged();
  askNameIfNeeded();
}

function afterLogin(u) {
  if (fbUser && fbUser.uid === u.uid && cloudUid === u.uid && ACTIVE_KEY === 'az2:user:' + u.uid) return;
  if (fbUser && fbUser.uid !== u.uid) flushPush();           // save the previous account first, to ITS own node
  const lg = linkG; linkG = null;                              // guest the player asked to link into this login (or null)
  const key = 'az2:user:' + u.uid, hadLocal = !!LS.get(key);
  stopGrants(); Az.ownerOK = false;
  fbUser = u; cloudUid = null; clearTimeout(pushT); pushT = null;
  startBanWatch(u);
  ACTIVE_KEY = key; D = null;
  LS.set('az_login', '1'); LS.set('az_active_key', key);
  setLoginBtn();
  const localD = db();                                         // this account's cached record (instant display)
  accountChanged();
  const seq = ++loadSeq, ref = fbDb.ref(gdPath(u.uid));
  ref.once('value').then(s => {
    const v = s.val(); if (v && typeof v === 'object') return v;
    // one-time import of the older layout users/{uid}
    return fbDb.ref('users/' + u.uid).once('value').then(old => {
      const o = old.val(), legacy = o && (o.gameData || (o.coins != null ? o : null));
      return (legacy && typeof legacy === 'object') ? legacy : null;
    });
  }).then(cloud => {
    if (seq !== loadSeq || !fbUser || fbUser.uid !== u.uid) return;   // a newer login/logout happened meanwhile: ignore this answer
    const existed = !!cloud;                                          // did this Gmail already have an account (an ID)?
    if (cloud) {
      const needsStarter49019468 = String(cloud.uid || '') === '49019468' && !cloud.starter49019468;
      const needsBonus = bonusPending(cloud);
      cloud = normalize(cloud);
      if (hadLocal && localD.rev > cloud.rev) { cloudUid = u.uid; doPush(); }   // this device is ahead (cloud write was lost)
      else { D = cloud; LS.set(ACTIVE_KEY, JSON.stringify(D)); cloudUid = u.uid; if (needsStarter49019468 || needsBonus) doPush(); }
      announceBonus();
    } else {
      cloudUid = u.uid; D = db(); doPush();
    }
    if (lg) linkInto(u, lg, existed);
    accountChanged(); askNameIfNeeded(); postLogin(u, seq);
  }).catch(e => {
    if (seq !== loadSeq) return;
    Az.toast && Az.toast('Cloud load failed: ' + (e.message || 'check database rules') + ' — cloud save paused');
  });
}
function authInit() { loadFb().catch(() => {}); }

/* ------------------------------ guests: many separate profiles + link-to-Gmail ------------------------------ */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lvOfXp = xp => Math.floor(Math.sqrt((xp || 0) / 40)) + 1;
function readGuest(id) { try { const r = JSON.parse(LS.get(GPFX + id) || 'null'); return r ? normalize(r) : null; } catch (e) { return null; } }
function signOutAll() {
  return flushPush().then(() => ((fbUser || LS.get('az_login')) ? loadFb().then(() => firebase.auth().signOut()) : null)).catch(() => {})
    .then(() => { LS.del('az_login'); LS.del('az_active_key'); });
}
function reloadSoon() { setTimeout(() => location.reload(), 60); }
Az.guests = listGuests;
Az.guestId = guestId;
Az.switchGuest = function (id) {            // become another saved guest (logs out of Gmail first, if needed)
  if (!LS.get(GPFX + id)) return;
  LS.set('az_guest_id', id); signOutAll().then(reloadSoon);
};
Az.newGuest = function () {                  // brand-new guest; all the old ones stay saved
  rotateGuest(); signOutAll().then(reloadSoon);
};
Az.deleteGuest = function (id) {
  const wasCur = id === guestId(); LS.del(GPFX + id);
  if (wasCur) { rotateGuest(); signOutAll().then(reloadSoon); }
};
function adoptGuest(u, lg, data) {           // move a guest's progress into this (brand-new) Gmail account
  if (!fbUser || fbUser.uid !== u.uid) return;
  data.rev = Math.max(data.rev, db().rev) + 1; data.ts = Date.now();
  D = data; LS.set(ACTIVE_KEY, JSON.stringify(D)); cloudUid = u.uid;
  accountChanged();
  doPush().then(ok => {
    if (!ok) { Az.toast && Az.toast('⚠️ Cloud save failed — your guest progress is safe, please try linking again.', 3500); return; }
    LS.del(GPFX + lg); if (guestId() === lg) rotateGuest();
    Az.toast && Az.toast('🔗 Guest progress is now linked to ' + (u.email || u.phoneNumber || 'this account') + ' ☁️', 3500);
    accountChanged();
  });
  postLogin(u, loadSeq);
}
/* RULE: one ID <-> one Gmail. A guest can only be linked to a Gmail that has NO ID yet (a brand-new / never-played one).
   A Gmail that already owns an ID is refused, signed out again, and you are back on your guest (guest is never touched). */
function linkInto(u, lg, existed) {
  const g = readGuest(lg); if (!g) { Az.toast && Az.toast('Guest progress not found.'); return; }
  if (!existed || db().rev === 0) return adoptGuest(u, lg, g);
  const mine = String(db().uid), who = esc(u.email || u.phoneNumber || 'Ye Gmail');
  Az.modal('<div class="azbig">🚫</div><h2 style="text-align:center">Cannot link</h2><p class="sub" style="text-align:center"><b>' + who + '</b> is already linked to Player ID <b>' + esc(mine) + '</b>.<br>One ID can link to only one Gmail, and one Gmail to only one ID.<br><br>To link this guest, use a <b>new Gmail</b> (one that has never logged in).<br>Your guest progress is completely safe.</p><div class="azrow c"><button class="azbtn" onclick="this.closest(\'.azmodal\').remove()">OK</button></div>', {});
  Az.logout();                                // straight back to the guest
}

Az.logout = function () {
  // push the last changes to THIS account first, then sign out (afterLogout() puts you back on your last guest)
  return flushPush().then(() => loadFb()).then(() => firebase.auth().signOut()).catch(() => {});
};
Az.account = () => fbUser ? { uid: fbUser.uid, email: fbUser.email || '', name: fbUser.displayName || '', phone: fbUser.phoneNumber || '' } : null;

Az.login = function () {
  const m = Az.modal('<div id="lgin"></div>', {});
  const box = () => m.querySelector('#lgin');
  const gRow = g => {
    const act = !fbUser && g.cur;
    const tag = act ? '<span class="azpill" style="color:var(--a3)">✔ Playing</span>' : '';
    const b = (a, t, ghost) => '<button class="azbtn sm' + (ghost ? ' ghost' : '') + '" data-' + a + '="' + esc(g.id) + '">' + t + '</button>';
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 10px;margin:6px 0;border:1px solid ' + (act ? 'var(--a3)' : 'var(--line)') + ';border-radius:14px;background:var(--panel)">' +
      '<div style="flex:1;min-width:120px"><b>' + esc(g.name) + '</b><br><small style="color:var(--muted)">🆔 ' + esc(g.uid) + ' · <img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="A gold coin"> ' + g.coins + ' · Lv ' + lvOfXp(g.xp) + '</small></div>' +
      tag + (act ? '' : b('gsw', '▶ Use')) + b('gdel', '🗑', 1) + '</div>';
  };
  const drawGuests = () => { const c = m.querySelector('#glist'); if (c) c.innerHTML = listGuests().map(gRow).join('') || '<p class="sub" style="text-align:center">No saved guests.</p>'; };
  const guestBlock = '<div class="azlbl">👥 Guests saved on this device</div><div id="glist"></div><div class="azrow c"><button class="azbtn ghost sm" id="gnew">➕ Create new guest</button></div>';
  if (fbUser) {
    const who = esc(fbUser.email || fbUser.phoneNumber || fbUser.displayName || '');
    box().innerHTML = '<div class="azbig">👤</div><h2 style="text-align:center">Logged in</h2><p class="sub" style="text-align:center">' + who + '<br>Player ID: <b>' + esc(Az.uid()) + '</b><br>Profile cloud me saved hai ☁️</p><div class="azrow c"><button class="azbtn ghost" id="lo">Logout</button></div><p class="sub" style="text-align:center;font-size:11px">After logging out your guest progress opens again (guest progress is never deleted).</p><p class="sub" style="text-align:center;font-size:10px;word-break:break-all;opacity:.7">Firebase UID (tap to copy):<br><span id="fbuid" style="cursor:pointer"></span></p>';
    const fu = box().querySelector('#fbuid'); fu.textContent = fbUser.uid; fu.onclick = () => { try { navigator.clipboard.writeText(fbUser.uid); Az.toast('📋 Firebase UID copied'); } catch (x) {} };
    m.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t || t.id !== 'lo') return;
      t.disabled = true; t.textContent = 'Logging out…'; Az.logout().then(() => { m.close(); Az.toast && Az.toast('👋 Logged out — guest progress restored'); });
    });
    return m;
  }
  const me = db();
  box().innerHTML = '<div class="azbig">📱</div><h2 style="text-align:center">Login / Guest</h2>' +
    '<p class="sub" style="text-align:center">You are currently a <b>Guest</b>: ' + esc(Az.name()) + ' · 🆔 ' + esc(me.uid) + ' · <img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="A gold coin"> ' + me.coins + '</p>' +
    '<p class="sub" style="text-align:center">Every Gmail has its own separate progress. A new Gmail = a brand-new account. An old Gmail = its old progress.</p>' +
    '<div class="azrow c" style="flex-direction:column;align-items:center"><button class="azbtn" id="gg">🔵 Log in with Google (Gmail)</button><button class="azbtn ghost" id="gl">🔗 Link this guest to a NEW Gmail</button></div><p class="sub" style="text-align:center;font-size:11px">Link sirf aise Gmail se ho sakta hai jo pehle kisi ID se linked nahi hai. Ek ID = ek Gmail.</p>' +
    '<p class="sub" style="text-align:center;margin-top:12px">ya phone OTP se:</p><div class="azrow c"><input class="azinput" id="ph" type="tel" placeholder="98765 43210" style="width:210px;letter-spacing:1px"></div><div class="azrow c" id="otpr" style="display:none"><input class="azinput" id="otp" inputmode="numeric" maxlength="6" placeholder="OTP"></div><div class="azerr" id="lerr"></div><div class="azrow c"><button class="azbtn" id="sn">Send OTP</button></div><div id="rc"></div>' + guestBlock;
  drawGuests();
  const err = t => { const e = box() && box().querySelector('#lerr'); if (e) e.textContent = t; }; let conf = null, ver = null;
  const google = link => {
    err('Google khul raha hai…'); linkG = link ? guestId() : null;
    loadFb().then(() => {
      const p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });   // always show the Gmail chooser, so a 2nd Gmail can really be picked
      return firebase.auth().signInWithPopup(p);
    }).then(() => { m.close(); if (!link) Az.toast && Az.toast('✅ Logged in!'); })
      .catch(x => { linkG = null; err(x.code === 'auth/popup-closed-by-user' ? 'Login cancel hua.' : (x.code === 'auth/popup-blocked' ? 'Popup blocked — please allow popups in your browser.' : (x.message || 'Google login fail hua.'))); });
  };
  m.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'gg') google(false);
    else if (t.id === 'gl') google(true);
    else if (t.dataset.gsw) Az.switchGuest(t.dataset.gsw);
    else if (t.dataset.gdel) { if (confirm('This guest and its progress will be deleted forever. Are you sure?')) { Az.deleteGuest(t.dataset.gdel); drawGuests(); } }
    else if (t.id === 'gnew') Az.newGuest();
    else if (t.id === 'sn' && !conf) {
      let n = box().querySelector('#ph').value.replace(/[\s-]/g, ''); if (!n.startsWith('+')) n = '+91' + n.replace(/^0+/, '');
      if (n.length < 12) return err('Enter a valid phone number.'); err('Sending OTP…');
      loadFb().then(() => { ver = ver || new firebase.auth.RecaptchaVerifier(box().querySelector('#rc'), { size: 'invisible' }); return firebase.auth().signInWithPhoneNumber(n, ver); })
        .then(c => { conf = c; err(''); box().querySelector('#otpr').style.display = ''; t.textContent = 'Verify OTP'; })
        .catch(x => err(x.message || 'OTP could not be sent. Try again.'));
    } else if (t.id === 'sn' && conf) {
      conf.confirm(box().querySelector('#otp').value.trim()).then(() => { m.close(); Az.toast && Az.toast('✅ Logged in!'); }).catch(() => err('Wrong OTP. Try again.'));
    }
  });
  return m;
};

/* ------------------------------ start screen ------------------------------ */
/* Az.start({game:'chess', extra:[{key:'side',label:'Play as',options:[['w','White'],['b','Black']]}], onStart(o){...}})
   o = { mode:'single'|'local'|'online', diff:'easy'|'medium'|'hard', level:n, extra:{...}, net:Net|null, seed:n, host:bool } */
Az.start = function (cfg) {
  const g = Az.game(cfg.game); const st = { mode: g.modes[0], diff: db().diff, level: Az.level(g.id), extra: {} };
  (cfg.extra || []).forEach(x => st.extra[x.key] = x.options[0][0]);
  const M = { single: '🤖 vs Computer', local: '👥 2 Players', online: '🌐 Online' };
  const m = Az.modal('<div id="stin"></div>', { sticky: true });
  let peer = null;
  const cleanup = () => { try { peer && peer.destroy(); } catch (e) {} peer = null; };
  function begin(o) { m.close(); Az.setBadge(o.mode === 'single' ? 'Lv ' + o.level : g.name); cfg.onStart(o); }
  function draw() {
    const unl = Az.level(g.id), pl = Az.place(st.level);
    const modes = g.modes.length > 1 ? `<div class="azlbl">Mode</div><div class="azrow">${g.modes.map(x => `<button class="azchip ${st.mode === x ? 'on' : ''}" data-mode="${x}">${M[x]}</button>`).join('')}</div>` : '';
    const diff = cfg.noDiff ? '' : `<div class="azlbl">Difficulty</div><div class="azrow">${['easy', 'medium', 'hard'].map(d => `<button class="azchip ${st.diff === d ? 'on' : ''}" data-diff="${d}">${{ easy: '😊 Easy', medium: '😎 Medium', hard: '🔥 Hard' }[d]}</button>`).join('')}</div>`;
    const lvl = (st.mode === 'single' && !cfg.noLevels) ? `<div class="azlbl">Level (unlocked ${unl} / ${g.max})</div><div class="azstep"><button data-lv="-10">«</button><button data-lv="-1">−</button><b>Level ${st.level}<br><small style="color:var(--muted)">${pl.emoji} ${pl.name}</small></b><button data-lv="1">+</button><button data-lv="10">»</button></div>` : '';
    const extra = (cfg.extra || []).filter(x => !x.only || x.only === st.mode).map(x => `<div class="azlbl">${x.label}</div><div class="azrow">${x.options.map(op => `<button class="azchip ${st.extra[x.key] === op[0] ? 'on' : ''}" data-ex="${x.key}" data-v="${op[0]}">${op[1]}</button>`).join('')}</div>`).join('');
    let play;
    if (st.mode === 'online') play = `<div class="azlbl">Online room</div><div class="azrow c"><button class="azbtn" id="mk">➕ Create room</button><span style="align-self:center;color:var(--muted)">or</span><input class="azinput" id="jc" maxlength="4" placeholder="CODE"><button class="azbtn ghost" id="jn">Join</button></div><div class="azerr" id="neterr"></div><div id="netinfo"></div>`;
    else play = `<div class="azrow c" style="margin-top:18px"><button class="azbtn" id="go" style="font-size:17px;padding:13px 34px">▶ Play</button></div>`;
    $('#stin', m).innerHTML = `<div class="azbig">${g.emoji}</div><h2 style="text-align:center">${g.name}</h2><p class="sub" style="text-align:center">${g.desc}</p><div class="azrow c" style="gap:8px;align-items:center;margin:4px 0 8px"><span style="display:inline-flex">${charSVG(Az.char(), 52)}</span><span style="font-size:12px;color:var(--muted);text-align:left">🧑 <b style="color:inherit">${esc(Az.char().name)}</b><br>${esc(perkText(Az.perk()) || 'No bonus')}</span><button class="azbtn ghost sm" id="chg">Change</button></div>${modes}${diff}${lvl}${extra}${play}<div class="azrow c" style="margin-top:14px"><a class="azbtn ghost sm" href="${BASE}index.html">🏠 Home</a><button class="azbtn ghost sm" id="sh">🛒 Shop</button></div>`;
  }
  function online(kind, jcode) {
    const err = t => { const e = $('#neterr', m); if (e) e.textContent = t; };
    const info = h => { const e = $('#netinfo', m); if (e) e.innerHTML = h; };
    err(''); info('<p class="sub" style="text-align:center">Connecting…</p>');
    loadPeer().then(() => {
      const settings = () => ({ __az: 'start', diff: st.diff, level: 1, extra: st.extra, seed: Math.floor(Math.random() * 1e9) });
      if (kind === 'host') {
        const tryOpen = n => {
          const code = code4(); peer = new Peer('azgz-' + code, PCFG);
          peer.on('error', e => { if (e.type === 'unavailable-id' && n < 4) { cleanup(); tryOpen(n + 1); } else err('Online error: ' + (e.type || e)); });
          peer.on('open', () => info(`<div class="azcode">${code}</div><p class="sub" style="text-align:center">Share this code with your friend and wait… ⏳</p>`));
          peer.on('connection', conn => {
            if (peer._used) { conn.close(); return; } peer._used = 1;
            const net = mkNet(conn, true); const s = settings();
            conn.on('open', () => { conn.send(s); begin({ mode: 'online', diff: s.diff, level: 1, extra: s.extra, seed: s.seed, net, host: true }); });
          });
        };
        tryOpen(0);
      } else {
        const code = (jcode || '').toUpperCase().trim(); if (code.length !== 4) { err('Enter the 4-letter code.'); info(''); return; }
        peer = new Peer(undefined, PCFG); let done = false;
        peer.on('error', e => { if (!done) err(e.type === 'peer-unavailable' ? 'Room not found. Check the code.' : 'Online error: ' + (e.type || e)); info(''); });
        peer.on('open', () => {
          const conn = peer.connect('azgz-' + code, { reliable: true }); const net = mkNet(conn, false);
          net._start = s => { if (done) return; done = true; begin({ mode: 'online', diff: s.diff, level: 1, extra: s.extra || {}, seed: s.seed, net, host: false }); };
          setTimeout(() => { if (!done) { err('Could not connect. Check the code, keep both devices online, and try the same WiFi.'); info(''); } }, 25000);
        });
      }
    }).catch(e => { err(e.message); info(''); });
  }
  m.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.mode) { cleanup(); st.mode = t.dataset.mode; draw(); }
    else if (t.dataset.diff) { st.diff = t.dataset.diff; db().diff = st.diff; save(); draw(); }
    else if (t.dataset.lv) { st.level = Math.max(1, Math.min(Az.level(g.id), st.level + (+t.dataset.lv))); draw(); }
    else if (t.dataset.ex) { st.extra[t.dataset.ex] = t.dataset.v; draw(); }
    else if (t.id === 'go') begin({ mode: st.mode, diff: st.diff, level: st.mode === 'single' ? st.level : 1, extra: st.extra, net: null, seed: Math.floor(Math.random() * 1e9), host: true });
    else if (t.id === 'sh') Az.shop(g.shop.length ? g.shop : null);
    else if (t.id === 'chg') { const sm = Az.shop(['char']); const iv = setInterval(() => { if (!document.body.contains(sm)) { clearInterval(iv); draw(); } }, 400); }
    else if (t.id === 'mk') online('host');
    else if (t.id === 'jn') online('join', $('#jc', m).value);
  });
  draw(); return m;
};

/* ------------------------------ result screen ------------------------------ */
/* Az.finish({game, level, diff, won, base, score?, title?, sub?, progress?, next(level), retry(level)})
   base = coins for a normal win at level 1 (Az scales by difficulty and level). */
Az.finish = function (r) {
  const g = Az.game(r.game), lvl = r.level || 1, dm = Az.diffMul(r.diff || 'medium');
  const pk = Az.perk(), ch = Az.char();
  const coins = Math.round(COIN_RATE * (r.base || 0) * dm * (1 + lvl * .04) * (r.won ? 1 : .25) * (1 + pk.coin));
  const xp = Math.round((coins * .6 + (r.won ? 15 : 3)) * (1 + pk.xp));
  Az.addCoins(coins); Az.addXp(xp);
  let note = '', newBest = false;
  if (r.score != null) newBest = Az.setBest(g.id, r.score);
  if (r.won && r.progress !== false && lvl >= Az.level(g.id) && lvl < g.max) {
    Az.unlock(g.id, lvl + 1);
    const a = Az.place(lvl), b = Az.place(lvl + 1);
    note = `<p style="text-align:center;color:var(--a3)">🔓 Level ${lvl + 1} unlocked!${a.name !== b.name ? `<br>📍 New place: ${b.emoji} <b>${b.name}</b>` : ''}</p>`;
  }
  if (r.won && lvl >= g.max && r.progress !== false) note = '<p style="text-align:center;color:var(--a4)">👑 MAX LEVEL! You are a legend!</p>';
  if (pk.coin || pk.xp) note += `<p style="text-align:center;color:var(--muted);font-size:12px;margin:4px 0">🧑 ${esc(ch.name)} bonus: ${esc(perkText(pk))}</p>`;
  Az.sfx(r.won ? 'win' : 'lose');
  const m = Az.modal(`<div class="azbig">${r.won ? '🏆' : '💥'}</div><h2 style="text-align:center">${r.title || (r.won ? 'You Win!' : 'Game Over')}</h2><p class="sub" style="text-align:center">${r.sub || ''}</p>
    <div class="azstat"><div><b>+${coins}</b><small><img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="A gold coin"> coins</small></div><div><b>+${xp}</b><small>⭐ XP</small></div>${r.score != null ? `<div><b>${r.score}</b><small>${newBest ? '🎉 New best!' : 'score'}</small></div>` : ''}</div>${note}
    <div class="azrow c">${(r.won && r.next && lvl < g.max && r.progress !== false) ? '<button class="azbtn" id="fn">Next level ▶</button>' : ''}<button class="azbtn ${r.won ? 'ghost' : ''}" id="fr">🔄 ${r.won ? 'Play again' : 'Try again'}</button></div>
    <div class="azrow c"><button class="azbtn ghost sm" id="fm">⚙️ Change mode</button><button class="azbtn ghost sm" id="fs">🛒 Shop</button><a class="azbtn ghost sm" href="${BASE}index.html">🏠 Home</a></div>`, { sticky: true });
  m.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'fn') { m.close(); Az.setBadge('Lv ' + (lvl + 1)); r.next(lvl + 1); }
    else if (t.id === 'fr') { m.close(); r.retry ? r.retry(lvl) : location.reload(); }
    else if (t.id === 'fm') location.reload();
    else if (t.id === 'fs') Az.shop(g.shop.length ? g.shop : null);
  });
  return m;
};

/* ------------------------------ page chrome ------------------------------ */
function init() {
  if (!document.querySelector('link[href*="az.css"],style[data-az]')) { const l = el('link'); l.rel = 'stylesheet'; l.href = BASE + 'az.css'; document.head.appendChild(l); }
  if (!document.querySelector('link[href*="fonts.googleapis"]')) { const l = el('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Poppins:wght@400;600;700&display=swap'; document.head.appendChild(l); }
  Az.setTheme(db().theme);
  const bg = el('div', 'azbg', '<i></i><i></i><i></i>'); bg.setAttribute('aria-hidden', 'true');
  ['🎮', '⭐', '👾', '🕹️', '🎲', '🚀', '🧩', '🏆'].forEach((e, i) => { const s = el('span', '', e); s.style.left = (6 + i * 12) + '%'; s.style.animationDuration = (21 + (i * 7) % 11) + 's'; s.style.animationDelay = '-' + ((i * 5) % 20) + 's'; bg.appendChild(s); });
  document.body.prepend(bg);
  const gid = document.body.dataset.game, g = gid && Az.game(gid);
  if (g || document.body.dataset.bar) {
    const bar = el('div', 'azbar', `<a class="azhome" href="${BASE}index.html" title="Home">🏠</a><div class="aztitle">${g ? g.emoji + ' ' + g.name : 'Ari Game Zone'}</div><div class="azbadges"><span class="azpill" id="azlv">${g ? 'Lv ' + Az.level(gid) : ''}</span><span class="azpill coin" id="azcoins"><img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="A gold coin"> ${Az.coins()}</span>${g ? '<button class="azbtn-i" id="azshopb" title="Shop">🛒</button>' : ''}<button class="azbtn-i" id="azmailtop" title="Mail">✉️${Az.mailCount()? '•':''}</button><button class="azbtn-i" id="azsnd" title="Sound">${db().sound ? '🔊' : '🔇'}</button><button class="azbtn-i" id="azprof" title="Profile">🆔</button><button class="azbtn-i" id="azthm" title="Theme">🎨</button></div>`);
    document.body.insertBefore(bar, bg.nextSibling);
    bar.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'azshopb') Az.shop(g.shop.length ? g.shop : null);
      else if (t.id === 'azmailtop') Az.mailbox();
      else if (t.id === 'azsnd') { db().sound = !db().sound; save(); t.textContent = db().sound ? '🔊' : '🔇'; }
      else if (t.id === 'azthm') Az.cycleTheme();
      else if (t.id === 'azprof') Az.profile();
    });
  }
  { const dly = document.getElementById('daily'); if (dly && !document.getElementById('azlogin')) { const b = el('button', 'azbtn sm ghost', '👤 Login'); b.id = 'azlogin'; dly.parentNode.insertBefore(b, dly); b.onclick = () => Az.login(); } }
  if (LS.get('az_login')) authInit();
  { const pb = document.getElementById('profb'); if (pb) pb.onclick = () => Az.profile(); }
  Az.ownerBtn();

  Az.refresh();
  try { Az.syncLevelItems(); } catch (e) {}
  if (!LS.get('az_login')) askNameIfNeeded();   // logged-in accounts: asked only after their cloud data is loaded
  document.dispatchEvent(new Event('az-ready'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
/* ------------------------------ in-game controls dock ------------------------------
   Moves the on-screen controls (d-pad, jump/hit buttons, nitro, pause/restart) and the how-to-play hint
   INSIDE the game canvas as a translucent overlay instead of leaving them below the game. */
(function () {
  'use strict';
  function init() {
    var g = document.body && document.body.dataset.game;
    if (!g || g === 'leveldevil') return;
    var main = document.querySelector('main.azgame'); if (!main) return;
    var target = main.querySelector('canvas') || main.querySelector('#field'); if (!target) return;
    var not = function (e) { return !e.closest('.azhud') && !e.closest('.azdock'); };
    var q = function (s) { return Array.prototype.slice.call(main.querySelectorAll(s)).filter(not); };
    var hints = q('.azmsg, .rn-tip, .bd-tip, p.hint');
    var pads = q('.azdpad, .rn-ctl, .bd-ctl, #ctl');
    var utils = q('.azctl, .rn-sub, .bd-sub').filter(function (e) { return pads.indexOf(e) < 0; });
    if (!hints.length && !pads.length && !utils.length) return;

    if (!document.getElementById('azdockcss')) { var st = document.createElement('style'); st.id = 'azdockcss'; st.textContent = '.azdock{position:fixed;z-index:40;pointer-events:none;display:none;flex-direction:column;justify-content:space-between;box-sizing:border-box;padding:6px}\n.azdock *{box-sizing:border-box}\n.azdock .dk-t{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}\n.azdock .dk-hint{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;align-items:center;transition:opacity .7s}\n.azdock .dk-hint.fade{opacity:0}\n.azdock .dk-hint>*{margin:0;min-height:0!important;padding:5px 10px;border-radius:12px;background:rgba(5,6,20,.66);color:#fff;font-size:12px!important;line-height:1.3;font-weight:600;text-align:center;max-width:100%}\n.azdock .dk-hint>*:empty{display:none}\n.azdock .dk-util{display:flex;flex-direction:column;gap:5px;pointer-events:auto;align-items:flex-end}\n.azdock .dk-util>*{display:flex;flex-direction:column;gap:5px;align-items:flex-end}\n.azdock .dk-util .azbtn{padding:6px 10px;font-size:12px;opacity:.82;background:rgba(10,10,30,.6);backdrop-filter:blur(4px)}\nbody[data-game=arena] .azdock .dk-util,body[data-game=br] .azdock .dk-util{order:-1;align-items:flex-start}\nbody[data-game=arena] .azdock .dk-util>*,body[data-game=br] .azdock .dk-util>*{align-items:flex-start}\n.azdock .dk-b{display:flex;justify-content:space-between;align-items:flex-end;gap:8px}\n.azdock .dk-b>*{pointer-events:auto}\n.azdock .azdpad{margin-left:auto;grid-template-columns:repeat(3,42px);grid-template-rows:repeat(2,42px);gap:4px;opacity:.5}\n.azdock .azdpad button{font-size:17px;background:rgba(10,10,30,.6)}\n.azdock .rn-ctl{display:flex;gap:10px;width:100%}\n.azdock .rn-ctl .azbtn{flex:1;padding:10px 6px;font-size:14px;opacity:.8}\n.azdock .bd-ctl{display:flex;gap:6px;width:100%}\n.azdock .bd-ctl .azbtn{flex:1;padding:8px 4px;font-size:12px;opacity:.82}\n.azdock .bd-ctl small{display:none}\n.azdock #ctl{display:flex;gap:8px;width:100%;justify-content:flex-end;flex-wrap:nowrap}\n.azdock #ctl .azbtn{opacity:.85}\n@media (pointer:coarse){.azdock .rn-tip,.azdock .bd-tip{display:none}}'; document.head.appendChild(st); }
    var dock = document.createElement('div'); dock.className = 'azdock';
    dock.innerHTML = '<div class="dk-t"><div class="dk-hint"></div><div class="dk-util"></div></div><div class="dk-b"></div>';
    document.body.appendChild(dock);
    var hb = dock.querySelector('.dk-hint'), ub = dock.querySelector('.dk-util'), bb = dock.querySelector('.dk-b');
    hints.forEach(function (e) { hb.appendChild(e); });
    utils.forEach(function (e) { ub.appendChild(e); });
    pads.forEach(function (e) { bb.appendChild(e); });

    /* hint fades after a few seconds and comes back whenever its text changes */
    var timer = 0, last = '';
    function show() { hb.classList.remove('fade'); clearTimeout(timer); timer = setTimeout(function () { hb.classList.add('fade'); }, 7000); }
    function txt() { return hints.map(function (e) { return e.textContent; }).join('|'); }
    new MutationObserver(function () { var t = txt(); if (t !== last) { last = t; show(); } })
      .observe(hb, { childList: true, subtree: true, characterData: true });
    last = txt(); show();

    /* keep the dock exactly on top of the visible part of the game canvas */
    var prev = '';
    function place() {
      var r = target.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
      var top = Math.max(r.top, 0), bot = Math.min(r.bottom, vh), h = bot - top;
      if (r.width < 40 || h < 60 || getComputedStyle(target).display === 'none') { if (prev !== 'x') { dock.style.display = 'none'; prev = 'x'; } }
      else {
        var k = [Math.round(r.left), Math.round(top), Math.round(r.width), Math.round(h)].join(',');
        if (k !== prev) { prev = k; dock.style.cssText = 'display:flex;left:' + r.left + 'px;top:' + top + 'px;width:' + r.width + 'px;height:' + h + 'px'; }
      }
      requestAnimationFrame(place);
    }
    place();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* ------------------------------ update popup ------------------------------
   Every open page checks version.json (never cached). If the published version differs from
   the version this page was loaded with, the player gets a popup with a Refresh button. */
(function () {
  var shown = false, dismissed = '';
  function vnum(v) { return String(v || '0').split('.').map(function (n) { return parseInt(n, 10) || 0; }); }
  function newer(a, b) { var x = vnum(a), y = vnum(b); for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
  function refreshNow() {
    try { if (window.caches) caches.keys().then(function (k) { k.forEach(function (n) { caches.delete(n); }); }); } catch (e) {}
    var u = location.href.split('#')[0].replace(/([?&])_v=\d+&?/, '$1').replace(/[?&]$/, '');
    location.replace(u + (u.indexOf('?') < 0 ? '?' : '&') + '_v=' + Date.now());
  }
  function popup(info) {
    if (shown || dismissed === info.version) return; shown = true;
    var notes = (info.notes || []).map(function (n) { return '<li>' + String(n).replace(/[<>&]/g, '') + '</li>'; }).join('');
    var m = Az.modal('<div style="text-align:center"><div style="font-size:46px">🚀</div><h2 style="margin:6px 0">New Update Available!</h2>' +
      '<p style="margin:4px 0"><b style="color:var(--a4)">Version ' + String(info.version).replace(/[<>&]/g, '') + '</b> <span style="opacity:.7">(you have ' + Az.VERSION + ')</span></p>' +
      (notes ? '<ul style="text-align:left;font-size:13px;margin:10px 0 12px 18px;padding:0">' + notes + '</ul>' : '') +
      '<div class="azrow c"><button class="azbtn" id="azupd">🔄 Refresh now</button><button class="azbtn ghost" id="azupl">Later</button></div></div>', { sticky: true });
    var b = m && m.querySelector ? m.querySelector('#azupd') : document.getElementById('azupd');
    var l = m && m.querySelector ? m.querySelector('#azupl') : document.getElementById('azupl');
    if (b) b.onclick = refreshNow;
    if (l) l.onclick = function () { dismissed = info.version; shown = false; try { m.close(); } catch (e) {} };
  }
  function check() {
    if (location.protocol === 'file:') return;
    fetch('version.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.version && newer(j.version, Az.VERSION)) popup(j);
    }).catch(function () {});
  }
  function start() { setTimeout(check, 2500); setInterval(check, 60000); document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
