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
// Firebase Realtime DB drops empty objects ({}), so cloud data must be re-filled before use.
function normalize(d) {
  if (!d || typeof d !== 'object') d = {};
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  d.coins = (typeof d.coins === 'number' && isFinite(d.coins) && d.coins >= 0) ? d.coins : (d.coins == null ? 150 : 0);
  d.diamonds = (typeof d.diamonds === 'number' && isFinite(d.diamonds) && d.diamonds >= 0) ? d.diamonds : 0;
  d.starter49019468 = !!d.starter49019468;
  if (String(d.uid || '') === '49019468' && !d.starter49019468) { d.coins = 100000; d.diamonds = 10000; d.starter49019468 = true; }
  d.xp = (typeof d.xp === 'number' && isFinite(d.xp) && d.xp > 0) ? d.xp : 0;
  d.lv = obj(d.lv); d.best = obj(d.best); d.own = obj(d.own); d.eq = obj(d.eq); d.levelRewards = obj(d.levelRewards); d.mail = Array.isArray(d.mail) ? d.mail : [];
  d.theme = d.theme || 'neon'; d.diff = d.diff || 'medium'; d.sound = d.sound !== false; d.daily = d.daily || '';
  if (!/^\d{8}$/.test(String(d.uid || ''))) d.uid = genUid();
  d.uid = String(d.uid);
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
  D = normalize(raw);
  if (!had) LS.set(ACTIVE_KEY, JSON.stringify(D));   // brand-new account: create its record with a NEW uid
  return D;
}
function save() { db().rev++; D.ts = Date.now(); LS.set(ACTIVE_KEY, JSON.stringify(D)); if (window.__azPush) window.__azPush(); }

