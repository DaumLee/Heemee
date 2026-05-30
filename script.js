const itemList = document.getElementById("itemList");
const itemTemplate = document.getElementById("itemTemplate");
const scrollTopBtn = document.getElementById("scrollTopBtn");
const STORAGE_KEY = "audioItemStorage";
const EIGHTH_NOTE_MODE_KEY = "heemeeEighthNoteMode";
const TOUCH_DRAG_DELAY = 420;
const TOUCH_MOVE_CANCEL_DISTANCE = 9;
const TOUCH_SCROLL_EDGE_SIZE = 82;
const TOUCH_SCROLL_STEP = 14;
const GITHUB_LFS_MEDIA_BASE_URL = "https://media.githubusercontent.com/media/DaumLee/Heemee/main/";
const DEFAULT_INFO_TEXT = "BPM: \nKey: \n구성: \n메모: ";
const metronome = window.HeemeeMetronome;
let touchDragState = null;
let eighthNoteMode = localStorage.getItem(EIGHTH_NOTE_MODE_KEY) === "true";
let activeAudioPlayer = null;

const normalizeItem = (item) => ({
  ...item,
  info: item.info ?? DEFAULT_INFO_TEXT,
});

const mergeFileAudioUrls = (savedItems, fileItems) => {
  const audioUrlById = new Map(
    fileItems
      .filter((item) => item.id && item.audioDataUrl)
      .map((item) => [item.id, item.audioDataUrl]),
  );

  let changed = false;
  const mergedItems = savedItems.map((item) => {
    const fileAudioUrl = audioUrlById.get(item.id);
    if (!fileAudioUrl || item.audioDataUrl === fileAudioUrl) {
      return item;
    }

    changed = true;
    return {
      ...item,
      audioDataUrl: fileAudioUrl,
    };
  });

  return { changed, items: mergedItems };
};

const parseJsonText = (text) => {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
};

const formatAudioTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
};

const getAudioSourceUrl = (audioDataUrl) => {
  if (!audioDataUrl) return "";
  if (/^https?:\/\//i.test(audioDataUrl)) return audioDataUrl;
  if (window.location.hostname.endsWith("github.io") && audioDataUrl.startsWith("audio/")) {
    return `${GITHUB_LFS_MEDIA_BASE_URL}${audioDataUrl}`;
  }
  return audioDataUrl;
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
  audioDataUrl: card.querySelector(".audio-player")?.dataset.audioDataUrl || "",
});

const getItemsFromDom = () => {
  return [...itemList.querySelectorAll(".item-card")].map(getItemDataFromCard);
};

const persistDomOrder = () => {
  saveItems(getItemsFromDom());
};

const getMetronomeOptions = () => ({
  eighthNoteMode,
});

const syncAllMetronomeControls = () => {
  itemList?.querySelectorAll(".item-card").forEach((card) => {
    card.syncMetronomeControls?.();
  });
};

const stopAudioPlayer = (audioPlayer, { reset = true } = {}) => {
  audioPlayer.pause();
  if (reset) {
    audioPlayer.currentTime = 0;
  }
  audioPlayer.closest(".item-card")?.syncAudioControls?.();
};

