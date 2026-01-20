let targetFolderId = null;
let allDuplicateGroups = []; // Array of arrays of messages
let currentBatchIndex = 0;
const BATCH_SIZE = 20;
const AppState = {
  WAITING_TO_START: "WAITING_TO_START",
  IDLE: "IDLE",
  SCANNING: "SCANNING",
  DELETING: "DELETING",
  FINISHED: "FINISHED",
  ERROR: "ERROR",
};

let currentState = 0;

function setUiState(newState, customMessage = null) {
  const statusBar = document.getElementById("status-bar");

  if (newState === currentState) {
    if (customMessage) {
      statusBar.textContent = customMessage;
      console.log(`[State Update] Still ${newState}: "${customMessage}"`);
    }
    return;
  }

  currentState = newState;
  console.log(`[State Change] -> ${newState}`);

  const btnStart = document.getElementById("btn-start");
  const btnProcess = document.getElementById("btn-process");
  const btnCancel = document.getElementById("btn-cancel");
  const body = document.body;

  if (customMessage) statusBar.textContent = customMessage;

  switch (newState) {
    case AppState.WAITING_TO_START:
      body.style.cursor = "default";
      btnStart.disabled = false;
      btnProcess.disabled = true;
      btnCancel.disabled = false;
      btnProcess.textContent = "Delete Selected & Next";
      break;
    case AppState.IDLE:
      body.style.cursor = "default";
      btnStart.disabled = true;
      btnProcess.disabled = false;
      btnCancel.disabled = false;
      btnProcess.textContent = "Delete Selected & Next";
      // btnProcess.classList.remove("error")
      break;

    case AppState.SCANNING:
      body.style.cursor = "wait";
      btnProcess.disabled = true;
      btnCancel.disabled = true;
      btnProcess.textContent = "Scanning...";
      break;

    case AppState.DELETING:
      body.style.cursor = "wait";
      btnProcess.disabled = true;
      btnCancel.disabled = true;
      btnProcess.textContent = "Deleting...";
      break;

    case AppState.FINISHED:
      body.style.cursor = "default";
      btnProcess.disabled = false;
      btnCancel.disabled = false;
      btnProcess.textContent = "Finished";
      break;

    case AppState.ERROR:
      body.style.cursor = "default";
      btnProcess.disabled = false;
      btnCancel.disabled = false;
      btnProcess.textContent = "Retry Deletion";
      // btnProcess.classList.add("error")
      console.error("Error State:", customMessage);
      break;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Tab is opened with foldername in the URL, remove URL encoding from the folder name
  targetFolderId = decodeURIComponent(window.location.hash.substring(1));

  if (!targetFolderId) {
    setUiState(AppState.ERROR, "Error: No folder selected.");
    return;
  }

  const folder = await messenger.folders.get(targetFolderId);
  setUiState(AppState.WAITING_TO_START, `Ready to scan folder: ${folder.name}`);

  document.getElementById("btn-start").addEventListener("click", startScan);

  document
    .getElementById("btn-process")
    .addEventListener("click", processBatch);
  document.getElementById("btn-cancel").addEventListener("click", () => {
    closeTab();
  });
});

async function startScan() {
  const isRecursive = document.getElementById("include-subfolders").checked;

  setUiState(AppState.SCANNING, "Scanning folder... this may take a moment.");

  try {
    const rootFolder = await messenger.folders.get(targetFolderId);

    const messages = await fetchAllMessages(rootFolder, isRecursive);
    allDuplicateGroups = detectDuplicates(messages);

    setUiState(
      AppState.IDLE,
      `Found ${allDuplicateGroups.length} groups of duplicates.`,
    );

    currentBatchIndex = 0;
    renderBatch();
  } catch (err) {
    setUiState(AppState.ERROR, "Error during scan: " + err.message);
  }
}

async function fetchAllMessages(folder, recursive) {
  let messages = [];

  setUiState(AppState.SCANNING, `Scanning: ${folder.name}...`);
  let page = await messenger.messages.list(folder);
  messages.push(...page.messages);
  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    messages.push(...page.messages);
  }

  if (recursive) {
    const subFolders = await messenger.folders.getSubFolders(folder);

    for (const subFolder of subFolders) {
      // JS runs on a single thread, to avoid UI freezing pause for 10ms
      // to let the UI render the "Scanning <Folder Name>" update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const childMessages = await fetchAllMessages(subFolder, true);
      messages.push(...childMessages);
    }
  }

  return messages;
}

