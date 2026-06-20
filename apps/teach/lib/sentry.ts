// Sentry crash reporting.
// Install: expo install @sentry/react-native
// Then add plugin to app.json: { "plugins": ["@sentry/react-native/expo"] }
// Set EXPO_PUBLIC_SENTRY_DSN in your .env file.
//
// This module is a no-op until @sentry/react-native is installed.

let initialized = false;

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn || initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
    Sentry.init({ dsn, tracesSampleRate: 0.2 });
    initialized = true;
  } catch {
    // @sentry/react-native not installed yet
  }
}

export function captureException(err: unknown) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
    Sentry.captureException(err);
  } catch {
    // noop
  }
}
