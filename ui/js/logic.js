import { appData, AppState, setUIState } from "./state.js";
import { wait } from "./utils.js";

export async function fetchAllMessages(folder, recursive) {
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

export function detectDuplicates(messages) {
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

export async function processBatch(onProgress = null) {
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
  const deleteFunc = async (ids, bypassTrash = false) => {
    if (appData.debugMode) {
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
