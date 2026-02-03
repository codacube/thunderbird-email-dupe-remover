import { appData } from "./state.js";
import { consoleLog } from "./utils.js";

export async function updateStats(numDeleted) {
  const store = await browser.storage.local.get(["totalDeleted"]);
  let total = (store.totalDeleted || 0) + numDeleted;

  await browser.storage.local.set({ totalDeleted: total });
  return total;
}

export async function getTotalDeletedCount() {
  const store = await browser.storage.local.get(["totalDeleted"]);
  return store.totalDeleted || 0;
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

  consoleLog(
    appData.debugMode,
    `sessionDeleted: ${deletedThisSession} < 50 ?, totalDeleted: ${totalDeleted} < 1000 ?, lastPrompt: ${lastPrompt} > 0 ?, too soon: ${now - lastPrompt < ONE_WEEK}`,
  );

  // More than 100 deleted now? Show message
  if (deletedThisSession > 100) {
    showMessage = true;
  }

  // Crossed a 1000 threshold recently? Show message
  if (
    !showMessage &&
    Math.floor(totalDeleted / 1000) >
      Math.floor((totalDeleted - deletedThisSession) / 1000)
  ) {
    showMessage = true;
  }

  // If we are showing the message, have a last prompt time, and time checks are enabled then
  if (showMessage && lastPrompt > 0 && !appData.disableDonationTimeCheck) {
    // If it's been less than a week since last prompt, then don't show
    if (now - lastPrompt < ONE_WEEK) {
      showMessage = false;
    }
  }

  consoleLog(appData.debugMode, `Donation prompt needed? ${showMessage}`);

  if (showMessage) {
    await browser.storage.local.set({ lastDonationPrompt: now });
    return true; // Prompt for donation
  }

  return false;
}
