const itemList = document.getElementById("itemList");
const itemTemplate = document.getElementById("itemTemplate");
const scrollTopBtn = document.getElementById("scrollTopBtn");
const STORAGE_KEY = "audioItemStorage";
const TOUCH_DRAG_DELAY = 420;
const TOUCH_MOVE_CANCEL_DISTANCE = 9;
const TOUCH_SCROLL_EDGE_SIZE = 82;
const TOUCH_SCROLL_STEP = 14;
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
  audioPools: null,
  audioPoolIndexes: {
    primary: 0,
    secondary: 0,
    regular: 0,
  },
  timerId: null,
  activeButton: null,
  activeCard: null,
  beat: 0,
};
let touchDragState = null;

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

  Object.values(metronomeState.audioPools || {}).forEach((pool) => {
    pool.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  });

  setMetronomeButtonState(metronomeState.activeButton, false);
  metronomeState = {
    ...metronomeState,
    timerId: null,
    activeButton: null,
    activeCard: null,
    beat: 0,
  };
};

const getMetronomeAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!metronomeState.audioContext) {
    metronomeState.audioContext = new AudioContextClass();
  }

  return metronomeState.audioContext;
};

const getClickKind = (timeSignature) => {
  const beatInMeasure = metronomeState.beat % timeSignature.beatsPerMeasure;
  const isPrimaryAccent = beatInMeasure === 0;
  const isSecondaryAccent = !isPrimaryAccent && timeSignature.accents.includes(beatInMeasure);

  if (isPrimaryAccent) return "primary";
  if (isSecondaryAccent) return "secondary";
  return "regular";
};

const getClickFrequency = (kind) => {
  if (kind === "primary") return 1200;
  if (kind === "secondary") return 1000;
  return 760;
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const writeAscii = (view, offset, text) => {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
};

const createClickWavDataUrl = (frequency, volume) => {
  const sampleRate = 44100;
  const duration = 0.065;
  const sampleCount = Math.floor(sampleRate * duration);
  const headerSize = 44;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(headerSize + sampleCount * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * bytesPerSample, true);

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const progress = sample / sampleCount;
    const attack = Math.min(1, progress / 0.08);
    const decay = Math.max(0, 1 - progress);
    const envelope = attack * decay * decay;
    const wave = Math.sin((2 * Math.PI * frequency * sample) / sampleRate);
    const value = Math.max(-1, Math.min(1, wave * envelope * volume));
    view.setInt16(headerSize + sample * bytesPerSample, value * 0x7fff, true);
  }

  return `data:audio/wav;base64,${bytesToBase64(new Uint8Array(buffer))}`;
};

const createAudioPool = (src) => {
  return Array.from({ length: 4 }, () => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.playsInline = true;
    return audio;
  });
};

const ensureMetronomeMedia = () => {
  if (metronomeState.audioPools) return;

  metronomeState.audioPools = {
    primary: createAudioPool(createClickWavDataUrl(getClickFrequency("primary"), 0.75)),
    secondary: createAudioPool(createClickWavDataUrl(getClickFrequency("secondary"), 0.62)),
    regular: createAudioPool(createClickWavDataUrl(getClickFrequency("regular"), 0.5)),
  };
};

const playMediaClick = (kind) => {
  ensureMetronomeMedia();

  const pool = metronomeState.audioPools?.[kind];
  if (!pool) return false;

  const index = metronomeState.audioPoolIndexes[kind] % pool.length;
  const audio = pool[index];
  metronomeState.audioPoolIndexes[kind] = index + 1;

  audio.pause();
  audio.currentTime = 0;

  const playPromise = audio.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {
      playWebAudioClick(kind);
    });
  }

  return true;
};

const unlockMetronomeAudio = async () => {
  const context = getMetronomeAudioContext();
  if (!context) return null;

  if (context.state === "suspended") {
    await context.resume();
  }

  return context;
};

const playWebAudioClick = (kind) => {
  const context = metronomeState.audioContext;
  if (!context || context.state === "suspended") return;

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(getClickFrequency(kind), now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "primary" ? 0.28 : kind === "secondary" ? 0.22 : 0.15, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.06);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
};

