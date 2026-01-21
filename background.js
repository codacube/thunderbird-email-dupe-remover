messenger.menus.create({
  id: "scan-duplicates",
  title: "Scan for Duplicates...",
  contexts: ["folder_pane"],
});

messenger.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "scan-duplicates") {
    // Open the review interface in a new tab, passing the folder ID in the URL hash so the UI knows what to scan
    let folderId = info.selectedFolder.id;
    messenger.tabs.create({
      url: `ui/index.html#${folderId}`,
      active: true,
    });
  }
});
