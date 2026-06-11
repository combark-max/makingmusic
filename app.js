const API_BASE = "https://api.sunoapi.org";
const KEY_STORAGE = "waveroom.apiKey";
const LAST_TASK_STORAGE = "waveroom.lastTask";

const state = {
  apiKey: localStorage.getItem(KEY_STORAGE) || "",
  taskId: localStorage.getItem(LAST_TASK_STORAGE) || "",
  pollTimer: null,
  busy: false
};

const $ = (selector) => document.querySelector(selector);

const form = $("#composerForm");
const settingsDialog = $("#settingsDialog");
const apiKeyInput = $("#apiKey");
const rememberKey = $("#rememberKey");
const generateButton = $("#generateButton");
const refreshButton = $("#refreshButton");
const taskCard = $("#taskCard");
const taskStatus = $("#taskStatus");
const taskIdText = $("#taskIdText");
const meterBar = $("#meterBar");
const tracks = $("#tracks");
const statusLabel = $("#statusLabel");
const statusCopy = $("#statusCopy");

const statusProgress = {
  PENDING: 18,
  TEXT_SUCCESS: 42,
  FIRST_SUCCESS: 72,
  SUCCESS: 100,
  CREATE_TASK_FAILED: 100,
  GENERATE_AUDIO_FAILED: 100,
  CALLBACK_EXCEPTION: 100,
  SENSITIVE_WORD_ERROR: 100
};

function setStatus(label, copy, tone = "normal") {
  statusLabel.textContent = label;
  statusCopy.textContent = copy;
  statusLabel.style.color = tone === "error" ? "var(--danger)" : "var(--lime)";
}

function showTask(taskId, status = "PENDING") {
  state.taskId = taskId;
  localStorage.setItem(LAST_TASK_STORAGE, taskId);
  taskCard.hidden = false;
  taskStatus.textContent = status;
  taskIdText.textContent = taskId;
  meterBar.style.width = `${statusProgress[status] || 18}%`;
}

function getApiKey() {
  const key = state.apiKey || apiKeyInput.value.trim();
  if (!key) {
    settingsDialog.showModal();
    throw new Error("API 키를 먼저 저장해 주세요.");
  }
  return key;
}

function buildPayload() {
  const customMode = new FormData(form).get("customMode") === "true";
  const instrumental = $("#instrumental").checked;
  const payload = {
    customMode,
    instrumental,
    model: $("#model").value,
    callBackUrl: $("#callbackUrl").value.trim() || "https://example.com/callback",
    prompt: $("#prompt").value.trim()
  };

  if (customMode) {
    payload.title = $("#title").value.trim();
    payload.style = $("#style").value.trim();
    payload.negativeTags = $("#negativeTags").value.trim();
    payload.styleWeight = Number($("#styleWeight").value);
    payload.weirdnessConstraint = Number($("#weirdness").value);
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === "") delete payload[key];
  });

  validatePayload(payload);
  return payload;
}

function validatePayload(payload) {
  if (!payload.prompt && !payload.customMode) {
    throw new Error("간단 모드에서는 곡 아이디어가 필요합니다.");
  }
  if (payload.customMode && !payload.title) {
    throw new Error("커스텀 모드에서는 제목이 필요합니다.");
  }
  if (payload.customMode && !payload.style) {
    throw new Error("커스텀 모드에서는 스타일이 필요합니다.");
  }
  if (payload.customMode && !payload.instrumental && !payload.prompt) {
    throw new Error("보컬 곡 커스텀 모드에서는 가사 또는 프롬프트가 필요합니다.");
  }
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Authorization": `Bearer ${getApiKey()}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 200) {
    throw new Error(data.msg || `요청 실패: ${response.status}`);
  }
  return data;
}

async function generateMusic(event) {
  event.preventDefault();
  if (state.busy) return;

  try {
    state.busy = true;
    generateButton.disabled = true;
    setStatus("Creating", "SunoAPI에 생성 요청을 보내는 중입니다.");

    const data = await apiFetch("/api/v1/generate", {
      method: "POST",
      body: JSON.stringify(buildPayload())
    });

    const taskId = data.data?.taskId;
    if (!taskId) throw new Error("taskId가 응답에 없습니다.");

    showTask(taskId, "PENDING");
    renderEmpty("생성 작업이 시작되었습니다. 첫 스트림은 보통 30-40초 뒤 준비됩니다.");
    setStatus("Queued", "작업이 등록되었습니다. 결과를 자동으로 확인합니다.");
    startPolling();
  } catch (error) {
    setStatus("Error", error.message, "error");
  } finally {
    state.busy = false;
    generateButton.disabled = false;
  }
}

