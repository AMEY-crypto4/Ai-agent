const requirementEl = document.getElementById("requirement");
const projectNameEl = document.getElementById("projectName");
const generateBtn = document.getElementById("generateBtn");
const feedbackEl = document.getElementById("feedback");
const refineBtn = document.getElementById("refineBtn");
const newProjectBtn = document.getElementById("newProjectBtn");

const createForm = document.getElementById("createForm");
const logSection = document.getElementById("log");
const logList = document.getElementById("logList");
const resultEl = document.getElementById("result");
const resultTitle = document.getElementById("resultTitle");
const summaryEl = document.getElementById("summary");
const warningsEl = document.getElementById("warnings");
const fileListEl = document.getElementById("fileList");
const fileContentEl = document.querySelector("#fileContent code");
const downloadLink = document.getElementById("downloadLink");
const projectListEl = document.getElementById("projectList");

let currentFiles = [];
let currentProjectId = null;
let activeSource = null;

function addLogLine(message, kind) {
  const li = document.createElement("li");
  li.textContent = message;
  if (kind) li.className = kind;
  logList.appendChild(li);
  logList.parentElement.scrollTop = logList.parentElement.scrollHeight;
}

function renderFiles(files) {
  currentFiles = files;
  fileListEl.innerHTML = "";
  files.forEach((file, index) => {
    const btn = document.createElement("button");
    btn.textContent = file.path;
    btn.addEventListener("click", () => selectFile(index));
    fileListEl.appendChild(btn);
  });
  selectFile(0);
}

function selectFile(index) {
  [...fileListEl.children].forEach((el, i) => el.classList.toggle("active", i === index));
  fileContentEl.textContent = currentFiles[index]?.content ?? "";
}

function renderWarnings(warnings) {
  warningsEl.innerHTML = "";
  if (!warnings || warnings.length === 0) {
    warningsEl.classList.add("hidden");
    return;
  }
  warnings.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = w;
    warningsEl.appendChild(li);
  });
  warningsEl.classList.remove("hidden");
}

function showResult(projectId, summary, files, warnings) {
  currentProjectId = projectId;
  resultTitle.textContent = "Summary";
  summaryEl.textContent = summary;
  renderWarnings(warnings);
  renderFiles(files);
  downloadLink.href = `/api/download/${projectId}`;
  downloadLink.classList.remove("hidden");
  resultEl.classList.remove("hidden");
}

function setBusy(busy) {
  generateBtn.disabled = busy;
  refineBtn.disabled = busy;
}

function runStream(url, { onDone, onError }) {
  if (activeSource) activeSource.close();
  logSection.classList.remove("hidden");
  logList.innerHTML = "";
  setBusy(true);

  const source = new EventSource(url);
  activeSource = source;

  source.onmessage = (e) => {
    let event;
    try {
      event = JSON.parse(e.data);
    } catch {
      return;
    }

    if (event.type === "status") {
      addLogLine(event.message);
    } else if (event.type === "warning") {
      addLogLine(event.message, "warning");
    } else if (event.type === "error") {
      addLogLine(event.message, "error");
      source.close();
      activeSource = null;
      setBusy(false);
      onError?.(event.message);
    } else if (event.type === "done") {
      addLogLine("Done.");
      source.close();
      activeSource = null;
      setBusy(false);
      onDone?.(event);
    }
  };

  source.onerror = () => {
    source.close();
    activeSource = null;
    setBusy(false);
    onError?.("Connection to the agent was interrupted.");
  };
}

function generate() {
  const requirement = requirementEl.value.trim();
  if (!requirement) {
    addLogLine("Please describe what you want built first.", "error");
    logSection.classList.remove("hidden");
    return;
  }

  resultEl.classList.add("hidden");
  const params = new URLSearchParams({ requirement });
  const projectName = projectNameEl.value.trim();
  if (projectName) params.set("projectName", projectName);

  runStream(`/api/generate/stream?${params.toString()}`, {
    onDone: (event) => {
      showResult(event.projectId, event.summary, event.files, event.warnings);
      loadProjectList();
    },
  });
}

function refine() {
  const feedback = feedbackEl.value.trim();
  if (!feedback || !currentProjectId) return;

  const params = new URLSearchParams({ feedback });
  runStream(`/api/projects/${currentProjectId}/refine/stream?${params.toString()}`, {
    onDone: (event) => {
      showResult(event.projectId, event.summary, event.files, event.warnings);
      feedbackEl.value = "";
      loadProjectList();
    },
  });
}

async function loadProjectList() {
  try {
    const response = await fetch("/api/projects");
    const projects = await response.json();
    projectListEl.innerHTML = "";
    projects.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "project-item" + (p.projectId === currentProjectId ? " active" : "");
      btn.appendChild(document.createTextNode(p.projectName || p.projectId));
      const req = document.createElement("span");
      req.className = "req";
      req.textContent = p.requirement;
      btn.appendChild(req);
      btn.addEventListener("click", () => openProject(p.projectId));
      projectListEl.appendChild(btn);
    });
  } catch {
    // Project list is a convenience; ignore failures silently.
  }
}

async function openProject(projectId) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (!response.ok) return;
  const meta = await response.json();
  logSection.classList.add("hidden");
  showResult(meta.projectId, meta.summary, meta.files, []);
  loadProjectList();
}

function startNewProject() {
  currentProjectId = null;
  requirementEl.value = "";
  projectNameEl.value = "";
  resultEl.classList.add("hidden");
  logSection.classList.add("hidden");
  loadProjectList();
}

generateBtn.addEventListener("click", generate);
refineBtn.addEventListener("click", refine);
newProjectBtn.addEventListener("click", startNewProject);

loadProjectList();
