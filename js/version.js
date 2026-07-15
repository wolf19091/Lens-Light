/**
 * Lens Light - Version
 * Single source of truth for the app version.
 *
 * NOTE: sw.js keeps its own APP_VERSION / cache-name constants because a
 * service worker can't reliably import ES modules at install time. Keep the
 * version in sw.js in sync with this value on every release.
 */

export const APP_VERSION = '9.0.1';
