// State Management
let allDuplicateGroups = []; // Array of arrays of messages
let currentBatchIndex = 0;
const BATCH_SIZE = 20;

document.addEventListener("DOMContentLoaded", async () => {
  // Remove URL encoding from the folder name
  const folderId = decodeURIComponent(window.location.hash.substring(1));

  if (!folderId) {
    updateStatus("Error: No folder selected.");
    return;
  }

  updateStatus("Scanning folder... this may take a moment.");
  try {
    const folder = await messenger.folders.get(folderId);
    const messages = await fetchAllMessages(folder);
    allDuplicateGroups = detectDuplicates(messages);

    updateStatus(`Found ${allDuplicateGroups.length} groups of duplicates.`);

    renderBatch();

    document
      .getElementById("btn-process")
      .addEventListener("click", processBatch);
    document.getElementById("btn-cancel").addEventListener("click", () => {
      messenger.tabs.getCurrent().then((tab) => messenger.tabs.remove(tab.id));
    });
  } catch (err) {
    console.error(err);
    updateStatus("Error during scan: " + err.message);
  }
});

async function fetchAllMessages(folder) {
  let page = await messenger.messages.list(folder);
  let messages = page.messages;
  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    messages.push(...page.messages);
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
    document.getElementById("btn-process").disabled = true;
    document.getElementById("btn-process").textContent = "Finished";
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
  const checkboxes = document.querySelectorAll(".dupe-checkbox:checked");
  const idsToDelete = Array.from(checkboxes).map((cb) =>
    parseInt(cb.getAttribute("data-msg-id")),
  );

  if (idsToDelete.length > 0) {
    updateStatus(`Deleting ${idsToDelete.length} messages...`);

    // Perform Delete
    await messenger.messages.delete(idsToDelete);
  }

  // Move index forward
  currentBatchIndex += BATCH_SIZE;

  // Re-render next batch
  renderBatch();
  updateStatus("Batch processed. Ready for next.");

  // Scroll to top
  document.getElementById("duplicate-list").scrollTop = 0;
}

function updateStatus(msg) {
  document.getElementById("status-bar").textContent = msg;
}
