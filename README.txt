ARI GAME ZONE — FREE FIREBASE SPARK BUILD
========================================

This build intentionally supports only Firebase Google login and private profile cloud-save.
Game coins, XP and levels remain local to the device. Secure admin coin actions, player transfers,
server-side rewards and bans are NOT included because they require a trusted backend.

Firebase project: ari-game-zone
Realtime Database URL: https://ari-game-zone-default-rtdb.asia-southeast1.firebasedatabase.app

SETUP
1. In Firebase Authentication, enable Google. Phone sign-in may incur SMS costs/quotas and is not required.
2. Authentication > Settings > Authorized domains: add arihant620.github.io.
3. Realtime Database > Rules: paste database.rules.json and Publish.
4. Upload the CONTENTS of this folder to the GitHub Pages repository root.
5. Open https://arihant620.github.io/ari-game-zone1/

SECURITY
The rules allow each signed-in user to read/write only their own profile node. They do not grant access
to coin, XP, moderation, or audit nodes. Do not loosen rules to public read/write.
The Firebase web apiKey is a public project identifier, not a server secret; restrict it in Google Cloud
API key settings to the required APIs and your website referrers where practical.