const playMetronomeClick = ({ timeSignature }) => {
  const kind = getClickKind(timeSignature);
  playMediaClick(kind);
  metronomeState.beat += 1;
};

const startMetronome = async (card, button, config) => {
  stopMetronome();

  metronomeState.activeButton = button;
  metronomeState.activeCard = card;
  metronomeState.beat = 0;
  setMetronomeButtonState(button, true);

  playMetronomeClick(config);
  unlockMetronomeAudio().catch((error) => {
    console.error("Metronome fallback audio could not be started.", error);
  });
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

const isDragIgnoredTarget = (target) => {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest("button, input, textarea, audio, label, select, a"));
};

const moveDraggingCard = (card, clientY) => {
  const afterElement = getDragAfterElement(itemList, clientY);
  if (afterElement) {
    itemList.insertBefore(card, afterElement);
  } else {
    itemList.appendChild(card);
  }
};

const scrollNearViewportEdge = (clientY) => {
  if (clientY < TOUCH_SCROLL_EDGE_SIZE) {
    window.scrollBy({ top: -TOUCH_SCROLL_STEP, behavior: "auto" });
  } else if (clientY > window.innerHeight - TOUCH_SCROLL_EDGE_SIZE) {
    window.scrollBy({ top: TOUCH_SCROLL_STEP, behavior: "auto" });
  }
};

const clearTouchDragTimer = () => {
  if (touchDragState?.timerId) {
    clearTimeout(touchDragState.timerId);
  }
};

const beginTouchDrag = () => {
  if (!touchDragState?.card || touchDragState.card.classList.contains("open")) return;

  touchDragState.isDragging = true;
  touchDragState.card.classList.add("dragging", "touch-dragging");
  document.body.classList.add("touch-reordering");
};

const resetTouchDrag = ({ persist = false } = {}) => {
  const activeState = touchDragState;
  clearTouchDragTimer();

  if (activeState?.card) {
    activeState.card.classList.remove("dragging", "touch-dragging");
  }

  document.body.classList.remove("touch-reordering");
  touchDragState = null;

  if (persist && activeState?.isDragging) {
    persistDomOrder();
  }
};

const setupTouchReorder = (card) => {
  card.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1 || card.classList.contains("open") || isDragIgnoredTarget(event.target)) {
        return;
      }

      const touch = event.touches[0];
      clearTouchDragTimer();
      touchDragState = {
        card,
        startX: touch.clientX,
        startY: touch.clientY,
        isDragging: false,
        suppressClick: false,
        timerId: window.setTimeout(beginTouchDrag, TOUCH_DRAG_DELAY),
      };
    },
    { passive: true },
  );

  card.addEventListener(
    "touchmove",
    (event) => {
      if (!touchDragState || touchDragState.card !== card || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - touchDragState.startX;
      const deltaY = touch.clientY - touchDragState.startY;
      const distance = Math.hypot(deltaX, deltaY);

      if (!touchDragState.isDragging && distance > TOUCH_MOVE_CANCEL_DISTANCE) {
        resetTouchDrag();
        return;
      }

      if (!touchDragState.isDragging) return;

      event.preventDefault();
      touchDragState.suppressClick = true;
      moveDraggingCard(card, touch.clientY);
      scrollNearViewportEdge(touch.clientY);
    },
    { passive: false },
  );

  card.addEventListener("touchend", () => {
    const shouldSuppressClick = touchDragState?.card === card && touchDragState.isDragging;
    resetTouchDrag({ persist: shouldSuppressClick });

    if (shouldSuppressClick) {
      card.dataset.suppressNextClick = "true";
      window.setTimeout(() => {
        delete card.dataset.suppressNextClick;
      }, 0);
    }
  });

  card.addEventListener("touchcancel", () => {
    resetTouchDrag();
  });

  card.addEventListener(
    "click",
    (event) => {
      if (card.dataset.suppressNextClick !== "true") return;

      event.preventDefault();
      event.stopPropagation();
      delete card.dataset.suppressNextClick;
    },
    true,
  );
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
  lyricsInput.tabIndex = -1;
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

    if (isDragIgnoredTarget(event.target)) {
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
  setupTouchReorder(card);

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
    moveDraggingCard(draggingCard, event.clientY);
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
