// Status toasts

let globalStatusTimer = null;

export function showStatus(message, duration = 2500, statusMsgEl = document.getElementById('status-msg')) {
  if (!statusMsgEl) return;
  statusMsgEl.textContent = String(message);
  statusMsgEl.classList.add('show');
  if (globalStatusTimer) clearTimeout(globalStatusTimer);
  globalStatusTimer = setTimeout(() => statusMsgEl.classList.remove('show'), duration);
}

export function createStatus(statusMsgEl) {
  let statusTimer = null;

  function scopedShowStatus(message, duration = 2500) {
    if (!statusMsgEl) return;
    statusMsgEl.textContent = String(message);
    statusMsgEl.classList.add('show');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusMsgEl.classList.remove('show'), duration);
  }

  return { showStatus: scopedShowStatus };
}
