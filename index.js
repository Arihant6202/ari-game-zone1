const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.database();
const MAX_COINS = 10000000;
// Set this to the Firebase Authentication UID of the OWNER account (not the 8-digit game UID).
const ADMIN_AUTH_UID = process.env.ADMIN_AUTH_UID;
function requireOwner(context) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');
  if (!ADMIN_AUTH_UID || context.auth.uid !== ADMIN_AUTH_UID) throw new functions.https.HttpsError('permission-denied', 'Owner access only.');
}
async function findUser(gameUid) {
  const snap = await db.ref('users').orderByChild('uid').equalTo(String(gameUid)).once('value');
  if (!snap.exists()) throw new functions.https.HttpsError('not-found', 'Player UID not found in cloud users.');
  const entries = Object.entries(snap.val());
  if (entries.length !== 1) throw new functions.https.HttpsError('failed-precondition', 'Game UID is missing or duplicated.');
  return { authUid: entries[0][0], data: entries[0][1] || {} };
}
exports.adminAction = functions.https.onCall(async (data, context) => {
  requireOwner(context);
  const action = String(data.action || '');
  if (action === 'ping') return { ok: true, message: 'Admin backend connected.' };
  const gameUid = String(data.targetGameUid || '');
  if (!/^\d{8}$/.test(gameUid)) throw new functions.https.HttpsError('invalid-argument', 'Enter an 8-digit game UID.');
  const target = await findUser(gameUid);
  const ref = db.ref('users/' + target.authUid);
  let result = {};
  if (['addCoins','removeCoins','setMaxCoins'].includes(action)) {
    const amount = Number(data.amount);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_COINS) throw new functions.https.HttpsError('invalid-argument', 'Invalid coin amount.');
    let newBalance;
    await ref.child('coins').transaction(current => {
      const old = Number(current || 0);
      if (action === 'addCoins') newBalance = old + amount;
      else if (action === 'removeCoins') newBalance = Math.max(0, old - amount);
      else newBalance = MAX_COINS;
      if (newBalance > MAX_COINS) return; // abort
      return newBalance;
    });
    const latest = await ref.child('coins').once('value');
    result = { gameUid, coins: Number(latest.val() || 0) };
  } else if (action === 'ban' || action === 'unban') {
    const reason = String(data.reason || '').slice(0, 300);
    const hours = Number(data.durationHours || 0);
    if (action === 'ban' && (!reason || (hours !== 0 && hours !== 24))) throw new functions.https.HttpsError('invalid-argument', 'Provide a reason and valid ban duration.');
    const banned = action === 'ban';
    await db.ref('moderation/' + target.authUid).set({ banned, reason: banned ? reason : '', by: context.auth.uid, updatedAt: admin.database.ServerValue.TIMESTAMP, expiresAt: banned && hours ? Date.now() + hours * 3600000 : null });
    result = { gameUid, banned, expiresAt: banned && hours ? Date.now() + hours * 3600000 : null };
  } else throw new functions.https.HttpsError('invalid-argument', 'Unknown admin action.');
  await db.ref('adminAudit').push({ action, targetGameUid: gameUid, targetAuthUid: target.authUid, amount: data.amount || null, reason: data.reason || '', by: context.auth.uid, at: admin.database.ServerValue.TIMESTAMP });
  return { ok: true, ...result };
});
exports.checkMyBan = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');
  const ref = db.ref('moderation/' + context.auth.uid);
  const snap = await ref.once('value');
  const m = snap.val();
  if (!m || !m.banned) return { banned: false };
  if (m.expiresAt && Date.now() >= m.expiresAt) { await ref.update({ banned: false, reason: '', expiresAt: null }); return { banned: false }; }
  return { banned: true, reason: m.reason || 'Account suspended', expiresAt: m.expiresAt || null };
});
