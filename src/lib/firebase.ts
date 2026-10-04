import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  indexedDBLocalPersistence,
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

// Initialize Auth with iframe-friendly persistence
export const auth = (() => {
  if (typeof window === "undefined") {
    return getApps().length > 0 ? getAuth(getApp()) : getAuth(app);
  }

  try {
    const isIframe = window.self !== window.top;
    return initializeAuth(app, {
      persistence: isIframe
        ? [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
        : [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
    });
  } catch {
    // If initializeAuth was already called or fails, fallback to getAuth
    return getAuth(app);
  }
})();

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
      // If popup was blocked by browser iframe policy, fallback to redirect
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
  try {
    // Attempt standard Client SDK with a 3.5s timeout for iframe indexedDB hanging
    const clientPromise = (async () => {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      if (displayName && userCredential.user) {
        await updateProfile(userCredential.user, { displayName });
      }
      return userCredential;
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("CLIENT_AUTH_TIMEOUT")), 3500)
    );

    return await Promise.race([clientPromise, timeoutPromise]);
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message === "CLIENT_AUTH_TIMEOUT";
    const isIframe = typeof window !== "undefined" && window.self !== window.top;

    // In iframe or upon timeout, fallback to server-side auth proxy
    if (isTimeout || isIframe) {
      console.warn("Using server-side auth proxy for iframe compatibility...");
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signup", email, password: pass, displayName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create account.");
      }
      return {
        user: {
          uid: data.user.uid,
          email: data.user.email,
          displayName: data.user.displayName,
        },
      } as unknown as UserCredential;
    }
    throw err;
  }
}

export async function loginWithEmail(email: string, pass: string) {
  try {
    const clientPromise = signInWithEmailAndPassword(auth, email, pass);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("CLIENT_AUTH_TIMEOUT")), 3500)
    );

    return await Promise.race([clientPromise, timeoutPromise]);
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message === "CLIENT_AUTH_TIMEOUT";
    const isIframe = typeof window !== "undefined" && window.self !== window.top;

    if (isTimeout || isIframe) {
      console.warn("Using server-side auth proxy for iframe compatibility...");
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signin", email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Invalid email or password.");
      }
      return {
        user: {
          uid: data.user.uid,
          email: data.user.email,
          displayName: data.user.displayName || email.split("@")[0],
        },
      } as unknown as UserCredential;
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
