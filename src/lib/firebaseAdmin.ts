import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const projectId =
  (process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    firebaseConfig.projectId)?.trim();

const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

if (privateKey) {
  // Remove surrounding double or single quotes if pasted with quotes in Vercel
  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1);
  }
  // Convert literal \\n sequences to actual newlines
  privateKey = privateKey.replace(/\\n/g, "\n");
}

if (!projectId) {
  throw new Error(
    "Firebase Admin configuration error: project ID is missing."
  );
}

const existingApp = getApps().find(
  (app) => app.name === "[DEFAULT]"
);

let firebaseAdminApp;
if (existingApp) {
  firebaseAdminApp = existingApp;
} else if (clientEmail && privateKey) {
  try {
    firebaseAdminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } catch (err) {
    console.error("Failed to initialize Firebase Admin with cert credentials:", err);
    throw err;
  }
} else {
  firebaseAdminApp = initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

export const firebaseAdminAuth = getAuth(firebaseAdminApp);
export const firebaseAdminDb = getFirestore(firebaseAdminApp);