import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Firebase web configuration is public. Authorization is enforced by firestore.rules,
// never by hiding this API key. No admin/service-account credentials belong in this app.
const emulator = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';
const app = initializeApp(
  emulator
    ? {
        apiKey: 'demo-key',
        projectId: 'demo-apex',
        authDomain: 'demo-apex.firebaseapp.com',
      }
    : {
        apiKey: 'AIzaSyCXxKyNl69reJJRuq4S_fI1E05vXl6oqow',
        authDomain: 'apex-blind-chess.firebaseapp.com',
        projectId: 'apex-blind-chess',
        storageBucket: 'apex-blind-chess.firebasestorage.app',
        messagingSenderId: '266699441591',
        appId: '1:266699441591:web:283c8526676c41cf51d432',
      },
);
export const auth = getAuth(app);
export const database = getFirestore(app);
// Firestore's disk persistence is deliberately off: our account-scoped IndexedDB outbox
// owns offline writes, version checks, deletion tombstones, and conflict preservation.
if (emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(database, '127.0.0.1', 8080);
}
