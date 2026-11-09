ARI GAME ZONE — PROJECT README

A mobile-friendly HTML5 gaming site with Firebase account saves, player IDs, Google sign-in, Gold Coins, a shop, claimable Mail, multiplayer emoji reactions, and per-game progression.

GAMES
- Zone Survivor and Arena Strike
- Turbo Racing, Royal Chess, Tic Tac Toe, Connect Four, Ludo, UNO
- Sky Flyer, Snake Evolution, Brick Breaker, Whack-a-Mole, Level Devil, Stone Paper Scissor
- Neon Runner and Badminton Rally

PLAYER FEATURES
- Guest progress is stored separately on the current device.
- Google accounts have separate cloud progress per Firebase account.
- Mail inbox is available from the home page and game top bar.
- Level rewards: +100 Gold Coins every level; every fifth level grants a special item of a different kind (trail, gun, bird, car, outfit, runner, snake, chess set, ball, dice, token, card back, hero, racket, shuttle, disc). Rare/legendary items are level-reward only (shown as 🔒 in the shop).
- Name: the player's own name is the only name shown. The Gmail name is used only until the player sets a name.
- v14: Neon Runner and Badminton Rally rebuilt (double jump, slide, drones, shields, magnets / real rallies with clear, drop & smash). New shop items for every game, with rarity badges.
- Lucky Reward costs 100 Gold Coins per spin and may award an unowned shop item or Gold Coins.
- Multiplayer games that use PeerJS can show opponent names and exchange quick emoji reactions.

DEVELOPER FEATURES
- Verified owner Gmail: kumararihant625@gmail.com (Player ID 97835276).
- Developer Mode can send Gold Coins and an optional message to a registered Player ID through claimable Mail.
- A separate confirmed action queues a 500 Gold Coin Diwali bonus for every existing ID registered in uidIndex. This action must be triggered by the owner after publishing Firebase rules; it is not pre-sent by the ZIP.

DEPLOYMENT
1. Keep firebase-config.js configured for the intended Firebase project.
2. Publish database.rules.json in Firebase Realtime Database Rules.
3. Upload all ZIP contents to the GitHub Pages repository root.
4. Test Google login, guest save, Mail claiming, and multiplayer on two separate devices.

For owner instructions, see ADMIN-SETUP.txt.


--- VERSION 15 UPDATE NOTES ---
- Homepage visual refresh: dark neon dashboard, clearer navigation, responsive game cards and updated branding.
- Added original mini-games: Memory Match, Quick Math, Color Dash and Tap Rush.
- Game registry now contains 20 games total (15 existing + 5 new).
- Added Ari Game Zone SVG app/favicon icon and installable web manifest.
- Existing account separation, Firebase Google sign-in/cloud save, in-game mailbox and PeerJS room framework retained.

IMPORTANT INTEGRATION LIMITS (NOT CLAIMED AS COMPLETE):
- Secure player-to-player Gold transfer needs a trusted Firebase Cloud Function (or equivalent server) and server-enforced transaction validation. It is not safe to implement by allowing browsers to edit another player's balance.
- Actual email notifications need an email provider and a trusted server trigger; the existing in-game mailbox is not email delivery.
- The current badminton page is a playable solo game; its online mode needs a dedicated synchronized real-time game-state implementation before it can be called live multiplayer.
- Firebase rules were preserved; no production rules were loosened.

TESTING PERFORMED:
- JavaScript syntax check for az.js passed.
- New game registry count checked: 20.
- New game HTML inline scripts passed Node syntax checks.
- No live Firebase authentication, email delivery, multi-device cloud sync or multiplayer session test was possible in this offline project-editing environment.


--- VERSION 19 UPDATE NOTES ---
- Space Dodge rebuilt on canvas (ship, falling asteroids, stars, drag/arrow controls, survive-to-win timer). Fixes the blank game screen.
- Lucky Spin: flat 2000 Gold per spin (never increases). Level-reward items are excluded from the spin. Item chance raised to ~18% (still lower than Gold prizes).
- Removed link underlines on game cards and menus.
- Cache-busting (?v=20) on logo, favicon, manifest, CSS and JS so the new app logo shows. To refresh the installed app icon: remove the app from the home screen and add it again.


--- VERSION 20 UPDATE NOTES ---
- Removed Space Dodge from the game list and archive.
- Added Stone Paper Scissor with Solo vs Computer, same-device 2-player, and PeerJS online room-code multiplayer.
- Updated PWA app icons and browser icons using the supplied ARI gold-and-black logo.
- Bumped site asset cache versions to v20 so installed PWA refreshes its branding and game files.
- Online multiplayer requires both players to have internet access and PeerJS connectivity; test with two devices before announcing it as production-ready.


