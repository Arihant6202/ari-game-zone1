Ari Game Zone - 10 games
Sab 11 HTML files ek hi folder me hain (CSS/JS andar hi hai).
GitHub: Add file -> Upload files -> sab 11 files ek saath -> Commit.
File ka naam index.html hi rehna chahiye.

--- Update (v2) ---
* turbo-racing.html : naya Online mode (room code se dost ke saath race). Dono ko same road milta hai,
  rival ka ghost car dikhta hai, pehle finish line cross karne wala jeetta hai. "Play again" = rematch.
* battle-royale.html / arena-strike.html : character ab chalta hua dikhta hai (2D me paon ke steps + body bob,
  3D me legs/arms swing + hop + aage jhukna). Shinobu model ek single mesh hai, isliye uski poori body hop/lean karti hai.
* Baaki sab 11 files me sirf registry line badli (Turbo Racing ke modes me 'online' add).
Upload karte waqt purani files replace kar do (sab ek hi folder me, index.html root me).

--- Update (v3) ---
* Random Player ID: har naye visitor ko automatically ek unique ID milti hai (format AZ-XXXX-XXXX). Ye browser me save rehti hai.
* Pehli baar site kholne par "Welcome" popup aata hai: naam daalo ya Skip karo (skip par naam Player-XXXX hoga).
* Naam/ID badalne ke liye: top bar me 🆔 button (games me) ya lobby me "🆔 Profile" button.
* Naam aur ID Firebase login ke baad cloud me bhi save hote hain.
* database.rules.json : Firebase Console -> Realtime Database -> Rules me paste karo. Har user sirf apna data
  (users/<uid>) padh/likh sakta hai, aur coins/xp ki limit lagi hai.
* firebase-config.js me abhi bhi PASTE_ wali keys hain - apni Firebase keys daalni zaroori hain
  (Google login / OTP / cloud save ke liye). Bina keys ke site guest mode me chalti hai.
* Note: coins/XP abhi bhi browser (client) me calculate hote hain. Rules sirf basic limit lagate hain;
  poori cheating-proof economy ke liye server (Cloud Functions) chahiye.

--- Update (v4) ---
* Player ID ab sirf number (8 digit) hai. Purani AZ-XXXX-XXXX wali ID apne aap number me badal jaati hai.
* Profile me "Phone se photo chuno": gallery/camera se photo lo, wo chhoti karke save hoti hai (home par avatar me dikhti hai).
  Cloud ke liye database.rules.json dobara Firebase Rules me paste karo (photo field add hui hai).
* Online room me dono players ke naam + photo upar dikhte hain ("Ari vs Rohan").
* Turbo Racing: online me dono car alag lane se start hoti hain. Steering: ungli jahan rakho car wahan jaati hai
  (left/right half wala tap nahi), keyboard A/D ya arrows pehle jaise.
* Naya game: ludo.html (12 files ab). Single (computer ke saath), Same phone (2-4 players), Online (2 insaan, baaki computer).
  Online me dono phones par game same seed se chalta hai, isliye sirf dice/goti ka choice bheja jaata hai.

OWNER ADMIN PANEL
Open owner-admin.html for owner coin controls, UID transfers, bans and unbans.
See ADMIN-SETUP.txt before using it. Secure actions require deploying the supplied Firebase Cloud Functions and configuring the owner's Firebase Authentication UID. The 8-digit game UID alone is not secure authorization.
