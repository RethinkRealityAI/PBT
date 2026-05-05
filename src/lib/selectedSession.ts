// Lightweight cross-screen handoff for the History → HistoryDetail flow.
// The state-machine router doesn't carry params, so we keep a single id in a
// module-level slot. Set when a history row is clicked, read by the detail screen.

let selectedSessionId: string | null = null;

export function setSelectedSessionId(id: string | null) {
  selectedSessionId = id;
}

export function getSelectedSessionId(): string | null {
  return selectedSessionId;
}
