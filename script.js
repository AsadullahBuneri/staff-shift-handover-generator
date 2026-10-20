const notes = document.getElementById("notes");
const notesCounter = document.getElementById("notesCounter");
const fictionalDataConfirmation = document.getElementById("fictionalDataConfirmation");
const generateBtn = document.getElementById("generateBtn");
const sampleBtn = document.getElementById("sampleBtn");
const clearBtn = document.getElementById("clearBtn");
const loading = document.getElementById("loading");
const error = document.getElementById("error");
const results = document.getElementById("results");
const reportContainer = document.getElementById("reportContainer");
const copyBtn = document.getElementById("copyBtn");
const printBtn = document.getElementById("printBtn");

const sampleNotes = `Room 304: Fever went down, give antibiotics at 6 PM.
Room 308: Waiting for MRI results.
Room 312: pt restless, gave pain meds, check again later
Room 304: BP stable now`;
const priorityOrder = { High: 0, Medium: 1, Low: 2 };
const copyButtonLabel = copyBtn.textContent;
let renderedRooms = [];
let copyResetTimer;

// Keep the character count visible and flag notes that exceed the API limit.
function updateCharacterCount() {
  const characterCount = notes.value.length;
  notesCounter.textContent = `${characterCount}/5000 characters`;
  notesCounter.classList.toggle("is-over-limit", characterCount > 5000);
  notes.setAttribute("aria-invalid", String(characterCount > 5000));
}

// Show errors as text so messages are never interpreted as markup.
function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function hideError() {
  error.textContent = "";
  error.hidden = true;
}

// Confirm the complete structure before trying to render a model response.
function isValidReport(report) {
  return (
    report &&
    Array.isArray(report.rooms) &&
    report.rooms.every(
      (room) =>
        room &&
        typeof room.room === "string" &&
        typeof room.status === "string" &&
        Array.isArray(room.pending_tasks) &&
        room.pending_tasks.every((task) => typeof task === "string") &&
        Object.prototype.hasOwnProperty.call(priorityOrder, room.priority) &&
        Array.isArray(room.needs_verification) &&
        room.needs_verification.every((item) => typeof item === "string"),
    )
  );
}

// Build report cards using DOM nodes and textContent, never HTML strings.
function createRoomCard(room) {
  const card = document.createElement("article");
  card.className = "report-card";

  const cardHeader = document.createElement("div");
  cardHeader.className = "report-card-header";

  const title = document.createElement("h3");
  title.className = "room-title";
  title.textContent = `Room ${room.room}`;

  const priority = document.createElement("span");
  priority.className = `priority-badge ${room.priority.toLowerCase()}`;
  priority.textContent = room.priority;
  priority.setAttribute("aria-label", `Priority: ${room.priority}`);

  cardHeader.append(title, priority);
  card.append(cardHeader);

  const statusSection = document.createElement("section");
  statusSection.className = "status-section";
  const statusHeading = document.createElement("h4");
  statusHeading.textContent = "Patient Status";
  const statusText = document.createElement("p");
  statusText.textContent = room.status;
  statusSection.append(statusHeading, statusText);
  card.append(statusSection);

  const tasksSection = document.createElement("section");
  tasksSection.className = "pending-tasks";
  const tasksHeading = document.createElement("h4");
  tasksHeading.textContent = "Pending Tasks";
  const taskList = document.createElement("ul");

  const tasks = room.pending_tasks.length > 0 ? room.pending_tasks : ["None noted"];
  tasks.forEach((task) => {
    const item = document.createElement("li");
    item.textContent = task;
    taskList.append(item);
  });

  tasksSection.append(tasksHeading, taskList);
  card.append(tasksSection);

  if (room.needs_verification.length > 0) {
    const verification = document.createElement("aside");
    verification.className = "needs-verification";
    const verificationHeading = document.createElement("h4");
    verificationHeading.textContent = "⚠️ Needs human verification";
    const verificationList = document.createElement("ul");

    room.needs_verification.forEach((detail) => {
      const item = document.createElement("li");
      item.textContent = detail;
      verificationList.append(item);
    });

    verification.append(verificationHeading, verificationList);
    card.append(verification);
  }

  return card;
}

function renderReport(report) {
  renderedRooms = [...report.rooms].sort(
    (first, second) => priorityOrder[first.priority] - priorityOrder[second.priority],
  );
  reportContainer.replaceChildren();

  if (renderedRooms.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "No patient rooms were found in these notes.";
    reportContainer.append(emptyMessage);
  } else {
    renderedRooms.forEach((room) => {
      reportContainer.append(createRoomCard(room));
    });
  }

  results.hidden = false;
}

