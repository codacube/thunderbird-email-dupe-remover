import { appData } from "./state.js";

export async function updateStats(numDeleted) {
  const store = await browser.storage.local.get(["totalDeleted"]);
  let total = (store.totalDeleted || 0) + numDeleted;

  await browser.storage.local.set({ totalDeleted: total });
  return total;
}

export async function checkIfShowDonationMsg(deletedThisSession) {
  const store = await browser.storage.local.get([
    "totalDeleted",
    "lastDonationPrompt",
  ]);

  let totalDeleted = store.totalDeleted || 0;
  let lastPrompt = store.lastDonationPrompt || 0;
  let showMessage = false;

  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

  // More than 50 deleted now? Show message
  if (deletedThisSession > 50) {
    showMessage = true;
  }

  // Crossed a 1000 threshold recently? Show message
  if (
    !showMessage &&
    Math.floor(totalDeleted / 100) >
      Math.floor((totalDeleted - deletedThisSession) / 100)
  ) {
    showMessage = true;
  }

  // Don't ask again if we asked recently
  if (!appData.debugMode && showMessage && lastPrompt > 0) {
    if (now - lastPrompt < ONE_WEEK) {
      showMessage = false;
    }
  }

  if (showMessage) {
    await browser.storage.local.set({ lastDonationPrompt: now });
    return true; // Prompt for donation
  }

  return false;
}
