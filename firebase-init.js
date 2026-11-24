import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  onValue,
  runTransaction,
  query,
  orderByChild,
  equalTo
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// Замените значения на данные из консоли Firebase -> Project settings -> Your apps
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function ensureUser(userId, username) {
  const userRef = ref(db, `users/${userId}`);
  const snap = await get(userRef);
  if (!snap.exists()) {
    await set(userRef, {
      username: username.toLowerCase(),
      balance: 0,
      inventory: []
    });
  } else {
    const current = snap.val();
    if (current.username !== username.toLowerCase()) {
      await set(ref(db, `users/${userId}/username`), username.toLowerCase());
    }
  }
}

function subscribeUser(userId, cb) {
  onValue(ref(db, `users/${userId}`), (snap) => {
    cb(snap.val() || { balance: 0, inventory: [] });
  });
}

function subscribeCatalog(cb) {
  onValue(ref(db, "gifts_catalog"), (snap) => {
    const val = snap.val();
    if (!val) {
      cb([]);
      return;
    }
    const items = Array.isArray(val)
      ? val.filter(Boolean)
      : Object.entries(val).map(([id, item]) => ({ id, ...item }));
    cb(items);
  });
}

let activeMsgUnsub = null;
function subscribeMessages(chatPath, cb) {
  if (typeof activeMsgUnsub === "function") {
    activeMsgUnsub();
  }
  const msgRef = ref(db, chatPath);
  activeMsgUnsub = onValue(msgRef, (snap) => {
    const val = snap.val() || {};
    const arr = Object.values(val).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    cb(arr);
  });
}

async function pushMessage(chatPath, senderId, senderUsername, text) {
  const listRef = ref(db, chatPath);
  const newMsgRef = push(listRef);
  await set(newMsgRef, {
    senderId: String(senderId),
    senderUsername,
    text,
    createdAt: Date.now()
  });
}

async function findUserByUsername(usernameWithAt) {
  const q = query(ref(db, "users"), orderByChild("username"), equalTo(usernameWithAt.toLowerCase()));
  const snap = await get(q);
  if (!snap.exists()) return null;
  const entries = Object.entries(snap.val());
  const [uid, data] = entries[0];
  return { id: uid, ...data };
}

async function purchaseGift(userId, price, giftItem) {
  const userRef = ref(db, `users/${userId}`);
  const result = await runTransaction(userRef, (current) => {
    if (!current) return current;
    const bal = Number(current.balance || 0);
    if (bal < Number(price)) return;
    const inv = Array.isArray(current.inventory) ? current.inventory : [];
    return {
      ...current,
      balance: bal - Number(price),
      inventory: [giftItem, ...inv]
    };
  });

  if (!result.committed) {
    throw new Error("Insufficient balance or transaction aborted");
  }
}

window.YoronDB = {
  db,
  ensureUser,
  subscribeUser,
  subscribeCatalog,
  subscribeMessages,
  pushMessage,
  findUserByUsername,
  purchaseGift
};

window.dispatchEvent(new Event("yoron:db-ready"));
    
