import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, runTransaction } from 'firebase/firestore';
import { auth, database } from '../adapters/firebase';

export interface AccountState {
  ready: boolean;
  user: { id: string; email: string; username: string | null } | null;
  error: string | null;
}
export function accountError(error: unknown) {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'The email or password was not accepted.';
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Sign in or reset its password.';
    case 'auth/weak-password':
      return 'Use a password with at least 8 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Connect to the internet to use account services. Offline practice is still available.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a little before trying again.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Email/password login has not been enabled for this site yet.';
    case 'permission-denied':
      return 'The game database is not configured yet. Your games remain saved on this device.';
    default:
      return error instanceof Error
        ? error.message
        : 'The account request failed. Please try again.';
  }
}
export class Accounts {
  private state: AccountState = { ready: false, user: null, error: null };
  private listeners = new Set<() => void>();
  constructor() {
    onAuthStateChanged(
      auth,
      (user) => {
        this.set({
          ready: true,
          user: user ? { id: user.uid, email: user.email ?? '', username: user.displayName } : null,
          error: null,
        });
      },
      (error) => this.set({ ready: true, user: null, error: accountError(error) }),
    );
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(state: AccountState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  async register(email: string, password: string, username: string) {
    this.validateUsername(username);
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
    await createUserWithEmailAndPassword(auth, email.trim(), password);
    await this.chooseUsername(username);
  }
  private validateUsername(username: string) {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username.trim()))
      throw new Error('Use 3–24 letters, numbers, or underscores for your public username.');
  }
  async chooseUsername(input: string) {
    this.validateUsername(input);
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in first.');
    const username = input.trim().toLowerCase();
    const nameRef = doc(database, 'usernames', username);
    const profileRef = doc(database, 'profiles', user.uid);
    const actualName = await runTransaction(database, async (tx) => {
      const [name, profile] = await Promise.all([tx.get(nameRef), tx.get(profileRef)]);
      if (profile.exists()) return profile.data().username as string; // Resume a partially completed signup.
      if (name.exists() && name.data().ownerId !== user.uid)
        throw new Error('That username is taken. Choose another.');
      tx.set(nameRef, { ownerId: user.uid });
      tx.set(profileRef, { username }); // Email only lives in private Firebase Authentication data.
      return username;
    });
    await updateProfile(user, { displayName: actualName });
    if (auth.currentUser?.uid === user.uid)
      this.set({
        ready: true,
        user: { id: user.uid, email: user.email ?? '', username: actualName },
        error: null,
      });
  }
  login = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email.trim(), password);
  logout = () => signOut(auth);
  resetPassword = (email: string) => sendPasswordResetEmail(auth, email.trim());
}
