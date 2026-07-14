function formatEUR(amount) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function renderAccountCard(account) {
  const isLive = account.source !== "mock";
  return `
    <div class="account-card">
      <div class="name">
        ${account.name}
        <span class="badge ${isLive ? "live" : ""}">${account.source}</span>
      </div>
      <div class="balance">${formatEUR(account.balance)}</div>
    </div>
  `;
}

function renderDirectionBar(item, maxAmount) {
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

async function render() {
  const accounts = await getAccounts();
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);

  document.getElementById("netWorthTotal").textContent = formatEUR(total);
  document.getElementById("asOf").textContent =
    "as of " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  document.getElementById("accountGrid").innerHTML =
    accounts.map(renderAccountCard).join("");

  const breakdown = await getDirectionBreakdown(accounts);
  const maxAmount = Math.max(...breakdown.map((b) => b.amount), 1);
  document.getElementById("directionBars").innerHTML =
    breakdown.map((b) => renderDirectionBar(b, maxAmount)).join("");

  const hasLiveData = accounts.some((a) => a.source !== "mock");
  document.getElementById("dataSourceNote").textContent = hasLiveData
    ? "Live data mixed with manual entries."
    : "Showing sample data — no live bank connection yet.";
}

render();
