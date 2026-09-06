import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export const subscribeToAuth = (callback) => onAuthStateChanged(auth, callback);

export async function register({ email, password, displayName }) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName?.trim()) await updateProfile(credential.user, { displayName: displayName.trim() });
  await setDoc(doc(db, 'users', credential.user.uid), {
    email: credential.user.email,
    displayName: displayName?.trim() || '',
    createdAt: serverTimestamp(),
    plan: 'trial',
    trialStartedAt: serverTimestamp(),
    walletAddress: null,
  }, { merge: true });
  return credential.user;
}

export async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export function logout() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}
