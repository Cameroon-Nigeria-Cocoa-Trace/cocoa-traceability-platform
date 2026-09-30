# Cameroon-Cross River Cocoa Traceability Platform

A digital traceability infrastructure and marketplace platform preserving the provenance, ownership chain, and EUDR compliance for Cameroonian cocoa moving through Cross River and Nigerian export corridors.

---

## Collaborator Setup Guide

Welcome to the project! Follow these setup steps carefully to start collaborating in Google AI Studio.

### 1. Permissions & Access
- You have **already been added** to the project on **Firebase** and the **Google Cloud Console**.
- You do not need to configure new Firebase projects, databases, or API keys manually.

### 2. Import into Google AI Studio
To clone and run the project inside AI Studio:
1. Open [Google AI Studio](https://aistudio.google.com/).
2. Click on **New App** (or click the **`+`** icon).
3. Select **Import from GitHub**.
4. Paste the repository URL:
   ```text
   https://github.com/Cameroon-Nigeria-Cocoa-Trace/cocoa-traceability-platform.git
   ```
5. Confirm and let AI Studio initialize the environment.

### 3. Always Sync (Pull) Before Starting Work
Before starting any new task, feature, or bug fix:
- Always pull/sync the latest commits from `main` to ensure you are working on the most recent codebase and avoid merge conflicts.

```bash
git pull origin main
```

---

## Scoping Agent Instructions (Crucial for AI Studio)

When working with an AI assistant in AI Studio, **always set system instructions** to scope the agent's work strictly to your assigned area. This prevents accidental overwrites of shared core infrastructure (e.g., Firebase, auth, layout, security rules).

### Example System Instruction:
Copy, adapt (replace bracketed folder paths with your assigned area), and paste this into your AI Studio system instructions:

```text
You are working on a cocoa traceability platform: an app for buying and selling cocoa while tracking previous and present owners.

Scope rules. You will always:
* Only edit files inside [src/components/marketplace/] and [src/app/dashboard/].
* Never modify authentication, Firebase configuration, security rules, environment variables, or secrets.
* Never change database structure or field names for ownership records without asking me first.
* Not change model strings found in code.
* Not add, remove, or upgrade dependencies without asking first.
* Keep the existing design, layout, and styling unless I ask for a change.

Before making changes:
* List the files you plan to edit and why, then wait for my approval.
* If a request needs a file outside the allowed folders, stop and tell me instead of editing it.

After making changes:
* Summarize exactly which files you changed.
```

---

## Local Development (Optional)

If running outside AI Studio locally:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

4. Run linter:
   ```bash
   npm run lint
   ```

5. Build for production:
   ```bash
   npm run build
   ```

---

## Project Structure & Key Technologies

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database & Auth**: Firebase Authentication (Google Auth) & Cloud Firestore (`europe-west2`)
- **Icons**: Lucide React
