import { NextRequest } from "next/server";
import { firebaseAdminAuth } from "@/lib/firebaseAdmin";

export interface AuthenticatedUser {
  userId: string;
}

export type FirebaseIdTokenVerifier = (
  idToken: string
) => Promise<{ uid: string }>;

export async function getAuthenticatedUser(
  req: NextRequest,
  verifyToken: FirebaseIdTokenVerifier = (idToken) =>
    firebaseAdminAuth.verifyIdToken(idToken)
): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error(
      "Authentication Required: A Firebase ID token is required."
    );
  }

  const idToken = authHeader.slice("Bearer ".length).trim();

  if (!idToken) {
    throw new Error(
      "Authentication Required: A Firebase ID token is required."
    );
  }

  try {
    const decodedToken = await verifyToken(idToken);

    if (
      typeof decodedToken.uid !== "string" ||
      decodedToken.uid.trim() === ""
    ) {
      throw new Error("Invalid Firebase UID");
    }

    return { userId: decodedToken.uid };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";

    if (code === "auth/id-token-expired") {
      throw new Error(
        "Authentication Error: Firebase token has expired."
      );
    }

    throw new Error(
      "Authentication Error: Invalid or expired Firebase ID token."
    );
  }
}