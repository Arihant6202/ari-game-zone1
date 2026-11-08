(function () {
'use strict';
const SRC = document.currentScript ? document.currentScript.src : '';
const BASE = SRC.replace(/az\.js.*$/, '');
const KEY = 'az2';
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
  return s;
}
// Firebase Realtime DB drops empty objects ({}), so cloud data must be re-filled before use.
function normalize(d) {
  if (!d || typeof d !== 'object') d = {};
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  d.coins = (typeof d.coins === 'number' && isFinite(d.coins) && d.coins >= 0) ? d.coins : (d.coins == null ? 150 : 0);
  d.xp = (typeof d.xp === 'number' && isFinite(d.xp) && d.xp > 0) ? d.xp : 0;
  d.lv = obj(d.lv); d.best = obj(d.best); d.own = obj(d.own); d.eq = obj(d.eq);
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
    { id: 'o_shinobu', name: 'Shinobu', price: 0, color: '#b794f4', hat: '🦋', hp: 180, desc: 'Butterfly Hashira. +80 HP' },
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

/* ------------------------------ core API ------------------------------ */
const Az = window.Az = {
  BASE, GAMES, PLACES, SHOP, COIN_RATE, DAILY_BONUS,
  game: id => GAMES.find(g => g.id === id),
  get: k => db()[k],
  set: (k, v) => { db()[k] = v; save(); },

  coins: () => db().coins,
  addCoins(n) { db().coins = Math.max(0, db().coins + Math.round(n)); save(); Az.refresh(); },
  xp: () => db().xp,
  addXp(n) { db().xp += Math.round(n); save(); Az.refresh(); },
  plvl: () => Math.floor(Math.sqrt(db().xp / 40)) + 1,
  plProgress() { const L = Az.plvl(), a = 40 * (L - 1) * (L - 1), b = 40 * L * L; return { lvl: L, cur: db().xp - a, need: b - a }; },

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
  toast(msg, ms) { const t = el('div', 'aztoast', msg); document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2200); },
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
    const c = $('#azcoins'); if (c) c.textContent = '🪙 ' + Az.coins();
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
    '<p class="sub" style="text-align:center">' + (first ? 'Tumhe ek unique Player ID mil gayi hai. Ab apna naam daalo.' : 'Ye tumhari unique Player ID hai.') + '</p>' +
    '<div class="azrow c"><span class="azpill" id="pfuid" style="font-size:16px;letter-spacing:1px;cursor:pointer" title="Tap to copy"></span></div>' +
    '<div class="azrow c" style="margin-top:12px"><input id="pfname" maxlength="14" autocomplete="off" placeholder="Apna naam (2-14 letters)" style="width:100%;max-width:260px;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:inherit;font:inherit;text-align:center"></div>' +
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
    fi.onchange = () => { const f = fi.files && fi.files[0]; if (f) Az.setPhoto(f).then(() => { Az.avatarFill(av); Az.toast('✅ Photo save ho gayi'); }).catch(() => Az.toast('❌ Photo nahi chali, dusri try karo')); };
    const r2 = document.createElement('div'); r2.className = 'azrow c'; r2.append(bt, rm); row.append(av, r2, fi); m.querySelector('#pfuid').parentNode.before(row); }
  const inp = m.querySelector('#pfname'); inp.value = db().nameSet ? db().name : (fbUser && fbUser.displayName ? Az.cleanName(fbUser.displayName) : '');
  if (fbUser) { const ac = document.createElement('p'); ac.className = 'sub'; ac.style.textAlign = 'center'; ac.textContent = '☁️ ' + (fbUser.email || fbUser.phoneNumber || 'Logged in'); m.querySelector('#pfuid').parentNode.after(ac); }
  if (Az.isOwner()) { const dv = document.createElement('div'); dv.className = 'azrow c'; const db2 = document.createElement('button'); db2.className = 'azbtn sm'; db2.textContent = '👑 Developer Mode'; db2.onclick = () => { location.href = BASE + 'owner-admin.html'; }; dv.appendChild(db2); m.querySelector('#pferr').after(dv); }
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50);
  const doSave = () => { if (Az.setName(inp.value)) { m.close(); Az.toast('✅ Naam save: ' + Az.name()); } else m.querySelector('#pferr').textContent = 'Naam kam se kam 2 characters ka ho.'; };
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
      const pv = it.bg ? `<div class="pv"><div class="sw" style="background:${it.bg};color:${it.fg};display:grid;place-items:center;font-size:20px;border-radius:10px;${it.glow ? 'box-shadow:0 0 14px ' + it.glow : ''}">⚄</div></div>` : it.ring ? `<div class="pv"><div class="sw" style="background:${it.dot};border-color:${it.ring}"></div></div>` : it.emoji ? `<div class="pv">${it.emoji}</div>` : (it.c1 ? `<div class="pv"><div class="sw" style="background:${it.c1 === 'rainbow' ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : `linear-gradient(135deg,${it.c1},${it.c2})`}"></div></div>` : (it.w ? `<div class="pv"><div class="sw" style="background:linear-gradient(90deg,${it.w} 50%,${it.b} 50%)"></div></div>` : `<div class="pv"><div class="sw" style="background:${it.color === 'rainbow' ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : it.color}">${it.hat || ''}</div></div>`));
      const btn = eq ? '<button class="azbtn sm ghost" disabled>✔ Equipped</button>' : own ? `<button class="azbtn sm" data-eq="${it.id}">Equip</button>` : `<button class="azbtn sm" data-buy="${it.id}" ${Az.coins() < it.price ? 'style="filter:grayscale(.7)"' : ''}>🪙 ${it.price}</button>`;
      return `<div class="azitem ${eq ? 'eq' : ''}">${pv}<b>${it.name}</b><small>${it.desc || ''}</small>${btn}</div>`;
    }).join('');
    $('#shopin', m).innerHTML = `<h2>🛒 Shop</h2><p class="sub">You have <b style="color:var(--a4)">🪙 ${Az.coins()}</b> coins. Earn more by winning levels!</p><div class="azrow">${tabs}</div><div class="azshopgrid">${items}</div><div class="azrow c" style="margin-top:14px"><button class="azbtn ghost" id="shopx">Close</button></div>`;
   } catch (err) { $('#shopin', m).innerHTML = '<h2>🛒 Shop</h2><p class="sub">Shop load nahi hua: ' + String(err && err.message || err).replace(/[<>&]/g, '') + '</p><div class="azrow c"><button class="azbtn ghost" id="shopx">Close</button></div>'; }
  }
  m.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.s) { cur = t.dataset.s; draw(); }
    else if (t.dataset.buy) { if (Az.buy(t.dataset.buy)) { Az.sfx('coin'); Az.toast('✅ Bought & equipped!'); } else { Az.sfx('lose'); Az.toast('Not enough coins 🪙 — win more levels!'); } draw(); }
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
const OWNER_UID = '97835276', MAXC = 999999999, seenGrants = {};
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
    if (!c || !c.apiKey || /PASTE/.test(c.apiKey)) return rej(new Error('Firebase keys missing. firebase-config.js me apni keys daalo.'));
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
      s.onerror = () => rej(new Error('Login service load nahi hua. Internet check karo.')); document.head.appendChild(s);
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
  const n = Math.round(+g.coins); if (!isFinite(n)) return;
  const was = db().coins;
  db().coins = Math.max(0, Math.min(MAXC, g.mode === 'set' ? n : was + n)); save(); Az.refresh();
  const d = db().coins - was; Az.toast && Az.toast(g.mode === 'set' ? '🎁 Owner ne tumhare coins ' + db().coins + ' kar diye!' : (d >= 0 ? '🎁 Owner ne +' + d + ' coins bheje!' : '⚠️ Owner ne ' + (-d) + ' coins kam kiye'), 3500);
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
      ref.child(id).remove().then(() => { if (g && typeof g.coins === 'number' && fbUser && fbUser.uid === u.uid) applyGrant(g); }).catch(() => { delete seenGrants[id]; });
    });
  }, () => {});
}
function postLogin(u, seq) {
  if (!fbDb) return;
  const alive = () => seq === loadSeq && fbUser && fbUser.uid === u.uid;
  fbDb.ref('admin/ping').once('value')                       // allowed by the rules ONLY for the owner's Firebase account
    .then(() => {
      if (!alive()) return; Az.ownerOK = true;
      if (String(db().uid) !== OWNER_UID) { db().uid = OWNER_UID; save(); accountChanged(); }
      return fbDb.ref('uidIndex/' + OWNER_UID).set(u.uid);
    })
    .catch(() => { if (alive() && !Az.ownerOK) Az.ownerOK = false; })
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
Az.devGive = function (gid, amount, mode) {
  return Promise.resolve().then(() => {
    if (!Az.isOwner()) throw new Error('Ye sirf owner ID ' + OWNER_UID + ' ke liye hai.');
    if (!fbUser || !fbDb) throw new Error('Pehle Google/Phone se login karo.');
    if (!Az.ownerOK) throw new Error('Owner verify nahi hua. database.rules.json me apna Firebase Auth UID daalo (ADMIN-SETUP.txt) aur Publish karo.');
    gid = String(gid || '').replace(/\D/g, ''); amount = Math.round(+amount);
    if (!/^\d{8}$/.test(gid)) throw new Error('Player ID 8 digit ki honi chahiye.');
    if (!isFinite(amount) || Math.abs(amount) > 1e9) throw new Error('Coins sahi number me daalo.');
    return fbDb.ref('uidIndex/' + gid).once('value').then(s => {
      const t = s.val(); if (!t) throw new Error('Is Player ID ka account nahi mila. Us player ko ek baar login karke game kholna hoga.');
      return fbDb.ref('adminGrants/' + t).push({ coins: amount, mode: mode === 'set' ? 'set' : 'add', ts: firebase.database.ServerValue.TIMESTAMP }).then(() => gid);
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
    if (cloud) {
      cloud = normalize(cloud);
      if (hadLocal && localD.rev > cloud.rev) { cloudUid = u.uid; doPush(); Az.toast && Az.toast('☁️ Latest progress uploaded'); }   // this device is ahead (cloud write was lost)
      else { D = cloud; LS.set(ACTIVE_KEY, JSON.stringify(D)); cloudUid = u.uid; Az.toast && Az.toast('☁️ Account progress restored'); }
    } else {
      cloudUid = u.uid; D = db(); doPush(); Az.toast && Az.toast('☁️ New account created');
    }
    if (lg) linkInto(u, lg);
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
function mergeData(a, g) {                   // keep the BEST of both records
  const r = normalize(JSON.parse(JSON.stringify(a)));
  r.coins = Math.max(a.coins, g.coins); r.xp = Math.max(a.xp, g.xp);
  Object.keys(g.lv).forEach(k => { r.lv[k] = Math.max(r.lv[k] || 1, g.lv[k] || 1); });
  Object.keys(g.best).forEach(k => { r.best[k] = Math.max(r.best[k] || 0, g.best[k] || 0); });
  r.own = Object.assign({}, g.own, a.own);
  return r;
}
function adoptGuest(u, lg, data) {           // make `data` (a guest's progress) THE progress of this signed-in account
  if (!fbUser || fbUser.uid !== u.uid) return;
  data.rev = Math.max(data.rev, db().rev) + 1; data.ts = Date.now();
  D = data; LS.set(ACTIVE_KEY, JSON.stringify(D)); cloudUid = u.uid;
  accountChanged();
  doPush().then(ok => {
    if (!ok) { Az.toast && Az.toast('⚠️ Cloud save nahi hua — guest progress safe hai, dobara link karo.', 3500); return; }
    LS.del(GPFX + lg); if (guestId() === lg) rotateGuest();
    Az.toast && Az.toast('🔗 Guest progress ab ' + (u.email || u.phoneNumber || 'is account') + ' se linked hai ☁️', 3500);
    accountChanged();
  });
  postLogin(u, loadSeq);
}
function linkInto(u, lg) {                   // called right after login (or from the Link button) with the account's data already loaded
  const g = readGuest(lg); if (!g) { Az.toast && Az.toast('Guest progress nahi mila.'); return; }
  const acc = db();
  if (acc.rev === 0) return adoptGuest(u, lg, g);         // brand-new Gmail: nothing to lose, just move the guest in
  const row = (t, d) => '<div class="azstat" style="margin:4px 0"><div><b style="font-size:14px">' + esc(t) + '</b><small>' + esc(d.name || ('Player-' + String(d.uid).slice(-4))) + '</small></div><div><b>🪙 ' + d.coins + '</b><small>coins</small></div><div><b>Lv ' + lvOfXp(d.xp) + '</b><small>player</small></div></div>';
  const m = Az.modal('<div class="azbig">🔗</div><h2 style="text-align:center">Is Gmail me pehle se progress hai</h2><p class="sub" style="text-align:center">' + esc(u.email || u.phoneNumber || '') + '</p>' + row('☁️ Gmail', acc) + row('👤 Guest', g) +
    '<div class="azrow c" style="flex-direction:column;align-items:stretch"><button class="azbtn" id="lk_mg">🧮 Dono ka best milao (recommended)</button><button class="azbtn ghost" id="lk_rp">⬆️ Guest se Gmail replace karo</button><button class="azbtn ghost" id="lk_kp">☁️ Gmail waisa hi rakho (guest alag rahe)</button></div>', { sticky: true });
  m.addEventListener('click', e => {
    const id = e.target.id; if (!/^lk_/.test(id)) return; m.close();
    if (!fbUser || fbUser.uid !== u.uid) return;
    if (id === 'lk_mg') adoptGuest(u, lg, mergeData(db(), g));
    else if (id === 'lk_rp') adoptGuest(u, lg, g);
    else Az.toast && Az.toast('Gmail ka progress waisa hi hai. Guest progress alag safe hai.', 3000);
  });
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
    const tag = act ? '<span class="azpill" style="color:var(--a3)">✔ Playing</span>' : (fbUser && g.cur ? '<span class="azpill">Logout ke baad</span>' : '');
    const b = (a, t, ghost) => '<button class="azbtn sm' + (ghost ? ' ghost' : '') + '" data-' + a + '="' + esc(g.id) + '">' + t + '</button>';
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 10px;margin:6px 0;border:1px solid ' + (act ? 'var(--a3)' : 'var(--line)') + ';border-radius:14px;background:var(--panel)">' +
      '<div style="flex:1;min-width:120px"><b>' + esc(g.name) + '</b><br><small style="color:var(--muted)">🆔 ' + esc(g.uid) + ' · 🪙 ' + g.coins + ' · Lv ' + lvOfXp(g.xp) + '</small></div>' +
      tag + (act ? '' : (!g.cur || !fbUser ? b('gsw', fbUser ? 'Switch' : '▶ Use') : '')) + (fbUser ? b('glk', '🔗 Link', 1) : '') + b('gdel', '🗑', 1) + '</div>';
  };
  const drawGuests = () => { const c = m.querySelector('#glist'); if (c) c.innerHTML = listGuests().map(gRow).join('') || '<p class="sub" style="text-align:center">Koi saved guest nahi.</p>'; };
  const guestBlock = '<div class="azlbl">👥 Is device ke saved guests</div><div id="glist"></div><div class="azrow c"><button class="azbtn ghost sm" id="gnew">➕ Naya guest banao</button></div>';
  if (fbUser) {
    const who = esc(fbUser.email || fbUser.phoneNumber || fbUser.displayName || '');
    box().innerHTML = '<div class="azbig">👤</div><h2 style="text-align:center">Logged in</h2><p class="sub" style="text-align:center">' + who + '<br>Player ID: <b>' + esc(Az.uid()) + '</b><br>Profile cloud me saved hai ☁️</p><div class="azrow c"><button class="azbtn ghost" id="lo">Logout</button></div><p class="sub" style="text-align:center;font-size:11px">Logout ke baad tum wapas apne guest progress par aaoge — guest ka progress kabhi delete nahi hota.</p>' + guestBlock + '<p class="sub" style="text-align:center;font-size:10px;word-break:break-all;opacity:.7">Firebase UID (tap to copy):<br><span id="fbuid" style="cursor:pointer"></span></p>';
    const fu = box().querySelector('#fbuid'); fu.textContent = fbUser.uid; fu.onclick = () => { try { navigator.clipboard.writeText(fbUser.uid); Az.toast('📋 Firebase UID copied'); } catch (x) {} };
    drawGuests();
    m.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'lo') { t.disabled = true; t.textContent = 'Logging out…'; Az.logout().then(() => { m.close(); Az.toast && Az.toast('👋 Logout ho gaya — guest progress wapas'); }); }
      else if (t.dataset.gsw) Az.switchGuest(t.dataset.gsw);
      else if (t.dataset.glk) { if (cloudUid !== fbUser.uid) { Az.toast('Cloud load ho raha hai, thoda ruko…'); return; } m.close(); linkInto(fbUser, t.dataset.glk); }
      else if (t.dataset.gdel) { if (confirm('Ye guest aur uska progress hamesha ke liye delete ho jayega. Pakka?')) { Az.deleteGuest(t.dataset.gdel); drawGuests(); } }
      else if (t.id === 'gnew') Az.newGuest();
    });
    return m;
  }
  const me = db();
  box().innerHTML = '<div class="azbig">📱</div><h2 style="text-align:center">Login / Guest</h2>' +
    '<p class="sub" style="text-align:center">Abhi tum <b>Guest</b> ho: ' + esc(Az.name()) + ' · 🆔 ' + esc(me.uid) + ' · 🪙 ' + me.coins + '</p>' +
    '<p class="sub" style="text-align:center">Har Gmail ka apna alag progress hota hai. Naya Gmail = bilkul naya account. Purana Gmail = uska purana progress.</p>' +
    '<div class="azrow c" style="flex-direction:column;align-items:center"><button class="azbtn" id="gg">🔵 Google (Gmail) se login</button><button class="azbtn ghost" id="gl">🔗 Is guest progress ko Gmail se link karo</button></div>' +
    '<p class="sub" style="text-align:center;margin-top:12px">ya phone OTP se:</p><div class="azrow c"><input class="azinput" id="ph" type="tel" placeholder="98765 43210" style="width:210px;letter-spacing:1px"></div><div class="azrow c" id="otpr" style="display:none"><input class="azinput" id="otp" inputmode="numeric" maxlength="6" placeholder="OTP"></div><div class="azerr" id="lerr"></div><div class="azrow c"><button class="azbtn" id="sn">Send OTP</button></div><div id="rc"></div>' + guestBlock;
  drawGuests();
  const err = t => { const e = box() && box().querySelector('#lerr'); if (e) e.textContent = t; }; let conf = null, ver = null;
  const google = link => {
    err('Google khul raha hai…'); linkG = link ? guestId() : null;
    loadFb().then(() => {
      const p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });   // always show the Gmail chooser, so a 2nd Gmail can really be picked
      return firebase.auth().signInWithPopup(p);
    }).then(() => { m.close(); Az.toast && Az.toast('✅ Login ho gaya!'); })
      .catch(x => { linkG = null; err(x.code === 'auth/popup-closed-by-user' ? 'Login cancel hua.' : (x.code === 'auth/popup-blocked' ? 'Popup block hua — browser me popup allow karo.' : (x.message || 'Google login fail hua.'))); });
  };
  m.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'gg') google(false);
    else if (t.id === 'gl') google(true);
    else if (t.dataset.gsw) Az.switchGuest(t.dataset.gsw);
    else if (t.dataset.gdel) { if (confirm('Ye guest aur uska progress hamesha ke liye delete ho jayega. Pakka?')) { Az.deleteGuest(t.dataset.gdel); drawGuests(); } }
    else if (t.id === 'gnew') Az.newGuest();
    else if (t.id === 'sn' && !conf) {
      let n = box().querySelector('#ph').value.replace(/[\s-]/g, ''); if (!n.startsWith('+')) n = '+91' + n.replace(/^0+/, '');
      if (n.length < 12) return err('Sahi phone number daalo.'); err('OTP bhej raha hoon…');
      loadFb().then(() => { ver = ver || new firebase.auth.RecaptchaVerifier(box().querySelector('#rc'), { size: 'invisible' }); return firebase.auth().signInWithPhoneNumber(n, ver); })
        .then(c => { conf = c; err(''); box().querySelector('#otpr').style.display = ''; t.textContent = 'Verify OTP'; })
        .catch(x => err(x.message || 'OTP nahi gaya. Dobara try karo.'));
    } else if (t.id === 'sn' && conf) {
      conf.confirm(box().querySelector('#otp').value.trim()).then(() => { m.close(); Az.toast && Az.toast('✅ Login ho gaya!'); }).catch(() => err('Galat OTP. Dobara try karo.'));
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
          setTimeout(() => { if (!done) { err('Connect nahi hua. Code dobara check karo, dono net chalu rakho, aur ek hi WiFi par try karo.'); info(''); } }, 25000);
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
    <div class="azstat"><div><b>+${coins}</b><small>🪙 coins</small></div><div><b>+${xp}</b><small>⭐ XP</small></div>${r.score != null ? `<div><b>${r.score}</b><small>${newBest ? '🎉 New best!' : 'score'}</small></div>` : ''}</div>${note}
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
    const bar = el('div', 'azbar', `<a class="azhome" href="${BASE}index.html" title="Home">🏠</a><div class="aztitle">${g ? g.emoji + ' ' + g.name : 'Ari Game Zone'}</div><div class="azbadges"><span class="azpill" id="azlv">${g ? 'Lv ' + Az.level(gid) : ''}</span><span class="azpill coin" id="azcoins">🪙 ${Az.coins()}</span>${g ? '<button class="azbtn-i" id="azshopb" title="Shop">🛒</button>' : ''}<button class="azbtn-i" id="azsnd" title="Sound">${db().sound ? '🔊' : '🔇'}</button><button class="azbtn-i" id="azprof" title="Profile">🆔</button><button class="azbtn-i" id="azthm" title="Theme">🎨</button></div>`);
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
