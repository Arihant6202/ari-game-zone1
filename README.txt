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


ACCOUNT FIX UPDATE (v2)
- NEW shared file az.js: ab game engine (coins, XP, shop, login, cloud save) sirf ek jagah hai. Har page
  <script src="az.js"> se use karta hai. Pehle har page me engine ki copy thi aur index.html alag/purani thi.
  GitHub me az.js bhi upload karna zaroori hai (baaki files ke saath).
- Bug jo "dusra Gmail bhi same token/UID dikhata tha": Google popup bina account chooser ke pehle se
  logged-in Gmail utha leta tha. Ab prompt=select_account laga hai, to har baar Gmail chuna ja sakta hai.
- Har Gmail ka alag local record (az2:user:<authUid>) aur alag cloud node users/<authUid>/gameData.
  Naya Gmail = bilkul naya account (150 coins, naya 8-digit Player ID, level 1).
- Logout par naya guest ID banta hai (naya progress). Purana guest/Gmail data alag safe rehta hai.
- Cloud se aaya data ab normalize hota hai (Firebase khaali {} objects hata deta hai -> pehle crash hota tha).
- Cloud load ke purane/late answers ignore hote hain (account switch race fix) aur page band hote hi
  last coins flush hote hain (pagehide).
- Login ke baad home screen ka level-progress/coins/theme turant naye account ke hisaab se refresh hota hai.
- Welcome/name popup ab cloud load hone ke baad aata hai (returning user ko dobara nahi).
- Home page: games count 13, categories theek kiye (Cards, Platformer; khaali Puzzle/Brain hata diye).
- Zone Survivor ki shop me Guns bhi ab dikhte hain.

NEW GAMES
- Level Devil: 20 levels (fake floor, invisible walls, shy door, falling spikes, saws, moving lifts...).
  Har level automatic solver se check hua hai ki jeetna possible hai. Keyboard + touch controls.
- UNO: asli 108-card UNO. vs Computer (1-3 bots, easy/medium/hard) ya 2-4 players pass-and-play
  (cards chhupane wali screen ke saath). Wild colour choose, Skip/Reverse/+2/+4, UNO call + penalty.

Live Firebase (real Google login) ko deploy karke ek baar test zaroor karo. Local tests me Firebase
ko mock karke account isolation verify kiya gaya hai.


UPDATE v3 (shop + online + developer mode)
- SHOP: ab har game me 🛒 button hai (jin games ke apne items nahi hain unme poori shop khulti hai).
  Naye items + prices: Ludo dice (0-2500 coins) & tokens (0-1800), UNO card backs (0-2500),
  Level Devil heroes (0-3000). Kharide hue items game me turant dikhte hain.
  az.js ab "az.js?v=3" se load hota hai taaki browser/GitHub Pages purani cached file na chalaye
  (isi se kabhi-kabhi shop/naye features na dikhne ki problem hoti hai).
- ONLINE: UNO ab 1v1 online (room code), Level Devil online race (dono ko same level, jo pehle door
  tak pahunche wo jeete, saamne wale ka ghost dikhta hai, rematch). Ludo online pehle se tha.
- DEVELOPER MODE: ADMIN-SETUP.txt padho. owner-admin.html naye sire se bana hai.
- database.rules.json badla hai: ab admin/uidIndex/adminGrants rules bhi hain. PASTE_OWNER_...
  placeholder ko apne Firebase UID se badalna zaroori hai, warna Developer Mode ka "dusre ko coins"
  hissa kaam nahi karega (apne coins wala hissa kaam karega).


UPDATE v4 (guest profiles, link-to-Gmail, premium guns, Level Devil controls)
- GUESTS: logout par guest ka progress ab kabhi nahi hatta. Logout ke baad tum wapas usi guest par aate ho.
  Is device par kitne bhi guest ban sakte hain (👤 Guest/Login box > "Naya guest banao"), har ek ka alag
  coins/XP/levels/items/Player ID. Box me list se kisi bhi guest par "Use" dabao ya 🗑 se delete karo.
  Purane (v2/v3 me "kho gaye") guest bhi isi browser me saved the - ab wo list me dikhenge.
- NAYA GMAIL = bilkul naya account (150 coins). Purana Gmail = uska apna cloud progress.
- LINK (ek ID = ek Gmail): guest se "🔗 Is guest ko NAYE Gmail se link karo" dabao. Link sirf aise Gmail se hota hai jo
  pehle kisi ID se linked nahi hai (kabhi login/use nahi hua). Jo Gmail pehle se kisi ID se linked hai usse link
  refuse hota hai, wo Gmail turant logout ho jata hai aur guest wapas khul jata hai (guest ko kuch nahi hota).
  Gmail me login hone par guest list / Link option dikhta hi nahi; bas Logout, aur logout par guest khul jata hai.
- OWNER ID 97835276 sirf kumararihant625@gmail.com ki hai (database.rules.json Gmail se check karta hai; UID paste
  nahi karna). Kisi aur Gmail par ye ID aa jaye to login par use nayi ID mil jati hai. Rules dobara Publish karo!
- GUNS: 8 nayi premium guns (Twin Fang 9,000 ... Divine Cannon 150,000). Purani 6 guns jaisi thi waisi hi hain.
- COINS: har win/loss ke coins ab aadhe (Az.COIN_RATE = 0.5 az.js me), daily bonus 100 -> 50.
  Aur kam/zyada karna ho to az.js me COIN_RATE badlo.
- LEVEL DEVIL: naya move pad (anguthe ko ◀ aur ▶ ke beech bina uthaye slide karo), bada JUMP, "↔️ Swap hands"
  (lefty), aur "🔄 Rotate mode": poori landscape screen, controls side me (player/door ko nahi dhakte).
  Phone portrait me ho tab bhi game 90° ghoom jata hai - bas phone ko tilt karo. Choice account ke saath save hoti hai.
- Saari HTML ab az.js?v=6 load karti hain (cache refresh ke liye). GitHub me poora folder dobara upload karo.


UPDATE v7
- Shop now shows a drawn figure for every item (guns, outfits, cars, ships, snakes, chess pieces, balls, dice, tokens, UNO card backs, heroes).
- Gun skins are visible in-game (Zone Survivor 2D + 3D, Arena Strike, loot on the ground). Each gun has its own shape and colour.
- 8 new outfits (Karate Master, Outlaw Cowboy, Alien Invader, Zombie Brute, Night Vampire, Super Hero, Dragon Warrior, Phoenix Legend).
- Shinobu now costs 7000 coins (no longer free).
- The repeating "Owner ID found..." popup is gone (status is shown on the Developer page). Only one popup shows at a time, and repeats are ignored.
- All text is now in English.
- UNO: optional +2/+4 stacking, stacked discard pile, card landing animation, big UNO! flash, hand fan for big hands, pulsing Draw button.
- Upload ALL files again (az.js and az.css changed; pages now load az.js?v=7).


UPDATE v8 (A coin mark + diamonds)
- Coin display now uses the A coin symbol (Ⓐ).
- Added a separate Diamonds balance.
- Shop items can be bought using Coins or Diamonds (diamond cost shown beside each item).
- Developer page supports setting, adding and removing Diamonds from the owner account.
- Player ID 49019468 remains a normal player; on first load it receives 100,000 Coins and 10,000 Diamonds.
- All pages now load az.js?v=8 to avoid stale browser cache.
