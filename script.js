const itemList = document.getElementById("itemList");
const itemTemplate = document.getElementById("itemTemplate");
const STORAGE_KEY = "audioItemStorage";
const DEFAULT_INFO_TEXT = "BPM: \nKey: \n구성: \n메모: ";

const normalizeItem = (item) => ({
  ...item,
  info: item.info ?? DEFAULT_INFO_TEXT,
});

const parseJsonText = (text) => {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
};

const loadItems = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];
  try {
    const parsed = parseJsonText(saved);
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch (error) {
    console.error("저장된 데이터를 불러오는 중 오류가 발생했습니다.", error);
    return [];
  }
};

const saveItems = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const getItemDataFromCard = (card) => ({
  id: card.dataset.itemId,
  name: card.dataset.itemName || "",
  info: card.querySelector(".info")?.value || "",
  lyrics: card.querySelector(".lyrics")?.value || "",
  notes: card.querySelector(".notes")?.value || "",
  audioDataUrl: card.querySelector(".audio-player")?.src || "",
});

const getItemsFromDom = () => {
  return [...itemList.querySelectorAll(".item-card")].map(getItemDataFromCard);
};

const persistDomOrder = () => {
  saveItems(getItemsFromDom());
};

const createItemNode = (itemData = {}) => {
  const clone = itemTemplate.content.cloneNode(true);
  const card = clone.querySelector(".item-card");
  const toggle = clone.querySelector(".item-toggle");
  const title = clone.querySelector(".item-title");
  const details = clone.querySelector(".item-details");
  const audioPlayer = clone.querySelector(".audio-player");
  const infoInput = clone.querySelector(".info");
  const lyricsInput = clone.querySelector(".lyrics");
  const notesInput = clone.querySelector(".notes");

  const updateTitle = () => {
    title.textContent = card.dataset.itemName || "새 항목";
  };

  const persistCurrentItem = () => {
    persistDomOrder();
  };

  const autoResizeTextArea = (textarea) => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const getCurrentItem = () => ({
    id: card.dataset.itemId,
    name: card.dataset.itemName || "",
    info: infoInput.value,
    lyrics: lyricsInput.value,
    notes: notesInput.value,
    audioDataUrl: audioPlayer.src || "",
  });

  card.dataset.itemId = itemData.id || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  card.dataset.itemName = itemData.name || "";
  infoInput.value = itemData.info ?? DEFAULT_INFO_TEXT;
  lyricsInput.value = itemData.lyrics || "";
  notesInput.value = itemData.notes || "";
  updateTitle();
  autoResizeTextArea(infoInput);
  autoResizeTextArea(lyricsInput);
  autoResizeTextArea(notesInput);
  if (itemData.audioDataUrl) {
    audioPlayer.src = itemData.audioDataUrl;
  }

  card.addEventListener("dragstart", (event) => {
    if (event.target.closest("button, input, textarea, audio, label")) {
      event.preventDefault();
      return;
    }

    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.itemId);
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    persistDomOrder();
  });

  toggle.addEventListener("click", () => {
    card.classList.toggle("open");
    if (card.classList.contains("open")) {
      requestAnimationFrame(() => {
        autoResizeTextArea(lyricsInput);
        autoResizeTextArea(infoInput);
        autoResizeTextArea(notesInput);
      });
    }
  });

  notesInput.addEventListener("input", () => autoResizeTextArea(notesInput));
  notesInput.addEventListener("input", persistCurrentItem);

  return clone;
};

const getDragAfterElement = (container, y) => {
  const cards = [...container.querySelectorAll(".item-card:not(.dragging)")];

  return cards.reduce(
    (closest, card) => {
      const box = card.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset, element: card };
      }

      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
};

const loadTheme = () => {
  const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const syncTheme = () => {
    document.documentElement.dataset.theme = themeQuery.matches ? "dark" : "light";
  };

  syncTheme();
  if (themeQuery.addEventListener) {
    themeQuery.addEventListener("change", syncTheme);
  } else if (themeQuery.addListener) {
    themeQuery.addListener(syncTheme);
  }
};

const renderItems = () => {
  itemList.innerHTML = "";
  const items = loadItems();
  if (items.length === 0) {
    itemList.innerHTML = `<p class="empty-state">표시할 음원 데이터를 불러오지 못했습니다.</p>`;
    return;
  }

  items.forEach((item) => {
    const node = createItemNode(item);
    itemList.appendChild(node);
  });
};

if (itemList) {
  itemList.addEventListener("dragover", (event) => {
    const draggingCard = itemList.querySelector(".item-card.dragging");
    if (!draggingCard) return;

    event.preventDefault();
    const afterElement = getDragAfterElement(itemList, event.clientY);
    if (afterElement) {
      itemList.insertBefore(draggingCard, afterElement);
    } else {
      itemList.appendChild(draggingCard);
    }
  });

  itemList.addEventListener("drop", (event) => {
    event.preventDefault();
    persistDomOrder();
  });
}

// --- GitHub 저장 관련 UI 핸들러 ---
const githubSaveBtn = document.getElementById("githubSaveBtn");
const resetLocalBtn = document.getElementById("resetLocalBtn");
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

const exportItemsJson = () => {
  const items = loadItems();
  const data = JSON.stringify(items, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "items.json";
  a.click();
  URL.revokeObjectURL(url);
};

if (githubSaveBtn) {
  githubSaveBtn.addEventListener("click", () => {
    const shouldExport = confirm("현재 항목을 JSON 파일로 내보낼까요?");
    if (shouldExport) {
      exportItemsJson();
    }
  });
}

if (resetLocalBtn) {
  resetLocalBtn.addEventListener("click", async () => {
    const shouldReset = confirm("로컬에 저장된 수정사항을 지우고 JSON 파일에서 다시 불러올까요?");
    if (!shouldReset) return;

    resetLocalBtn.disabled = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("audioItemTheme");
      await loadInitialData();
    } finally {
      resetLocalBtn.disabled = false;
    }
  });
}

if (ghCloseBtn) {
  ghCloseBtn.addEventListener("click", () => {
    githubModal && githubModal.setAttribute("aria-hidden", "true");
  });
}

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportItemsJson();
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
        const data = parseJsonText(reader.result);
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
  if (!itemList || !itemTemplate) {
    console.error("Required item list elements are missing.");
    return;
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved.length) {
    renderItems();
    return;
  }

  try {
    const resp = await fetch("data/items.json", { cache: "no-store" });
    if (resp.ok) {
      const data = parseJsonText(await resp.text());
      if (Array.isArray(data)) {
        saveItems(data.map(normalizeItem));
        renderItems();
        return;
      }
    }
    console.warn("Could not load data/items.json:", resp.status, resp.statusText);
  } catch (err) {
    console.warn("Could not load external data/items.json:", err);
  }

  // Fallback to rendering (empty state)
  renderItems();
}

try {
  loadTheme();
} catch (error) {
  console.warn("Could not sync theme:", error);
}
loadInitialData();
