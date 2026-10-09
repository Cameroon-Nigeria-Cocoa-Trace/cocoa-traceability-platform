import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  firebaseConfig.projectId;

if (!projectId) {
  throw new Error(
    "Firebase Admin configuration error: project ID is missing."
  );
}

const existingApp = getApps().find(
  (app) => app.name === "[DEFAULT]"
);

const firebaseAdminApp =
  existingApp ??
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });

export const firebaseAdminAuth = getAuth(firebaseAdminApp);