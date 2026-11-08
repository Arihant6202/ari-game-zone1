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
- Lucky Spin: first spin 2000 Gold, +100 per spin, capped at 10000. Item chance raised to ~18% (still lower than Gold prizes).
- Removed link underlines on game cards and menus.
- Cache-busting (?v=20) on logo, favicon, manifest, CSS and JS so the new app logo shows. To refresh the installed app icon: remove the app from the home screen and add it again.


--- VERSION 20 UPDATE NOTES ---
- Removed Space Dodge from the game list and archive.
- Added Stone Paper Scissor with Solo vs Computer, same-device 2-player, and PeerJS online room-code multiplayer.
- Updated PWA app icons and browser icons using the supplied ARI gold-and-black logo.
- Bumped site asset cache versions to v20 so installed PWA refreshes its branding and game files.
- Online multiplayer requires both players to have internet access and PeerJS connectivity; test with two devices before announcing it as production-ready.
