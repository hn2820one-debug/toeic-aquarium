const DIFFICULTY_CONFIG = {
  easy: { label: "Easy", speedMultiplier: 0.8, minLength: 1, maxLength: 8, timeLimitSec: 180 },
  normal: { label: "Normal", speedMultiplier: 1, minLength: 1, maxLength: 12, timeLimitSec: 120 },
  hard: { label: "Hard", speedMultiplier: 1.35, minLength: 8, maxLength: 99, timeLimitSec: 90 }
};

const STORAGE_KEYS = {
  prefs: "deepsea_word_aquarium_prefs",
  wordBank: "deepsea_word_aquarium_word_bank",
  stats: "deepsea_word_aquarium_stats",
  history: "deepsea_word_aquarium_history",
  learningHistory: "deepsea_word_aquarium_learning_history"
};

const VALID_POS = new Set(["Noun", "Verb", "Adjective", "Adverb"]);
const WORDS_PER_ROUND_MIN = 5;
const WORDS_PER_ROUND_MAX = 80;
const HISTORY_MAX = 50;
const LEARNING_HISTORY_MAX = 50;
const ZEN_FIXED_WORDS = 30;
const TIME_ATTACK_FISH_COUNT = 10;
const COMBO_WINDOW_SEC = 3;
const SCORE_CORRECT_BASE = 10;
const SCORE_WRONG = 5;
const COMBO_BONUS_PER_STREAK = 2;
const TA_TIME_LIMIT_MIN = 30;
const TA_TIME_LIMIT_MAX = 180;
const FISH_SPEED_SCALE_MIN = 0.45;
const FISH_SPEED_SCALE_MAX = 1.65;
const CORRECTION_DURATION_MIN = 1;
const CORRECTION_DURATION_MAX = 1.5;

function clampWordsPerRound(n) {
  const v = Number.parseInt(String(n), 10);
  if (Number.isNaN(v)) {
    return 30;
  }
  return Math.min(WORDS_PER_ROUND_MAX, Math.max(WORDS_PER_ROUND_MIN, v));
}

function clampTaTimeLimitSec(n) {
  const v = Number.parseInt(String(n), 10);
  if (Number.isNaN(v)) {
    return 120;
  }
  return Math.min(TA_TIME_LIMIT_MAX, Math.max(TA_TIME_LIMIT_MIN, v));
}

function clampFishSpeedScale(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) {
    return 1;
  }
  return Math.min(FISH_SPEED_SCALE_MAX, Math.max(FISH_SPEED_SCALE_MIN, v));
}