async function refreshTask() {
  if (!state.taskId) {
    renderEmpty("확인할 작업이 없습니다.");
    return;
  }

  try {
    setStatus("Checking", "생성 상태를 확인하고 있습니다.");
    const data = await apiFetch(`/api/v1/generate/record-info?taskId=${encodeURIComponent(state.taskId)}`, {
      method: "GET"
    });
    const record = data.data || {};
    const status = record.status || "PENDING";
    showTask(record.taskId || state.taskId, status);

    const songs = record.response?.sunoData || [];
    if (songs.length) renderTracks(songs);

    if (status === "SUCCESS") {
      stopPolling();
      setStatus("Complete", "트랙 생성이 완료되었습니다.");
    } else if (status.includes("FAILED") || status.includes("ERROR") || status === "CALLBACK_EXCEPTION") {
      stopPolling();
      setStatus("Failed", record.errorMessage || status, "error");
    } else {
      setStatus(status, "아직 생성 중입니다. 잠시 후 다시 확인합니다.");
    }
  } catch (error) {
    setStatus("Error", error.message, "error");
  }
}

function startPolling() {
  stopPolling();
  refreshTask();
  state.pollTimer = window.setInterval(refreshTask, 15000);
}

function stopPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function renderEmpty(text) {
  tracks.innerHTML = `<article class="empty-state"><p>${escapeHtml(text)}</p></article>`;
}

function renderTracks(songs) {
  tracks.innerHTML = "";
  const template = $("#trackTemplate");
  songs.forEach((song, index) => {
    const node = template.content.cloneNode(true);
    const title = song.title || `Track ${index + 1}`;
    const audioUrl = song.audioUrl || song.streamAudioUrl || "";
    node.querySelector(".cover").src = song.imageUrl || "./icon.svg";
    node.querySelector(".cover").alt = `${title} cover`;
    node.querySelector("h3").textContent = title;
    node.querySelector(".track-meta").textContent = [song.tags, formatDuration(song.duration)].filter(Boolean).join(" · ");
    node.querySelector("audio").src = audioUrl;
    node.querySelector(".lyrics pre").textContent = song.prompt || "표시할 가사가 없습니다.";
    node.querySelector(".download").href = audioUrl;
    node.querySelector(".download").hidden = !audioUrl;
    tracks.appendChild(node);
  });
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function bindSettings() {
  $("#settingsButton").addEventListener("click", () => {
    apiKeyInput.value = state.apiKey;
    settingsDialog.showModal();
  });

  $("#saveKeyButton").addEventListener("click", () => {
    state.apiKey = apiKeyInput.value.trim();
    if (rememberKey.checked) localStorage.setItem(KEY_STORAGE, state.apiKey);
    else localStorage.removeItem(KEY_STORAGE);
    setStatus("Ready", state.apiKey ? "API 키가 준비되었습니다." : "API 키 없이 저장했습니다.");
  });

  $("#clearKeyButton").addEventListener("click", () => {
    state.apiKey = "";
    apiKeyInput.value = "";
    localStorage.removeItem(KEY_STORAGE);
    setStatus("Ready", "저장된 API 키를 삭제했습니다.");
  });
}

function bindSliders() {
  [
    ["#styleWeight", "#styleWeightValue"],
    ["#weirdness", "#weirdnessValue"]
  ].forEach(([inputSelector, outputSelector]) => {
    const input = $(inputSelector);
    const output = $(outputSelector);
    input.addEventListener("input", () => {
      output.value = Number(input.value).toFixed(2);
    });
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

bindSettings();
bindSliders();
form.addEventListener("submit", generateMusic);
refreshButton.addEventListener("click", refreshTask);

if (state.taskId) {
  showTask(state.taskId, "PENDING");
}