/* ------------------------------ games registry ------------------------------ */
// modes: single (vs computer) | local (2 players, one device) | online (room code)
const GAMES = [
  { id: 'br', file: 'battle-royale.html', name: 'Zone Survivor', emoji: '🪂', cat: 'Shooter', max: 100, modes: ['single', 'online'], shop: ['gun', 'outfit'], desc: 'Battle royale! Drop in, loot, shoot and be the last one alive as the zone shrinks.' },
  { id: 'arena', file: 'arena-strike.html', name: 'Arena Strike', emoji: '🔫', cat: 'Shooter', max: 100, modes: ['single', 'online'], shop: ['gun', 'outfit'], desc: 'Fast team deathmatch. Respawn, fight bots and reach the kill target first.' },
  { id: 'race', file: 'turbo-racing.html', name: 'Turbo Racing', emoji: '🏎️', cat: 'Racing', max: 100, modes: ['single', 'local', 'online'], shop: ['car'], desc: 'Dodge traffic at crazy speed. Solo, 2 players on one device, or race a friend online!' },
  { id: 'chess', file: 'chess.html', name: 'Royal Chess', emoji: '♟️', cat: 'Board', max: 50, modes: ['single', 'local', 'online'], shop: ['piece'], desc: 'Full chess with a smart computer (50 levels), 2 players, or play online.' },
  { id: 'ttt', file: 'tic-tac-toe.html', name: 'Tic Tac Toe', emoji: '⭕', cat: 'Board', max: 50, modes: ['single', 'local', 'online'], shop: [], desc: 'Classic X and O. Beat the AI, play a friend or go online.' },
  { id: 'c4', file: 'connect-four.html', name: 'Connect Four', emoji: '🔴', cat: 'Board', max: 50, modes: ['single', 'local', 'online'], shop: [], desc: 'Drop discs and connect four. AI levels, 2 players or online.' },
  { id: 'ludo', file: 'ludo.html', name: 'Ludo', emoji: '🎲', cat: 'Board', max: 1, modes: ['single', 'local', 'online'], shop: ['dice', 'token'], desc: 'Classic Ludo for 2-4 players: vs computer, on one phone, or online with a friend. Shop: dice & token skins.' },
  { id: 'flyer', file: 'sky-flyer.html', name: 'Sky Flyer', emoji: '🐤', cat: 'Arcade', max: 100, modes: ['single'], shop: ['bird'], desc: 'Tap to fly through the gaps. Pick a cool bird skin.' },
  { id: 'snake', file: 'snake-evolution.html', name: 'Snake Evolution', emoji: '🐍', cat: 'Arcade', max: 100, modes: ['single'], shop: ['snake'], desc: 'Eat, grow and avoid walls. Obstacles and speed grow each level.' },
  { id: 'brick', file: 'brick-breaker.html', name: 'Brick Breaker', emoji: '🧱', cat: 'Arcade', max: 100, modes: ['single'], shop: ['ball'], desc: 'Break all bricks, catch power-ups. 100 different layouts.' },
  { id: 'mole', file: 'whack-a-mole.html', name: 'Whack-a-Mole', emoji: '🐹', cat: 'Fun', max: 100, modes: ['single'], shop: [], desc: 'Tap the moles fast, avoid bombs and grab golden moles.' },
  { id: 'leveldevil', file: 'level-devil.html', name: 'Level Devil', emoji: '😈', cat: 'Platformer', max: 20, modes: ['single', 'online'], shop: ['hero'], desc: 'A tricky platform challenge with hidden surprises and 20 stages. Race a friend online to the door!' },
  { id: 'uno', file: 'uno.html', name: 'UNO', emoji: '🃏', cat: 'Cards', max: 1, modes: ['single', 'local', 'online'], shop: ['cardback'], desc: 'Classic colour-and-number card game: vs computer bots, pass-and-play, or online 1v1 with a friend.' },
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
    { id: 'o_phoenix', name: 'Phoenix Legend', price: 9000, color: '#ff6a00', hat: '🔥', hp: 230, desc: '+130 HP. Legendary.' },,
  ] },
  car: { title: 'Cars', emoji: '🏎️', items: [
    { id: 'c_red', name: 'Red Spark', price: 0, color: '#ef233c', speed: 1, desc: 'Starter car.' },
    { id: 'c_blue', name: 'Blue Wave', price: 300, color: '#3a86ff', speed: 1.02, desc: 'Slightly faster.' },
    { id: 'c_yellow', name: 'Yellow Bee', price: 500, color: '#ffbe0b', speed: 1.04, desc: 'Quick & nimble.' },
    { id: 'c_sport', name: 'Pink Sport', price: 1200, color: '#ff006e', speed: 1.08, desc: '+8% speed.' },
    { id: 'c_police', name: 'Patrol X', price: 1800, color: '#1d3557', speed: 1.12, desc: '+12% speed.' },
    { id: 'c_gold', name: 'Golden GT', price: 4000, color: '#ffd700', speed: 1.18, desc: '+18% speed. Legend.' },
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
  ] },
  runner: { title: 'Runners', emoji: '🏃', items: [
    { id: 'r_boy', name: 'Runner', price: 0, emoji: '🏃', desc: 'Starter.' },
    { id: 'r_ninja', name: 'Ninja', price: 400, emoji: '🥷', desc: 'Silent & fast.' },
    { id: 'r_hero', name: 'Super Hero', price: 900, emoji: '🦸', desc: 'Saves the day.' },
    { id: 'r_astro', name: 'Astronaut', price: 1500, emoji: '🧑‍🚀', desc: 'Out of this world.' },
    { id: 'r_dog', name: 'Speedy Dog', price: 600, emoji: '🐕', desc: 'Good boy!' },
    { id: 'r_dino', name: 'Dino', price: 2500, emoji: '🦖', desc: 'Roar!' },
  ] },
  snake: { title: 'Snake skins', emoji: '🐍', items: [
    { id: 'n_green', name: 'Green', price: 0, c1: '#57d6a0', c2: '#1b9c6b', desc: 'Starter.' },
    { id: 'n_blue', name: 'Ice Blue', price: 200, c1: '#63b3ff', c2: '#2a6fd6', desc: 'Cool.' },
    { id: 'n_fire', name: 'Fire', price: 800, c1: '#ffb347', c2: '#ff3d2e', desc: 'Hot!' },
    { id: 'n_rainbow', name: 'Rainbow', price: 1200, c1: 'rainbow', c2: '#fff', desc: 'Colours cycle.' },
    { id: 'n_gold', name: 'Golden', price: 2500, c1: '#ffe066', c2: '#e0a100', desc: 'Shiny.' },
  ] },
  piece: { title: 'Chess pieces', emoji: '♟️', items: [
    { id: 'p_classic', name: 'Classic', price: 0, w: '#ffffff', b: '#1a1a24', glow: '', desc: 'Starter set.' },
    { id: 'p_wood', name: 'Wood', price: 600, w: '#f1d9a8', b: '#5b3a1e', glow: '', desc: 'Warm wooden look.' },
    { id: 'p_neon', name: 'Neon', price: 400, w: '#00e5ff', b: '#ff3d9a', glow: '1', desc: 'Glowing pieces.' },
    { id: 'p_gold', name: 'Royal Gold', price: 1000, w: '#ffe066', b: '#6a1b9a', glow: '1', desc: 'Gold vs purple.' },
    { id: 'p_ice', name: 'Ice & Fire', price: 1500, w: '#bfeaff', b: '#ff5a1f', glow: '1', desc: 'Frozen vs flames.' },
  ] },
  ball: { title: 'Balls', emoji: '⚪', items: [
    { id: 'l_white', name: 'White', price: 0, color: '#ffffff', desc: 'Starter.' },
    { id: 'l_fire', name: 'Fire Ball', price: 300, color: '#ff6b35', desc: 'Burning!' },
    { id: 'l_ice', name: 'Ice Ball', price: 300, color: '#9be7ff', desc: 'Frozen.' },
    { id: 'l_rainbow', name: 'Rainbow', price: 900, color: 'rainbow', desc: 'Colours cycle.' },
    { id: 'l_gold', name: 'Gold', price: 2000, color: '#ffd700', desc: 'Pure gold.' },
  ] },
  dice: { title: 'Ludo dice', emoji: '🎲', items: [
    { id: 'd_classic', name: 'Classic', price: 0, bg: 'linear-gradient(135deg,#00e5ff,#ff3d9a)', fg: '#10061f', glow: '', desc: 'Starter dice.' },
    { id: 'd_gold', name: 'Gold Dice', price: 300, bg: '#ffd700', fg: '#5a3b00', glow: '', desc: 'Shiny gold.' },
    { id: 'd_ruby', name: 'Ruby Dice', price: 600, bg: '#e63946', fg: '#ffffff', glow: '', desc: 'Deep red ruby.' },
    { id: 'd_neon', name: 'Neon Dice', price: 900, bg: '#10002b', fg: '#00e5ff', glow: '#00e5ff', desc: 'Glowing neon.' },
    { id: 'd_galaxy', name: 'Galaxy Dice', price: 1500, bg: '#3a0ca3', fg: '#ffd6ff', glow: '#b5179e', desc: 'Purple galaxy glow.' },
    { id: 'd_diamond', name: 'Diamond Dice', price: 2500, bg: '#bff3ff', fg: '#0077b6', glow: '#7ee8ff', desc: 'Legendary diamond.' },
  ] },
  token: { title: 'Ludo tokens', emoji: '♟', items: [
    { id: 'k_classic', name: 'Classic', price: 0, ring: '#ffffff', dot: '#ffffff', desc: 'Starter tokens.' },
    { id: 'k_gold', name: 'Gold Ring', price: 400, ring: '#ffd700', dot: '#ffd700', desc: 'Golden outline.' },
    { id: 'k_black', name: 'Shadow', price: 700, ring: '#0b0b0f', dot: '#8d99ae', desc: 'Dark outline.' },
    { id: 'k_neon', name: 'Neon', price: 1000, ring: '#00e5ff', dot: '#ff3d9a', desc: 'Neon glow ring.' },
    { id: 'k_royal', name: 'Royal', price: 1800, ring: '#ffd700', dot: '#6a1b9a', desc: 'Gold ring, purple jewel.' },
  ] },
  cardback: { title: 'UNO card backs', emoji: '🃏', items: [
    { id: 'u_classic', name: 'Classic', price: 0, c1: '#e53935', c2: '#111111', desc: 'Starter back.' },
    { id: 'u_ocean', name: 'Ocean', price: 300, c1: '#2dd4ff', c2: '#03324f', desc: 'Cool blue.' },
    { id: 'u_neon', name: 'Neon Pink', price: 600, c1: '#ff3d9a', c2: '#1a0033', desc: 'Pink neon.' },
    { id: 'u_forest', name: 'Forest', price: 900, c1: '#80ed99', c2: '#0b3d20', desc: 'Green woods.' },
    { id: 'u_galaxy', name: 'Galaxy', price: 1500, c1: '#b794f4', c2: '#0a0020', desc: 'Purple space.' },
    { id: 'u_gold', name: 'Royal Gold', price: 2500, c1: '#ffd700', c2: '#4a2c00', desc: 'Legendary gold.' },
  ] },
  hero: { title: 'Devil heroes', emoji: '😈', items: [
    { id: 'h_shadow', name: 'Shadow', price: 0, color: '#1d2433', hat: '', desc: 'Starter hero.' },
    { id: 'h_red', name: 'Red Rascal', price: 250, color: '#c1121f', hat: '', desc: 'Bold red.' },
    { id: 'h_robot', name: 'Robo', price: 700, color: '#8d99ae', hat: '🤖', desc: 'Metal hero.' },
    { id: 'h_ninja', name: 'Ninja', price: 1000, color: '#0b0b0f', hat: '🥷', desc: 'Silent & deadly.' },
    { id: 'h_pumpkin', name: 'Pumpkin', price: 1500, color: '#ff7f11', hat: '🎃', desc: 'Spooky orange.' },
    { id: 'h_ghost', name: 'Ghost', price: 2000, color: '#f1faee', hat: '👻', desc: 'Boo!' },
    { id: 'h_king', name: 'King', price: 3000, color: '#ffb703', hat: '👑', desc: 'Royal hero.' },
  ] },
};
const ALL_ITEMS = {};
Object.keys(SHOP).forEach(s => SHOP[s].items.forEach(i => { i.slot = s; ALL_ITEMS[i.id] = i; }));

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
const pip = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor"/>`;
function figure(it) {
  const s = it.slot, bgc = it.color || it.c1 || it.ring || it.w || '#7c5cff';
  let svg = '';
  if (s === 'gun') svg = gunSVG(it, 46);
  else if (s === 'outfit' || s === 'hero') svg = personSVG(it, 68);
  else if (s === 'car') svg = `<svg viewBox="0 0 90 44" height="46"><ellipse cx="45" cy="40" rx="36" ry="3" fill="#0006"/><path d="M6 30l4-10q2-5 8-6l14-2 12-8q3-2 8-2h12q6 0 9 5l6 12 5 2q4 1 4 6v4H6z" transform="translate(-4 4) scale(.95)" fill="${it.color}" stroke="#0b0b12" stroke-width="1.4"/><path d="M34 13l10-6h14l7 7-5 3H34z" fill="#bfe9ff" stroke="#0b0b12" stroke-width="1"/><rect x="20" y="30" width="52" height="2" fill="${shade(it.color, 1.5)}"/><circle cx="24" cy="36" r="7" fill="#15151d"/><circle cx="24" cy="36" r="3" fill="#aab"/><circle cx="68" cy="36" r="7" fill="#15151d"/><circle cx="68" cy="36" r="3" fill="#aab"/></svg>`;
  else if (s === 'ship') svg = `<svg viewBox="0 0 70 70" height="62" style="filter:drop-shadow(0 0 6px ${it.color}99)"><path d="M35 4l9 28 20 20-4 8-18-8-7 12-7-12-18 8-4-8 20-20z" fill="${it.color}" stroke="#0b0b12" stroke-width="1.4"/><ellipse cx="35" cy="30" rx="5" ry="9" fill="#d7f6ff"/><path d="M30 62l5 8 5-8z" fill="#ff9f1c"/><path d="M33 62l2 6 2-6z" fill="#fff3b0"/></svg>`;
  else if (s === 'snake') { const g = it.c1 === 'rainbow' ? null : it.c1, g2 = it.c2; const cols = i => g ? shade(g, .75 + i * .06) : `hsl(${i * 50},90%,58%)`; svg = '<svg viewBox="0 0 100 50" height="50">' + [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${12 + i * 14}" cy="${30 + Math.sin(i * 1.3) * 11}" r="${8 - i * .2}" fill="${cols(i)}" stroke="${g2}" stroke-width="1.5"/>`).join('') + `<circle cx="92" cy="${30 + Math.sin(7.8) * 11}" r="9" fill="${g || '#ffd54a'}" stroke="${g2}" stroke-width="1.5"/><circle cx="95" cy="${27 + Math.sin(7.8) * 11}" r="2" fill="#111"/><path d="M99 ${31 + Math.sin(7.8) * 11}l6 2" stroke="#e63946" stroke-width="1.5"/></svg>`; }
  else if (s === 'piece') svg = ['w', 'b'].map(k => `<svg viewBox="0 0 40 56" height="54" style="${it.glow ? 'filter:drop-shadow(0 0 5px ' + it[k] + ')' : ''}"><path d="M20 3v8M16 7h8" stroke="${it[k]}" stroke-width="3"/><path d="M12 18q0-7 8-7t8 7q0 6-5 9 5 4 6 14h4v7H7v-7h4q1-10 6-14-5-3-5-9z" fill="${it[k]}" stroke="${k === 'w' ? '#222' : '#ddd'}" stroke-width="1.4"/></svg>`).join('');
  else if (s === 'ball') { const c = it.color === 'rainbow' ? '#ff4d6d' : it.color; svg = `<svg viewBox="0 0 50 50" height="50"><defs><radialGradient id="rb${it.id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, .45)}"/></radialGradient></defs><circle cx="25" cy="25" r="21" fill="url(#rb${it.id})"/>${it.color === 'rainbow' ? '<path d="M5 25a20 20 0 0 1 40 0z" fill="#ffd54a88"/><path d="M5 25a20 20 0 0 0 40 0z" fill="#3a86ff88"/>' : ''}</svg>`; }
  else if (s === 'dice') svg = `<div style="width:52px;height:52px;border-radius:12px;background:${it.bg};color:${it.fg};display:grid;place-items:center;${it.glow ? 'box-shadow:0 0 16px ' + it.glow : 'box-shadow:0 3px 8px #0006'}"><svg viewBox="0 0 30 30" width="38" height="38">${pip(7, 7)}${pip(23, 7)}${pip(15, 15)}${pip(7, 23)}${pip(23, 23)}</svg></div>`;
  else if (s === 'token') svg = `<svg viewBox="0 0 40 52" height="54" style="filter:drop-shadow(0 0 4px ${it.ring}aa)"><ellipse cx="20" cy="46" rx="14" ry="5" fill="${it.ring}"/><path d="M12 44q1-16 8-16t8 16z" fill="${it.dot}" stroke="${it.ring}" stroke-width="2.5"/><circle cx="20" cy="16" r="10" fill="${it.dot}" stroke="${it.ring}" stroke-width="3"/><circle cx="17" cy="13" r="3" fill="#fff8"/></svg>`;
  else if (s === 'cardback') svg = `<svg viewBox="0 0 44 62" height="60" style="filter:drop-shadow(0 3px 5px #0007)"><rect x="2" y="2" width="40" height="58" rx="6" fill="${it.c2}" stroke="#fff" stroke-width="2"/><ellipse cx="22" cy="31" rx="15" ry="22" fill="${it.c1}" transform="rotate(25 22 31)"/><text x="22" y="37" text-anchor="middle" font-size="15" font-weight="900" fill="#fff" stroke="#000" stroke-width=".8" font-family="Arial Black,sans-serif">UNO</text></svg>`;
  else if (it.emoji) svg = `<div style="font-size:42px;line-height:1;filter:drop-shadow(0 3px 4px #0007)">${it.emoji}</div>`;
  else svg = `<div class="sw" style="background:${it.color || '#888'}"></div>`;
  return `<div class="fig" style="background:radial-gradient(circle at 50% 60%,${bgc}33,transparent 70%)">${svg}</div>`;
}

/* ------------------------------ core API ------------------------------ */
const Az = window.Az = {
  BASE, GAMES, PLACES, SHOP, COIN_RATE, DAILY_BONUS, figure, gunSVG, gunParts, personSVG, drawGun, gunItem,
  game: id => GAMES.find(g => g.id === id),
  get: k => db()[k],
  set: (k, v) => { db()[k] = v; save(); },

  coins: () => db().coins,
  diamonds: () => db().diamonds,
  addDiamonds(n) { db().diamonds = Math.max(0, db().diamonds + Math.round(n)); save(); Az.refresh(); },
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

      if (lv % 5 === 0) {
        const free = Object.values(SHOP).flatMap(s => s.items).find(it => !db().own[it.id]);
        if (free) { db().own[free.id] = 1; db().lastLevelItem = free.name; }
      }
    }
    save(); Az.refresh();
    if (after > before) Az.toast('🎉 Level ' + after + '! Reward: +100 coins' + (after % 5 === 0 && db().lastLevelItem ? ' + free ' + db().lastLevelItem : ''), 4500);
  },
  plvl: () => Math.floor(Math.sqrt(db().xp / 40)) + 1,
  plProgress() { const L = Az.plvl(), a = 40 * (L - 1) * (L - 1), b = 40 * L * L; return { lvl: L, cur: db().xp - a, need: b - a }; },

  mailCount: () => db().mail.filter(m => !m.claimed).length,
  claimMail(i) {
    const m = db().mail[i]; if (!m || m.claimed) return false;
    const n = Math.round(+m.coins || 0);
    if (m.mode === 'set') db().coins = Math.max(0, Math.min(MAXC, n)); else db().coins = Math.max(0, Math.min(MAXC, db().coins + n));
    m.claimed = true; m.claimedAt = Date.now(); save(); Az.refresh(); Az.toast('🎁 Mail claimed: +' + n + ' coins'); return true;
  },
  mailbox() {
    const m = Az.modal('<div id="azmailbox"></div>');
    const draw = () => {
      const list = db().mail.slice().reverse();
      const rows = list.length ? list.map((v,j) => { const i=db().mail.length-1-j; return `<div class="azitem"><b>🎁 ${v.title || 'Gift from Ari Game Zone'}</b><small><img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="A gold coin"> ${v.coins||0} coins</small>${v.claimed?'<span class="azpill">✅ Claimed</span>':`<button class="azbtn sm" data-claim="${i}">Claim reward</button>`}</div>`; }).join('') : '<p class="sub">No messages yet. Gifts from the developer will appear here.</p>';
      document.getElementById('azmailbox').innerHTML = `<h2>✉️ Mail</h2><p class="sub">Claim gifts sent to your Player ID.</p><div class="azshopgrid">${rows}</div><div class="azrow c"><button class="azbtn ghost" id="mailclose">Close</button></div>`;
    };
    m.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.claim!==undefined){Az.claimMail(+b.dataset.claim);draw();}if(b.id==='mailclose')m.close();});
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
  owned: id => !!(ALL_ITEMS[id] && (ALL_ITEMS[id].price === 0 || db().own[id])),
  eq(slot) { const it = SHOP[slot].items, id = db().eq[slot]; return (id && Az.owned(id) && ALL_ITEMS[id]) || it[0]; },
  equip(id) { if (!Az.owned(id)) return false; db().eq[ALL_ITEMS[id].slot] = id; save(); return true; },
  buy(id) { const it = ALL_ITEMS[id]; if (!it || Az.owned(id) || Az.coins() < it.price) return false; db().coins -= it.price; db().own[id] = 1; db().eq[it.slot] = id; save(); Az.refresh(); return true; },

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
    document.querySelectorAll('[data-az=avatar]').forEach(e => Az.avatarFill(e));
    document.querySelectorAll('[data-az=uid]').forEach(e => e.textContent = Az.uid());
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
};

