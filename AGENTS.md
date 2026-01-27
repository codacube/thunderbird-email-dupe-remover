# Agent Guide for thunderbird-email-dupe-remover

## Project Overview
This is a Mozilla Thunderbird extension written primarily in JavaScript to scan for duplicate emails and provide a UI for reviewing and deleting duplicates.

## Directory Structure
- `background.js`: Background script to create context menu and open UI tab
- `ui/app.js`: Main UI application managing scanning, duplicate detection, deletion logic, and user interaction
- `manifest.json`: Extension manifest specifying permissions, scripts, and metadata
- `README.md`: Usage instructions and notes

## Commands and Automation
- No build or test scripts detected in this directory.
- No linters or CI configurations found.
- Extension is installed manually and invoked via Thunderbird UI.

## Coding Patterns and Style
- Written in modern JavaScript (ES6+), using async/await for async operations.
- UI manipulation via DOM API and event listeners.
- State-driven UI interaction using a finite state pattern (`AppState` enum).
- Batch processing for handling large numbers of duplicates to avoid UI blocking.
- Message deletion done asynchronously with progress updates.

## Testing
- No automated tests detected in the repository.
- Testing expected to be manual by running the extension in Thunderbird environment.

## Important Details and Gotchas
- Deletes messages are irreversible; users are explicitly warned in README.
- Messages grouped by `headerMessageId` to detect duplicates.
- UI batches groups for user review and deletion actions.
- Donations prompt shown conditionally after a threshold of deletions.
- Extension permissions include message read, move, delete, tabs, menus, and storage.
- Background script relies on Thunderbird Messenger API to open UI with folder context.

## Agent Recommendations
- Use Thunderbird environment to run and test extension.
- Manual operation triggered from folder context menu.
- Expect all code in JavaScript, focus on asynchronous DOM + Thunderbird API usage.
- No automated build/test pipelines, requires manual package installation and testing.
- Monitor `ui/app.js` for core scanning, UI state, deletion workflows.
- Be cautious about modifying deletion logic—there is explicit user risk and warnings.

---

This document should assist any future agent or developer to quickly understand the repository usage, structure, and how to interact with it efficiently.