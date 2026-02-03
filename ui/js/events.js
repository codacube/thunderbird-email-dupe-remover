import { appData, AppState, setUIState, nextBatch } from "./state.js";
import { fetchAllMessages, detectDuplicates, processBatch } from "./logic.js";
import { renderContainer, updateDeleteButton } from "./render.js";
import { updateStats } from "./storage.js";
import { wait } from "./utils.js";

export function registerUIEventListeners() {
  const listContainer = document.getElementById("duplicate-list");

  // Buttons
  document
    .getElementById("btn-start")
    .addEventListener("click", handleStartScan);
  document
    .getElementById("btn-process")
    .addEventListener("click", handleProcessClick);
  document.getElementById("btn-cancel").addEventListener("click", closeTab);

  // Delete/Keep Checkboxes
  listContainer.addEventListener("change", (e) => {
    if (e.target.matches(".dupe-checkbox")) {
      handleCheckboxChange(e.target);
    }
  });
}

async function handleStartScan() {
  const isRecursive = document.getElementById("include-subfolders").checked;

  appData.sessionDeletedCount = 0;

  setUIState(AppState.SCANNING, "Scanning folder... this may take a moment.");

  // Wait for the controls-bar to disappear (transition set to 0.5s in CSS)
  await wait(750);

  try {
    const rootFolder = await messenger.folders.get(appData.targetFolderId);

    const messages = await fetchAllMessages(rootFolder, isRecursive);
    appData.allDuplicateGroups = detectDuplicates(messages);

    if (appData.allDuplicateGroups.length === 0) {
      setUIState(
        AppState.FINISHED,
        "No duplicate emails found in this folder.",
      );
    } else {
      setUIState(
        AppState.IDLE,
        `Found ${appData.allDuplicateGroups.length} groups of duplicates.`,
      );
    }

    appData.currentBatchIndex = 0;
    renderContainer();
  } catch (err) {
    setUIState(AppState.ERROR, "Error during scan: " + err.message);
  }
}

async function handleProcessClick() {
  // Check if already finished and we need to exit
  if (
    appData.currentState === AppState.FINISHED ||
    appData.currentState === AppState.FINISHED_SHOW_DONATION
  ) {
    closeTab();
    return;
  }

  // Start deleting messages in this batch
  try {
    // Start Deleting this batch
    setUIState(AppState.DELETING, "Deleting messages...");

    const progressCallback = (current, total) => {
      const percent = Math.round((current / total) * 100);
      setUIState(
        AppState.DELETING,
        `Deleting messages... ${percent}% (${current} of ${total}).`,
      );
    };

    const numDeleted = await processBatch(progressCallback);
    appData.sessionDeletedCount += numDeleted;
    await updateStats(numDeleted);

    await nextBatch();
    renderContainer();
  } catch (err) {
    setUIState(AppState.ERROR, "Error: " + err.message);
    // alert("Failed to delete messages.");
  }
}

function closeTab() {
  messenger.tabs.getCurrent().then((tab) => messenger.tabs.remove(tab.id));
}

function handleCheckboxChange(checkbox) {
  // Find the parent row (closest goes up the DOM tree)
  const row = checkbox.closest(".message-row");
  // Find the text label inside that row
  const labelSpan = row.querySelector(".badge");

  if (checkbox.checked) {
    // Delete
    row.classList.replace("keep", "delete");
    labelSpan.textContent = "Delete";
  } else {
    // Keep
    row.classList.replace("delete", "keep");
    labelSpan.textContent = labelSpan.dataset.keepText;
  }

  updateDeleteButton();
}
