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


FREE SPARK CLOUD SAVE UPDATE
- After login, game progress is stored at users/{FirebaseAuthUID}/gameData.
- Coins, XP, unlocked levels, best scores, owned/equipped items and profile sync across devices using the same Firebase account.
- This is client-side sync on Spark. Players can tamper with their own gameData; it is not cheat-proof. Do not use for real-money value.
- Publish database.rules.json in Firebase Realtime Database > Rules. Each account can read/write only its own user node.


ACCOUNT ISOLATION UPDATE
- Local profiles are now namespaced per Firebase Auth UID.
- Guest profile uses one persistent device-bound guest ID; logging out returns to the same guest profile and preserves its local progress.
- Google accounts load/save only users/{authUid}/gameData.
- Existing legacy users/{authUid} profile data is imported once when gameData is absent.
- Added Level Devil (20-stage platform challenge with responsive keyboard/touch controls) and UNO with bot and 2-player pass-and-play modes.
- JavaScript inline scripts passed Node syntax checks. Live Firebase behavior still requires testing
  on the deployed GitHub Pages domain with the published Firebase rules.


GUEST + GAME UPDATE (2026-11-08)
- Guest ID is generated only when the device has no guest ID. Logout no longer rotates it.
- Guest progress remains in az2:guest:{deviceGuestId}; Google profiles remain in az2:user:{FirebaseAuthUID} and users/{FirebaseAuthUID}/gameData.
- Level Devil controls were rebuilt for pointer/touch and keyboard input, with 20 progressively harder stages, restart, and best-stage tracking.
- UNO now supports You vs Bot and local 2-player modes, three bot difficulty settings, wild colour selection, draw/pass, and round wins.
