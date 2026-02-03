import { updateDeleteButton } from "./render.js";
import { checkIfShowDonationMsg } from "./storage.js";
import { consoleLog } from "./utils.js";

const DEBUGGING = true;

export const AppState = {
  WAITING_TO_START: "WAITING_TO_START",
  IDLE: "IDLE",
  SCANNING: "SCANNING",
  DELETING: "DELETING",
  FINISHED_SHOW_DONATION: "FINISHED_SHOW_DONATION",
  FINISHED: "FINISHED",
  ERROR: "ERROR",
};

export const appData = {
  currentState: 0,
  targetFolderId: null,
  allDuplicateGroups: [], // Array of arrays of messages
  currentBatchIndex: 0,
  batchSize: 20,
  sessionDeletedCount: 0,
  debugMode: DEBUGGING,
  dryRun: DEBUGGING || false, // Don't delete any emails
  disableDonationTimeCheck: true,
};

export function setUIState(newState, customMessage = null) {
  const statusBar = document.getElementById("status-bar");

  statusBar.classList.remove("status-error");

  if (newState === appData.currentState) {
    if (customMessage) {
      statusBar.textContent = customMessage;
      consoleLog(
        appData.debugMode,
        `[State Update] Still ${newState}: "${customMessage}"`,
      );
    }
    return;
  }

  appData.currentState = newState;
  consoleLog(appData.debugMode, `[State Change] -> ${newState}`);

  const controls = document.getElementById("scan-controls");
  const btnStart = document.getElementById("btn-start");
  const btnProcess = document.getElementById("btn-process");
  const btnCancel = document.getElementById("btn-cancel");
  const body = document.body;

  if (customMessage) statusBar.textContent = customMessage;

  switch (newState) {
    // Waiting for user to press Start Scan
    case AppState.WAITING_TO_START:
      body.style.cursor = "default";
      btnStart.disabled = false;
      btnProcess.disabled = true;
      btnCancel.disabled = false;
      btnProcess.textContent = "Delete Selected & Next";
      break;

    // Scanning for dupes
    case AppState.SCANNING:
      controls.classList.add("collapsed");
      body.style.cursor = "wait";
      btnProcess.disabled = true;
      btnCancel.disabled = true;
      btnProcess.textContent = "Scanning...";
      break;

    // Scan complete, waiting for user to process batch
    case AppState.IDLE:
      body.style.cursor = "default";
      btnStart.disabled = true;
      btnProcess.disabled = false;
      btnCancel.disabled = false;
      setTimeout(updateDeleteButton, 0); // Ensure DOM has rendered tickboxes before updating button
      break;

    // User pressed Delete Selected, processing deletions
    case AppState.DELETING:
      body.style.cursor = "wait";
      btnProcess.disabled = true;
      btnCancel.disabled = true;
      btnProcess.textContent = "Deleting...";
      break;

    case AppState.FINISHED_SHOW_DONATION:
      controls.classList.add("hidden"); // TODO Hidden?
      body.style.cursor = "default";
      btnProcess.disabled = false;
      btnCancel.disabled = false;
      btnProcess.textContent = "No thanks, maybe later";
      break;

    // All done
    case AppState.FINISHED:
      controls.classList.add("hidden"); // TODO Hidden?
      body.style.cursor = "default";
      btnProcess.disabled = false;
      btnCancel.disabled = false;
      btnProcess.textContent = "Finished";
      break;

    // Whoops, something went wrong
    case AppState.ERROR:
      body.style.cursor = "default";
      btnProcess.disabled = false;
      btnCancel.disabled = false;
      btnProcess.textContent = "Retry Deletion";
      statusBar.classList.add("status-error");
      console.error("Error State: ", customMessage);
      break;
  }
}

export async function nextBatch() {
  // Move to next batch
  appData.currentBatchIndex += appData.batchSize;

  // Set state
  if (appData.currentBatchIndex >= appData.allDuplicateGroups.length) {
    const showDonation = await checkIfShowDonationMsg(
      appData.sessionDeletedCount,
    );
    if (showDonation) {
      setUIState(AppState.FINISHED_SHOW_DONATION, "Awesome, cleanup complete!");
    } else {
      setUIState(AppState.FINISHED, "Completed, no more duplicates.");
    }
  } else {
    setUIState(AppState.IDLE, "Batch processed. Ready for next.");
  }
}
