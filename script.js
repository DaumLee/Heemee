const itemList = document.getElementById("itemList");
const itemTemplate = document.getElementById("itemTemplate");
const scrollTopBtn = document.getElementById("scrollTopBtn");
const STORAGE_KEY = "audioItemStorage";
const DEFAULT_INFO_TEXT = "BPM: \nKey: \n구성: \n메모: ";
const BPM_PATTERN = /\bbpm\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)/i;
const TIME_SIGNATURE_PATTERNS = [
  { pattern: /\b6\s*\/\s*8\b|six[-\s]?eight/i, value: { label: "6/8", beatsPerMeasure: 6, accents: [0, 3] } },
  { pattern: /\b3\s*\/\s*4\b|three[-\s]?four/i, value: { label: "3/4", beatsPerMeasure: 3, accents: [0] } },
  { pattern: /\b4\s*\/\s*4\b|four[-\s]?four/i, value: { label: "4/4", beatsPerMeasure: 4, accents: [0] } },
];
const DEFAULT_TIME_SIGNATURE = { label: "4/4", beatsPerMeasure: 4, accents: [0] };
let metronomeState = {
  audioContext: null,
  timerId: null,
  activeButton: null,
  activeCard: null,
  beat: 0,
};

const normalizeItem = (item) => ({
  ...item,
  info: item.info ?? DEFAULT_INFO_TEXT,
});

const parseJsonText = (text) => {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
};

const parseBpm = (text = "") => {
  const match = text.match(BPM_PATTERN);
  if (!match) return null;

  const bpm = Number(match[1]);
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return null;
  return bpm;
};

const parseTimeSignature = (text = "") => {
  const found = TIME_SIGNATURE_PATTERNS.find(({ pattern }) => pattern.test(text));
  return found ? found.value : DEFAULT_TIME_SIGNATURE;
};

const getMetronomeConfig = (text = "") => {
  const bpm = parseBpm(text);
  if (!bpm) return null;

  return {
    bpm,
    timeSignature: parseTimeSignature(text),
  };
};

const setMetronomeButtonState = (button, isPlaying) => {
  if (!button) return;
  button.textContent = isPlaying ? "Stop" : "Play";
  button.setAttribute("aria-pressed", String(isPlaying));
};

const stopMetronome = () => {
  if (metronomeState.timerId) {
    clearInterval(metronomeState.timerId);
  }

  setMetronomeButtonState(metronomeState.activeButton, false);
  metronomeState = {
    ...metronomeState,
    timerId: null,
    activeButton: null,
    activeCard: null,
    beat: 0,
  };
};

const playMetronomeClick = ({ timeSignature }) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!metronomeState.audioContext) {
    metronomeState.audioContext = new AudioContextClass();
  }

  const context = metronomeState.audioContext;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const beatInMeasure = metronomeState.beat % timeSignature.beatsPerMeasure;
  const isPrimaryAccent = beatInMeasure === 0;
  const isSecondaryAccent = !isPrimaryAccent && timeSignature.accents.includes(beatInMeasure);

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(isPrimaryAccent ? 1200 : isSecondaryAccent ? 1000 : 760, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(isPrimaryAccent ? 0.28 : isSecondaryAccent ? 0.22 : 0.15, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.06);
  metronomeState.beat += 1;
};

const startMetronome = async (card, button, config) => {
  stopMetronome();

  if (metronomeState.audioContext?.state === "suspended") {
    await metronomeState.audioContext.resume();
  }

  metronomeState.activeButton = button;
  metronomeState.activeCard = card;
  metronomeState.beat = 0;
  setMetronomeButtonState(button, true);

  playMetronomeClick(config);
  metronomeState.timerId = window.setInterval(() => {
    playMetronomeClick(config);
  }, 60000 / config.bpm);
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
  const metronomeBtn = clone.querySelector(".metronome-btn");
  const metronomeBpm = clone.querySelector(".metronome-bpm");
  const infoInput = clone.querySelector(".info");
  const lyricsInput = clone.querySelector(".lyrics");
  const notesInput = clone.querySelector(".notes");

  const updateTitle = () => {
    title.textContent = card.dataset.itemName || "새 항목";
  };

  const syncDragState = () => {
    card.draggable = !card.classList.contains("open");
  };

  const persistCurrentItem = () => {
    persistDomOrder();
  };

  const syncMetronomeControls = () => {
    const config = getMetronomeConfig(infoInput.value);
    metronomeBpm.textContent = config ? `${config.bpm} BPM · ${config.timeSignature.label}` : "No BPM";
    metronomeBtn.disabled = !config;
    metronomeBtn.title = config
      ? `Play metronome at ${config.bpm} BPM in ${config.timeSignature.label}`
      : "Add BPM info first";

    if (!config && metronomeState.activeButton === metronomeBtn) {
      stopMetronome();
    }
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
  autoResizeTextArea(lyricsInput);
  autoResizeTextArea(notesInput);
  syncMetronomeControls();
  if (itemData.audioDataUrl) {
    audioPlayer.src = itemData.audioDataUrl;
  }

  card.addEventListener("dragstart", (event) => {
    if (card.classList.contains("open")) {
      event.preventDefault();
      return;
    }

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
    const shouldOpen = !card.classList.contains("open");
    itemList.querySelectorAll(".item-card.open").forEach((openCard) => {
      if (openCard !== card) {
        openCard.classList.remove("open");
        openCard.draggable = true;
      }
    });
    card.classList.toggle("open", shouldOpen);
    syncDragState();
    if (card.classList.contains("open")) {
      requestAnimationFrame(() => {
        autoResizeTextArea(lyricsInput);
        autoResizeTextArea(notesInput);
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  });

  syncDragState();
  notesInput.addEventListener("input", () => autoResizeTextArea(notesInput));
  notesInput.addEventListener("input", persistCurrentItem);
  infoInput.addEventListener("input", syncMetronomeControls);
  metronomeBtn.addEventListener("click", async () => {
    const config = getMetronomeConfig(infoInput.value);
    if (!config) return;

    if (metronomeState.activeButton === metronomeBtn) {
      stopMetronome();
      return;
    }

    await startMetronome(card, metronomeBtn, config);
  });

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

if (scrollTopBtn) {
  const syncScrollTopButton = () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 240);
  };

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", syncScrollTopButton, { passive: true });
  syncScrollTopButton();
}

const exportJsonBtn = document.getElementById("exportJsonBtn");
const resetLocalBtn = document.getElementById("resetLocalBtn");

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

if (exportJsonBtn) {
  exportJsonBtn.addEventListener("click", () => {
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
