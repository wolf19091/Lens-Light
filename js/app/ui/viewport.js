// iOS viewport height fix
// NOTE: CSS uses height: calc(var(--app-vh) * 100)

export function updateAppVh() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--app-vh', `${vh}px`);
}