--- VERSION 22 UPDATE NOTES ---
NEW: CHARACTERS (shop tab "Characters", also on the Shop page and in Profile)
- Arnav    : starter (free)            +5% XP
- Atharv   : buy for 3,500 Gold         +8% Gold from games
- Sahil    : buy for 8,000 Gold         +5% Gold, +3% Lucky Spin item chance
- Dhiraj   : Level 12 reward (cannot be bought)   +40 HP in shooters, +5% XP
- Himanshu : Lucky Spin only (cannot be bought)   +15% XP, +5% Gold
- Arihant  : Level 77 reward (the Founder; free for the owner ID 97835276)   +12% Gold & XP, +50 HP, +3% luck
- The equipped character's bonus applies in every game (result screen shows it). The start screen of every game shows your character with a "Change" button.

BUG FIXES
- Memory Match: matched cards showed the text "null"; levels/difficulty now change the card count and move limit.
- Color Dash: was only a plain quiz (no colours, no timer, ignored level/difficulty). Rebuilt as a Stroop-style game: tap the INK colour, timer bar, 3 lives, speed depends on level/difficulty.
- Tap Rush: the target never moved, the win goal ignored level/difficulty, and pressing Play twice stacked timers. Rebuilt with a moving target, misses cost points, and a single timer.
- Lucky Spin could award "Spaceship" items although no game uses them (and the full shop showed an empty Spaceships tab). Unused shop slots are now hidden everywhere.
- Cache version bumped to az.js?v=22 so installed apps load the new files.

KNOWN LIMIT (not fixed, needs a server): all coins/items live in the player's own Firebase node, so a technical player can edit their own balance with browser DevTools. Real protection needs Cloud Functions.


--- VERSION 23 UPDATE NOTES ---
- One-time Gold Coin gifts: Player ID 49019468 gets +199,999 and Player ID 56067071 gets +299,999. Applied once per ID (saved flag "bonus" in the account, synced to Firebase), so it can never repeat after reload, logout/login or on another device. Gift toast shown once.
- Fixed: the old 49019468 starter bonus used to OVERWRITE the balance with 100,000 (could wipe coins). It now only tops up to at least 100,000.
- Cache version bumped to az.js?v=23 on every page.
- All pages load with zero JavaScript errors (tested in headless Chromium).


--- VERSION 24 UPDATE NOTES ---
NEW (owner / Developer Mode)
- Ban / Unban by Player ID (with reason, banned list, one-tap unban). Stored at banned/<firebaseUid>. A banned account sees a full-screen ban notice (live, no reload needed) and Firebase rules block its cloud saves. Owner ID cannot be banned. Guests (never logged in with Google) cannot be banned.
- New Mail composer: write title + message + Gold Coins + any shop items/characters, send to ONE Player ID or to EVERY existing player (no ID needed). Diwali bonus box removed.
NEW (players)
- Mail: Delete, Delete all, Claim all. Deleting a mail with an unclaimed coin/item reward claims it automatically first. An item the player already owns is converted to 500 coins (same as level rewards).
NEW GAME MODE
- Arena Strike -> Online -> "Co-op vs Bots": 2 players (room code) are one team against computer bots. Host simulates bots, friend sees them live; shared team kill target; both see win/lose screen. 1v1 Duel is unchanged.
BUG FIXES
- Mail gifts could be lost if the tab closed right after arriving (queue entry was deleted before the mail was saved). Now saved to the cloud first, de-duplicated by grant id.
- Cloud-save error toast no longer spams a banned account.
- Cache version bumped to az.js?v=24.
IMPORTANT: publish the new database.rules.json (it adds the banned node and item gifts) before using Ban or item mail.
TESTED: headless Chromium with an in-memory Firebase mock (mail, items, delete/auto-claim, ban/unban, live unban) and a two-client co-op simulation. Not tested on live Firebase / real PeerJS between two devices.

UPDATES (v1.01.02)
- Every update: change VERSION in az.js AND "version" in version.json. Players get an update popup (Refresh button) and one mail per version.
- Outfits are style only (no HP/power). Perks exist only on characters.
- Banned players can send a message to support from the ban screen; the owner reads them in Developer Mode > "Ban support messages".
- Developer Mode > "All Player IDs list" (players.html) shows every Player ID with username. Names appear after a player opens the latest version once.
- IMPORTANT: publish the new database.rules.json in Firebase (adds "support" and "playerDir") or support messages / the username list will not work.