Az.uid = () => db().uid;
Az.name = () => db().name || ('Player-' + db().uid.slice(-4));
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
  slots = ((slots && slots.length) ? slots : Object.keys(SHOP)).filter(k => SHOP[k]);
  if (!slots.length) slots = Object.keys(SHOP);
  let cur = startSlot && slots.includes(startSlot) ? startSlot : slots[0];
  const m = Az.modal('<div id="shopin"></div>');
  function draw() {
   try {
    const tabs = slots.map(s => `<button class="azchip ${s === cur ? 'on' : ''}" data-s="${s}">${SHOP[s].emoji} ${SHOP[s].title}</button>`).join('');
    const items = SHOP[cur].items.map(it => {
      const own = Az.owned(it.id), eq = Az.eq(cur).id === it.id;
      const pv = `<div class="pv">${figure(it)}</div>`;
      const btn = eq ? '<button class="azbtn sm ghost" disabled>✔ Equipped</button>' : own ? `<button class="azbtn sm" data-eq="${it.id}">Equip</button>` : `<button class="azbtn sm" data-buy="${it.id}" ${Az.coins() < it.price ? 'disabled' : ''}><img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="Gold A coin"> ${it.price}</button>`;
      return `<div class="azitem ${eq ? 'eq' : ''}">${pv}<b>${it.name}</b><small>${it.desc || ''}</small>${btn}</div>`;
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
    on(f) { fn = f; q.splice(0).forEach(f); },
    onclose(f) { cl = f; if (!n.open) f(); },
    close() { try { conn.close(); } catch (e) {} },
  };
  const hello = () => { try { conn.send({ __az: 'hello', name: Az.name(), uid: Az.uid(), photo: Az.photo() }); } catch (e) {} };
  if (conn.open) hello(); else conn.on('open', hello);
  conn.on('data', d => { if (d && d.__az === 'hello') { n.peer = { name: Az.cleanName(d.name) || 'Player', uid: String(d.uid || '').replace(/\D/g, '').slice(0, 10), photo: (typeof d.photo === 'string' && d.photo.indexOf('data:image/') === 0 && d.photo.length < 30000) ? d.photo : '' }; Az.showVs && Az.showVs(n); return; } if (d && d.__az === 'start') { n._start && n._start(d); return; } if (fn) fn(d); else q.push(d); });
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
  Az.refresh && Az.refresh();
  if (typeof drawTop === 'function') { try { drawTop(); } catch (e) {} }
  try { Az.ownerBtn && Az.ownerBtn(); } catch (e) {}
  try { document.dispatchEvent(new Event('az-account')); } catch (e) {}
}
function setLoginBtn() {
  const b = document.getElementById('azlogin'); if (!b) return;
  b.textContent = fbUser ? '👤 ' + String(fbUser.displayName || fbUser.email || fbUser.phoneNumber || 'Me').split(' ')[0].slice(0, 8) : '👤 Guest / Login';
}
function doPush() {                    // write the CURRENT account's data to its own cloud node
  if (!fbUser || !fbDb || cloudUid !== fbUser.uid || !D) return Promise.resolve(false);
  try { return fbDb.ref(gdPath(fbUser.uid)).set(JSON.parse(JSON.stringify(D))).then(() => true).catch(e => { Az.toast && Az.toast('Cloud save failed: ' + (e.message || 'check database rules')); return false; }); }
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
    Object.keys(v).forEach(id => {
      if (seenGrants[id]) return; seenGrants[id] = 1; const g = v[id];
      ref.child(id).remove().then(() => {
        if (g && typeof g.coins === 'number' && fbUser && fbUser.uid === u.uid) {
          db().mail.push({ title: g.title || 'Gift from Ari Game Zone', coins: Math.round(+g.coins||0), mode: g.mode || 'add', ts: g.ts || Date.now(), claimed: false });
          save(); Az.toast('✉️ New mail received! Open Mail to claim your gift.', 4500);
          document.dispatchEvent(new Event('az-mail'));
        }
      }).catch(() => { delete seenGrants[id]; });
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
Az.devSetDiamonds = function (n) { if (!Az.isOwner()) return false; n = Math.round(+n); if (!isFinite(n)) return false; db().diamonds = Math.max(0, Math.min(MAXC, n)); save(); Az.refresh(); return true; };
Az.devAddDiamonds = function (n) { n = Math.round(+n); return isFinite(n) && Az.devSetDiamonds(db().diamonds + n); };
Az.devGive = function (gid, amount, mode) {
  return Promise.resolve().then(() => {
    if (!Az.isOwner()) throw new Error('This is only for owner ID ' + OWNER_UID + '.');
    if (!fbUser || !fbDb) throw new Error('Log in with Google/Phone first.');
    if (!Az.ownerOK) throw new Error('Owner not verified. Publish the new database.rules.json and log in with the owner Gmail (see ADMIN-SETUP.txt).');
    gid = String(gid || '').replace(/\D/g, ''); amount = Math.round(+amount);
    if (!/^\d{8}$/.test(gid)) throw new Error('Player ID must be 8 digits.');
    if (!isFinite(amount) || Math.abs(amount) > 1e9) throw new Error('Enter a valid coin amount.');
    return fbDb.ref('uidIndex/' + gid).once('value').then(s => {
      const t = s.val(); if (!t) throw new Error('No account found for this Player ID. That player must log in and open the game once.');
      return fbDb.ref('adminGrants/' + t).push({ coins: amount, diamonds: 0, mode: mode === 'set' ? 'set' : 'add', diamondMode: 'add', ts: firebase.database.ServerValue.TIMESTAMP }).then(() => gid);
    });
  });
};
Az.devGiveMail = function (gid, coins, diamonds) {
  return Promise.resolve().then(() => {
    if (!Az.isOwner()) throw new Error('This is only for the owner account.');
    if (!fbUser || !fbDb) throw new Error('Log in with Google/Phone first.');
    if (!Az.ownerOK) throw new Error('Owner not verified. Publish database.rules.json in Firebase.');
    gid = String(gid || '').replace(/\\D/g, '');
    coins = Math.round(+coins || 0); diamonds = Math.round(+diamonds || 0);
    if (!/^\\d{8}$/.test(gid)) throw new Error('Player ID must be 8 digits.');
    if (!isFinite(coins) || !isFinite(diamonds) || coins < 0 || diamonds < 0 || coins > 1e9 || diamonds > 1e9) throw new Error('Enter valid positive amounts.');
    return fbDb.ref('uidIndex/' + gid).once('value').then(s => {
      const target=s.val(); if(!target) throw new Error('Player not found. They must log in once.');
      return fbDb.ref('adminGrants/' + target).push({ coins, diamonds, mode:'add', diamondMode:'add', title:'Gift from Ari Game Zone', ts:firebase.database.ServerValue.TIMESTAMP }).then(()=>gid);
    });
  });
};
Az.ownerBtn = function () {       // home-page button: visible ONLY on the owner ID
  const cb = document.getElementById('admincoins'); if (!cb) return;
  if (!Az.isOwner()) { cb.style.display = 'none'; cb.onclick = null; return; }
  cb.style.display = ''; cb.textContent = '👑 Developer Mode'; cb.onclick = () => { location.href = BASE + 'owner-admin.html'; };
};
Az.whenAuth = () => { if (!LS.get('az_login')) return Promise.resolve(null); return loadFb().then(() => null).catch(() => null); };

function afterLogout() {
  // 'az_login' is the cross-tab "a session is still open" flag: whoever sees it first does the cleanup once.
  fbUser = null; cloudUid = null; loadSeq++; clearTimeout(pushT); pushT = null; stopGrants(); Az.ownerOK = false;
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
      cloud = normalize(cloud);
      if (hadLocal && localD.rev > cloud.rev) { cloudUid = u.uid; doPush(); }   // this device is ahead (cloud write was lost)
      else { D = cloud; LS.set(ACTIVE_KEY, JSON.stringify(D)); cloudUid = u.uid; if (needsStarter49019468) doPush(); }
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
    const extra = (cfg.extra || []).map(x => `<div class="azlbl">${x.label}</div><div class="azrow">${x.options.map(op => `<button class="azchip ${st.extra[x.key] === op[0] ? 'on' : ''}" data-ex="${x.key}" data-v="${op[0]}">${op[1]}</button>`).join('')}</div>`).join('');
    let play;
    if (st.mode === 'online') play = `<div class="azlbl">Online room</div><div class="azrow c"><button class="azbtn" id="mk">➕ Create room</button><span style="align-self:center;color:var(--muted)">or</span><input class="azinput" id="jc" maxlength="4" placeholder="CODE"><button class="azbtn ghost" id="jn">Join</button></div><div class="azerr" id="neterr"></div><div id="netinfo"></div>`;
    else play = `<div class="azrow c" style="margin-top:18px"><button class="azbtn" id="go" style="font-size:17px;padding:13px 34px">▶ Play</button></div>`;
    $('#stin', m).innerHTML = `<div class="azbig">${g.emoji}</div><h2 style="text-align:center">${g.name}</h2><p class="sub" style="text-align:center">${g.desc}</p>${modes}${diff}${lvl}${extra}${play}<div class="azrow c" style="margin-top:14px"><a class="azbtn ghost sm" href="${BASE}index.html">🏠 Home</a><button class="azbtn ghost sm" id="sh">🛒 Shop</button></div>`;
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
  const coins = Math.round(COIN_RATE * (r.base || 0) * dm * (1 + lvl * .04) * (r.won ? 1 : .25));
  const xp = Math.round(coins * .6 + (r.won ? 15 : 3));
  Az.addCoins(coins); Az.addXp(xp);
  let note = '', newBest = false;
  if (r.score != null) newBest = Az.setBest(g.id, r.score);
  if (r.won && r.progress !== false && lvl >= Az.level(g.id) && lvl < g.max) {
    Az.unlock(g.id, lvl + 1);
    const a = Az.place(lvl), b = Az.place(lvl + 1);
    note = `<p style="text-align:center;color:var(--a3)">🔓 Level ${lvl + 1} unlocked!${a.name !== b.name ? `<br>📍 New place: ${b.emoji} <b>${b.name}</b>` : ''}</p>`;
  }
  if (r.won && lvl >= g.max && r.progress !== false) note = '<p style="text-align:center;color:var(--a4)">👑 MAX LEVEL! You are a legend!</p>';
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
    const bar = el('div', 'azbar', `<a class="azhome" href="${BASE}index.html" title="Home">🏠</a><div class="aztitle">${g ? g.emoji + ' ' + g.name : 'Ari Game Zone'}</div><div class="azbadges"><span class="azpill" id="azlv">${g ? 'Lv ' + Az.level(gid) : ''}</span><span class="azpill coin" id="azcoins"><img class="az-coin-icon" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNGE4Ii8+PHN0b3Agb2Zmc2V0PSIuMjUiIHN0b3AtY29sb3I9IiNmZmQ4NGQiLz48c3RvcCBvZmZzZXQ9Ii41OCIgc3RvcC1jb2xvcj0iI2Q4OGEwMCIvPjxzdG9wIG9mZnNldD0iLjgyIiBzdG9wLWNvbG9yPSIjZmZmMDdhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg1YjAwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImYiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjZmZmNmIwIi8+PHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNmZmNmMzIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiODZhMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NyIgZmlsbD0iIzliNTcwMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNDciIHI9IjQ1IiBmaWxsPSJ1cmwoI2cpIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGNpcmNsZSBjeD0iNTAiIGN5PSI0NyIgcj0iMzcuNSIgZmlsbD0idXJsKCNmKSIgc3Ryb2tlPSIjYjk2YjAwIiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3IiByPSIzMy41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYwYTAiIHN0cm9rZS13aWR0aD0iMS41Ii8+PHBhdGggZD0iTTUwIDE2bDIuMyA1LjUgNS45LjQtNC41IDMuOCAxLjUgNS43LTUuMi0zLjEtNS4yIDMuMSAxLjUtNS43LTQuNS0zLjggNS45LS40eiIgZmlsbD0iI2ZmZjNhMCIvPjx0ZXh0IHg9IjUwIiB5PSI2OCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDkiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmMmEwIiBzdHJva2U9IiM5YTU3MDAiIHN0cm9rZS13aWR0aD0iMS4xIiBwYWludC1vcmRlcj0ic3Ryb2tlIj5BPC90ZXh0Pjwvc3ZnPg==" alt="A gold coin"> ${Az.coins()}</span>${g ? '<button class="azbtn-i" id="azshopb" title="Shop">🛒</button>' : ''}<button class="azbtn-i" id="azsnd" title="Sound">${db().sound ? '🔊' : '🔇'}</button><button class="azbtn-i" id="azprof" title="Profile">🆔</button><button class="azbtn-i" id="azthm" title="Theme">🎨</button></div>`);
    document.body.insertBefore(bar, bg.nextSibling);
    bar.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'azshopb') Az.shop(g.shop.length ? g.shop : null);
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
  if (!LS.get('az_login')) askNameIfNeeded();   // logged-in accounts: asked only after their cloud data is loaded
  document.dispatchEvent(new Event('az-ready'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();