function detectDuplicates(messages) {
  const map = new Map();

  // Group by Message-ID
  for (const msg of messages) {
    if (!msg.headerMessageId) continue;

    if (!map.has(msg.headerMessageId)) {
      map.set(msg.headerMessageId, []);
    }
    map.get(msg.headerMessageId).push(msg);
  }

  // Filter out unique emails, keep only groups > 1
  return Array.from(map.values()).filter((group) => group.length > 1);
}

function renderBatch() {
  const container = document.getElementById("duplicate-list");
  container.innerHTML = ""; // Clear current view

  // Calculate slice
  const start = currentBatchIndex;
  const end = Math.min(start + BATCH_SIZE, allDuplicateGroups.length);
  const batch = allDuplicateGroups.slice(start, end);

  // Update Footer Stats
  document.getElementById("batch-start").textContent = start + 1;
  document.getElementById("batch-end").textContent = end;
  document.getElementById("total-groups").textContent =
    allDuplicateGroups.length;

  if (batch.length === 0) {
    container.innerHTML =
      "<div style='text-align:center; padding:40px;'><h3>All Done!</h3><p>No more duplicates found.</p></div>";
    setUiState(AppState.FINISHED, "All done! No more duplicates.");
    return;
  }

  batch.forEach((group, index) => {
    // Sort group by date (Oldest first)
    group.sort((a, b) => new Date(a.date) - new Date(b.date));

    // The first one is the "Keeper", the rest are "Trash"
    // We create a visual group for them
    const groupDiv = document.createElement("div");
    groupDiv.className = "dupe-group";

    // Header
    const subject = group[0].subject || "(No Subject)";
    groupDiv.innerHTML = `<div class="group-header"><span>${subject}</span> <span style="font-weight:normal; font-size:0.9em">${group.length} Copies</span></div>`;

    group.forEach((msg, i) => {
      const isKeeper = i === 0; // Keep the oldest
      const row = document.createElement("div");
      row.className = `message-row ${isKeeper ? "keep" : "delete"}`;

      // Checkbox Logic: Keepers unchecked, Deletions checked
      const checked = isKeeper ? "" : "checked";

      row.innerHTML = `
        <input type="checkbox" class="dupe-checkbox" data-msg-id="${
          msg.id
        }" ${checked}>
        <div class="details">
          <div><strong>${msg.author}</strong></div>
          <div class="meta">${new Date(
            msg.date,
          ).toLocaleString()} &bull; Folder: ${msg.folder.name}</div>
        </div>
        <div class="badge">${isKeeper ? "Keep (Oldest)" : "Delete"}</div>
      `;

      // Allow user to toggle styling when clicking checkbox
      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          row.classList.remove("keep");
          row.classList.add("delete");
        } else {
          row.classList.remove("delete");
          row.classList.add("keep");
        }
      });

      groupDiv.appendChild(row);
    });

    container.appendChild(groupDiv);
  });
}

async function processBatch() {
  // Check if already finished and we need to exit
  if (currentState === AppState.FINISHED) {
    closeTab();
    return;
  }

  setUiState(AppState.DELETING, "Deleting selected messages...");

  try {
    const checkboxes = document.querySelectorAll(".dupe-checkbox:checked");

    const idsToDelete = Array.from(checkboxes).map((cb) =>
      parseInt(cb.getAttribute("data-msg-id")),
    );

    if (idsToDelete.length > 0) {
      setUiState(
        AppState.DELETING,
        `Deleting ${idsToDelete.length} messages...`,
      );

      // Perform Delete
      for (let i = 0; i < idsToDelete.length; i++) {
        await messenger.messages.delete([idsToDelete[i]]);

        let pct = Math.round(((i + 1) / idsToDelete.length) * 100);
        setUiState(
          AppState.DELETING,
          `Deleting messages... ${pct}% (${i + 1} of ${idsToDelete.length})`,
        );
      }
    }

    // Move to next batch, calculate state, then render
    currentBatchIndex += BATCH_SIZE;

    if (currentBatchIndex >= allDuplicateGroups.length) {
      setUiState(AppState.FINISHED, "Completed, no more duplicates.");
    } else {
      setUiState(AppState.IDLE, "Batch processed. Ready for next.");
      // Scroll to top
      document.getElementById("duplicate-list").scrollTop = 0;
    }

    renderBatch();
  } catch (err) {
    setUiState(AppState.ERROR, "Error:" + err.message);
    alert("Failed to delete messages.");
  }
}

// function updateStatus(msg) {
//   document.getElementById("status-bar").textContent = msg;
// }

function closeTab() {
  messenger.tabs.getCurrent().then((tab) => messenger.tabs.remove(tab.id));
}
