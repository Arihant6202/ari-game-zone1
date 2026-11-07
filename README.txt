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
