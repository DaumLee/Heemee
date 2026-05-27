const addItemBtn = document.getElementById("addItemBtn");
const themeToggleBtn = document.getElementById("themeToggle");
const itemList = document.getElementById("itemList");
const itemTemplate = document.getElementById("itemTemplate");
const STORAGE_KEY = "audioItemStorage";
const THEME_KEY = "audioItemTheme";

const loadItems = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch (error) {
    console.error("저장된 데이터를 불러오는 중 오류가 발생했습니다.", error);
    return [];
  }
};

const saveItems = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const createItemNode = (itemData = {}) => {
  const clone = itemTemplate.content.cloneNode(true);
  const card = clone.querySelector(".item-card");
  const toggle = clone.querySelector(".item-toggle");
  const titleInput = clone.querySelector(".item-title-input");
  const details = clone.querySelector(".item-details");
  const fileInput = clone.querySelector(".audio-upload");
  const audioPlayer = clone.querySelector(".audio-player");
  const lyricsInput = clone.querySelector(".lyrics");
  const notesInput = clone.querySelector(".notes");
  const saveBtn = clone.querySelector(".save-btn");
  const removeBtn = clone.querySelector(".remove-btn");

  const updateTitle = () => {
    if (titleInput.value.trim()) {
      titleInput.value = titleInput.value.trim();
    }
    titleInput.placeholder = titleInput.value.trim() ? titleInput.value.trim() : "새 항목";
  };

  const loadAudio = (file) => {
    if (!file) {
      audioPlayer.src = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      audioPlayer.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const persistCurrentItem = () => {
    const items = loadItems();
    const updated = items.filter((item) => item.id !== card.dataset.itemId);
    updated.unshift(getCurrentItem());
    saveItems(updated);
  };

  const autoResizeTextArea = (textarea) => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const getCurrentItem = () => ({
    id: card.dataset.itemId,
    name: titleInput.value,
    lyrics: lyricsInput.value,
    notes: notesInput.value,
    audioDataUrl: audioPlayer.src || "",
  });

  card.dataset.itemId = itemData.id || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  titleInput.value = itemData.name || "";
  lyricsInput.value = itemData.lyrics || "";
  notesInput.value = itemData.notes || "";
  updateTitle();
  autoResizeTextArea(lyricsInput);
  autoResizeTextArea(notesInput);
  if (itemData.audioDataUrl) {
    audioPlayer.src = itemData.audioDataUrl;
  }

  toggle.addEventListener("click", () => {
    card.classList.toggle("open");
    if (card.classList.contains("open")) {
      requestAnimationFrame(() => {
        autoResizeTextArea(lyricsInput);
        autoResizeTextArea(notesInput);
      });
    }
  });

  titleInput.addEventListener("input", updateTitle);
  titleInput.addEventListener("input", persistCurrentItem);
  titleInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  lyricsInput.addEventListener("input", () => autoResizeTextArea(lyricsInput));
  lyricsInput.addEventListener("input", persistCurrentItem);
  notesInput.addEventListener("input", () => autoResizeTextArea(notesInput));
  notesInput.addEventListener("input", persistCurrentItem);

  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    loadAudio(file);
    persistCurrentItem();
  });

  saveBtn.addEventListener("click", () => {
    const items = loadItems();
    const updated = items.filter((item) => item.id !== card.dataset.itemId);
    updated.unshift(getCurrentItem());
    saveItems(updated);
    alert("항목이 저장되었습니다.");
  });

  removeBtn.addEventListener("click", () => {
    const items = loadItems().filter((item) => item.id !== card.dataset.itemId);
    saveItems(items);
    card.remove();
  });

  persistCurrentItem();

  return clone;
};

const setTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, theme);
};

const loadTheme = () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferred = savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(preferred);
};

const renderItems = () => {
  itemList.innerHTML = "";
  const items = loadItems();
  if (items.length === 0) {
    itemList.innerHTML = `<p class="empty-state">새 항목을 추가해보세요.</p>`;
    return;
  }

  items.forEach((item) => {
    const node = createItemNode(item);
    itemList.appendChild(node);
  });
};

addItemBtn.addEventListener("click", () => {
  const node = createItemNode({});
  itemList.prepend(node);
  const card = itemList.querySelector(".item-card");
  if (card) {
    card.classList.add("open");
  }
});

themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === "dark" ? "light" : "dark");
});

// --- GitHub 저장 관련 UI 핸들러 ---
const githubSaveBtn = document.getElementById("githubSaveBtn");
const githubModal = document.getElementById("githubModal");
const ghSaveBtn = document.getElementById("ghSaveBtn");
const ghCloseBtn = document.getElementById("ghCloseBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const ghOwner = document.getElementById("ghOwner");
const ghRepo = document.getElementById("ghRepo");
const ghBranch = document.getElementById("ghBranch");
const ghPath = document.getElementById("ghPath");
const ghMessage = document.getElementById("ghMessage");
const ghToken = document.getElementById("ghToken");

if (githubSaveBtn) {
  githubSaveBtn.addEventListener("click", () => {
    githubModal && githubModal.setAttribute("aria-hidden", "false");
  });
}

if (ghCloseBtn) {
  ghCloseBtn.addEventListener("click", () => {
    githubModal && githubModal.setAttribute("aria-hidden", "true");
  });
}

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const items = loadItems();
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "items.json";
    a.click();
    URL.revokeObjectURL(url);
  });
}

if (importBtn && importFile) {
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        saveItems(data);
        renderItems();
        alert("JSON을 불러왔습니다.");
        githubModal && githubModal.setAttribute("aria-hidden", "true");
      } catch (err) {
        alert("잘못된 JSON 파일입니다.");
      }
    };
    reader.readAsText(file);
  });
}

async function githubSaveToRepo(items, token, owner, repo, branch, path, message) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  let sha = null;
  try {
    const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`, {
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (getResp.ok) {
      const d = await getResp.json();
      sha = d.sha;
    }
  } catch (e) {}

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(items, null, 2))));
  const body = { message: message || "Update items", content, branch };
  if (sha) body.sha = sha;

  const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
    body: JSON.stringify(body),
  });
  return putResp;
}

if (ghSaveBtn) {
  ghSaveBtn.addEventListener("click", async () => {
    const owner = ghOwner.value.trim();
    const repo = ghRepo.value.trim();
    const branch = (ghBranch.value || "main").trim();
    const path = (ghPath.value || "data/items.json").trim();
    const message = ghMessage.value.trim() || "Update items";
    const token = ghToken.value.trim();
    if (!owner || !repo || !token) { alert("Owner, repo, token 정보를 입력하세요."); return; }
    const items = loadItems();
    ghSaveBtn.disabled = true;
    try {
      const resp = await githubSaveToRepo(items, token, owner, repo, branch, path, message);
      if (resp.ok) {
        alert("GitHub에 저장되었습니다.");
        githubModal && githubModal.setAttribute("aria-hidden", "true");
      } else {
        const txt = await resp.text();
        alert("저장 실패: " + resp.status + "\n" + txt);
      }
    } catch (err) { alert("오류: " + err.message); }
    ghSaveBtn.disabled = false;
  });
}

// Load theme, then ensure initial items are available (from localStorage or external file)
async function loadInitialData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved.length) {
    renderItems();
    return;
  }

  try {
    const resp = await fetch("data/items.json", { cache: "no-store" });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) {
        saveItems(data);
        renderItems();
        return;
      }
    }
  } catch (err) {
    console.warn("Could not load external data/items.json:", err);
  }

  // Fallback to rendering (empty state)
  renderItems();
}

loadTheme();
loadInitialData();
