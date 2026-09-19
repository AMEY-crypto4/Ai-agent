const requirementEl = document.getElementById("requirement");
const projectNameEl = document.getElementById("projectName");
const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const summaryEl = document.getElementById("summary");
const fileListEl = document.getElementById("fileList");
const fileContentEl = document.querySelector("#fileContent code");
const downloadLink = document.getElementById("downloadLink");

let currentFiles = [];

function renderFiles(files) {
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

async function generate() {
  const requirement = requirementEl.value.trim();
  if (!requirement) {
    statusEl.textContent = "Please describe what you want built first.";
    return;
  }

  generateBtn.disabled = true;
  statusEl.textContent = "Understanding your requirement and building the module... this can take a bit.";
  resultEl.classList.add("hidden");
  downloadLink.classList.add("hidden");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirement,
        projectName: projectNameEl.value.trim() || undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Generation failed.");
    }

    currentFiles = data.files;
    summaryEl.textContent = data.summary;
    renderFiles(data.files);
    downloadLink.href = `/api/download/${data.projectId}`;
    downloadLink.classList.remove("hidden");
    resultEl.classList.remove("hidden");
    statusEl.textContent = `Done — generated ${data.files.length} file(s).`;
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  } finally {
    generateBtn.disabled = false;
  }
}

generateBtn.addEventListener("click", generate);
