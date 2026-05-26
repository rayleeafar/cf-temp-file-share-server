/* =============================================
   Temp File Server — Dark Tech Frontend
   All existing functionality preserved plus
   enhanced loading/error/empty states.
   ============================================= */

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

// --- DOM References ---
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const expirySelect = document.getElementById("expirySelect");
const uploadBtn = document.getElementById("uploadBtn");
const uploadBtnText = document.querySelector(".upload-btn-text");
const uploadSpinner = document.getElementById("uploadSpinner");
const status = document.getElementById("status");
const result = document.getElementById("result");
const shareLink = document.getElementById("shareLink");
const copyBtn = document.getElementById("copyBtn");
const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const tokenInput = document.getElementById("tokenInput");
const tokenBadge = document.getElementById("tokenBadge");
const fileList = document.getElementById("fileList");
const fileListBody = document.getElementById("fileListBody");
const fileListLoader = document.getElementById("fileListLoader");
const fileListEmpty = document.getElementById("fileListEmpty");
const fileListError = document.getElementById("fileListError");
const fileListErrorMsg = document.getElementById("fileListErrorMsg");

let selectedFile = null;

// =============================================
// Token Settings
// =============================================
let authToken = localStorage.getItem("authToken") || "";
if (authToken) {
  tokenInput.value = authToken;
  updateTokenBadge();
  loadFileList();
}

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

tokenInput.addEventListener("input", () => {
  authToken = tokenInput.value.trim();
  if (authToken) {
    localStorage.setItem("authToken", authToken);
  } else {
    localStorage.removeItem("authToken");
  }
  updateTokenBadge();
  loadFileList();
});

function updateTokenBadge() {
  if (authToken) {
    const display = authToken.length > 6
      ? authToken.slice(0, 3) + "***" + authToken.slice(-1)
      : authToken.slice(0, 3) + "***";
    tokenBadge.textContent = display;
    tokenBadge.classList.remove("hidden");
  } else {
    tokenBadge.classList.add("hidden");
  }
}

// =============================================
// Drag & Drop
// =============================================
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFileSelect(files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    handleFileSelect(fileInput.files[0]);
  }
});

function handleFileSelect(file) {
  if (file.size > MAX_SIZE) {
    showStatus("File exceeds the 25 MB size limit.", "error");
    selectedFile = null;
    uploadBtn.disabled = true;
    dropZone.classList.remove("has-file");
    dropZone.querySelector(".drop-text").textContent = "Drag & drop a file here, or click to select";
    return;
  }

  selectedFile = file;
  uploadBtn.disabled = false;
  dropZone.classList.add("has-file");
  dropZone.querySelector(".drop-text").textContent = file.name;
  hideStatus();
  hideResult();
}

// =============================================
// Upload
// =============================================
uploadBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  uploadBtn.disabled = true;
  uploadBtn.classList.add("loading");
  uploadBtnText.textContent = "Uploading...";
  uploadSpinner.classList.remove("hidden");
  hideStatus();
  hideResult();

  const formData = new FormData();
  formData.append("file", selectedFile);

  if (authToken) {
    formData.append("authToken", authToken);
  }

  const expiresIn = expirySelect.value;
  if (expiresIn !== "") {
    formData.append("expiresIn", expiresIn);
  }

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed." }));
      throw new Error(err.error || `Upload failed (HTTP ${res.status})`);
    }

    const data = await res.json();
    shareLink.value = data.url;
    result.classList.remove("hidden");
    showStatus("File uploaded successfully!", "success");
    loadFileList();
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.classList.remove("loading");
    uploadBtnText.textContent = "Upload";
    uploadSpinner.classList.add("hidden");
  }
});

// =============================================
// Copy Link
// =============================================
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareLink.value);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
  } catch {
    shareLink.select();
    document.execCommand("copy");
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
  }
});

// =============================================
// Status Helpers
// =============================================
function showStatus(msg, type) {
  status.textContent = msg;
  status.className = `status ${type}`;
}

function hideStatus() {
  status.className = "status hidden";
}

function hideResult() {
  result.className = "result hidden";
}

// =============================================
// Formatting Helpers
// =============================================
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function formatExpires(expiresAt) {
  if (!expiresAt) return "Never";
  const diff = expiresAt - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Expired";
  if (diff < 3600) return Math.ceil(diff / 60) + " min";
  if (diff < 86400) return Math.ceil(diff / 3600) + " hours";
  return Math.ceil(diff / 86400) + " days";
}

// =============================================
// File List
// =============================================
async function loadFileList() {
  // Clear previous content
  fileListBody.innerHTML = "";
  fileListEmpty.classList.add("hidden");
  fileListError.classList.add("hidden");
  fileListLoader.classList.add("hidden");
  fileList.classList.remove("hidden");

  if (!authToken) {
    fileListBody.innerHTML = '<p class="file-list-empty">Set a token in Settings to view your shared files.</p>';
    return;
  }

  // Show loading state
  fileListLoader.classList.remove("hidden");

  try {
    const res = await fetch("/api/files?token=" + encodeURIComponent(authToken));
    fileListLoader.classList.add("hidden");

    if (!res.ok) {
      fileListErrorMsg.textContent = "Failed to load file list (HTTP " + res.status + ").";
      fileListError.classList.remove("hidden");
      return;
    }

    const data = await res.json();

    if (!data.files || data.files.length === 0) {
      fileListEmpty.classList.remove("hidden");
      return;
    }

    for (const file of data.files) {
      const row = document.createElement("div");
      row.className = "file-row";

      const nameSpan = document.createElement("span");
      nameSpan.className = "file-name";
      nameSpan.textContent = file.filename;
      nameSpan.title = file.filename;

      const metaSpan = document.createElement("span");
      metaSpan.className = "file-meta";
      metaSpan.textContent = formatSize(file.size) + " | " + file.type + " | " + formatExpires(file.expiresAt);

      const copyLinkBtn = document.createElement("button");
      copyLinkBtn.className = "file-copy-btn";
      copyLinkBtn.textContent = "Copy Link";
      copyLinkBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(file.url);
          copyLinkBtn.textContent = "Copied!";
          copyLinkBtn.classList.add("copied");
          setTimeout(() => {
            copyLinkBtn.textContent = "Copy Link";
            copyLinkBtn.classList.remove("copied");
          }, 2000);
        } catch {
          const temp = document.createElement("input");
          temp.value = file.url;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          document.body.removeChild(temp);
          copyLinkBtn.textContent = "Copied!";
          setTimeout(() => { copyLinkBtn.textContent = "Copy Link"; }, 2000);
        }
      });

      row.appendChild(nameSpan);
      row.appendChild(metaSpan);
      row.appendChild(copyLinkBtn);
      fileListBody.appendChild(row);
    }
  } catch (err) {
    fileListLoader.classList.add("hidden");
    fileListErrorMsg.textContent = "Network error loading file list.";
    fileListError.classList.remove("hidden");
  }
}
