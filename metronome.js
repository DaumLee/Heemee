const HeemeeMetronome = (() => {
  const BPM_PATTERN = /\bbpm\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)/i;
  const TIME_SIGNATURE_PATTERNS = [
    { pattern: /\b8\s*\/\s*8\b|eight[-\s]?eight/i, value: { label: "8/8", beatsPerMeasure: 8, accents: [0] } },
    { pattern: /\b6\s*\/\s*8\b|six[-\s]?eight/i, value: { label: "6/8", beatsPerMeasure: 6, accents: [0, 3] } },
    { pattern: /\b3\s*\/\s*4\b|three[-\s]?four/i, value: { label: "3/4", beatsPerMeasure: 3, accents: [0] } },
    { pattern: /\b4\s*\/\s*4\b|four[-\s]?four/i, value: { label: "4/4", beatsPerMeasure: 4, accents: [0] } },
  ];
  const DEFAULT_TIME_SIGNATURE = { label: "4/4", beatsPerMeasure: 4, accents: [0] };
  const EIGHTH_NOTE_TIME_SIGNATURE = { label: "8/8", beatsPerMeasure: 8, accents: [0] };

  let state = {
    audioContext: null,
    timerId: null,
    activeButton: null,
    activeCard: null,
    beat: 0,
    nextClickTime: 0,
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

  const getConfig = (text = "", options = {}) => {
    const bpm = parseBpm(text);
    if (!bpm) return null;

    const timeSignature = parseTimeSignature(text);
    const shouldUseEighthNotes = options.eighthNoteMode && timeSignature.label === "4/4";

    return {
      bpm,
      playbackBpm: shouldUseEighthNotes ? bpm * 2 : bpm,
      timeSignature: shouldUseEighthNotes ? EIGHTH_NOTE_TIME_SIGNATURE : timeSignature,
    };
  };

  const setButtonState = (button, isPlaying) => {
    if (!button) return;
    button.setAttribute("aria-pressed", String(isPlaying));
    button.setAttribute("aria-label", isPlaying ? "메트로놈 정지" : "메트로놈 재생");
    button.classList.toggle("is-playing", isPlaying);
  };

  const stop = () => {
    if (state.timerId) {
      clearInterval(state.timerId);
    }

    setButtonState(state.activeButton, false);
    state = {
      ...state,
      timerId: null,
      activeButton: null,
      activeCard: null,
      beat: 0,
      nextClickTime: 0,
    };
  };

  const getAudioContext = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!state.audioContext) {
      state.audioContext = new AudioContextClass();
    }

    return state.audioContext;
  };

  const getClickKind = (timeSignature) => {
    const beatInMeasure = state.beat % timeSignature.beatsPerMeasure;
    const isPrimaryAccent = beatInMeasure === 0;
    const isSecondaryAccent = !isPrimaryAccent && timeSignature.accents.includes(beatInMeasure);

    if (isPrimaryAccent) return "primary";
    if (isSecondaryAccent) return "secondary";
    return "regular";
  };

  const getClickFrequency = (kind) => {
    if (kind === "primary") return 1500;
    if (kind === "secondary") return 1250;
    return 1000;
  };

  const ensureMedia = () => {
    getAudioContext();
  };

  const playWebAudioClick = (kind, time) => {
    const context = state.audioContext;
    if (!context || context.state === "suspended") return;

    const startTime = time ?? context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(getClickFrequency(kind), startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.4, startTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.06);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  };

  const unlockAudio = async () => {
    const context = getAudioContext();
    if (!context) return null;

    if (context.state === "suspended") {
      await context.resume();
    }

    return context;
  };

  const playClick = ({ timeSignature }, time) => {
    const kind = getClickKind(timeSignature);
    playWebAudioClick(kind, time);
    state.beat += 1;
  };

  const startTimed = (config) => {
    const context = state.audioContext;
    if (!context || context.state !== "running") return;

    const secondsPerBeat = 60 / (config.playbackBpm ?? config.bpm);
    const scheduleAheadTime = 0.1;
    state.nextClickTime = context.currentTime + 0.012;

    const scheduleClicks = () => {
      while (state.nextClickTime < context.currentTime + scheduleAheadTime) {
        playClick(config, state.nextClickTime);
        state.nextClickTime += secondsPerBeat;
      }
    };

    scheduleClicks();
    state.timerId = window.setInterval(scheduleClicks, 25);
  };

  const start = async (card, button, config) => {
    stop();
    ensureMedia();

    state.activeButton = button;
    state.activeCard = card;
    state.beat = 0;
    setButtonState(button, true);

    try {
      await unlockAudio();
      startTimed(config);
    } catch (error) {
      console.error("Metronome audio could not be started.", error);
      stop();
    }
  };

  return {
    ensureMedia,
    getConfig,
    isActiveButton: (button) => state.activeButton === button,
    start,
    stop,
  };
})();

window.HeemeeMetronome = HeemeeMetronome;
