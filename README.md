# AI Shift Handover Note Generator

AI Shift Handover Note Generator is a small, framework-free web app that turns rough shift notes into a structured draft organized by room. It sends submitted notes to a Vercel serverless function, which asks the Groq API to return a JSON report with a status, pending tasks, priority, and items that need human verification. The report is intended only as a drafting aid: users must verify every detail and follow their organization’s approved handover process.

## Features

- Plain HTML, CSS, and browser JavaScript; no frontend framework.
- Accepts notes up to 5,000 characters and shows a live character count.
- Requires users to confirm that submitted notes are fictional and contain no real patient information.
- Groups notes by room and sorts report cards by priority.
- Shows patient status, pending tasks, priority, and verification items.
- Includes example notes, clear, copy, and print controls.
- Uses a server-side API key and returns structured JSON from the AI endpoint.
- Uses DOM creation and `textContent` to display report text safely.
- Responsive interface with loading, validation, and error states.

## How it works

**Notes → frontend → Vercel serverless function → Groq API → structured report**

The browser checks the notes and fictional-data confirmation, then sends them as JSON to `/api/handover`. The serverless function validates the request, calls Groq with a low temperature and JSON response mode, validates the returned report shape, and responds with JSON. The browser renders the report as text in room cards.

## Technologies used

- HTML, CSS, and JavaScript
- Vercel Serverless Functions (Node.js CommonJS)
- Groq API (`llama-3.3-70b-versatile`, OpenAI-compatible chat completions)
- GitHub Copilot (development assistance)
- GitHub (source hosting)
- Vercel (local development and deployment)

## Local setup

Prerequisites: Git, Node.js with npm, and a Groq API key.

1. Clone the repository and enter its directory:

   ```bash
   git clone https://github.com/AsadullahBuneri/staff-shift-handover-generator.git
   cd staff-shift-handover-generator
   ```

2. Copy the example environment file to `.env`:

   **PowerShell**
   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux**
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and replace the placeholder with your Groq API key:

   ```dotenv
   AI_API_KEY=your_actual_key
   ```

   Keep `.env` private; it is ignored by Git. Do not put the key in browser code or commit it.

4. Install the Vercel CLI:

   ```bash
   npm install --global vercel
   ```

5. Start the local development server:

   ```bash
   vercel dev
   ```

6. Open the local URL printed by Vercel in your browser (typically `http://localhost:3000`).

## Deploy to Vercel

1. Push the project to a Git repository and import it into Vercel, or deploy with the Vercel CLI from the project directory.
2. In the Vercel project dashboard, open **Settings → Environment Variables**.
3. Add `AI_API_KEY` with your Groq API key. Enable it for the environments you intend to use (for example, Production and Preview).
4. Deploy or redeploy the project so the function receives the environment variable.
5. Open the deployed site and test it with fictional notes. The API key remains available only to the serverless function; it must not be added to frontend files.

## Safety measures

- The system prompt instructs the model not to invent medical details and not to change medication names, doses, or times.
- Ambiguous, missing, or contradictory information is directed to `needs_verification` and displayed for human review.
- The page tells users to use fictional data only, and the UI and API require a fictional-data confirmation. This is an attestation, not automatic verification that submitted notes are fictional.
- The API key is read on the server from `AI_API_KEY`; it is not sent in the frontend response or embedded in browser code.
- Groq generation uses temperature `0.1` and requests JSON-only output.
- The backend validates the JSON structure. The frontend creates DOM elements and sets report values through `textContent`, rather than inserting model output as raw HTML.
- AI-generated reports are unverified drafts, not medical advice or a substitute for approved clinical documentation and handover procedures. Verify every item, particularly medication instructions.

## Example input and output

Example input (fictional):

```text
Room 304: Fever went down, give antibiotics at 6 PM.
Room 308: Waiting for MRI results.
Room 312: pt restless, gave pain meds, check again later
Room 304: BP stable now
```

Example output (illustrative; actual wording and prioritization may differ):

```json
{
  "rooms": [
    {
      "room": "304",
      "status": "Fever has gone down; blood pressure is stable now.",
      "pending_tasks": ["Give antibiotics at 6 PM."],
      "priority": "Medium",
      "needs_verification": [
        "The specific antibiotic and dose are not provided."
      ]
    },
    {
      "room": "308",
      "status": "Waiting for MRI results.",
      "pending_tasks": [],
      "priority": "Medium",
      "needs_verification": [
        "The follow-up task and timing are not specified."
      ]
    },
    {
      "room": "312",
      "status": "Restless; pain meds were given.",
      "pending_tasks": ["Check again later."],
      "priority": "Medium",
      "needs_verification": [
        "The medication and dose are not specified.",
        "The time for checking again is not specified."
      ]
    }
  ]
}
```

The example illustrates the expected response shape; the AI may produce different text. Review its output against the original notes.

## Limitations and future improvements

- An AI model can still misunderstand notes despite safety instructions and output validation; human review is essential.
- The fictional-data checkbox cannot detect or prevent a user from submitting real patient information.
- Reports are not saved, authenticated, or integrated with an electronic health record.
- The current API uses Groq and its `AI_API_KEY` server environment variable; alternate providers are not configured.
- Future work could include automated tests, stricter report validation, configurable model/provider selection, improved accessibility testing, and organization-approved privacy and security controls before any real-world clinical use.
