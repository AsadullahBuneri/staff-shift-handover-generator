const { MODEL, TEMPERATURE, MAX_NOTES_LENGTH, SYSTEM_PROMPT } = require("../lib/config");

// Send a consistent JSON response for every outcome.
function sendJson(res, status, body) {
  return res.status(status).json(body);
}

// Vercel usually parses JSON bodies; also handle string bodies and malformed JSON.
function readRequestBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  return body;
}

// Match the model output to the fields consumed by the browser.
function isValidReport(report) {
  return (
    report &&
    Array.isArray(report.beds) &&
    report.beds.every(
      (bed) =>
        bed &&
        typeof bed.bed === "string" &&
        typeof bed.status === "string" &&
        Array.isArray(bed.pending_tasks) &&
        bed.pending_tasks.every((task) => typeof task === "string") &&
        ["High", "Medium", "Low"].includes(bed.priority) &&
        Array.isArray(bed.needs_verification) &&
        bed.needs_verification.every((item) => typeof item === "string"),
    )
  );
}

// Remove the credential if an upstream error unexpectedly echoes it.
function redactApiKey(text, apiKey) {
  return [apiKey, encodeURIComponent(apiKey)].reduce(
    (safeText, secret) => safeText.split(secret).join("[REDACTED]"),
    text,
  );
}

module.exports = async function handler(req, res) {
  // This endpoint only handles POST requests.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed. Use POST." });
  }

  try {
    // Validate the submitted notes before calling the external API.
    const body = readRequestBody(req.body);
    if (
      !body ||
      typeof body.notes !== "string" ||
      body.notes.trim().length === 0 ||
      body.notes.length > MAX_NOTES_LENGTH
    ) {
      return sendJson(res, 400, {
        error: `Provide non-empty notes up to ${MAX_NOTES_LENGTH} characters.`,
      });
    }

    // Keep the trimmed API key server-side and never include it in a response or log.
    const apiKey = process.env.AI_API_KEY?.trim();
    if (!apiKey) {
      return sendJson(res, 500, {
        error: "The handover service is not configured. Please try again later.",
      });
    }

    // Ask Groq for a JSON-only handover report.
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";

    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.AI_API_KEY.trim(),
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: body.notes },
          ],
          temperature: TEMPERATURE,
          response_format: { type: "json_object" },
        }),
      });
    } catch {
      return sendJson(res, 502, {
        error: "The handover service could not be reached. Please try again.",
      });
    }

    // Include sanitized provider diagnostics for troubleshooting failed requests.
    if (!upstream.ok) {
      const responseBodyText = await upstream.text();
      const safeResponseBody = redactApiKey(responseBodyText, apiKey);
      console.error("Groq API request failed", {
        status: upstream.status,
        responseBody: safeResponseBody,
      });

      let upstreamMessage = "";
      try {
        const errorBody = JSON.parse(safeResponseBody);
        upstreamMessage =
          typeof errorBody?.error?.message === "string"
            ? errorBody.error.message
            : typeof errorBody?.error === "string"
              ? errorBody.error
            : "";
      } catch {
        upstreamMessage = safeResponseBody.trim();
      }

      const detailMessage = (upstreamMessage || upstream.statusText || "Request failed")
        .replace(/\s+/g, " ")
        .slice(0, 240);

      return sendJson(res, 502, {
        error: "The handover report could not be generated. Please try again.",
        detail: `Groq returned HTTP ${upstream.status}: ${detailMessage}`,
      });
    }

    let upstreamBody;
    try {
      upstreamBody = await upstream.json();
    } catch {
      return sendJson(res, 502, {
        error: "The handover service returned an unreadable response. Please try again.",
      });
    }

    const generatedText = upstreamBody?.choices?.[0]?.message?.content;

    // Reject missing or malformed model output with a friendly gateway error.
    let report;
    try {
      if (typeof generatedText !== "string" || !generatedText.trim()) {
        throw new Error("Empty model response");
      }
      report = JSON.parse(generatedText);
    } catch {
      return sendJson(res, 502, {
        error: "The handover service returned an unreadable report. Please try again.",
      });
    }

    // Ensure the response has the expected top-level structure.
    if (!isValidReport(report)) {
      return sendJson(res, 502, {
        error: "The handover service returned an invalid report. Please try again.",
      });
    }

    return sendJson(res, 200, report);
  } catch {
    // Keep unexpected failures safe and avoid returning implementation details.
    return sendJson(res, 500, {
      error: "Something went wrong while generating the report. Please try again.",
    });
  }
};
