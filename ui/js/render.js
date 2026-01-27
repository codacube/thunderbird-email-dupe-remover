import { appData, AppState, setUIState } from "./state.js";
import { wait } from "./utils.js";

export async function renderContainer() {
  if (appData.currentState === AppState.FINISHED_SHOW_DONATION) {
    renderFinishScreen();
  } else if (appData.currentState === AppState.FINISHED) {
    // TODO - Final screen without donation
  } else {
    await renderBatch();
  }
}

// TODO check why async?
async function renderBatch() {
  const container = document.getElementById("duplicate-list");

  try {
    container.classList.remove("visible");
    await wait(150);

    container.innerHTML = ""; // Clear current view

    // If no duplicates found
    if (
      !appData.allDuplicateGroups ||
      appData.allDuplicateGroups.length === 0
    ) {
      container.innerHTML =
        "<div style='text-align:center; padding:40px;'><h3>No Duplicates Found</h3><p>There are no duplicate emails in this folder.</p></div>";
      return;
    }

    // Calculate slice
    const start = appData.currentBatchIndex;
    const end = Math.min(
      start + appData.batchSize,
      appData.allDuplicateGroups.length,
    );
    const batch = appData.allDuplicateGroups.slice(start, end);

    // Update Footer Stats
    document.getElementById("batch-start").textContent = start + 1;
    document.getElementById("batch-end").textContent = end;
    document.getElementById("total-groups").textContent =
      appData.allDuplicateGroups.length;

    console.log(
      `start: ${start} end: ${end} total: ${appData.allDuplicateGroups.length}`,
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

export function updateDeleteButton() {
  const btnProcess = document.getElementById("btn-process");

  const checkedCount = document.querySelectorAll(
    ".dupe-checkbox:checked",
  ).length;

  const isLastBatch =
    appData.currentBatchIndex + appData.batchSize >=
    appData.allDuplicateGroups.length - 1;
  const actionSuffix = isLastBatch ? "Finish" : "Next";
  console.log(
    `Updating delete button: ${checkedCount} checked, last batch: ${isLastBatch}`,
  );
  console.log(
    `currentBatchIndex: ${appData.currentBatchIndex}, total groups: ${appData.allDuplicateGroups.length}`,
  );

  if (checkedCount === 1) {
    btnProcess.textContent = `Trash 1 email & ${actionSuffix}`;
  } else if (checkedCount > 1) {
    btnProcess.textContent = `Trash ${checkedCount} emails & ${actionSuffix}`;
  } else {
    btnProcess.textContent = `Keep all emails & ${actionSuffix}`;
  }
}

// Quick and dirty donation screen for testing
// Get rid of magic numbers!
function renderFinishScreen() {
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
      setUIState(AppState.FINISHED, "Finished.");
    },
    { once: true },
  );
}