const stopOtherAudioPlayers = (currentAudioPlayer) => {
  itemList?.querySelectorAll(".audio-player").forEach((audioPlayer) => {
    if (audioPlayer !== currentAudioPlayer && !audioPlayer.paused) {
      stopAudioPlayer(audioPlayer);
    }
  });
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
  const audioRow = clone.querySelector(".audio-row");
  const audioPlayer = clone.querySelector(".audio-player");
  const audioToggleBtn = clone.querySelector(".audio-toggle-btn");
  const audioInlineToggleBtn = clone.querySelector(".audio-inline-toggle-btn");
  const audioSeek = clone.querySelector(".audio-seek");
  const audioTime = clone.querySelector(".audio-time");
  const bpmText = clone.querySelector(".item-bpm");
  const metronomeBtn = clone.querySelector(".metronome-btn");
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

  const syncAudioControls = () => {
    const hasAudio = Boolean(audioPlayer.dataset.audioDataUrl);
    const isPlaying = hasAudio && !audioPlayer.paused && !audioPlayer.ended;
    const duration = audioPlayer.duration || 0;
    const currentTime = audioPlayer.currentTime || 0;
    const seekValue = duration ? (currentTime / duration) * 100 : 0;

    audioToggleBtn.disabled = !hasAudio;
    audioToggleBtn.setAttribute("aria-pressed", String(isPlaying));
    audioToggleBtn.setAttribute("aria-label", isPlaying ? "오디오 정지" : "오디오 재생");
    audioToggleBtn.title = hasAudio ? (isPlaying ? "오디오 정지" : "오디오 재생") : "오디오 없음";
    audioInlineToggleBtn.disabled = !hasAudio;
    audioInlineToggleBtn.setAttribute("aria-pressed", String(isPlaying));
    audioInlineToggleBtn.setAttribute("aria-label", isPlaying ? "오디오 정지" : "오디오 재생");
    audioSeek.disabled = !hasAudio || !duration;
    audioSeek.value = String(seekValue);
    audioTime.textContent = `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`;
  };

  const toggleAudioPlayback = async () => {
    if (!audioPlayer.dataset.audioDataUrl) return;

    if (!audioPlayer.paused && !audioPlayer.ended) {
      stopAudioPlayer(audioPlayer);
      if (activeAudioPlayer === audioPlayer) {
        activeAudioPlayer = null;
      }
      return;
    }

    stopOtherAudioPlayers(audioPlayer);
    await audioPlayer.play();
  };

  const syncMetronomeControls = () => {
    const config = metronome.getConfig(infoInput.value, getMetronomeOptions());
    bpmText.textContent = config ? `${config.bpm} BPM` : "";
    bpmText.hidden = !config;
    metronomeBtn.disabled = !config;
    metronomeBtn.title = config
      ? `${config.bpm} BPM ${config.timeSignature.label} 메트로놈`
      : "BPM 정보가 없습니다";

    if (!config && metronome.isActiveButton(metronomeBtn)) {
      metronome.stop();
    }
  };

  const autoResizeTextArea = (textarea) => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

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
  const hasAudio = Boolean(itemData.audioDataUrl);
  if (hasAudio) {
    audioPlayer.dataset.audioDataUrl = itemData.audioDataUrl;
    audioPlayer.src = getAudioSourceUrl(itemData.audioDataUrl);
    syncAudioControls();
  } else {
    audioToggleBtn.remove();
    audioRow.remove();
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
  if (hasAudio) {
    audioToggleBtn.addEventListener("click", toggleAudioPlayback);
    audioInlineToggleBtn.addEventListener("click", toggleAudioPlayback);
    audioSeek.addEventListener("input", () => {
      if (!audioPlayer.duration) return;

      audioPlayer.currentTime = (Number(audioSeek.value) / 100) * audioPlayer.duration;
      syncAudioControls();
    });
    audioPlayer.addEventListener("play", () => {
      stopOtherAudioPlayers(audioPlayer);
      activeAudioPlayer = audioPlayer;
      syncAudioControls();
    });
    audioPlayer.addEventListener("pause", syncAudioControls);
    audioPlayer.addEventListener("timeupdate", syncAudioControls);
    audioPlayer.addEventListener("loadedmetadata", syncAudioControls);
    audioPlayer.addEventListener("ended", () => {
      if (activeAudioPlayer === audioPlayer) {
        activeAudioPlayer = null;
      }
      syncAudioControls();
    });
  }
  metronomeBtn.addEventListener("click", async () => {
    const config = metronome.getConfig(infoInput.value, getMetronomeOptions());
    if (!config) return;

    if (metronome.isActiveButton(metronomeBtn)) {
      metronome.stop();
      return;
    }

    await metronome.start(card, metronomeBtn, config);
  });

  card.syncMetronomeControls = syncMetronomeControls;
  card.syncAudioControls = syncAudioControls;

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
const eighthNoteToggleBtn = document.getElementById("eighthNoteToggleBtn");

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

if (eighthNoteToggleBtn) {
  const syncEighthNoteToggle = () => {
    eighthNoteToggleBtn.setAttribute("aria-pressed", String(eighthNoteMode));
    eighthNoteToggleBtn.setAttribute("aria-label", eighthNoteMode ? "4분 음표로 전환" : "8분 음표로 전환");
    eighthNoteToggleBtn.title = eighthNoteMode ? "4분 음표로 전환" : "8분 음표로 전환";
  };

  eighthNoteToggleBtn.addEventListener("click", () => {
    eighthNoteMode = !eighthNoteMode;
    localStorage.setItem(EIGHTH_NOTE_MODE_KEY, String(eighthNoteMode));
    syncEighthNoteToggle();
    metronome.stop();
    syncAllMetronomeControls();
  });

  syncEighthNoteToggle();
}

// Load theme, then ensure initial items are available from localStorage or data/items.json.
async function loadInitialData() {
  if (!itemList || !itemTemplate) {
    console.error("Required item list elements are missing.");
    return;
  }

  const saved = localStorage.getItem(STORAGE_KEY);

  try {
    const resp = await fetch("data/items.json", { cache: "no-store" });
    if (resp.ok) {
      const data = parseJsonText(await resp.text());
      if (Array.isArray(data)) {
        const fileItems = data.map(normalizeItem);

        if (saved && saved.length) {
          const savedItems = loadItems();
          if (savedItems.length === 0) {
            saveItems(fileItems);
            renderItems();
            return;
          }

          const merged = mergeFileAudioUrls(savedItems, fileItems);
          if (merged.changed) {
            saveItems(merged.items);
          }
          renderItems();
          return;
        }

        saveItems(fileItems);
        renderItems();
        return;
      }
    }
    console.warn("Could not load data/items.json:", resp.status, resp.statusText);
  } catch (err) {
    console.warn("Could not load data/items.json:", err);
  }

  // Fallback to rendering (empty state)
  renderItems();
}

try {
  loadTheme();
  metronome.ensureMedia();
} catch (error) {
  console.warn("Could not sync theme:", error);
}
loadInitialData();