// Create a readable clipboard version from the same sorted report data.
function createPlainTextReport() {
  if (renderedRooms.length === 0) {
    return "Handover Report\n\nNo patient rooms were found in these notes.";
  }

  return [
    "Handover Report",
    "",
    ...renderedRooms.flatMap((room) => [
      `Room ${room.room}`,
      `Patient Status: ${room.status}`,
      `Priority: ${room.priority}`,
      "Pending Tasks:",
      ...(room.pending_tasks.length
        ? room.pending_tasks.map((task) => `- ${task}`)
        : ["- None noted"]),
      ...(room.needs_verification.length
        ? [
            "Needs human verification:",
            ...room.needs_verification.map((detail) => `- ${detail}`),
          ]
        : []),
      "",
    ]),
  ].join("\n");
}

// Older browsers may not offer the Clipboard API, so provide a text-area fallback.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Try the fallback when clipboard permission is unavailable.
    }
  }

  const temporaryInput = document.createElement("textarea");
  temporaryInput.value = text;
  temporaryInput.setAttribute("readonly", "");
  temporaryInput.style.position = "fixed";
  temporaryInput.style.opacity = "0";
  document.body.append(temporaryInput);
  temporaryInput.select();

  const copied = document.execCommand("copy");
  temporaryInput.remove();
  if (!copied) {
    throw new Error("Clipboard copy is unavailable.");
  }
}

notes.addEventListener("input", updateCharacterCount);

sampleBtn.addEventListener("click", () => {
  notes.value = sampleNotes;
  renderedRooms = [];
  reportContainer.replaceChildren();
  results.hidden = true;
  updateCharacterCount();
  hideError();
  notes.focus();
});

clearBtn.addEventListener("click", () => {
  notes.value = "";
  renderedRooms = [];
  reportContainer.replaceChildren();
  results.hidden = true;
  hideError();
  copyBtn.textContent = copyButtonLabel;
  window.clearTimeout(copyResetTimer);
  updateCharacterCount();
  notes.focus();
});

generateBtn.addEventListener("click", async () => {
  const noteText = notes.value;
  hideError();

  if (!noteText.trim()) {
    showError("Enter shift notes before generating a handover report.");
    notes.focus();
    return;
  }

  if (noteText.length > 5000) {
    showError("Notes must be 5000 characters or fewer.");
    notes.focus();
    return;
  }

  if (!fictionalDataConfirmation.checked) {
    showError("Confirm that the notes are fictional and contain no real patient information.");
    fictionalDataConfirmation.focus();
    return;
  }

  generateBtn.disabled = true;
  sampleBtn.disabled = true;
  clearBtn.disabled = true;
  notes.disabled = true;
  fictionalDataConfirmation.disabled = true;
  loading.hidden = false;
  results.hidden = true;
  reportContainer.replaceChildren();
  renderedRooms = [];

  try {
    const response = await fetch("/api/handover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: noteText,
        fictionalDataConfirmed: fictionalDataConfirmation.checked,
      }),
    });

    let report;
    try {
      report = await response.json();
    } catch {
      throw new Error("The server returned an unreadable response. Please try again.");
    }

    if (!response.ok) {
      throw new Error(
        report && typeof report.error === "string"
          ? report.error
          : "The handover report could not be generated. Please try again.",
      );
    }

    if (!isValidReport(report)) {
      throw new Error("The server returned an invalid report. Please try again.");
    }

    renderReport(report);
  } catch (requestError) {
    const message =
      requestError instanceof TypeError
        ? "Could not connect to the handover service. Check your connection and try again."
        : requestError instanceof Error
          ? requestError.message
          : "The request failed. Please check your connection and try again.";
    showError(message);
  } finally {
    generateBtn.disabled = false;
    sampleBtn.disabled = false;
    clearBtn.disabled = false;
    notes.disabled = false;
    fictionalDataConfirmation.disabled = false;
    loading.hidden = true;
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await copyText(createPlainTextReport());
    copyBtn.textContent = "Copied ✓";
    window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyBtn.textContent = copyButtonLabel;
    }, 1800);
  } catch {
    showError("The report could not be copied. Please select and copy it manually.");
  }
});

printBtn.addEventListener("click", () => {
  window.print();
});

updateCharacterCount();
