// Status toasts

export function createStatus(statusMsgEl) {
  let statusTimer = null;

  function showStatus(message, duration = 2500) {
    if (!statusMsgEl) return;
    statusMsgEl.textContent = String(message);
    statusMsgEl.classList.add('show');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusMsgEl.classList.remove('show'), duration);
  }

  return { showStatus };
}
