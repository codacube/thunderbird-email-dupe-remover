import { registerUIEventListeners } from "./events.js";
import { appData, AppState, setUIState } from "./state.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Tab is opened with foldername in the URL, remove URL encoding from the folder name
  appData.targetFolderId = decodeURIComponent(
    window.location.hash.substring(1),
  );

  if (!appData.targetFolderId) {
    setUIState(AppState.ERROR, "Error: No folder selected.");
    return;
  }

  registerUIEventListeners();

  // Ready to start
  const folder = await messenger.folders.get(appData.targetFolderId);
  setUIState(AppState.WAITING_TO_START, `Ready to scan folder: ${folder.name}`);
});
