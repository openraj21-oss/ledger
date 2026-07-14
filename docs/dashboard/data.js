/**
 * data.js — account data source for the Ledger financial dashboard.
 *
 * Manual balances (Trade Republic, Buffer/emergency fund) now live in
 * Firestore under financeManual/{uid}, same owner-only security pattern
 * as the existing Ledger goals app (financeManual/{uid}: allow read,
 * write if request.auth.uid == uid). No more editing a JS constant by
 * hand — see the inline edit form in app.js.
 *
 * TODO (Visibility direction, live bank data):
 *   GoCardless Bank Account Data is closed to new signups (since Jul 2025).
 *   Replacement: Enable Banking (https://enablebanking.com) — supports ABN
 *   AMRO, self-serve signup, free/restricted-production tier for personal
 *   projects. Revolut coverage under Enable Banking is unconfirmed — may
 *   need Revolut's own developer API as a fallback.
 *
 *   Cloud Functions (the natural place to hold API secrets server-side)
 *   requires Firebase's Blaze plan, which requires adding a billing card —
 *   ruled out for this project (kept fully free / Spark plan). A live bank
 *   integration will need a different free serverless host that doesn't
 *   require billing (e.g. Cloudflare Workers free tier) with its own
 *   account signup — that's a "you" step, not something buildable here.
 *
 *   To go live once that account exists:
 *   1. Replace the body of fetchRevolut() / fetchAbnAmro() below with a
 *      fetch() to that proxy. Keep the try/catch shape in fetchAccount() —
 *      that's what gives each account independent stale/error fallback
 *      instead of one failure taking down the whole dashboard.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtsWqKcucofjfmysTK-l2_Be-q4lYJfis",
  authDomain: "ledger-ddd4a.firebaseapp.com",
  projectId: "ledger-ddd4a",
  storageBucket: "ledger-ddd4a.firebasestorage.app",
  messagingSenderId: "548246807473",
  appId: "1:548246807473:web:3f9f8ca305f0d777cc5390",
};

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();

const CACHE_KEY = "ledger-dashboard-cache-v1";

// --- manual balances (Firestore-backed) -------------------------------
// Defaults used until a financeManual/{uid} doc exists (i.e. before the
// first save from the edit form).
const DEFAULT_MANUAL_BALANCES = {
  tradeRepublic: 0,
  buffer: null, // null = vault/spaarrekening not opened yet
};

async function loadManualBalances(uid) {
  if (!uid) return DEFAULT_MANUAL_BALANCES;
  try {
    const doc = await db.collection("financeManual").doc(uid).get();
    if (doc.exists) return { ...DEFAULT_MANUAL_BALANCES, ...doc.data() };
  } catch (err) {
    console.error("loadManualBalances failed", err);
  }
  return DEFAULT_MANUAL_BALANCES;
}

async function saveManualBalances(uid, balances) {
  if (!uid) throw new Error("not signed in");
  await db.collection("financeManual").doc(uid).set(balances, { merge: true });
}

// --- per-account fetchers (automatable accounts) ------------------------
// Each fetcher is independently wrapped by fetchAccount() below, so one
// account failing (network error, API down, bad credentials) never blocks
// the others or the dashboard as a whole.

async function fetchRevolut() {
  // Mock implementation. Replace with a real fetch() to a backend proxy
  // once a live-data provider + free serverless host exist (see TODO above).
  return { balance: 1830.42, currency: "EUR" };
}

async function fetchAbnAmro() {
  // Mock implementation. Replace with a real fetch() to a backend proxy
  // once Enable Banking credentials + a free serverless host exist.
  return { balance: 6120.15, currency: "EUR" };
}

// --- resilience wrapper ----------------------------------------------------

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable (private browsing etc.) — fine, just skip caching
  }
}

/**
 * Runs a fetcher for one account. On success: caches and returns status "ok".
 * On failure: falls back to the last cached balance for that account and
 * returns status "stale". If there's no cache either, returns status "error"
 * with a null balance. Never throws — a broken account degrades gracefully
 * instead of breaking the page.
 */
async function fetchAccount(id, meta, fetcher) {
  const cache = readCache();
  try {
    const { balance, currency } = await fetcher();
    const result = {
      id,
      ...meta,
      balance,
      currency,
      status: "ok",
      lastUpdated: new Date().toISOString(),
    };
    cache[id] = result;
    writeCache(cache);
    return result;
  } catch (err) {
    const cached = cache[id];
    if (cached) {
      return { ...cached, status: "stale" };
    }
    return {
      id,
      ...meta,
      balance: null,
      currency: "EUR",
      status: "error",
      lastUpdated: null,
    };
  }
}

async function getAccounts(uid) {
  const manualBalances = await loadManualBalances(uid);

  const accounts = await Promise.all([
    fetchAccount("revolut-main", { name: "Revolut", institution: "Revolut", direction: "everyday", source: "mock" }, fetchRevolut),
    fetchAccount("abn-main", { name: "ABN AMRO", institution: "ABN AMRO", direction: "everyday", source: "mock" }, fetchAbnAmro),
    Promise.resolve({
      id: "trade-republic",
      name: "Trade Republic",
      institution: "Trade Republic",
      direction: "growth",
      source: "manual",
      balance: manualBalances.tradeRepublic,
      currency: "EUR",
      status: "ok",
      lastUpdated: new Date().toISOString(),
    }),
    Promise.resolve(
      manualBalances.buffer === null || manualBalances.buffer === undefined
        ? {
            id: "buffer-vault",
            name: "Buffer",
            institution: "Not opened yet",
            direction: "buffer",
            source: "manual",
            balance: null,
            currency: "EUR",
            status: "not-started",
            lastUpdated: null,
          }
        : {
            id: "buffer-vault",
            name: "Buffer",
            institution: "Vault",
            direction: "buffer",
            source: "manual",
            balance: manualBalances.buffer,
            currency: "EUR",
            status: "ok",
            lastUpdated: new Date().toISOString(),
          }
    ),
  ]);
  return accounts;
}

// Direction breakdown is driven directly by each account's `direction` tag
// (set where the account is defined above) instead of being derived after
// the fact — no more silently folding untracked money into "Everyday".
async function getDirectionBreakdown(accounts) {
  const directions = [
    { key: "buffer", label: "Buffer (emergency fund)" },
    { key: "growth", label: "Growth" },
    { key: "everyday", label: "Everyday" },
  ];

  return directions.map(({ key, label }) => {
    const inDirection = accounts.filter((a) => a.direction === key);
    const started = inDirection.some((a) => a.status !== "not-started");
    const amount = inDirection.reduce((sum, a) => sum + (a.balance || 0), 0);
    return { label, amount, started };
  });
}
