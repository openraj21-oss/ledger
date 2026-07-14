function formatEUR(amount) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const STATUS_LABEL = {
  ok: "",
  stale: "stale",
  error: "error",
  "not-started": "not started",
};

function renderAccountCard(account) {
  const isLive = account.source !== "mock";
  const statusLabel = STATUS_LABEL[account.status] || "";
  const badgeClass =
    account.status === "error" ? "badge error" :
    account.status === "stale" ? "badge stale" :
    account.status === "not-started" ? "badge" :
    `badge ${isLive ? "live" : ""}`;

  const balanceLine =
    account.status === "not-started"
      ? `<div class="balance muted">Not started</div>`
      : account.status === "error"
      ? `<div class="balance muted">No data</div>`
      : `<div class="balance">${formatEUR(account.balance)}</div>`;

  const noteLine =
    account.status === "not-started"
      ? `<div class="account-note">Open a Vault or spaarrekening to activate</div>`
      : account.status === "error"
      ? `<div class="account-note">Couldn't reach ${account.institution} — no cached balance yet</div>`
      : account.status === "stale"
      ? `<div class="account-note">Showing last known balance${account.lastUpdated ? " from " + new Date(account.lastUpdated).toLocaleDateString("en-GB") : ""}</div>`
      : "";

  return `
    <div class="account-card">
      <div class="name">
        ${account.name}
        <span class="${badgeClass}">${statusLabel || account.source}</span>
      </div>
      ${balanceLine}
      ${noteLine}
    </div>
  `;
}

function renderDirectionBar(item, maxAmount) {
  if (!item.started) {
    return `
      <div class="bar-row">
        <div class="bar-label">
          <span>${item.label}</span>
          <span class="amt muted">not started</span>
        </div>
        <div class="bar-track"></div>
      </div>
    `;
  }
  const pct = maxAmount > 0 ? Math.max(2, (item.amount / maxAmount) * 100) : 0;
  return `
    <div class="bar-row">
      <div class="bar-label">
        <span>${item.label}</span>
        <span class="amt">${formatEUR(item.amount)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

let currentUid = null;
let lastManualBalances = { tradeRepublic: 0, buffer: null };

async function render() {
  const accounts = await getAccounts(currentUid);

  // Net worth excludes accounts with no usable balance (status "error" or
  // "not-started"), and flags it when the total is partial rather than
  // silently presenting an incomplete number as the full picture.
  const usable = accounts.filter((a) => a.balance !== null && a.balance !== undefined);
  const total = usable.reduce((sum, a) => sum + a.balance, 0);
  const isPartial = usable.length < accounts.length;

  document.getElementById("netWorthTotal").textContent = formatEUR(total);
  document.getElementById("asOf").textContent =
    "as of " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  document.getElementById("netWorthDelta").textContent = isPartial
    ? "Partial — one or more accounts unavailable"
    : "";

  document.getElementById("accountGrid").innerHTML =
    accounts.map(renderAccountCard).join("");

  const breakdown = await getDirectionBreakdown(accounts);
  const maxAmount = Math.max(...breakdown.filter((b) => b.started).map((b) => b.amount), 1);
  document.getElementById("directionBars").innerHTML =
    breakdown.map((b) => renderDirectionBar(b, maxAmount)).join("");

  const hasLiveData = accounts.some((a) => a.source !== "mock");
  document.getElementById("dataSourceNote").textContent = hasLiveData
    ? "Live data mixed with manual entries."
    : "Showing sample data for Revolut/ABN AMRO — no live bank connection yet. Trade Republic and Buffer are your real manual entries.";

  // populate edit form with current manual balances for next edit
  const trAccount = accounts.find((a) => a.id === "trade-republic");
  const bufferAccount = accounts.find((a) => a.id === "buffer-vault");
  lastManualBalances = {
    tradeRepublic: trAccount ? trAccount.balance : 0,
    buffer: bufferAccount && bufferAccount.status !== "not-started" ? bufferAccount.balance : null,
  };
  document.getElementById("editTradeRepublic").value = lastManualBalances.tradeRepublic ?? "";
  document.getElementById("editBuffer").value = lastManualBalances.buffer ?? "";
}

async function saveManualBalancesFromForm() {
  const trValue = parseFloat(document.getElementById("editTradeRepublic").value);
  const bufferRaw = document.getElementById("editBuffer").value.trim();
  const bufferValue = bufferRaw === "" ? null : parseFloat(bufferRaw);

  const statusEl = document.getElementById("editStatus");
  statusEl.textContent = "Saving…";
  try {
    await saveManualBalances(currentUid, {
      tradeRepublic: isNaN(trValue) ? 0 : trValue,
      buffer: bufferValue === null || isNaN(bufferValue) ? null : bufferValue,
    });
    statusEl.textContent = "Saved.";
    await render();
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  } catch (err) {
    console.error("save failed", err);
    statusEl.textContent = "Save failed — check console.";
  }
}

// ---- auth gate ----
let gsiRendered = false;
function initGoogleSignIn(attempt) {
  attempt = attempt || 0;
  if (gsiRendered) return;
  if (!(window.google && google.accounts && google.accounts.id)) {
    if (attempt < 50) setTimeout(() => initGoogleSignIn(attempt + 1), 100);
    return;
  }
  google.accounts.id.initialize({
    client_id: "548246807473-1ic15ldelhaksi9ptn9v6c8l7tdk3d5i.apps.googleusercontent.com",
    callback: handleGoogleCredential,
  });
  const container = document.getElementById("gsiButtonContainer");
  if (container) {
    setTimeout(() => {
      if (gsiRendered) return;
      gsiRendered = true;
      google.accounts.id.renderButton(container, { theme: "filled_black", size: "large", shape: "rectangular", width: 300, text: "continue_with" });
    }, 300);
  }
}
document.addEventListener("DOMContentLoaded", () => initGoogleSignIn());

function handleGoogleCredential(response) {
  const credential = firebase.auth.GoogleAuthProvider.credential(response.credential);
  auth.signInWithCredential(credential).catch((e) => {
    document.getElementById("authError").textContent = e.message;
  });
}

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUid = user.uid;
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("appRoot").style.display = "block";
    document.getElementById("signedInAs").textContent = "Signed in as " + (user.email || user.displayName || "you");
    render();
  } else {
    currentUid = null;
    document.getElementById("authScreen").style.display = "block";
    document.getElementById("appRoot").style.display = "none";
  }
});

document.getElementById("signOutBtn").onclick = () => auth.signOut();
document.getElementById("saveBalancesBtn").onclick = saveManualBalancesFromForm;
