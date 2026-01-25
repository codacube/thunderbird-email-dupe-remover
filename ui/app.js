let targetFolderId = null;
let allDuplicateGroups = []; // Array of arrays of messages
let currentBatchIndex = 0;
let sessionDeletedCount = 0;
const BATCH_SIZE = 20;

const AppState = {
  WAITING_TO_START: "WAITING_TO_START",
  IDLE: "IDLE",
  SCANNING: "SCANNING",
  DELETING: "DELETING",
  DONATION_PROMPT: "DONATION_PROMPT",
  FINISHED: "FINISHED",
  ERROR: "ERROR",
};

let currentState = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setUIState(newState, customMessage = null) {
  const statusBar = document.getElementById("status-bar");

  statusBar.classList.remove("status-error");

  if (newState === currentState) {
    if (customMessage) {
      statusBar.textContent = customMessage;
      console.log(`[State Update] Still ${newState}: "${customMessage}"`);
    }
    return;
  }

  currentState = newState;
  console.log(`[State Change] -> ${newState}`);

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

    case AppState.DONATION_PROMPT:
      // controls.classList.add("hidden"); // TODO Hidden?
      // body.style.cursor = "default";
      // btnProcess.disabled = false;
      // btnCancel.disabled = false;
      // btnProcess.textContent = "Finished";
      renderDonationScreen();
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

document.addEventListener("DOMContentLoaded", async () => {
  // Tab is opened with foldername in the URL, remove URL encoding from the folder name
  targetFolderId = decodeURIComponent(window.location.hash.substring(1));

  if (!targetFolderId) {
    setUIState(AppState.ERROR, "Error: No folder selected.");
    return;
  }

  registerUIEventListeners();

  // Ready to start
  const folder = await messenger.folders.get(targetFolderId);
  setUIState(AppState.WAITING_TO_START, `Ready to scan folder: ${folder.name}`);
});

function registerUIEventListeners() {
  const listContainer = document.getElementById("duplicate-list");

  // Buttons
  document.getElementById("btn-start").addEventListener("click", startScan);
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

async function handleProcessClick() {
  // Check if already finished and we need to exit
  if (currentState === AppState.FINISHED) {
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

    // TODO Best place?
    // const donationPrompt = await updateStatsAndCheckDonation(totalDeletedThisSession);
    // console.log(
    //   `Deleted ${totalDeletedThisSession} total messages this session. shouldPrompt: ${donationPrompt}`,
    // );
    const numDeleted = await processBatch(progressCallback);
    sessionDeletedCount += numDeleted;
    await updateStats(numDeleted);

    // const showDonationMsg = await updateStatsAndCheckDonation(
    //   totalDeletedThisSession,
    // );
    // console.log(
    //   `Deleted ${totalDeletedThisSession} total messages this session. shouldPrompt: ${donationPrompt}`,
    // );

    await advanceState();
    renderBatch();
  } catch (err) {
    setUIState(AppState.ERROR, "Error: " + err.message);
    // alert("Failed to delete messages.");
  }
}

async function advanceState() {
  // Move to next batch
  currentBatchIndex += BATCH_SIZE;

  // Set state
  if (currentBatchIndex >= allDuplicateGroups.length) {
    const showDonation = await checkIfShowDonationMsg(sessionDeletedCount);
    if (showDonation) {
      setUIState(AppState.DONATION_PROMPT, "Preparing donation prompt...");
    } else {
      setUIState(AppState.FINISHED, "Completed, no more duplicates.");
    }
  } else {
    setUIState(AppState.IDLE, "Batch processed. Ready for next.");
    // Scroll to top
    document.getElementById("duplicate-list").scrollTop = 0;
  }
}

async function startScan() {
  const isRecursive = document.getElementById("include-subfolders").checked;

  sessionDeletedCount = 0;

  setUIState(AppState.SCANNING, "Scanning folder... this may take a moment.");

  // Wait for the controls-bar to disappear (transition set to 0.5s in CSS)
  await wait(750);

  try {
    const rootFolder = await messenger.folders.get(targetFolderId);

    const messages = await fetchAllMessages(rootFolder, isRecursive);
    allDuplicateGroups = detectDuplicates(messages);

    if (allDuplicateGroups.length === 0) {
      setUIState(
        AppState.FINISHED,
        "No duplicate emails found in this folder.",
      );
    } else {
      setUIState(
        AppState.IDLE,
        `Found ${allDuplicateGroups.length} groups of duplicates.`,
      );
    }

    currentBatchIndex = 0;
    renderBatch();
  } catch (err) {
    setUIState(AppState.ERROR, "Error during scan: " + err.message);
  }
}

async function fetchAllMessages(folder, recursive) {
  let messages = [];

  setUIState(AppState.SCANNING, `Scanning: ${folder.name}...`);
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

// TODO Show donation in here?
async function renderBatch() {
  const container = document.getElementById("duplicate-list");

  try {
    container.classList.remove("visible");
    await wait(150);

    container.innerHTML = ""; // Clear current view

    // If no duplicates found
    if (!allDuplicateGroups || allDuplicateGroups.length === 0) {
      container.innerHTML =
        "<div style='text-align:center; padding:40px;'><h3>No Duplicates Found</h3><p>There are no duplicate emails in this folder.</p></div>";
      return;
    }

    // Calculate slice
    const start = currentBatchIndex;
    const end = Math.min(start + BATCH_SIZE, allDuplicateGroups.length);
    const batch = allDuplicateGroups.slice(start, end);

    // Update Footer Stats
    document.getElementById("batch-start").textContent = start + 1;
    document.getElementById("batch-end").textContent = end;
    document.getElementById("total-groups").textContent =
      allDuplicateGroups.length;

    console.log(
      `start: ${start} end: ${end} total: ${allDuplicateGroups.length}`,
    );

    // If we've processed all batches, then nothing more to do
    if (batch.length === 0) {
      container.innerHTML =
        "<div style='text-align:center; padding:40px;'><h3>All Done!</h3><p>No more duplicates found.</p></div>";
      return;
    }

    const batchesHTML = batch
      .map((group, index) => {
        // Sort group by date (Oldest first) - the first one is the "Keeper", the rest are "Trash"
        group.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Check for unique folder names in this batch
        const uniqueFolderNames = new Set(group.map((msg) => msg.folder.name));
        const showFolderBadge = uniqueFolderNames.size > 1;

        const rowsHTML = group
          .map((msg, i) => {
            const isKeeper = i === 0; // Keep the oldest
            const defaultKeepText = isKeeper ? "Keep (Oldest)" : "Keep"; // And make sure the message remains consistent if checkbox is toggled

            // Checkbox Logic: Keepers unchecked, Deletions checked
            const checked = isKeeper ? "" : "checked";

            // Display folder badge if multiple folders are involved (or just folder name if all the same)
            const folderBadgeHtml = showFolderBadge
              ? `<span class="folder-badge" title="${msg.folder.path || msg.folder.name}">📂 ${msg.folder.name}</span>`
              : `📂 ${msg.folder.name}`;

            return `
              <div class="message-row ${isKeeper ? "keep" : "delete"}">
                <input type="checkbox" class="dupe-checkbox" data-msg-id="${msg.id}" ${checked} />
                <div class="details">
                  <div><strong>${msg.author}</strong></div>
                    <div class="meta">${new Date(msg.date).toLocaleString()} &bull; ${folderBadgeHtml}</div>
                  </div>
                <div class="badge" data-keep-text="${defaultKeepText}">${isKeeper ? defaultKeepText : "Delete"}</div>
              </div>
            `;
          })
          .join("");

        // Subject header for the group
        const subject = group[0].subject || "(No Subject)";

        return `
          <div class="group-header"><span>${subject}</span> <span style="font-weight:normal; font-size:0.9em">${group.length} Copies</span></div>
            ${rowsHTML} 
          </div>
          `;
      })
      .join("");

    container.innerHTML = batchesHTML;

    // Set the initial state of the Delete button
    updateDeleteButton();
  } finally {
    // TODO - Force a Browser "Reflow" ??
    // This is a trick: ask for offsetHeight so the browser acknowledges
    // the element is there before trying to animate it again.
    // Why?
    // If you remove a class (opacity: 0) and immediately add it back (opacity: 1) in the same
    // synchronous JavaScript block, the browser often "optimizes" the change away and just shows
    // the final state without animating. By reading a property like offsetHeight, you force the
    // browser to calculate the layout right now, ensuring it registers the "hidden" state before
    // switching to the "visible" state.
    void container.offsetHeight;

    container.classList.add("visible");
  }
}

async function processBatch(onProgress = null) {
  const idsToDelete = getIdsToDeleteInCurrentBatch();
  if (idsToDelete.length === 0) return 0;

  // We have ids to delete
  setUIState(AppState.DELETING, `Deleting ${idsToDelete.length} messages...`);
  const numDeleted = await deleteMessages(idsToDelete, false, onProgress);
  return numDeleted;
}

function getIdsToDeleteInCurrentBatch() {
  const checkboxes = document.querySelectorAll(".dupe-checkbox:checked");
  const idsToDelete = Array.from(checkboxes).map((cb) =>
    parseInt(cb.getAttribute("data-msg-id")),
  );
  return idsToDelete;
}

/**
 * Deletes messages in efficient chunks to prevent UI freezing
 * while allowing for progress updates.
 * * @param {Array<number>} messageIds - List of IDs to delete
 * @param {boolean} bypassTrash - Permanent delete vs Trash (not implemented)
 * @param {Function} onProgress - Optional callback (percent => void)
 */
async function deleteMessages(
  messageIds,
  bypassTrash = false,
  onProgress = null,
) {
  if (!messageIds || messageIds.length === 0) return 0;

  // For debugging
  debugMode = true;
  const deleteFunc = async (ids, bypassTrash = false) => {
    if (debugMode) {
      await wait(150); // Simulate delay
      console.log(`[Debug] .... Deleting messages: ${ids.join(", ")}`);
    } else {
      await messenger.messages.delete(ids, bypassTrash);
    }
  };

  const CHUNK_SIZE = 5; // Number of messages to delete per chunk (100 is better, but we'll go low for now)
  const total = messageIds.length;

  if (total <= CHUNK_SIZE) {
    await deleteFunc(messageIds); //messenger.messages.delete(messageIds);
    if (onProgress) onProgress(total, total);
    return total;
  }

  let processed = 0;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = messageIds.slice(i, i + CHUNK_SIZE);
    await deleteFunc(chunk, bypassTrash);
    processed += chunk.length;

    if (onProgress) {
      //const percent = Math.round((processed / total) * 100);
      onProgress(processed, total);
    }

    await wait(10); // Small delay to keep UI responsive
  }

  return processed;
}

function updateDeleteButton() {
  const btnProcess = document.getElementById("btn-process");

  const checkedCount = document.querySelectorAll(
    ".dupe-checkbox:checked",
  ).length;

  const isLastBatch =
    currentBatchIndex + BATCH_SIZE >= allDuplicateGroups.length - 1;
  const actionSuffix = isLastBatch ? "Finish" : "Next";
  console.log(
    `Updating delete button: ${checkedCount} checked, last batch: ${isLastBatch}`,
  );
  console.log(
    `currentBatchIndex: ${currentBatchIndex}, total groups: ${allDuplicateGroups.length}`,
  );

  if (checkedCount === 1) {
    btnProcess.textContent = `Trash 1 email & ${actionSuffix}`;
  } else if (checkedCount > 1) {
    btnProcess.textContent = `Trash ${checkedCount} emails & ${actionSuffix}`;
  } else {
    btnProcess.textContent = `Keep all emails & ${actionSuffix}`;
  }
}

function closeTab() {
  messenger.tabs.getCurrent().then((tab) => messenger.tabs.remove(tab.id));
}
async function updateStats(numDeleted) {
  const store = await browser.storage.local.get(["totalDeleted"]);
  let total = (store.totalDeleted || 0) + numDeleted;

  await browser.storage.local.set({ totalDeleted: total });
  return total;
}

async function checkIfShowDonationMsg(deletedThisSession) {
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
    Math.floor(totalDeleted / 100) >
    Math.floor((totalDeleted - deletedThisSession) / 100)
  ) {
    showMessage = true;
  }

  // Don't ask again if we asked recently
  // if (now - lastPrompt < ONE_WEEK) {
  //   showMessage = false;
  // }

  if (showMessage) {
    await browser.storage.local.set({ lastDonationPrompt: now });
    return true; // Prompt for donation
  }

  return false;
}

// Quick and dirty donation screen for testing
// Get rid of magic numbers!
function renderDonationScreen() {
  const container = document.getElementById("duplicate-list");
  const statusBar = document.getElementById("status-bar");

  // 1. Update Status Bar
  statusBar.textContent = "Cleanup complete! You're a superstar.";
  statusBar.className = "status-success"; // Green text

  // 2. Render the 'Ask' inside the main container (or a modal)
  container.innerHTML = `
    <div class="donation-wrapper">
      <div class="donation-icon">🎉</div>
      <h3>Wow! You've cleaned up 1,000+ emails!</h3>
      <p>I build this free tool in my spare time. If I just saved you an hour of work, consider buying me a coffee.</p>
      
      <a href="https://ko-fi.com/yourname" target="_blank" class="btn primary btn-donate">
        ☕ Buy me a Coffee
      </a>
      
      <button id="btn-return" class="btn secondary">No thanks, maybe later</button>
    </div>
  `;

  container.classList.add("visible");

  // 3. Bind the local "No thanks" button immediately
  document.getElementById("btn-return").addEventListener(
    "click",
    () => {
      setUiState(AppState.FINISHED, "Finished.");
    },
    { once: true },
  );
}
