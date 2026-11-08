ARI GAME ZONE — PROJECT README

A mobile-friendly HTML5 gaming site with Firebase account saves, player IDs, Google sign-in, Gold Coins, a shop, claimable Mail, multiplayer emoji reactions, and per-game progression.

GAMES
- Zone Survivor and Arena Strike
- Turbo Racing, Royal Chess, Tic Tac Toe, Connect Four, Ludo, UNO
- Sky Flyer, Snake Evolution, Brick Breaker, Whack-a-Mole, Level Devil
- Neon Runner and Badminton Rally

PLAYER FEATURES
- Guest progress is stored separately on the current device.
- Google accounts have separate cloud progress per Firebase account.
- Mail inbox is available from the home page and game top bar.
- Level rewards: +100 Gold Coins every level; every fifth level also grants a free shop item.
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
