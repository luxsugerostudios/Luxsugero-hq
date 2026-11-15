/**
 * Public Firebase web config for project luxsugero-hq.
 * Safe to commit: this is the client SDK config, not a service account.
 * Security is firestore.rules plus Firebase Authentication.
 *
 * To point the dashboard at another Firebase project, replace the object
 * below. If any value is still a YOUR_* placeholder, the site does not
 * call Firebase and renders seed data in read-only mode.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyD92nvMeSA6ES5taX1M130k-VDlfJI1O5I",
  authDomain: "luxsugero-hq.firebaseapp.com",
  projectId: "luxsugero-hq",
  storageBucket: "luxsugero-hq.firebasestorage.app",
  messagingSenderId: "785366576285",
  appId: "1:785366576285:web:f010d79e037eb39eccb874",
};

/** Must match the email checked in firestore.rules. */
export const FOUNDER_EMAIL = "luxsugerostudios@gmail.com";

const PLACEHOLDER = /^YOUR_/;

export function isFirebaseConfigured(
  config: typeof firebaseConfig = firebaseConfig,
): boolean {
  const values = [
    config.apiKey,
    config.authDomain,
    config.projectId,
    config.storageBucket,
    config.messagingSenderId,
    config.appId,
  ];
  return values.every(
    (value) =>
      typeof value === "string" && value.length > 2 && !PLACEHOLDER.test(value),
  );
}
