import { NextRequest, NextResponse } from "next/server";
import firebaseConfig from "../../../../firebase-applet-config.json";

export async function POST(req: NextRequest) {
  try {
    const { action, email, password, displayName } = await req.json();

    const apiKey = firebaseConfig.apiKey;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Firebase API key is not configured." },
        { status: 500 }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (action === "signup") {
      const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error?.message || "Failed to create account.";
        let friendly = errorMsg;
        if (errorMsg.includes("EMAIL_EXISTS")) {
          friendly = "This email is already in use. Please sign in instead.";
        } else if (errorMsg.includes("WEAK_PASSWORD")) {
          friendly = "Password is too weak. Please use at least 6 characters.";
        }
        return NextResponse.json({ success: false, error: friendly }, { status: 400 });
      }

      // If displayName provided, update profile
      let finalDisplayName = displayName || email.split("@")[0];
      if (displayName && data.idToken) {
        try {
          const updateEndpoint = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`;
          await fetch(updateEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken: data.idToken,
              displayName,
              returnSecureToken: true,
            }),
          });
          finalDisplayName = displayName;
        } catch {
          // non-blocking
        }
      }

      return NextResponse.json({
        success: true,
        user: {
          uid: data.localId,
          email: data.email,
          displayName: finalDisplayName,
        },
      });
    } else {
      // Sign in
      const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error?.message || "Authentication failed.";
        let friendly = errorMsg;
        if (
          errorMsg.includes("INVALID_LOGIN_CREDENTIALS") ||
          errorMsg.includes("INVALID_PASSWORD") ||
          errorMsg.includes("EMAIL_NOT_FOUND")
        ) {
          friendly = "Invalid email or password. Please verify your credentials or create a new account.";
        }
        return NextResponse.json({ success: false, error: friendly }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        user: {
          uid: data.localId,
          email: data.email,
          displayName: data.displayName || email.split("@")[0],
        },
      });
    }
  } catch (err: unknown) {
    console.error("Auth API Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error." },
      { status: 500 }
    );
  }
}
