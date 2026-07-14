/**
 * data.js — account data source for the Ledger financial dashboard.
 *
 * TODO (Visibility direction, live data):
 *   GoCardless Bank Account Data is closed to new signups (since Jul 2025).
 *   Replacement: Enable Banking (https://enablebanking.com) — supports ABN AMRO,
 *   has a self-serve Control Panel + free/restricted-production tier for personal
 *   projects. Revolut has its own direct developer API as a separate option.
 *
 *   To go live:
 *   1. Sign up for Enable Banking, get your application/API credentials.
 *   2. Replace `getAccounts()` below with a fetch() call to your backend
 *      (or a small Cloud Function, matching Ledger's Firebase stack) that
 *      proxies the Enable Banking API and returns data in the same shape.
 *   3. Trade Republic stays manual — update `manualBalances.tradeRepublic`
 *      by hand (or wire a tiny form that writes to Firebase).
 */

const manualBalances = {
  tradeRepublic: 4200.00, // update by hand until/unless automated
};

async function getAccounts() {
  // Mock data — swap this function body for a real fetch() once
  // Enable Banking credentials exist. Shape must stay: array of
  // { id, name, institution, balance, currency, source }.
  return [
    { id: "revolut-main", name: "Revolut", institution: "Revolut", balance: 1830.42, currency: "EUR", source: "mock" },
    { id: "abn-main", name: "ABN AMRO", institution: "ABN AMRO", balance: 6120.15, currency: "EUR", source: "mock" },
    { id: "trade-republic", name: "Trade Republic", institution: "Trade Republic", balance: manualBalances.tradeRepublic, currency: "EUR", source: "manual" },
  ];
}

// Rough split by Goals — Financial direction, for the breakdown bars.
// This is illustrative until real categorization exists.
async function getDirectionBreakdown(accounts) {
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  return [
    { label: "Buffer (emergency fund)", amount: 0 },
    { label: "Growth (Trade Republic)", amount: manualBalances.tradeRepublic },
    { label: "Everyday (Revolut + ABN AMRO)", amount: total - manualBalances.tradeRepublic },
  ];
}