function dedupeWordEntries(list) {
  const map = new Map();
  (list || []).forEach((row) => {
    if (!row || typeof row.word !== "string" || typeof row.pos !== "string" || typeof row.suffix !== "string") {
      return;
    }
    const word = row.word.trim();
    const pos = row.pos.trim();
    const suffix = row.suffix.trim();
    if (!word || !VALID_POS.has(pos) || !suffix) {
      return;
    }
    const key = `${word.toLowerCase()}|${pos}|${suffix.toLowerCase()}`;
    map.set(key, { word, pos, suffix });
  });
  return [...map.values()];
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

class Fish {
  constructor(wordData, bounds, speedMultiplier) {
    this.word = wordData.word;
    this.pos = wordData.pos;
    this.suffix = wordData.suffix;
    this.radiusX = Math.max(44, 16 + this.word.length * 5.6);
    this.radiusY = 24;
    this.dragging = false;
    this.removed = false;
    this.snapping = false;
    this.snapTargetX = 0;
    this.snapTargetY = 0;
    this.snapSpeed = 14;
    this.bounds = bounds;
    this.noDrag = false;
    this.errorState = false;
    this.correctionMode = false;
    this.correctionMoveT = 0;
    this.correctionDuration = CORRECTION_DURATION_MIN;
    this.correctionSx = 0;
    this.correctionSy = 0;
    this.correctionEx = 0;
    this.correctionEy = 0;
    this.correctionPhase = "move";
    this.fadeAlpha = 1;
    this.gameRef = null;
    this.x = this.random(bounds.padding + this.radiusX, bounds.width - bounds.padding - this.radiusX);
    this.y = this.random(bounds.playTop + this.radiusY, bounds.height - bounds.padding - this.radiusY);
    const speed = this.random(22, 56) * speedMultiplier;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed * 0.7;
  }

  random(min, max) {
    return min + Math.random() * (max - min);
  }

  startSnap(x, y) {
    this.snapping = true;
    this.dragging = false;
    this.snapTargetX = x;
    this.snapTargetY = y;
  }

  restoreSwimmingVelocity(speedMultiplier) {
    const speed = this.random(22, 56) * speedMultiplier;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed * 0.7;
  }

  startCorrectionTo(endX, endY, durationSec, gameRef) {
    this.correctionMode = true;
    this.correctionPhase = "move";
    this.correctionMoveT = 0;
    this.correctionDuration = durationSec;
    this.correctionSx = this.x;
    this.correctionSy = this.y;
    this.correctionEx = endX;
    this.correctionEy = endY;
    this.fadeAlpha = 1;
    this.snapping = false;
    this.dragging = false;
    this.gameRef = gameRef;
  }

  resizeBounds(bounds) {
    this.bounds = bounds;
    this.x = Math.min(Math.max(this.x, bounds.padding + this.radiusX), bounds.width - bounds.padding - this.radiusX);
    this.y = Math.min(Math.max(this.y, bounds.playTop + this.radiusY), bounds.height - bounds.padding - this.radiusY);
  }

  update(dt) {
    if (this.correctionMode) {
      if (this.correctionPhase === "move") {
        this.correctionMoveT += dt / this.correctionDuration;
        const u = Math.min(1, this.correctionMoveT);
        const t = easeInOutCubic(u);
        this.x = this.correctionSx + (this.correctionEx - this.correctionSx) * t;
        this.y = this.correctionSy + (this.correctionEy - this.correctionSy) * t;
        if (u >= 1) {
          this.correctionPhase = "fade";
          this.x = this.correctionEx;
          this.y = this.correctionEy;
        }
      } else {
        this.fadeAlpha -= dt * 1.8;
        if (this.fadeAlpha <= 0) {
          this.fadeAlpha = 0;
          this.correctionMode = false;
          this.removed = true;
          if (this.gameRef) {
            this.gameRef.onWrongCorrectionFinished(this);
          }
        }
      }
      return;
    }

    if (this.removed || this.dragging) {
      return;
    }

    if (this.snapping) {
      this.x += (this.snapTargetX - this.x) * Math.min(1, this.snapSpeed * dt);
      this.y += (this.snapTargetY - this.y) * Math.min(1, this.snapSpeed * dt);
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const left = this.bounds.padding + this.radiusX;
    const right = this.bounds.width - this.bounds.padding - this.radiusX;
    const top = this.bounds.playTop + this.radiusY;
    const bottom = this.bounds.height - this.bounds.padding - this.radiusY;

    if (this.x <= left) {
      this.x = left;
      this.vx *= -1;
    }
    if (this.x >= right) {
      this.x = right;
      this.vx *= -1;
    }
    if (this.y <= top) {
      this.y = top;
      this.vy *= -1;
    }
    if (this.y >= bottom) {
      this.y = bottom;
      this.vy *= -1;
    }
  }

  containsPoint(px, py) {
    if (this.removed || this.noDrag || this.correctionMode) {
      return false;
    }
    const nx = (px - this.x) / this.radiusX;
    const ny = (py - this.y) / this.radiusY;
    return nx * nx + ny * ny <= 1;
  }

  draw(ctx) {
    if (this.removed) {
      return;
    }
    const shake = this.errorState ? Math.sin(performance.now() / 40) * 3 : 0;
    ctx.save();
    ctx.globalAlpha = this.fadeAlpha;
    ctx.translate(this.x + shake, this.y);

    const gradient = ctx.createLinearGradient(-this.radiusX, -this.radiusY, this.radiusX, this.radiusY);
    if (this.errorState) {
      gradient.addColorStop(0, "rgba(255,140,140,0.75)");
      gradient.addColorStop(1, "rgba(255,80,80,0.35)");
      ctx.strokeStyle = "rgba(255,200,200,0.85)";
    } else {
      gradient.addColorStop(0, "rgba(180,240,255,0.55)");
      gradient.addColorStop(1, "rgba(120,180,255,0.25)");
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
    }
    ctx.fillStyle = gradient;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(0, 0, this.radiusX, this.radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-this.radiusX * 0.35, -this.radiusY * 0.2, this.radiusX * 0.25, this.radiusY * 0.22, -0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.errorState ? "#4a0a0a" : "#07274f";
    ctx.font = "700 18px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.word, 0, 0);
    ctx.restore();
  }
}

class ScorePopup {
  constructor(x, y, text, positive) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.life = 1;
    this.vy = -95;
    this.positive = positive;
  }

  update(dt) {
    this.life -= dt * 1.15;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    if (this.life <= 0) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.positive ? "#bfffb4" : "#ff9b9b";
    ctx.font = "800 20px 'Segoe UI', 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 170;
    this.vy = (Math.random() - 0.5) * 170;
    this.life = 0.8;
    this.size = 2 + Math.random() * 4;
    this.color = color;
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.98;
    this.vy *= 0.98;
  }

  draw(ctx) {
    if (this.life <= 0) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Tank {
  constructor(name, element) {
    this.name = name;
    this.element = element;
    this.rect = element.getBoundingClientRect();
  }

  refreshRect() {
    this.rect = this.element.getBoundingClientRect();
  }

  containsPoint(x, y) {
    const r = this.rect;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  getCenterCanvas(canvasRect) {
    const x = this.rect.left + this.rect.width / 2 - canvasRect.left;
    const y = this.rect.top + this.rect.height / 2 - canvasRect.top;
    return { x, y };
  }

  setActive(active) {
    this.element.classList.toggle("active-drop", active);
  }
}

class InputManager {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.draggingFish = null;
    this.pointerOffsetX = 0;
    this.pointerOffsetY = 0;

    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("pointercancel", (e) => this.onPointerUp(e));
  }

  getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onPointerDown(e) {
    if (this.game.state !== "PLAYING") {
      return;
    }
    const p = this.getCanvasPos(e);
    const fish = this.game.getTopFishAtPoint(p.x, p.y);
    if (!fish || fish.snapping || fish.noDrag) {
      return;
    }
    this.game.initAudioContext();
    this.game.warmupSpeechSynthesis();
    this.game.speakWordOnGrab(fish.word);
    fish.dragging = true;
    this.draggingFish = fish;
    this.pointerOffsetX = fish.x - p.x;
    this.pointerOffsetY = fish.y - p.y;
    this.canvas.setPointerCapture(e.pointerId);
  }

  onPointerMove(e) {
    if (!this.draggingFish || this.game.state !== "PLAYING") {
      return;
    }
    const p = this.getCanvasPos(e);
    this.draggingFish.x = p.x + this.pointerOffsetX;
    this.draggingFish.y = p.y + this.pointerOffsetY;
    this.game.highlightTankByClientPoint(e.clientX, e.clientY);
  }

  onPointerUp(e) {
    if (!this.draggingFish) {
      return;
    }
    const fish = this.draggingFish;
    fish.dragging = false;
    this.draggingFish = null;
    this.game.clearTankHighlight();
    this.game.initAudioContext();
    this.game.handleFishDrop(fish, e.clientX, e.clientY);
  }
}

class Game {
  constructor() {
    this.state = "MENU";
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");

    this.hud = document.getElementById("hud");
    this.hudTime = document.getElementById("hud-time");
    this.hudProgress = document.getElementById("hud-progress");
    this.hudAccuracy = document.getElementById("hud-accuracy");
    this.hudBest = document.getElementById("hud-best");
    this.menuBest = document.getElementById("menu-best");
    this.pauseBtn = document.getElementById("pause-btn");
    this.exitMenuBtn = document.getElementById("exit-menu-btn");
    this.helpBtn = document.getElementById("help-btn");
    this.hudTimeCaption = document.getElementById("hud-time-caption");
    this.hudTaBlock = document.getElementById("hud-ta-block");
    this.hudScore = document.getElementById("hud-score");
    this.comboMeter = document.getElementById("combo-meter");
    this.comboBarFill = document.getElementById("combo-bar-fill");
    this.gameoverTitle = document.getElementById("gameover-title");

    this.menuOverlay = document.getElementById("menu-overlay");
    this.settingsOverlay = document.getElementById("settings-overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.tutorialOverlay = document.getElementById("tutorial-overlay");
    this.gameoverOverlay = document.getElementById("gameover-overlay");
    this.resultSummary = document.getElementById("result-summary");
    this.weaknessList = document.getElementById("weakness-list");
    this.tanksArea = document.getElementById("tanks-area");
    this.volumeSlider = document.getElementById("volume-slider");
    this.fullscreenToggle = document.getElementById("fullscreen-toggle");
    this.difficultySelect = document.getElementById("difficulty-select");
    this.wordsPerRoundInput = document.getElementById("words-per-round");
    this.settingsTaTimeLimit = document.getElementById("settings-ta-time-limit");
    this.settingsTaTimeValue = document.getElementById("settings-ta-time-value");
    this.settingsFishSpeed = document.getElementById("settings-fish-speed");
    this.settingsFishSpeedValue = document.getElementById("settings-fish-speed-value");
    this.settingsPronunciationToggle = document.getElementById("settings-pronunciation-toggle");
    this.settingsTaTimeRow = document.getElementById("settings-ta-time-row");

    this.wordbankOverlay = document.getElementById("wordbank-overlay");
    this.wordbankCloseBtn = document.getElementById("wordbank-close-btn");
    this.wordbankFilter = document.getElementById("wordbank-filter");
    this.wordbankTbody = document.getElementById("wordbank-tbody");
    this.wordbankCount = document.getElementById("wordbank-count");
    this.wordbankForm = document.getElementById("wordbank-form");
    this.wordbankEditIndex = document.getElementById("wordbank-edit-index");
    this.wordbankWord = document.getElementById("wordbank-word");
    this.wordbankPos = document.getElementById("wordbank-pos");
    this.wordbankSuffix = document.getElementById("wordbank-suffix");
    this.wordbankFormClearBtn = document.getElementById("wordbank-form-clear-btn");
    this.wordbankMergeJsonBtn = document.getElementById("wordbank-merge-json-btn");
    this.wordbankImportBtn = document.getElementById("wordbank-import-btn");
    this.wordbankExportBtn = document.getElementById("wordbank-export-btn");
    this.wordbankImportFile = document.getElementById("wordbank-import-file");

    this.recordsOverlay = document.getElementById("records-overlay");
    this.recordsCloseBtn = document.getElementById("records-close-btn");
    this.recordsTbody = document.getElementById("records-tbody");
    this.recordsClearBtn = document.getElementById("records-clear-btn");

    this.historyLearningOverlay = document.getElementById("history-learning-overlay");
    this.historyLearningCloseBtn = document.getElementById("history-learning-close-btn");
    this.historyLearningList = document.getElementById("history-learning-list");
    this.historyLearningClearBtn = document.getElementById("history-learning-clear-btn");
    this.recentLogTicker = document.getElementById("recent-log-ticker");

    this.tanks = [...document.querySelectorAll(".tank")].map((el) => new Tank(el.dataset.pos, el));
    this.input = new InputManager(this, this.canvas);

    this.settings = {
      volume: 60,
      fullscreen: false,
      difficulty: "normal",
      wordsPerRound: 30,
      playMode: "zen",
      timeAttackDurationSec: 120,
      fishSpeedScale: 1,
      pronunciationEnabled: true
    };
    Object.assign(this.settings, this.loadPrefs());
    if (this.settings.timeAttackDurationSec == null) {
      this.settings.timeAttackDurationSec = 120;
    }
    if (this.settings.fishSpeedScale == null) {
      this.settings.fishSpeedScale = 1;
    }
    if (this.settings.pronunciationEnabled == null) {
      this.settings.pronunciationEnabled = true;
    }
    if (this.settings.playMode !== "zen" && this.settings.playMode !== "timeattack") {
      this.settings.playMode = "zen";
    }
    this.settings.timeAttackDurationSec = clampTaTimeLimitSec(this.settings.timeAttackDurationSec);
    this.settings.fishSpeedScale = clampFishSpeedScale(this.settings.fishSpeedScale);
    this.stats = this.loadStats();

    this.wordBank = [];
    this.sessionWords = [];
    this.fishes = [];
    this.particles = [];
    this.mistakes = {};
    this.correctCount = 0;
    this.wrongCount = 0;
    this.totalWords = 30;
    this.startMs = 0;
    this.pauseStarted = 0;
    this.accumulatedPauseMs = 0;
    this.elapsedMs = 0;
    this.timeLimitSec = DIFFICULTY_CONFIG.normal.timeLimitSec;
    this.lastFrameTime = 0;
    this.pauseReason = null;
    this.bounds = { width: 1, height: 1, playTop: 1, padding: 18 };

    this.playMode = "zen";
    this.score = 0;
    this.comboCount = 0;
    this.comboTimeLeft = 0;
    this.sessionPool = [];
    this.scorePopups = [];
    this.recentSortSamples = [];

    this.audioCtx = null;
    this.masterGain = null;
    this.ttsVoice = null;
    this.ttsPrimed = false;
    this.refreshTtsVoiceList();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.addEventListener("voiceschanged", () => this.refreshTtsVoiceList());
    }

    this.bindUI();
    this.syncMainMenuPlayModeFromSettings();
    this.resize();
    this.renderBestStats();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => {
      window.setTimeout(() => this.resize(), 200);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => this.resize());
      window.visualViewport.addEventListener("scroll", () => this.resize());
    }
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  async init() {
    const fetched = await this.fetchWordBankFromFile();
    const stored = this.loadWordBankFromStorage();
    if (stored.length > 0) {
      this.wordBank = stored;
    } else {
      this.wordBank = dedupeWordEntries(fetched.length > 0 ? fetched : this.getFallbackWordBank());
      this.saveWordBankToStorage();
    }
  }

  loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.stats);
      if (!raw) {
        return { bestAccuracy: 0, bestTimeMs: null, weaknessHistory: {} };
      }
      const parsed = JSON.parse(raw);
      return {
        bestAccuracy: Number(parsed.bestAccuracy || 0),
        bestTimeMs: parsed.bestTimeMs == null ? null : Number(parsed.bestTimeMs),
        weaknessHistory: parsed.weaknessHistory || {}
      };
    } catch (_err) {
      return { bestAccuracy: 0, bestTimeMs: null, weaknessHistory: {} };
    }
  }

  saveStats() {
    localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(this.stats));
  }

  loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.prefs);
      if (!raw) {
        return {};
      }
      const p = JSON.parse(raw);
      return {
        volume: typeof p.volume === "number" ? p.volume : undefined,
        fullscreen: typeof p.fullscreen === "boolean" ? p.fullscreen : undefined,
        difficulty: typeof p.difficulty === "string" ? p.difficulty : undefined,
        wordsPerRound: p.wordsPerRound != null ? clampWordsPerRound(p.wordsPerRound) : undefined,
        playMode: p.playMode === "timeattack" || p.playMode === "zen" ? p.playMode : undefined,
        timeAttackDurationSec: p.timeAttackDurationSec != null ? clampTaTimeLimitSec(p.timeAttackDurationSec) : undefined,
        fishSpeedScale: p.fishSpeedScale != null ? clampFishSpeedScale(p.fishSpeedScale) : undefined,
        pronunciationEnabled: typeof p.pronunciationEnabled === "boolean" ? p.pronunciationEnabled : undefined
      };
    } catch (_err) {
      return {};
    }
  }

  savePrefs() {
    const payload = {
      volume: this.settings.volume,
      fullscreen: this.settings.fullscreen,
      difficulty: this.settings.difficulty,
      wordsPerRound: clampWordsPerRound(this.settings.wordsPerRound),
      playMode: this.settings.playMode === "timeattack" ? "timeattack" : "zen",
      timeAttackDurationSec: clampTaTimeLimitSec(this.settings.timeAttackDurationSec),
      fishSpeedScale: clampFishSpeedScale(this.settings.fishSpeedScale),
      pronunciationEnabled: Boolean(this.settings.pronunciationEnabled)
    };
    localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(payload));
  }

  loadWordBankFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.wordBank);
      if (!raw) {
        return [];
      }
      const data = JSON.parse(raw);
      return Array.isArray(data) ? dedupeWordEntries(data) : [];
    } catch (_err) {
      return [];
    }
  }

  saveWordBankToStorage() {
    const list = dedupeWordEntries(this.wordBank);
    this.wordBank = list;
    localStorage.setItem(STORAGE_KEYS.wordBank, JSON.stringify(list));
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.history);
      if (!raw) {
        return [];
      }
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (_err) {
      return [];
    }
  }

  saveHistory(entries) {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(entries.slice(0, HISTORY_MAX)));
  }

  loadLearningHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.learningHistory);
      if (!raw) {
        return [];
      }
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) {
        return [];
      }
      return data
        .filter(
          (row) =>
            row &&
            typeof row.word === "string" &&
            typeof row.playerChoice === "string" &&
            typeof row.correctPOS === "string" &&
            typeof row.isCorrect === "boolean" &&
            typeof row.timestamp === "number"
        )
        .slice(0, LEARNING_HISTORY_MAX);
    } catch (_err) {
      return [];
    }
  }

  saveLearningHistory(entries) {
    localStorage.setItem(STORAGE_KEYS.learningHistory, JSON.stringify(entries.slice(0, LEARNING_HISTORY_MAX)));
  }

  appendLearningHistoryEntry(entry) {
    const row = {
      word: String(entry.word || ""),
      playerChoice: String(entry.playerChoice || ""),
      correctPOS: String(entry.correctPOS || ""),
      isCorrect: Boolean(entry.isCorrect),
      timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now()
    };
    const next = [row, ...this.loadLearningHistory()].slice(0, LEARNING_HISTORY_MAX);
    this.saveLearningHistory(next);
    this.recentSortSamples.unshift({ word: row.word, isCorrect: row.isCorrect });
    this.recentSortSamples = this.recentSortSamples.slice(0, 3);
    this.renderRecentLogTicker();
  }

  renderRecentLogTicker() {
    if (!this.recentLogTicker) {
      return;
    }
    if (this.state !== "PLAYING") {
      this.recentLogTicker.classList.add("hidden");
      return;
    }
    this.recentLogTicker.classList.remove("hidden");
    if (this.recentSortSamples.length === 0) {
      this.recentLogTicker.textContent = "";
      return;
    }
    this.recentLogTicker.textContent = this.recentSortSamples.map((s) => `${s.isCorrect ? "✅" : "❌"} ${s.word}`).join(", ");
  }

  updateRecentLogTickerVisibility() {
    this.renderRecentLogTicker();
  }

  renderLearningHistoryList() {
    if (!this.historyLearningList) {
      return;
    }
    const rows = this.loadLearningHistory();
    this.historyLearningList.innerHTML = "";
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "history-learning-empty";
      empty.textContent = "尚無排序記錄。開始遊戲後會自動寫入。";
      this.historyLearningList.appendChild(empty);
      return;
    }
    rows.forEach((r) => {
      const div = document.createElement("div");
      div.className = `history-learning-row ${r.isCorrect ? "history-learning-row--correct" : "history-learning-row--wrong"}`;
      const when = new Date(r.timestamp).toLocaleString();
      div.innerHTML = `<span class="hl-mark">${r.isCorrect ? "✅" : "❌"}</span> <strong>${this.escapeHtml(r.word)}</strong> → 你的選擇：<span class="hl-choice">${this.escapeHtml(r.playerChoice)}</span> · 正解：<span class="hl-answer">${this.escapeHtml(r.correctPOS)}</span><span class="hl-time">${this.escapeHtml(when)}</span>`;
      this.historyLearningList.appendChild(div);
    });
  }

  openHistoryLearningOverlay() {
    if (!this.historyLearningOverlay) {
      return;
    }
    this.renderLearningHistoryList();
    this.historyLearningOverlay.classList.remove("hidden");
    this.historyLearningOverlay.classList.add("active");
  }

  closeHistoryLearningOverlay() {
    if (!this.historyLearningOverlay) {
      return;
    }
    this.historyLearningOverlay.classList.add("hidden");
    this.historyLearningOverlay.classList.remove("active");
  }

  clearLearningHistoryProgress() {
    if (!window.confirm("確定要清除學習歷史紀錄？此操作無法復原。")) {
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.learningHistory);
    this.recentSortSamples = [];
    this.renderRecentLogTicker();
    this.renderLearningHistoryList();
  }

  appendGameRecord(payload) {
    const list = [payload, ...this.loadHistory()].slice(0, HISTORY_MAX);
    this.saveHistory(list);
  }

  renderBestStats() {
    const bestTimeLabel = this.stats.bestTimeMs == null ? "--:--" : this.formatTime(this.stats.bestTimeMs);
    const bestAccuracyLabel = `${this.stats.bestAccuracy || 0}%`;
    const text = `${bestAccuracyLabel} / ${bestTimeLabel}`;
    this.menuBest.textContent = `Best Record: ${text}`;
    this.hudBest.textContent = text;
  }

  async fetchWordBankFromFile() {
    try {
      const response = await fetch("words.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load words.json: ${response.status}`);
      }
      const data = await response.json();
      const validRows = data.filter(
        (item) =>
          item &&
          typeof item.word === "string" &&
          typeof item.pos === "string" &&
          typeof item.suffix === "string"
      );
      return dedupeWordEntries(validRows.length > 0 ? validRows : this.getFallbackWordBank());
    } catch (_err) {
      return dedupeWordEntries(this.getFallbackWordBank());
    }
  }

  getFallbackWordBank() {
    return [
      { word: "happiness", pos: "Noun", suffix: "-ness" },
      { word: "realize", pos: "Verb", suffix: "-ize" },
      { word: "beautiful", pos: "Adjective", suffix: "-ful" },
      { word: "quickly", pos: "Adverb", suffix: "-ly" }
    ];
  }

  bindUI() {
    document.getElementById("start-btn").addEventListener("click", () => this.startGame());
    document.getElementById("menu-settings-btn").addEventListener("click", () => this.openSettings());
    document.getElementById("settings-save-btn").addEventListener("click", () => this.saveSettings());
    document.getElementById("settings-close-btn").addEventListener("click", () => this.closeSettings());
    document.getElementById("resume-btn").addEventListener("click", () => this.resumeGame());
    document.getElementById("restart-btn").addEventListener("click", () => this.startGame());
    document.getElementById("play-again-btn").addEventListener("click", () => this.startGame());
    document.getElementById("back-menu-btn").addEventListener("click", () => this.backToMenu());
    document.getElementById("tutorial-btn").addEventListener("click", () => this.openTutorial());
    document.getElementById("tutorial-close-btn").addEventListener("click", () => this.closeTutorial());
    document.getElementById("wordbank-btn").addEventListener("click", () => this.openWordbankOverlay());
    this.wordbankCloseBtn.addEventListener("click", () => this.closeWordbankOverlay());
    document.getElementById("records-btn").addEventListener("click", () => this.openRecordsOverlay());
    this.recordsCloseBtn.addEventListener("click", () => this.closeRecordsOverlay());
    this.recordsClearBtn.addEventListener("click", () => this.clearRecords());
    document.getElementById("history-learning-btn").addEventListener("click", () => this.openHistoryLearningOverlay());
    if (this.historyLearningCloseBtn) {
      this.historyLearningCloseBtn.addEventListener("click", () => this.closeHistoryLearningOverlay());
    }
    if (this.historyLearningClearBtn) {
      this.historyLearningClearBtn.addEventListener("click", () => this.clearLearningHistoryProgress());
    }

    this.wordbankFilter.addEventListener("input", () => this.renderWordbankTable());
    this.wordbankForm.addEventListener("submit", (e) => this.onWordbankFormSubmit(e));
    this.wordbankFormClearBtn.addEventListener("click", () => this.clearWordbankForm());
    this.wordbankMergeJsonBtn.addEventListener("click", () => this.mergeWordBankFromJsonFile());
    this.wordbankImportBtn.addEventListener("click", () => this.wordbankImportFile.click());
    this.wordbankImportFile.addEventListener("change", (e) => this.onWordbankImportFile(e));
    this.wordbankExportBtn.addEventListener("click", () => this.exportWordBankJson());

    this.pauseBtn.addEventListener("click", () => this.pauseGame("pause"));
    this.exitMenuBtn.addEventListener("click", () => this.confirmExitToMenu());
    this.helpBtn.addEventListener("click", () => this.openTutorial());

    document.querySelectorAll('input[name="play-mode"]').forEach((el) => {
      el.addEventListener("change", () => {
        this.settings.playMode = this.getSelectedPlayMode();
        this.savePrefs();
      });
    });

    if (this.settingsTaTimeLimit) {
      this.settingsTaTimeLimit.addEventListener("input", () => this.updateSettingsTaTimeLabel());
    }
    if (this.settingsFishSpeed) {
      this.settingsFishSpeed.addEventListener("input", () => this.updateSettingsFishSpeedLabel());
    }
    document.querySelectorAll('input[name="settings-play-mode"]').forEach((el) => {
      el.addEventListener("change", () => this.refreshSettingsTaTimeRowVisibility());
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.tutorialOverlay.classList.contains("active")) {
          this.closeTutorial();
          return;
        }
        if (this.wordbankOverlay.classList.contains("active")) {
          this.closeWordbankOverlay();
          return;
        }
        if (this.recordsOverlay.classList.contains("active")) {
          this.closeRecordsOverlay();
          return;
        }
        if (this.historyLearningOverlay && this.historyLearningOverlay.classList.contains("active")) {
          this.closeHistoryLearningOverlay();
          return;
        }
        if (this.state === "PLAYING") {
          this.pauseGame("pause");
        } else if (this.state === "PAUSED" && this.pauseReason === "pause") {
          this.resumeGame();
        }
      }
    });
  }

  normalizeSuffixInput(raw) {
    let s = (raw || "").trim();
    if (!s) {
      return "";
    }
    if (!s.startsWith("-")) {
      s = `-${s}`;
    }
    return s;
  }

  openWordbankOverlay() {
    this.wordbankOverlay.classList.remove("hidden");
    this.wordbankOverlay.classList.add("active");
    this.clearWordbankForm();
    this.renderWordbankTable();
  }

  closeWordbankOverlay() {
    this.wordbankOverlay.classList.add("hidden");
    this.wordbankOverlay.classList.remove("active");
  }

  openRecordsOverlay() {
    this.recordsOverlay.classList.remove("hidden");
    this.recordsOverlay.classList.add("active");
    this.renderRecordsTable();
  }

  closeRecordsOverlay() {
    this.recordsOverlay.classList.add("hidden");
    this.recordsOverlay.classList.remove("active");
  }

  clearRecords() {
    if (!window.confirm("確定要清空所有戰績記錄？")) {
      return;
    }
    this.saveHistory([]);
    this.renderRecordsTable();
  }

  renderRecordsTable() {
    const rows = this.loadHistory();
    this.recordsTbody.innerHTML = "";
    if (rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7">尚無記錄。完成一局後會自動儲存。</td>`;
      this.recordsTbody.appendChild(tr);
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const at = r.at ? new Date(r.at).toLocaleString() : "";
      const diff = r.difficulty || "";
      const wc = r.wordCount != null ? String(r.wordCount) : "";
      const acc = r.accuracy != null ? `${r.accuracy}%` : "";
      const time = r.timeMs != null ? this.formatTime(r.timeMs) : "";
      const cw = `${r.correct ?? 0} / ${r.wrong ?? 0}`;
      const mode = r.gameMode === "timeattack" ? "TA" : r.gameMode === "zen" ? "Zen" : "";
      const scorePart = r.score != null ? ` 分${r.score}` : "";
      const note = r.isTimeout ? "時間到" : "完成";
      const noteCell = [mode + scorePart, note].filter(Boolean).join(" · ");
      tr.innerHTML = `<td>${at}</td><td>${diff}</td><td>${wc}</td><td>${acc}</td><td>${time}</td><td>${cw}</td><td>${noteCell}</td>`;
      this.recordsTbody.appendChild(tr);
    });
  }

  renderWordbankTable() {
    const q = (this.wordbankFilter.value || "").trim().toLowerCase();
    this.wordbankTbody.innerHTML = "";
    this.wordBank.forEach((row, idx) => {
      if (
        q &&
        !row.word.toLowerCase().includes(q) &&
        !row.suffix.toLowerCase().includes(q) &&
        !row.pos.toLowerCase().includes(q)
      ) {
        return;
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${this.escapeHtml(row.word)}</td>
        <td>${this.escapeHtml(row.pos)}</td>
        <td>${this.escapeHtml(row.suffix)}</td>
        <td>
          <button type="button" class="btn-link" data-action="edit" data-index="${idx}">編輯</button>
          <button type="button" class="btn-link" data-action="del" data-index="${idx}">刪除</button>
        </td>`;
      this.wordbankTbody.appendChild(tr);
    });
    this.wordbankTbody.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        const idx = Number(btn.getAttribute("data-index"));
        if (action === "edit") {
          this.fillWordbankForm(idx);
        } else if (action === "del") {
          this.wordBank.splice(idx, 1);
          this.wordBank = dedupeWordEntries(this.wordBank);
          this.saveWordBankToStorage();
          this.clearWordbankForm();
          this.renderWordbankTable();
        }
      });
    });
    const shown = this.wordbankTbody.querySelectorAll("tr").length;
    this.wordbankCount.textContent = `詞庫共 ${this.wordBank.length} 筆（表格顯示 ${shown} 筆）`;
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  fillWordbankForm(index) {
    const row = this.wordBank[index];
    if (!row) {
      return;
    }
    this.wordbankEditIndex.value = String(index);
    this.wordbankWord.value = row.word;
    this.wordbankPos.value = row.pos;
    this.wordbankSuffix.value = row.suffix;
  }

  clearWordbankForm() {
    this.wordbankEditIndex.value = "";
    this.wordbankWord.value = "";
    this.wordbankPos.value = "Noun";
    this.wordbankSuffix.value = "";
  }

  onWordbankFormSubmit(e) {
    e.preventDefault();
    const word = (this.wordbankWord.value || "").trim();
    const pos = this.wordbankPos.value;
    const suffix = this.normalizeSuffixInput(this.wordbankSuffix.value);
    if (!word || !VALID_POS.has(pos) || !suffix) {
      return;
    }
    const next = { word, pos, suffix };
    const editIdx = this.wordbankEditIndex.value;
    if (editIdx !== "") {
      const i = Number.parseInt(editIdx, 10);
      if (!Number.isNaN(i) && i >= 0 && i < this.wordBank.length) {
        this.wordBank[i] = next;
      }
    } else {
      this.wordBank.push(next);
    }
    this.wordBank = dedupeWordEntries(this.wordBank);
    this.saveWordBankToStorage();
    this.clearWordbankForm();
    this.renderWordbankTable();
  }

  async mergeWordBankFromJsonFile() {
    const extra = await this.fetchWordBankFromFile();
    this.wordBank = dedupeWordEntries([...this.wordBank, ...extra]);
    this.saveWordBankToStorage();
    this.renderWordbankTable();
  }

  onWordbankImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "[]"));
        if (!Array.isArray(data)) {
          throw new Error("JSON 必須為陣列");
        }
        this.wordBank = dedupeWordEntries([...this.wordBank, ...data]);
        this.saveWordBankToStorage();
        this.renderWordbankTable();
      } catch (err) {
        window.alert(`匯入失敗：${err.message || err}`);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  exportWordBankJson() {
    const blob = new Blob([JSON.stringify(dedupeWordEntries(this.wordBank), null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "words-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  resize() {
    const vv = window.visualViewport;
    const cssW = vv ? vv.width : window.innerWidth;
    const cssH = vv ? vv.height : window.innerHeight;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.tanksArea && !this.tanksArea.classList.contains("hidden")) {
      let tanksTop = 8;
      if (this.hud && !this.hud.classList.contains("hidden")) {
        const hudRect = this.hud.getBoundingClientRect();
        if (hudRect && Number.isFinite(hudRect.bottom)) {
          tanksTop = Math.max(6, Math.floor(hudRect.bottom + 8));
        }
      }
      this.tanksArea.style.top = `${tanksTop}px`;
    } else if (this.tanksArea) {
      this.tanksArea.style.top = "";
    }

    let playTop = cssH * 0.3 + 8;
    if (this.tanksArea && !this.tanksArea.classList.contains("hidden")) {
      const tr = this.tanksArea.getBoundingClientRect();
      if (tr.height > 0) {
        playTop = Math.min(cssH * 0.62, Math.max(96, tr.bottom + 10));
      }
    }
    this.bounds = {
      width: cssW,
      height: cssH,
      playTop,
      padding: Math.min(20, Math.max(10, Math.floor(cssW * 0.04)))
    };
    this.tanks.forEach((tank) => tank.refreshRect());
    this.fishes.forEach((fish) => fish.resizeBounds(this.bounds));
    this.updateRecentLogTickerVisibility();
  }

  applyDifficultyToWordPool() {
    const cfg = DIFFICULTY_CONFIG[this.settings.difficulty] || DIFFICULTY_CONFIG.normal;
    const pool = this.wordBank.filter(
      (w) => w.word.length >= cfg.minLength && w.word.length <= cfg.maxLength
    );
    return pool.length >= 10 ? pool : this.wordBank;
  }

  getSelectedPlayMode() {
    const el = document.querySelector('input[name="play-mode"]:checked');
    return el && el.value === "timeattack" ? "timeattack" : "zen";
  }

  hideMenuAndShowGameSurface() {
    this.menuOverlay.classList.remove("active");
    this.menuOverlay.classList.add("hidden");
    this.pauseOverlay.classList.add("hidden");
    this.pauseOverlay.classList.remove("active");
    this.gameoverOverlay.classList.add("hidden");
    this.gameoverOverlay.classList.remove("active");
    this.settingsOverlay.classList.add("hidden");
    this.settingsOverlay.classList.remove("active");
    this.tutorialOverlay.classList.add("hidden");
    this.tutorialOverlay.classList.remove("active");
    this.hud.classList.remove("hidden");
    this.helpBtn.classList.remove("hidden");
    this.tanksArea.classList.remove("hidden");
    this.tanks.forEach((tank) => tank.refreshRect());
    this.updateRecentLogTickerVisibility();
  }

  startGame() {
    if (this.wordBank.length === 0) {
      window.alert("詞庫為空。請先到「單字庫 📚」新增單字，或按「合併 words.json」。");
      return;
    }
    this.settings.playMode = this.getSelectedPlayMode();
    this.savePrefs();
    const mode = this.settings.playMode;
    if (mode === "timeattack") {
      this.startTimeAttackGame();
    } else {
      this.startZenGame();
    }
  }

  startZenGame() {
    const cfg = DIFFICULTY_CONFIG[this.settings.difficulty] || DIFFICULTY_CONFIG.normal;
    const sourcePool = this.applyDifficultyToWordPool();
    const drawCount = Math.min(ZEN_FIXED_WORDS, sourcePool.length);
    if (drawCount < 1) {
      window.alert("符合難度與字長條件的單字不足。請調低難度或到單字庫新增詞條。");
      return;
    }

    this.playMode = "zen";
    this.score = 0;
    this.comboCount = 0;
    this.comboTimeLeft = 0;
    this.scorePopups = [];
    this.recentSortSamples = [];
    this.sessionPool = [];
    this.state = "PLAYING";
    this.totalWords = drawCount;
    this.timeLimitSec = 0;
    this.sessionWords = this.pickRandomWords(sourcePool, drawCount);
    const speedMul = cfg.speedMultiplier * this.getFishSpeedMultiplier();
    this.fishes = this.sessionWords.map((wordData) => new Fish(wordData, this.bounds, speedMul));
    this.particles = [];
    this.mistakes = {};
    this.correctCount = 0;
    this.wrongCount = 0;
    this.startMs = performance.now();
    this.accumulatedPauseMs = 0;
    this.pauseStarted = 0;
    this.elapsedMs = 0;
    this.pauseReason = null;

    this.hudTaBlock.classList.add("hidden");
    this.hideMenuAndShowGameSurface();
    this.renderBestStats();
    this.updateHud();
  }

  startTimeAttackGame() {
    const cfg = DIFFICULTY_CONFIG[this.settings.difficulty] || DIFFICULTY_CONFIG.normal;
    const sourcePool = this.applyDifficultyToWordPool();
    if (sourcePool.length < 1) {
      window.alert("符合難度與字長條件的單字不足。請調低難度或到單字庫新增詞條。");
      return;
    }

    this.playMode = "timeattack";
    this.score = 0;
    this.comboCount = 0;
    this.comboTimeLeft = 0;
    this.scorePopups = [];
    this.recentSortSamples = [];
    this.sessionPool = sourcePool;
    this.state = "PLAYING";
    this.totalWords = 0;
    this.timeLimitSec = clampTaTimeLimitSec(this.settings.timeAttackDurationSec);
    this.sessionWords = [];
    this.mistakes = {};
    this.correctCount = 0;
    this.wrongCount = 0;
    this.startMs = performance.now();
    this.accumulatedPauseMs = 0;
    this.pauseStarted = 0;
    this.elapsedMs = 0;
    this.pauseReason = null;

    this.fishes = [];
    this.particles = [];
    for (let i = 0; i < TIME_ATTACK_FISH_COUNT; i += 1) {
      this.spawnOneTimeAttackFish();
    }

    this.hudTaBlock.classList.remove("hidden");
    this.hideMenuAndShowGameSurface();
    this.renderBestStats();
    this.updateComboHud({ pulse: false });
    this.updateHud();
  }

  spawnOneTimeAttackFish() {
    if (this.playMode !== "timeattack" || !this.sessionPool || this.sessionPool.length === 0) {
      return;
    }
    const cfg = DIFFICULTY_CONFIG[this.settings.difficulty] || DIFFICULTY_CONFIG.normal;
    const wordData = this.sessionPool[Math.floor(Math.random() * this.sessionPool.length)];
    const speedMul = cfg.speedMultiplier * this.getFishSpeedMultiplier();
    this.fishes.push(new Fish(wordData, this.bounds, speedMul));
  }

  ensureTimeAttackFishCount() {
    while (this.playMode === "timeattack" && this.fishes.length < TIME_ATTACK_FISH_COUNT) {
      this.spawnOneTimeAttackFish();
    }
  }

  pauseGame(reason) {
    if (this.state !== "PLAYING") {
      return;
    }
    this.state = "PAUSED";
    this.pauseReason = reason;
    this.pauseStarted = performance.now();
    if (reason === "pause") {
      this.pauseOverlay.classList.remove("hidden");
      this.pauseOverlay.classList.add("active");
    }
    this.updateRecentLogTickerVisibility();
  }

  resumeGame() {
    if (this.state !== "PAUSED") {
      return;
    }
    if (this.pauseStarted) {
      this.accumulatedPauseMs += performance.now() - this.pauseStarted;
    }
    this.pauseStarted = 0;
    this.pauseReason = null;
    this.state = "PLAYING";
    this.pauseOverlay.classList.add("hidden");
    this.pauseOverlay.classList.remove("active");
    this.updateRecentLogTickerVisibility();
  }

  confirmExitToMenu() {
    if (this.state !== "PLAYING" && this.state !== "PAUSED") {
      return;
    }
    if (!window.confirm("確定要退出並返回主畫面？本局將不會寫入戰績結算。")) {
      return;
    }
    this.pauseStarted = 0;
    this.pauseReason = null;
    this.pauseOverlay.classList.add("hidden");
    this.pauseOverlay.classList.remove("active");
    this.tutorialOverlay.classList.add("hidden");
    this.tutorialOverlay.classList.remove("active");
    this.backToMenu();
  }

  openTutorial() {
    const wasPlaying = this.state === "PLAYING";
    if (wasPlaying) {
      this.pauseGame("tutorial");
    }
    this.tutorialOverlay.classList.remove("hidden");
    this.tutorialOverlay.classList.add("active");
  }

  closeTutorial() {
    this.tutorialOverlay.classList.add("hidden");
    this.tutorialOverlay.classList.remove("active");
    if (this.state === "PAUSED" && this.pauseReason === "tutorial") {
      this.resumeGame();
    }
  }

  backToMenu() {
    this.state = "MENU";
    this.pauseReason = null;
    this.fishes = [];
    this.particles = [];
    this.scorePopups = [];
    this.comboCount = 0;
    this.comboTimeLeft = 0;
    this.hudTaBlock.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.helpBtn.classList.add("hidden");
    this.tanksArea.classList.add("hidden");
    this.gameoverOverlay.classList.add("hidden");
    this.gameoverOverlay.classList.remove("active");
    this.pauseOverlay.classList.add("hidden");
    this.pauseOverlay.classList.remove("active");
    this.tutorialOverlay.classList.add("hidden");
    this.tutorialOverlay.classList.remove("active");
    this.menuOverlay.classList.remove("hidden");
    this.menuOverlay.classList.add("active");
    this.renderBestStats();
    this.updateRecentLogTickerVisibility();
  }

  openSettings() {
    this.volumeSlider.value = this.settings.volume;
    this.fullscreenToggle.checked = this.settings.fullscreen;
    this.difficultySelect.value = this.settings.difficulty;
    this.wordsPerRoundInput.value = String(clampWordsPerRound(this.settings.wordsPerRound));
    this.syncSettingsPlayModeRadiosFromSettings();
    if (this.settingsTaTimeLimit) {
      this.settingsTaTimeLimit.value = String(clampTaTimeLimitSec(this.settings.timeAttackDurationSec));
    }
    if (this.settingsFishSpeed) {
      this.settingsFishSpeed.value = String(clampFishSpeedScale(this.settings.fishSpeedScale));
    }
    if (this.settingsPronunciationToggle) {
      this.settingsPronunciationToggle.checked = Boolean(this.settings.pronunciationEnabled);
    }
    this.updateSettingsTaTimeLabel();
    this.updateSettingsFishSpeedLabel();
    this.refreshSettingsTaTimeRowVisibility();
    this.settingsOverlay.classList.remove("hidden");
    this.settingsOverlay.classList.add("active");
  }

  refreshSettingsTaTimeRowVisibility() {
    if (!this.settingsTaTimeRow) {
      return;
    }
    const taSelected = [...document.querySelectorAll('input[name="settings-play-mode"]')].some(
      (el) => el.checked && el.value === "timeattack"
    );
    this.settingsTaTimeRow.style.display = taSelected ? "" : "none";
  }

  closeSettings() {
    this.settingsOverlay.classList.add("hidden");
    this.settingsOverlay.classList.remove("active");
  }

  async saveSettings() {
    this.settings.volume = Number(this.volumeSlider.value);
    this.settings.fullscreen = Boolean(this.fullscreenToggle.checked);
    this.settings.difficulty = this.difficultySelect.value;
    this.settings.wordsPerRound = clampWordsPerRound(this.wordsPerRoundInput.value);
    const settingsModeEl = document.querySelector('input[name="settings-play-mode"]:checked');
    if (settingsModeEl && (settingsModeEl.value === "zen" || settingsModeEl.value === "timeattack")) {
      this.settings.playMode = settingsModeEl.value;
    }
    if (this.settingsTaTimeLimit) {
      this.settings.timeAttackDurationSec = clampTaTimeLimitSec(this.settingsTaTimeLimit.value);
    }
    if (this.settingsFishSpeed) {
      this.settings.fishSpeedScale = clampFishSpeedScale(this.settingsFishSpeed.value);
    }
    if (this.settingsPronunciationToggle) {
      this.settings.pronunciationEnabled = Boolean(this.settingsPronunciationToggle.checked);
    }
    this.syncMainMenuPlayModeFromSettings();
    this.savePrefs();
    this.applyAudioVolumeGain();
    if (this.settings.fullscreen && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (_err) {
        this.settings.fullscreen = false;
        this.fullscreenToggle.checked = false;
      }
    } else if (!this.settings.fullscreen && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (_err) {
        // Keep current mode on exit failure.
      }
    }
    this.closeSettings();
  }

  pickRandomWords(source, count) {
    const copy = [...source];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }

  getTopFishAtPoint(x, y) {
    for (let i = this.fishes.length - 1; i >= 0; i -= 1) {
      const fish = this.fishes[i];
      if (fish.containsPoint(x, y)) {
        return fish;
      }
    }
    return null;
  }

  getTankAtClientPoint(clientX, clientY) {
    return this.tanks.find((t) => t.containsPoint(clientX, clientY)) || null;
  }

  highlightTankByClientPoint(clientX, clientY) {
    const tank = this.getTankAtClientPoint(clientX, clientY);
    this.tanks.forEach((t) => t.setActive(t === tank));
  }

  clearTankHighlight() {
    this.tanks.forEach((t) => t.setActive(false));
  }

  syncMainMenuPlayModeFromSettings() {
    const mode = this.settings.playMode === "timeattack" ? "timeattack" : "zen";
    const zenRadio = document.querySelector('input[name="play-mode"][value="zen"]');
    const taRadio = document.querySelector('input[name="play-mode"][value="timeattack"]');
    if (zenRadio) {
      zenRadio.checked = mode === "zen";
    }
    if (taRadio) {
      taRadio.checked = mode === "timeattack";
    }
  }

  syncSettingsPlayModeRadiosFromSettings() {
    document.querySelectorAll('input[name="settings-play-mode"]').forEach((el) => {
      const input = el;
      input.checked = input.value === this.settings.playMode;
    });
  }

  getFishSpeedMultiplier() {
    return clampFishSpeedScale(this.settings.fishSpeedScale);
  }

  initAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    if (!this.audioCtx) {
      this.audioCtx = new Ctx();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.connect(this.audioCtx.destination);
    }
    this.applyAudioVolumeGain();
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
  }

  applyAudioVolumeGain() {
    if (!this.masterGain) {
      return;
    }
    this.masterGain.gain.value = (this.settings.volume / 100) * 0.55;
  }

  refreshTtsVoiceList() {
    if (!window.speechSynthesis) {
      return;
    }
    const voices = window.speechSynthesis.getVoices() || [];
    const langEn = (v) => {
      const raw = (v.lang || "").toLowerCase().replace(/_/g, "-");
      return raw.startsWith("en");
    };
    const enAny = voices.filter(langEn);
    const enLocal = enAny.filter((v) => v.localService === true);
    this.ttsVoice =
      enLocal[0] ||
      enAny[0] ||
      voices.find((v) => /english|en-/i.test(v.name || "")) ||
      null;
  }

  warmupSpeechSynthesis() {
    const syn = window.speechSynthesis;
    if (!syn || this.ttsPrimed) {
      return;
    }
    this.ttsPrimed = true;
    if (typeof syn.resume === "function") {
      try {
        syn.resume();
      } catch (_e) {
        // Ignore.
      }
    }
    // Prime iOS voice pipeline on first user gesture.
    try {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      primer.rate = 1;
      syn.cancel();
      syn.speak(primer);
      setTimeout(() => syn.cancel(), 30);
    } catch (_err) {
      // Ignore; not all browsers allow silent primer utterance.
    }
  }

  speakWordOnGrab(word) {
    if (!this.settings.pronunciationEnabled || !word) {
      return;
    }
    const syn = window.speechSynthesis;
    if (!syn) {
      return;
    }
    if (typeof syn.resume === "function") {
      try {
        syn.resume();
      } catch (_e) {
        /* iOS may throw if not paused */
      }
    }
    const runSpeak = () => {
      this.refreshTtsVoiceList();
      const u = new SpeechSynthesisUtterance(String(word));
      u.lang = "en-US";
      if (this.ttsVoice) {
        u.voice = this.ttsVoice;
        const L = (this.ttsVoice.lang || "en-US").replace(/_/g, "-");
        u.lang = /^en/i.test(L) ? L : "en-US";
      }
      u.rate = 0.92;
      u.volume = 1;
      u.onerror = () => {
        // Retry once with browser default voice.
        try {
          const fb = new SpeechSynthesisUtterance(String(word));
          fb.lang = "en-US";
          fb.rate = 0.92;
          fb.volume = 1;
          syn.cancel();
          syn.speak(fb);
        } catch (_e) {
          // Ignore.
        }
      };
      syn.cancel();
      syn.speak(u);
    };
    const vlist = syn.getVoices() || [];
    if (vlist.length > 0) {
      runSpeak();
    } else {
      let done = false;
      const once = () => {
        if (done) {
          return;
        }
        done = true;
        syn.removeEventListener("voiceschanged", once);
        clearTimeout(retryTimer);
        runSpeak();
      };
      syn.addEventListener("voiceschanged", once);
      const retryTimer = setTimeout(once, 750);
    }
  }

  playDing() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    if (!this.audioCtx) {
      this.audioCtx = new Ctx();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.connect(this.audioCtx.destination);
    }
    this.applyAudioVolumeGain();
    const ctx = this.audioCtx;
    const master = this.masterGain;
    if (!ctx || !master) {
      return;
    }
    const schedule = () => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.28, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 0.2);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(schedule).catch(schedule);
    } else {
      schedule();
    }
  }

  playBuzz() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    if (!this.audioCtx) {
      this.audioCtx = new Ctx();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.connect(this.audioCtx.destination);
    }
    this.applyAudioVolumeGain();
    const ctx = this.audioCtx;
    const master = this.masterGain;
    if (!ctx || !master) {
      return;
    }
    const schedule = () => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(90, now + 0.12);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 0.24);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(schedule).catch(schedule);
    } else {
      schedule();
    }
  }

  cancelFishDropOutsideTanks(fish) {
    const cfg = DIFFICULTY_CONFIG[this.settings.difficulty] || DIFFICULTY_CONFIG.normal;
    const speedMul = cfg.speedMultiplier * this.getFishSpeedMultiplier();
    fish.snapping = false;
    fish.restoreSwimmingVelocity(speedMul);
  }

  wrongDropImmediateScoring(fish) {
    if (this.playMode === "timeattack") {
      if (this.comboCount > 0) {
        this.triggerComboBreak("wrong");
      }
      this.comboCount = 0;
      this.comboTimeLeft = 0;
      this.score = Math.max(0, this.score - SCORE_WRONG);
      this.wrongCount += 1;
      this.scorePopups.push(new ScorePopup(fish.x, fish.y, `-${SCORE_WRONG}`, false));
      if (!this.mistakes[fish.suffix]) {
        this.mistakes[fish.suffix] = [];
      }
      this.mistakes[fish.suffix].push(fish.word);
      this.updateComboHud({ pulse: false });
    } else {
      this.wrongCount += 1;
      if (!this.mistakes[fish.suffix]) {
        this.mistakes[fish.suffix] = [];
      }
      this.mistakes[fish.suffix].push(fish.word);
    }
    this.updateHud();
  }

  applyWrongDropImmediate(fish, playerChoiceTankName) {
    this.playBuzz();
    this.emitParticles(fish.x, fish.y, false);
    this.wrongDropImmediateScoring(fish);
    this.appendLearningHistoryEntry({
      word: fish.word,
      playerChoice: String(playerChoiceTankName || ""),
      correctPOS: fish.pos,
      isCorrect: false,
      timestamp: Date.now()
    });
    fish.noDrag = true;
    fish.errorState = true;
    fish.dragging = false;
    fish.snapping = false;
    fish.vx = 0;
    fish.vy = 0;
    const correctTankName = fish.pos;
    const tank = this.tanks.find((t) => t.name === correctTankName);
    if (!tank) {
      fish.removed = true;
      this.onWrongCorrectionFinished(fish);
      return;
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    const center = tank.getCenterCanvas(canvasRect);
    const tx = center.x;
    const ty = center.y;
    const dist = Math.hypot(tx - fish.x, ty - fish.y);
    const dur = Math.min(
      CORRECTION_DURATION_MAX,
      Math.max(CORRECTION_DURATION_MIN, 1 + (dist / 1200) * 0.5)
    );
    fish.startCorrectionTo(tx, ty, dur, this);
  }

  onWrongCorrectionFinished(fish) {
    this.fishes = this.fishes.filter((f) => f !== fish);
    if (this.playMode === "timeattack") {
      this.ensureTimeAttackFishCount();
      return;
    }
    if (this.correctCount + this.wrongCount >= this.totalWords) {
      this.finishGame(false);
    }
  }

  updateSettingsTaTimeLabel() {
    if (!this.settingsTaTimeLimit || !this.settingsTaTimeValue) {
      return;
    }
    const sec = clampTaTimeLimitSec(this.settingsTaTimeLimit.value);
    this.settingsTaTimeValue.textContent = `${sec}s`;
  }

  fishSpeedLabel(scale) {
    const s = clampFishSpeedScale(scale);
    if (s < 0.85) {
      return "Slow";
    }
    if (s > 1.2) {
      return "Fast";
    }
    return "Normal";
  }

  updateSettingsFishSpeedLabel() {
    if (!this.settingsFishSpeed || !this.settingsFishSpeedValue) {
      return;
    }
    const s = clampFishSpeedScale(this.settingsFishSpeed.value);
    this.settingsFishSpeedValue.textContent = `${this.fishSpeedLabel(s)} (${s.toFixed(2)}×)`;
  }

  emitParticles(x, y, isCorrect) {
    const color = isCorrect ? "rgba(90,255,135,0.95)" : "rgba(255,95,95,0.95)";
    for (let i = 0; i < 22; i += 1) {
      this.particles.push(new Particle(x, y, color));
    }
  }

  pulseComboMeter() {
    this.comboMeter.classList.remove("pulse");
    void this.comboMeter.offsetWidth;
    this.comboMeter.classList.add("pulse");
  }

  triggerComboBreak(_reason) {
    this.comboMeter.classList.remove("shake");
    void this.comboMeter.offsetWidth;
    this.comboMeter.classList.add("shake");
    setTimeout(() => this.comboMeter.classList.remove("shake"), 500);
    this.scorePopups.push(
      new ScorePopup(this.bounds.width / 2, this.bounds.playTop + 48, "Combo Broken!", false)
    );
  }

  updateComboHud(options = {}) {
    const { pulse = false } = options;
    if (this.playMode !== "timeattack") {
      return;
    }
    this.hudScore.textContent = String(this.score);
    this.comboMeter.textContent = `COMBO x${this.comboCount}`;
    const fill = this.comboCount > 0 ? Math.max(0, Math.min(1, this.comboTimeLeft / COMBO_WINDOW_SEC)) : 0;
    this.comboBarFill.style.width = `${fill * 100}%`;
    if (pulse) {
      this.pulseComboMeter();
    }
  }

  resolveFishInTankCorrect(fish, tank) {
    if (tank.name !== fish.pos) {
      return;
    }
    this.playDing();
    this.appendLearningHistoryEntry({
      word: fish.word,
      playerChoice: tank.name,
      correctPOS: fish.pos,
      isCorrect: true,
      timestamp: Date.now()
    });
    fish.removed = true;

    if (this.playMode === "timeattack") {
      this.comboCount += 1;
      this.comboTimeLeft = COMBO_WINDOW_SEC;
      const bonus = Math.max(0, this.comboCount - 1) * COMBO_BONUS_PER_STREAK;
      const pts = SCORE_CORRECT_BASE + bonus;
      this.score += pts;
      this.correctCount += 1;
      const label = bonus > 0 ? `+${pts} (Combo x${this.comboCount})` : `+${pts}`;
      this.scorePopups.push(new ScorePopup(fish.x, fish.y, label, true));
      this.emitParticles(fish.x, fish.y, true);
      this.fishes = this.fishes.filter((f) => !f.removed);
      this.ensureTimeAttackFishCount();
      this.updateComboHud({ pulse: true });
      this.updateHud();
      return;
    }

    this.correctCount += 1;
    this.emitParticles(fish.x, fish.y, true);
    this.fishes = this.fishes.filter((f) => !f.removed);
    this.updateHud();
    if (this.correctCount + this.wrongCount >= this.totalWords) {
      this.finishGame(false);
    }
  }

  handleFishDrop(fish, clientX, clientY) {
    if (this.state !== "PLAYING" || fish.removed || fish.snapping || fish.correctionMode || fish.noDrag) {
      return;
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    const fishClientX = canvasRect.left + fish.x;
    const fishClientY = canvasRect.top + fish.y;
    const tank =
      this.getTankAtClientPoint(clientX, clientY) || this.getTankAtClientPoint(fishClientX, fishClientY);
    if (!tank) {
      this.cancelFishDropOutsideTanks(fish);
      return;
    }
    if (tank.name !== fish.pos) {
      this.applyWrongDropImmediate(fish, tank.name);
      return;
    }
    const center = tank.getCenterCanvas(canvasRect);
    fish.startSnap(center.x, center.y);
    setTimeout(() => {
      if (!fish.removed && !fish.correctionMode) {
        this.resolveFishInTankCorrect(fish, tank);
      }
    }, 120);
  }

  finishGame(isTimeout) {
    this.state = "GAME_OVER";
    this.pauseReason = null;
    this.updateRecentLogTickerVisibility();
    this.elapsedMs = this.getElapsedMs();
    this.helpBtn.classList.add("hidden");
    this.hudTaBlock.classList.add("hidden");

    const totalAttempts = this.correctCount + this.wrongCount;
    const accuracy = totalAttempts === 0 ? 100 : Math.round((this.correctCount / totalAttempts) * 100);

    if (this.playMode === "timeattack") {
      this.gameoverTitle.textContent = "Time Attack 結束";
      const tag = isTimeout ? "（時間到）" : "";
      this.resultSummary.textContent = `分數 ${this.score} | 排序 ${totalAttempts} 次 | 準確率 ${accuracy}%${tag}`;
    } else {
      this.gameoverTitle.textContent = "Game Complete";
      const timeoutTag = isTimeout ? " (Time Up)" : "";
      this.resultSummary.textContent = `Total Time: ${this.formatTime(this.elapsedMs)} | Final Accuracy: ${accuracy}%${timeoutTag}`;
    }

    if (accuracy > this.stats.bestAccuracy) {
      this.stats.bestAccuracy = accuracy;
    }
    if (this.playMode === "zen") {
      if (this.stats.bestTimeMs == null || this.elapsedMs < this.stats.bestTimeMs) {
        this.stats.bestTimeMs = this.elapsedMs;
      }
    }
    Object.entries(this.mistakes).forEach(([suffix, words]) => {
      this.stats.weaknessHistory[suffix] = (this.stats.weaknessHistory[suffix] || 0) + words.length;
    });
    this.saveStats();
    this.renderBestStats();

    this.appendGameRecord({
      ts: Date.now(),
      at: new Date().toISOString(),
      gameMode: this.playMode,
      difficulty: this.settings.difficulty,
      wordCount: this.playMode === "zen" ? this.totalWords : totalAttempts,
      accuracy,
      score: this.playMode === "timeattack" ? this.score : undefined,
      timeMs: Math.round(this.elapsedMs),
      correct: this.correctCount,
      wrong: this.wrongCount,
      isTimeout: Boolean(isTimeout)
    });

    const currentEntries = Object.entries(this.mistakes)
      .map(([suffix, words]) => ({ suffix, words, count: words.length }))
      .sort((a, b) => b.count - a.count);
    const historyTop = Object.entries(this.stats.weaknessHistory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([suffix, count]) => `${suffix} (${count})`)
      .join(", ");

    if (currentEntries.length === 0) {
      this.weaknessList.innerHTML = `<p class="weakness-item">Perfect sorting. No suffix weaknesses found.</p>`;
    } else {
      this.weaknessList.innerHTML = currentEntries
        .map((entry) => {
          const uniqueWords = [...new Set(entry.words)];
          return `<p class="weakness-item">⚠️ You struggled with "${entry.suffix}" (${entry.count} mistakes): ${uniqueWords.join(", ")}</p>`;
        })
        .join("");
    }
    if (historyTop) {
      this.weaknessList.innerHTML += `<p class="weakness-item">📌 Historical weak suffixes: ${historyTop}</p>`;
    }

    this.gameoverOverlay.classList.remove("hidden");
    this.gameoverOverlay.classList.add("active");
  }

  getElapsedMs() {
    if (!this.startMs) {
      return 0;
    }
    return Math.max(0, performance.now() - this.startMs - this.accumulatedPauseMs);
  }

  updateHud() {
    if (this.playMode === "timeattack") {
      this.hudTimeCaption.textContent = "剩餘";
      const remainingMs = Math.max(0, this.timeLimitSec * 1000 - this.getElapsedMs());
      this.hudTime.textContent = this.formatTime(remainingMs);
      const attempts = this.correctCount + this.wrongCount;
      const accuracy = attempts === 0 ? 100 : Math.round((this.correctCount / attempts) * 100);
      this.hudProgress.textContent = `${attempts} 次`;
      this.hudAccuracy.textContent = `${accuracy}%`;
      this.updateComboHud({ pulse: false });
      return;
    }

    this.hudTimeCaption.textContent = "經過";
    this.hudTime.textContent = this.formatTime(this.getElapsedMs());
    const attempts = this.correctCount + this.wrongCount;
    const accuracy = attempts === 0 ? 100 : Math.round((this.correctCount / attempts) * 100);
    this.hudProgress.textContent = `${attempts}/${this.totalWords}`;
    this.hudAccuracy.textContent = `${accuracy}%`;
  }

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  update(dt) {
    const shouldAnimate = this.state === "PLAYING";
    if (shouldAnimate) {
      if (this.playMode === "zen") {
        this.updateHud();
        this.fishes.forEach((fish) => fish.update(dt));
      } else {
        this.elapsedMs = this.getElapsedMs();
        const remainingMs = this.timeLimitSec * 1000 - this.elapsedMs;
        if (remainingMs <= 0) {
          this.finishGame(true);
          return;
        }
        if (this.comboCount > 0) {
          this.comboTimeLeft -= dt;
          if (this.comboTimeLeft <= 0) {
            this.comboTimeLeft = 0;
            this.comboCount = 0;
            this.triggerComboBreak("timeout");
            this.updateComboHud({ pulse: false });
          }
        }
        this.updateHud();
        this.fishes.forEach((fish) => fish.update(dt));
      }
    }
    this.scorePopups.forEach((p) => p.update(dt));
    this.scorePopups = this.scorePopups.filter((p) => p.life > 0);
    this.particles.forEach((p) => p.update(dt));
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.bounds.width, this.bounds.height);
    this.fishes.forEach((fish) => fish.draw(this.ctx));
    this.particles.forEach((p) => p.draw(this.ctx));
    this.scorePopups.forEach((p) => p.draw(this.ctx));
  }

  loop(ts) {
    if (!this.lastFrameTime) {
      this.lastFrameTime = ts;
    }
    const dt = Math.min(0.04, (ts - this.lastFrameTime) / 1000);
    this.lastFrameTime = ts;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.loop);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const game = new Game();
  game.init();
});
