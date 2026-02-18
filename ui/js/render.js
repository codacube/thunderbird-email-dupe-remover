import { appData, AppState } from "./state.js";
import { consoleLog, wait, formatFriendly } from "./utils.js";
import { getTotalDeletedCount } from "./storage.js";

export async function renderContainer() {
  const container = document.getElementById("results-container");

  try {
    container.classList.remove("visible");
    await wait(150);

    container.innerHTML = ""; // Clear current view

    if (appData.currentState === AppState.FINISHED_SHOW_DONATION) {
      renderFinished(true);
    } else if (appData.currentState === AppState.FINISHED) {
      renderFinished(false);
    } else {
      await renderBatch();
    }
  } finally {
    container.classList.add("visible");
  }
}

async function renderBatch() {
  const container = document.getElementById("results-container");

  // If no duplicates found
  if (!appData.allDuplicateGroups || appData.allDuplicateGroups.length === 0) {
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

  consoleLog(
    appData.debugMode,
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
  container.scrollTop = 0;

  // Set the initial state of the Delete button
  updateDeleteButton();
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
  consoleLog(
    appData.debugMode,
    `Updating delete button: ${checkedCount} checked, last batch: ${isLastBatch}`,
  );
  consoleLog(
    appData.debugMode,
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

async function renderFinished(showDonation = false) {
  const container = document.getElementById("results-container");
  const allTimeTotal = await getTotalDeletedCount();

  // <div style='text-align:center; padding:40px;'>
  // </div>

  let overallMsgHTML = "";
  if (!appData.allDuplicateGroups || appData.allDuplicateGroups.length === 0) {
    overallMsgHTML = `<h3>No Duplicates Found</h3><p>There are no duplicate emails in this folder.</p>`;
  } else {
    overallMsgHTML = `<h3>🎉 You've cleaned up a total of ${formatFriendly(allTimeTotal)} emails! 🎉</h3>`;
  }

  let sessionStatsHTML = "";
  if (
    appData.sessionDeletedCount !== 0 &&
    appData.sessionDeletedCount !== allTimeTotal
  ) {
    sessionStatsHTML += `<p>...and in this session you've removed ${formatFriendly(appData.sessionDeletedCount)} duplicate emails.</p>`;
  }

  let donationButtonHTML = "";
  let donationMsgHTML = "";
  if (showDonation) {
    donationMsgHTML = `<p>I build this free tool in my spare time. If I've saved you time and you find it useful, then please consider buying me a coffee.</p>`;
    donationButtonHTML = `<div class="donation-buttons">
        <a href="https://www.buymeacoffee.com/codacube" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
      </div>`;
  }

  container.innerHTML = `
    <div class="finished-wrapper">
      <div class="finished-header">
        ${overallMsgHTML}
        ${sessionStatsHTML}
        ${donationMsgHTML}
      </div>
      ${donationButtonHTML}
    </div>
  `;
}
