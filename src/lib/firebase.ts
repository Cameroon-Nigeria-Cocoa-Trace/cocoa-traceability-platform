import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  UserCredential,
} from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore
export const db =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== "(default)"
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

// Initialize Auth (standard getAuth conforms with Firebase SDK specifications and prevents auth/argument-error)
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
googleProvider.addScope("email");
googleProvider.addScope("profile");

export async function loginWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
        console.warn("Popup blocked or cancelled, attempting signInWithRedirect...");
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
    }
    throw err;
  }
}

export async function checkRedirectAuthResult() {
  try {
    return await getRedirectResult(auth);
  } catch (err) {
    console.warn("Error getting redirect auth result:", err);
    return null;
  }
}

export async function signUpWithEmail(
  email: string,
  pass: string,
  displayName?: string
) {
  const cleanEmail = (email || "").trim();
  const cleanPass = (pass || "").trim();
  const cleanName = (displayName || "").trim();

  if (!cleanEmail || !cleanPass) {
    throw new Error("Email and password cannot be empty.");
  }
  if (cleanPass.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
    if (cleanName && userCredential.user) {
      try {
        await updateProfile(userCredential.user, { displayName: cleanName });
      } catch (pErr) {
        console.warn("Profile name update notice:", pErr);
      }
    }
    return userCredential;
  } catch (err: unknown) {
    // Attempt fallback to server-side authentication proxy
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signup",
          email: cleanEmail,
          password: cleanPass,
          displayName: cleanName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        return {
          user: {
            uid: data.user.uid,
            email: data.user.email,
            displayName: data.user.displayName,
          },
        } as unknown as UserCredential;
      }
    } catch {
      // ignore proxy error if original error is more descriptive
    }
    throw err;
  }
}

export async function loginWithEmail(email: string, pass: string) {
  const cleanEmail = (email || "").trim();
  const cleanPass = (pass || "").trim();

  if (!cleanEmail || !cleanPass) {
    throw new Error("Email and password cannot be empty.");
  }

  try {
    return await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
  } catch (err: unknown) {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signin",
          email: cleanEmail,
          password: cleanPass,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        return {
          user: {
            uid: data.user.uid,
            email: data.user.email,
            displayName: data.user.displayName || cleanEmail.split("@")[0],
          },
        } as unknown as UserCredential;
      }
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function logoutUser() {
  return await signOut(auth);
}

// Test Connection on load
async function testConnection() {
  if (typeof window === "undefined") return;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();

// Structured Firestore Error Handling
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
