const STORAGE_KEYS = {
  prefs: "deepsea_word_aquarium_prefs",
  wordBank: "deepsea_word_aquarium_word_bank",
  practiceHistory: "deepsea_word_aquarium_practice_history",
  wordStats: "deepsea_word_aquarium_word_stats",
  mistakeBank: "deepsea_word_aquarium_mistake_bank"
};

const LEGACY_STORAGE_KEYS = {
  practiceHistory: [
    "deepsea_word_aquarium_learning_history",
    "deepsea_word_aquarium_sandbox_log"
  ],
  legacyStats: "deepsea_word_aquarium_stats"
};

const POS_CHOICES = ["Noun", "Verb", "Adjective", "Adverb"];
const POS_HINT_LABELS = {
  Noun: "nouns",
  Verb: "verbs",
  Adjective: "adjectives",
  Adverb: "adverbs"
};
const QUESTIONS_PER_SESSION_OPTIONS = [10, 20, 30];
const DEFAULT_SETTINGS = {
  questionsPerSession: 10,
  practiceFocus: "all",
  showSuffixHintAfterAnswer: true,
  autoNextQuestion: false
};
const HISTORY_MAX = 300;
const CONFIDENT_ERROR_MS = 2000;
const SLOW_CORRECT_MS = 5000;
const AUTO_NEXT_DELAY_MS = 900;
const FOCUS_LABELS = {
  all: "All",
  mistakes: "Mistakes Only",
  weak_suffixes: "Weak Suffixes"
};

function clampQuestionsPerSession(value) {
  const parsed = Number.parseInt(String(value), 10);
  return QUESTIONS_PER_SESSION_OPTIONS.includes(parsed) ? parsed : DEFAULT_SETTINGS.questionsPerSession;
}

function normalizePracticeFocus(value) {
  return Object.prototype.hasOwnProperty.call(FOCUS_LABELS, value) ? value : DEFAULT_SETTINGS.practiceFocus;
}

function normalizeWordEntry(row) {
  if (!row || typeof row.word !== "string" || typeof row.pos !== "string" || typeof row.suffix !== "string") {
    return null;
  }

  const word = row.word.trim();
  const pos = row.pos.trim();
  const suffix = row.suffix.trim().startsWith("-") ? row.suffix.trim() : `-${row.suffix.trim()}`;

  if (!word || !POS_CHOICES.includes(pos) || !suffix || suffix === "-") {
    return null;
  }

  return { word, pos, suffix };
}

function dedupeWordEntries(list) {
  const map = new Map();
  (list || []).forEach((row) => {
    const normalized = normalizeWordEntry(row);
    if (!normalized) {
      return;
    }
    const key = `${normalized.word.toLowerCase()}|${normalized.pos}|${normalized.suffix.toLowerCase()}`;
    map.set(key, normalized);
  });
  return [...map.values()];
}

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDurationMs(ms, digits = 1) {
  return `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(digits)}s`;
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-Hant");
}

function weightedPickIndex(items) {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
  if (totalWeight <= 0) {
    return 0;
  }

  let threshold = Math.random() * totalWeight;
  for (let index = 0; index < items.length; index += 1) {
    threshold -= Math.max(0, Number(items[index].weight) || 0);
    if (threshold <= 0) {
      return index;
    }
  }

  return items.length - 1;
}

function sanitizeStatRecord(raw) {
  const correct = Number(raw && raw.correct);
  const wrong = Number(raw && raw.wrong);
  const consecutiveCorrect = Number(raw && raw.consecutiveCorrect);
  const attempts = Number(raw && raw.attempts);
  const totalResponseMs = Number(raw && raw.totalResponseMs);
  const lastSeenAt = Number(raw && raw.lastSeenAt);

  return {
    correct: Number.isFinite(correct) ? Math.max(0, correct) : 0,
    wrong: Number.isFinite(wrong) ? Math.max(0, wrong) : 0,
    consecutiveCorrect: Number.isFinite(consecutiveCorrect) ? Math.max(0, consecutiveCorrect) : 0,
    attempts: Number.isFinite(attempts)
      ? Math.max(0, attempts)
      : (Number.isFinite(correct) ? Math.max(0, correct) : 0) + (Number.isFinite(wrong) ? Math.max(0, wrong) : 0),
    totalResponseMs: Number.isFinite(totalResponseMs) ? Math.max(0, totalResponseMs) : 0,
    lastSeenAt: Number.isFinite(lastSeenAt) ? Math.max(0, lastSeenAt) : 0
  };
}

function sanitizeMistakeEntry(raw) {
  const weight = Number(raw && raw.weight);
  const wrongCount = Number(raw && raw.wrongCount);
  const correctCount = Number(raw && raw.correctCount);
  const confidentErrorCount = Number(raw && raw.confidentErrorCount);
  const slowCorrectCount = Number(raw && raw.slowCorrectCount);
  const consecutiveCorrect = Number(raw && raw.consecutiveCorrect);
  const lastWrongAt = Number(raw && raw.lastWrongAt);
  const lastCorrectAt = Number(raw && raw.lastCorrectAt);

  return {
    questionId: String((raw && raw.questionId) || ""),
    prompt: String((raw && raw.prompt) || ""),
    correctAnswer: String((raw && raw.correctAnswer) || ""),
    suffix: String((raw && raw.suffix) || ""),
    category: String((raw && raw.category) || "suffix-pos"),
    weight: Number.isFinite(weight) ? Math.max(1, weight) : 1,
    wrongCount: Number.isFinite(wrongCount) ? Math.max(0, wrongCount) : 0,
    correctCount: Number.isFinite(correctCount) ? Math.max(0, correctCount) : 0,
    confidentErrorCount: Number.isFinite(confidentErrorCount) ? Math.max(0, confidentErrorCount) : 0,
    slowCorrectCount: Number.isFinite(slowCorrectCount) ? Math.max(0, slowCorrectCount) : 0,
    consecutiveCorrect: Number.isFinite(consecutiveCorrect) ? Math.max(0, consecutiveCorrect) : 0,
    lastWrongAt: Number.isFinite(lastWrongAt) ? Math.max(0, lastWrongAt) : 0,
    lastCorrectAt: Number.isFinite(lastCorrectAt) ? Math.max(0, lastCorrectAt) : 0
  };
}

class PracticeApp {
  constructor() {
    this.settings = this.loadPrefs();
    this.seedWordBank = [];
    this.wordBank = [];
    this.questions = [];
    this.questionsById = new Map();
    this.questionsByPrompt = new Map();
    this.practiceHistory = [];
    this.wordStats = {};
    this.mistakeBank = {};
    this.legacyStats = this.readStorageJson(LEGACY_STORAGE_KEYS.legacyStats, {});
    this.session = null;
    this.currentQuestionStartedAt = 0;
    this.practiceClockTimer = null;
    this.autoNextTimer = null;

    this.cacheElements();
    this.bindUI();
  }

  cacheElements() {
    this.menuScreen = document.getElementById("menu-screen");
    this.practiceScreen = document.getElementById("practice-screen");
    this.summaryScreen = document.getElementById("summary-screen");
    this.menuOverview = document.getElementById("menu-overview");

    this.startPracticeBtn = document.getElementById("start-practice-btn");
    this.reviewMistakesBtn = document.getElementById("review-mistakes-btn");
    this.questionBankBtn = document.getElementById("question-bank-btn");
    this.progressBtn = document.getElementById("progress-btn");
    this.settingsBtn = document.getElementById("settings-btn");

    this.practiceFocusLabel = document.getElementById("practice-focus-label");
    this.practiceProgress = document.getElementById("practice-progress");
    this.practiceAccuracy = document.getElementById("practice-accuracy");
    this.practiceElapsed = document.getElementById("practice-elapsed");
    this.practiceCategory = document.getElementById("practice-category");
    this.questionPrompt = document.getElementById("question-prompt");
    this.questionMeta = document.getElementById("question-meta");
    this.feedbackPanel = document.getElementById("feedback-panel");
    this.choiceButtons = [...document.querySelectorAll(".choice-btn")];
    this.nextQuestionBtn = document.getElementById("next-question-btn");
    this.practiceExitBtn = document.getElementById("practice-exit-btn");

    this.summaryTitle = document.getElementById("summary-title");
    this.summaryMetrics = document.getElementById("summary-metrics");
    this.summaryHighlights = document.getElementById("summary-highlights");
    this.summaryReviewBtn = document.getElementById("summary-review-btn");
    this.summaryRestartBtn = document.getElementById("summary-restart-btn");
    this.summaryMenuBtn = document.getElementById("summary-menu-btn");

    this.questionBankOverlay = document.getElementById("question-bank-overlay");
    this.questionBankCloseBtn = document.getElementById("question-bank-close-btn");
    this.questionBankFilter = document.getElementById("question-bank-filter");
    this.questionBankTbody = document.getElementById("question-bank-tbody");
    this.questionBankCount = document.getElementById("question-bank-count");
    this.questionBankForm = document.getElementById("question-bank-form");
    this.questionBankEditIndex = document.getElementById("question-bank-edit-index");
    this.questionBankWord = document.getElementById("question-bank-word");
    this.questionBankPos = document.getElementById("question-bank-pos");
    this.questionBankSuffix = document.getElementById("question-bank-suffix");
    this.questionBankFormClearBtn = document.getElementById("question-bank-form-clear-btn");
    this.questionBankMergeJsonBtn = document.getElementById("question-bank-merge-json-btn");
    this.questionBankImportBtn = document.getElementById("question-bank-import-btn");
    this.questionBankExportBtn = document.getElementById("question-bank-export-btn");
    this.questionBankImportFile = document.getElementById("question-bank-import-file");

    this.progressOverlay = document.getElementById("progress-overlay");
    this.progressCloseBtn = document.getElementById("progress-close-btn");
    this.progressOverview = document.getElementById("progress-overview");
    this.progressLogTbody = document.getElementById("progress-log-tbody");
    this.progressClearHistoryBtn = document.getElementById("progress-clear-history-btn");
    this.progressClearMistakesBtn = document.getElementById("progress-clear-mistakes-btn");

    this.settingsOverlay = document.getElementById("settings-overlay");
    this.settingsCloseBtn = document.getElementById("settings-close-btn");
    this.settingsSaveBtn = document.getElementById("settings-save-btn");
    this.settingsSessionSize = document.getElementById("settings-session-size");
    this.settingsFocus = document.getElementById("settings-focus");
    this.settingsShowHint = document.getElementById("settings-show-hint");
    this.settingsAutoNext = document.getElementById("settings-auto-next");
  }

  bindUI() {
    this.startPracticeBtn.addEventListener("click", () => this.startPractice({ focus: this.settings.practiceFocus }));
    this.reviewMistakesBtn.addEventListener("click", () => this.startPractice({ focus: "mistakes" }));
    this.questionBankBtn.addEventListener("click", () => this.openQuestionBankOverlay());
    this.progressBtn.addEventListener("click", () => this.openProgressOverlay());
    this.settingsBtn.addEventListener("click", () => this.openSettingsOverlay());
    this.nextQuestionBtn.addEventListener("click", () => this.advanceToNextQuestion());
    this.practiceExitBtn.addEventListener("click", () => this.confirmExitPractice());
    this.summaryReviewBtn.addEventListener("click", () => this.startPractice({ focus: "mistakes" }));
    this.summaryRestartBtn.addEventListener("click", () => this.startPractice({ focus: this.settings.practiceFocus }));
    this.summaryMenuBtn.addEventListener("click", () => this.showScreen("menu"));

    this.choiceButtons.forEach((button) => {
      button.addEventListener("click", () => this.onChoiceSelected(button.dataset.choice || ""));
    });

    this.questionBankCloseBtn.addEventListener("click", () => this.closeOverlay(this.questionBankOverlay));
    this.questionBankFilter.addEventListener("input", () => this.renderQuestionBankTable());
    this.questionBankForm.addEventListener("submit", (event) => this.onQuestionBankSubmit(event));
    this.questionBankFormClearBtn.addEventListener("click", () => this.clearQuestionBankForm());
    this.questionBankMergeJsonBtn.addEventListener("click", () => this.mergeSeedWordBank());
    this.questionBankImportBtn.addEventListener("click", () => this.questionBankImportFile.click());
    this.questionBankImportFile.addEventListener("change", (event) => this.onQuestionBankImport(event));
    this.questionBankExportBtn.addEventListener("click", () => this.exportWordBank());
    this.questionBankTbody.addEventListener("click", (event) => this.onQuestionBankTableClick(event));

    this.progressCloseBtn.addEventListener("click", () => this.closeOverlay(this.progressOverlay));
    this.progressClearHistoryBtn.addEventListener("click", () => this.clearPracticeHistory());
    this.progressClearMistakesBtn.addEventListener("click", () => this.clearMistakeBank());

    this.settingsCloseBtn.addEventListener("click", () => this.closeOverlay(this.settingsOverlay));
    this.settingsSaveBtn.addEventListener("click", () => this.saveSettings());

    window.addEventListener("keydown", (event) => this.onKeyDown(event));
  }

  async init() {
    const fetched = await this.fetchWordBankFromFile();
    const stored = this.loadWordBankFromStorage();
    this.seedWordBank = fetched.length > 0 ? fetched : this.getFallbackWordBank();
    this.wordBank = stored.length > 0 ? stored : this.seedWordBank;
    if (stored.length === 0) {
      this.saveWordBankToStorage();
    } else {
      this.rebuildQuestionCache();
    }

    this.practiceHistory = this.loadPracticeHistory();
    this.wordStats = this.loadWordStats();
    this.mistakeBank = this.loadMistakeBank();

    this.applySettingsToForm();
    this.renderQuestionBankTable();
    this.renderMenuOverview();
    this.renderProgressOverlay();
    this.showScreen("menu");
  }

  loadPrefs() {
    const raw = this.readStorageJson(STORAGE_KEYS.prefs, {});
    return {
      questionsPerSession: clampQuestionsPerSession(raw.questionsPerSession != null ? raw.questionsPerSession : raw.wordsPerRound),
      practiceFocus: normalizePracticeFocus(raw.practiceFocus),
      showSuffixHintAfterAnswer: typeof raw.showSuffixHintAfterAnswer === "boolean" ? raw.showSuffixHintAfterAnswer : true,
      autoNextQuestion: typeof raw.autoNextQuestion === "boolean" ? raw.autoNextQuestion : false
    };
  }

  savePrefs() {
    const existing = this.readStorageJson(STORAGE_KEYS.prefs, {});
    const payload = {
      ...existing,
      questionsPerSession: clampQuestionsPerSession(this.settings.questionsPerSession),
      practiceFocus: normalizePracticeFocus(this.settings.practiceFocus),
      showSuffixHintAfterAnswer: Boolean(this.settings.showSuffixHintAfterAnswer),
      autoNextQuestion: Boolean(this.settings.autoNextQuestion)
    };
    this.writeStorageJson(STORAGE_KEYS.prefs, payload);
  }

  readStorageJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  writeStorageJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {
      // Ignore storage quota or serialization failures to keep the UI usable.
    }
  }

  loadWordBankFromStorage() {
    const data = this.readStorageJson(STORAGE_KEYS.wordBank, []);
    return Array.isArray(data) ? dedupeWordEntries(data) : [];
  }

  saveWordBankToStorage() {
    this.wordBank = dedupeWordEntries(this.wordBank);
    this.writeStorageJson(STORAGE_KEYS.wordBank, this.wordBank);
    this.rebuildQuestionCache();
  }

  rebuildQuestionCache() {
    this.questions = this.wordBank.map((entry) => this.createQuestionFromWord(entry));
    this.questionsById = new Map(this.questions.map((question) => [question.id, question]));
    this.questionsByPrompt = new Map();
    this.questions.forEach((question) => {
      const key = question.prompt.toLowerCase();
      const bucket = this.questionsByPrompt.get(key) || [];
      bucket.push(question);
      this.questionsByPrompt.set(key, bucket);
    });
  }

  createQuestionFromWord(entry) {
    return {
      id: `word_${slugify(entry.word)}_${entry.pos.toLowerCase()}_${slugify(entry.suffix)}`,
      type: "text",
      prompt: entry.word,
      choices: [...POS_CHOICES],
      answer: entry.pos,
      suffix: entry.suffix,
      category: "suffix-pos",
      level: 1
    };
  }

  findQuestion(prompt, correctAnswer = "", suffix = "") {
    const key = String(prompt || "").trim().toLowerCase();
    if (!key) {
      return null;
    }
    const bucket = this.questionsByPrompt.get(key) || [];
    if (bucket.length === 0) {
      return null;
    }
    return (
      bucket.find((question) => question.answer === correctAnswer && (!suffix || question.suffix === suffix)) ||
      bucket.find((question) => question.answer === correctAnswer) ||
      bucket.find((question) => !suffix || question.suffix === suffix) ||
      bucket[0]
    );
  }

  buildFallbackQuestionFromRecord(record) {
    return {
      id: record.questionId || `legacy_${slugify(record.prompt)}_${record.timestamp}`,
      type: "text",
      prompt: record.prompt,
      choices: [...POS_CHOICES],
      answer: record.correctAnswer,
      suffix: record.suffix || "",
      category: record.category || "suffix-pos",
      level: 1
    };
  }

  getQuestionForRecord(record) {
    return this.questionsById.get(record.questionId) || this.findQuestion(record.prompt, record.correctAnswer, record.suffix) || this.buildFallbackQuestionFromRecord(record);
  }

  normalizePracticeRecord(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const prompt = String(raw.prompt != null ? raw.prompt : raw.word != null ? raw.word : "").trim();
    const correctAnswer = String(raw.correctAnswer != null ? raw.correctAnswer : raw.correctPOS != null ? raw.correctPOS : raw.pos != null ? raw.pos : "").trim();
    const userAnswer = String(raw.userAnswer != null ? raw.userAnswer : raw.playerChoice != null ? raw.playerChoice : "").trim();
    const responseTimeMs = raw.responseTimeMs != null ? Number(raw.responseTimeMs) : raw.timeSec != null ? Number(raw.timeSec) * 1000 : 0;
    const timestamp = Number(raw.timestamp || Date.now());
    const matchedQuestion = this.questionsById.get(String(raw.questionId || "")) || this.findQuestion(prompt, correctAnswer, String(raw.suffix || ""));
    const resolvedPrompt = matchedQuestion ? matchedQuestion.prompt : prompt;
    const resolvedAnswer = matchedQuestion ? matchedQuestion.answer : correctAnswer;
    if (!resolvedPrompt || !resolvedAnswer) {
      return null;
    }

    const isCorrect = typeof raw.isCorrect === "boolean" ? raw.isCorrect : userAnswer === resolvedAnswer;
    const safeResponseTimeMs = Number.isFinite(responseTimeMs) ? Math.max(0, Math.round(responseTimeMs)) : 0;
    return {
      questionId: matchedQuestion ? matchedQuestion.id : String(raw.questionId || `legacy_${slugify(resolvedPrompt)}`),
      prompt: resolvedPrompt,
      correctAnswer: resolvedAnswer,
      userAnswer,
      isCorrect,
      responseTimeMs: safeResponseTimeMs,
      isConfidentError: Boolean(raw.isConfidentError || (!isCorrect && safeResponseTimeMs > 0 && safeResponseTimeMs < CONFIDENT_ERROR_MS)),
      category: matchedQuestion ? matchedQuestion.category : String(raw.category || "suffix-pos"),
      suffix: matchedQuestion ? matchedQuestion.suffix : String(raw.suffix || ""),
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
    };
  }

  loadPracticeHistory() {
    const current = this.readStorageJson(STORAGE_KEYS.practiceHistory, null);
    if (Array.isArray(current)) {
      return current
        .map((entry) => this.normalizePracticeRecord(entry))
        .filter(Boolean)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, HISTORY_MAX);
    }

    const legacyRecords = [];
    LEGACY_STORAGE_KEYS.practiceHistory.forEach((key) => {
      const rows = this.readStorageJson(key, []);
      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          const normalized = this.normalizePracticeRecord(row);
          if (normalized) {
            legacyRecords.push(normalized);
          }
        });
      }
    });

    return legacyRecords
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, HISTORY_MAX);
  }

  savePracticeHistory() {
    this.practiceHistory = this.practiceHistory
      .slice(0, HISTORY_MAX)
      .sort((a, b) => b.timestamp - a.timestamp);
    this.writeStorageJson(STORAGE_KEYS.practiceHistory, this.practiceHistory);
  }

  deriveWordStatsFromHistory(records) {
    const stats = {};
    [...records]
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((record) => {
        const question = this.getQuestionForRecord(record);
        this.applyRecordToWordStatsCollection(stats, question, record);
      });
    return stats;
  }

  loadWordStats() {
    const raw = this.readStorageJson(STORAGE_KEYS.wordStats, null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return this.deriveWordStatsFromHistory(this.practiceHistory);
    }

    const normalized = {};
    Object.entries(raw).forEach(([key, value]) => {
      normalized[key] = sanitizeStatRecord(value);
    });

    this.questions.forEach((question) => {
      if (normalized[question.prompt] && !normalized[question.id]) {
        normalized[question.id] = normalized[question.prompt];
        delete normalized[question.prompt];
      }
    });

    return normalized;
  }

  saveWordStats() {
    this.writeStorageJson(STORAGE_KEYS.wordStats, this.wordStats);
  }

  deriveMistakeBankFromHistory(records) {
    const bank = {};
    [...records]
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((record) => {
        const question = this.getQuestionForRecord(record);
        this.applyRecordToMistakeCollection(bank, question, record);
      });
    return bank;
  }

  loadMistakeBank() {
    const raw = this.readStorageJson(STORAGE_KEYS.mistakeBank, null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return this.deriveMistakeBankFromHistory(this.practiceHistory);
    }

    const normalized = {};
    Object.entries(raw).forEach(([key, value]) => {
      normalized[key] = sanitizeMistakeEntry(value);
    });
    return normalized;
  }

  saveMistakeBank() {
    this.writeStorageJson(STORAGE_KEYS.mistakeBank, this.mistakeBank);
  }

  applyRecordToWordStatsCollection(collection, question, record) {
    const key = question.id;
    const current = sanitizeStatRecord(collection[key] || this.wordStats[key]);
    current.attempts += 1;
    current.totalResponseMs += Math.max(0, record.responseTimeMs || 0);
    current.lastSeenAt = record.timestamp;

    if (record.isCorrect) {
      current.correct += 1;
      current.consecutiveCorrect += 1;
    } else {
      current.wrong += 1;
      current.consecutiveCorrect = 0;
    }

    collection[key] = current;
  }

  applyRecordToMistakeCollection(collection, question, record) {
    const key = question.id;
    const current = sanitizeMistakeEntry(collection[key] || this.mistakeBank[key] || {
      questionId: question.id,
      prompt: question.prompt,
      correctAnswer: question.answer,
      suffix: question.suffix,
      category: question.category
    });

    current.questionId = question.id;
    current.prompt = question.prompt;
    current.correctAnswer = question.answer;
    current.suffix = question.suffix;
    current.category = question.category;

    if (record.isCorrect) {
      current.correctCount += 1;
      current.consecutiveCorrect += 1;
      current.lastCorrectAt = record.timestamp;
      if ((record.responseTimeMs || 0) >= SLOW_CORRECT_MS) {
        current.slowCorrectCount += 1;
        current.weight += 2;
      }
      current.weight = Math.max(1, current.weight - 2);
      if (current.consecutiveCorrect >= 3) {
        current.weight = 1;
      }
    } else {
      current.wrongCount += 1;
      current.consecutiveCorrect = 0;
      current.lastWrongAt = record.timestamp;
      current.weight += 5;
      if (record.isConfidentError) {
        current.confidentErrorCount += 1;
        current.weight += 8;
      }
    }

    collection[key] = current;
  }

  getWordStat(question) {
    return sanitizeStatRecord(this.wordStats[question.id] || this.wordStats[question.prompt]);
  }

  getMistakeEntry(question) {
    const direct = this.mistakeBank[question.id];
    if (direct) {
      return sanitizeMistakeEntry(direct);
    }
    const legacyEntry = Object.values(this.mistakeBank).find(
      (entry) => entry && entry.prompt === question.prompt && entry.correctAnswer === question.answer
    );
    return legacyEntry ? sanitizeMistakeEntry(legacyEntry) : null;
  }

  getBaseQuestionWeight(question) {
    const stat = this.getWordStat(question);
    if (stat.consecutiveCorrect >= 3) {
      return 1;
    }
    return Math.max(1, 10 + stat.wrong * 5 - stat.correct * 2);
  }

  getMistakePriority(question) {
    const entry = this.getMistakeEntry(question);
    if (!entry) {
      return 0;
    }
    if (entry.consecutiveCorrect >= 3 && entry.weight <= 1) {
      return 0;
    }

    let score = Math.max(1, entry.weight);
    if (entry.confidentErrorCount > 0) {
      score += entry.confidentErrorCount * 12;
    }
    if (entry.wrongCount > 1) {
      score += (entry.wrongCount - 1) * 6;
    }
    if (entry.slowCorrectCount > 0) {
      score += entry.slowCorrectCount * 3;
    }
    if (entry.lastWrongAt > 0) {
      const ageDays = (Date.now() - entry.lastWrongAt) / 86400000;
      score += Math.max(0, 5 - ageDays);
    }

    if (entry.wrongCount === 0 && entry.confidentErrorCount === 0 && entry.slowCorrectCount === 0) {
      return 0;
    }
    return Math.max(1, Math.round(score));
  }

  buildWeakSuffixPool() {
    const suffixWeights = new Map();
    this.questions.forEach((question) => {
      const base = this.getMistakePriority(question) + this.getWordStat(question).wrong * 3;
      if (base > 0 && question.suffix) {
        suffixWeights.set(question.suffix, (suffixWeights.get(question.suffix) || 0) + base);
      }
    });

    const activeSuffixes = [...suffixWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([suffix]) => suffix);

    if (activeSuffixes.length === 0) {
      return [];
    }

    return this.questions
      .filter((question) => activeSuffixes.includes(question.suffix))
      .map((question) => ({
        question,
        weight: Math.max(1, this.getBaseQuestionWeight(question) + (suffixWeights.get(question.suffix) || 0))
      }));
  }

  buildPracticePool(focus) {
    if (focus === "mistakes") {
      return this.questions
        .map((question) => ({ question, weight: this.getMistakePriority(question) }))
        .filter((item) => item.weight > 0);
    }

    if (focus === "weak_suffixes") {
      const weakSuffixPool = this.buildWeakSuffixPool();
      if (weakSuffixPool.length > 0) {
        return weakSuffixPool;
      }
    }

    return this.questions.map((question) => ({
      question,
      weight: Math.max(1, this.getBaseQuestionWeight(question) + Math.round(this.getMistakePriority(question) / 2))
    }));
  }

  pickSessionQuestions(weightedPool, count) {
    if (weightedPool.length === 0) {
      return [];
    }

    const selected = [];
    const remaining = weightedPool.map((item) => ({ ...item }));
    const uniqueTarget = Math.min(count, remaining.length);

    while (selected.length < uniqueTarget && remaining.length > 0) {
      const index = weightedPickIndex(remaining);
      selected.push(remaining[index].question);
      remaining.splice(index, 1);
    }

    while (selected.length < count) {
      const index = weightedPickIndex(weightedPool);
      const candidate = weightedPool[index].question;
      const previous = selected[selected.length - 1];
      if (weightedPool.length > 1 && previous && candidate.id === previous.id) {
        const alternative = weightedPool.find((item) => item.question.id !== previous.id);
        selected.push((alternative || weightedPool[index]).question);
      } else {
        selected.push(candidate);
      }
    }

    return selected;
  }

  startPractice({ focus }) {
    this.closeAllOverlays();
    this.clearAutoNextTimer();

    if (this.questions.length === 0) {
      window.alert("Question Bank 為空，請先匯入或編輯題庫。");
      return;
    }

    const normalizedFocus = normalizePracticeFocus(focus || this.settings.practiceFocus);
    const pool = this.buildPracticePool(normalizedFocus);
    if (normalizedFocus === "mistakes" && pool.length === 0) {
      window.alert("目前未有可重練錯題。先完成一輪練習再回來。");
      return;
    }

    const questions = this.pickSessionQuestions(pool, clampQuestionsPerSession(this.settings.questionsPerSession));
    if (questions.length === 0) {
      window.alert("目前無法建立練習題組。請先確認 Question Bank 內容。");
      return;
    }

    this.session = {
      focus: normalizedFocus,
      questions,
      answers: [],
      index: 0,
      startedAt: performance.now(),
      answeredCurrentQuestion: false
    };

    this.renderCurrentQuestion();
    this.showScreen("practice");
  }

  getCurrentQuestion() {
    return this.session ? this.session.questions[this.session.index] : null;
  }

  renderCurrentQuestion() {
    const question = this.getCurrentQuestion();
    if (!question) {
      return;
    }

    this.session.answeredCurrentQuestion = false;
    this.currentQuestionStartedAt = performance.now();
    this.practiceFocusLabel.textContent = FOCUS_LABELS[this.session.focus];
    this.practiceCategory.textContent = question.category;
    this.questionPrompt.textContent = question.prompt;
    this.questionMeta.textContent = "Choose the correct part of speech for this word.";
    this.feedbackPanel.className = "feedback-panel";
    this.feedbackPanel.innerHTML = '<p class="feedback-empty">Select one answer to see feedback.</p>';
    this.nextQuestionBtn.classList.add("hidden");
    this.nextQuestionBtn.textContent = this.session.index === this.session.questions.length - 1 ? "Show Summary" : "Next Question";

    this.choiceButtons.forEach((button, index) => {
      button.disabled = false;
      button.classList.remove("is-correct", "is-wrong");
      button.dataset.choice = question.choices[index];
      const label = button.querySelector(".choice-label");
      const text = button.querySelector(".choice-text");
      if (label) {
        label.textContent = String.fromCharCode(65 + index);
      }
      if (text) {
        text.textContent = question.choices[index];
      }
    });

    this.updatePracticeHeader();
  }

  updatePracticeHeader() {
    if (!this.session) {
      return;
    }

    const answered = this.session.answers.length;
    const currentIndex = Math.min(this.session.index + 1, this.session.questions.length);
    const correct = this.session.answers.filter((record) => record.isCorrect).length;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 100;
    const elapsed = Math.max(0, performance.now() - this.session.startedAt);

    this.practiceProgress.textContent = `${currentIndex} / ${this.session.questions.length}`;
    this.practiceAccuracy.textContent = `${accuracy}%`;
    this.practiceElapsed.textContent = formatDurationMs(elapsed, elapsed >= 10000 ? 0 : 1);
  }

  onChoiceSelected(choice) {
    if (!this.session || this.session.answeredCurrentQuestion) {
      return;
    }

    const question = this.getCurrentQuestion();
    if (!question) {
      return;
    }

    const responseTimeMs = Math.round(performance.now() - this.currentQuestionStartedAt);
    const isCorrect = choice === question.answer;
    const record = {
      questionId: question.id,
      prompt: question.prompt,
      correctAnswer: question.answer,
      userAnswer: choice,
      isCorrect,
      responseTimeMs,
      isConfidentError: !isCorrect && responseTimeMs < CONFIDENT_ERROR_MS,
      category: question.category,
      suffix: question.suffix,
      timestamp: Date.now()
    };

    this.session.answers.push(record);
    this.session.answeredCurrentQuestion = true;
    this.appendPracticeRecord(record);
    this.applyRecordToWordStatsCollection(this.wordStats, question, record);
    this.applyRecordToMistakeCollection(this.mistakeBank, question, record);
    this.saveWordStats();
    this.saveMistakeBank();

    this.choiceButtons.forEach((button) => {
      button.disabled = true;
      const buttonChoice = button.dataset.choice || "";
      if (buttonChoice === question.answer) {
        button.classList.add("is-correct");
      }
      if (buttonChoice === choice && !isCorrect) {
        button.classList.add("is-wrong");
      }
    });

    this.renderFeedback(question, record);
    this.updatePracticeHeader();
    this.renderMenuOverview();
    this.renderProgressOverlay();

    if (this.settings.autoNextQuestion) {
      this.autoNextTimer = window.setTimeout(() => this.advanceToNextQuestion(), AUTO_NEXT_DELAY_MS);
    } else {
      this.nextQuestionBtn.classList.remove("hidden");
    }
  }

  renderFeedback(question, record) {
    const hint = `${question.suffix} usually forms ${POS_HINT_LABELS[question.answer] || question.answer.toLowerCase()}.`;
    const lines = [];

    if (record.isCorrect) {
      lines.push(`${escapeHtml(question.prompt)} = ${escapeHtml(question.answer)}`);
      if (this.settings.showSuffixHintAfterAnswer && question.suffix) {
        lines.push(`Suffix: ${escapeHtml(question.suffix)}`);
        lines.push(`Hint: ${escapeHtml(hint)}`);
      }
    } else {
      lines.push(`Your answer: ${escapeHtml(record.userAnswer)}`);
      lines.push(`Correct answer: ${escapeHtml(question.answer)}`);
      if (this.settings.showSuffixHintAfterAnswer && question.suffix) {
        lines.push(`Hint: ${escapeHtml(hint)}`);
      }
    }

    lines.push(`Response time: ${escapeHtml(formatDurationMs(record.responseTimeMs))}`);
    if (record.isConfidentError) {
      lines.push("Confident error: answered wrong in under 2 seconds.");
    }

    this.feedbackPanel.className = `feedback-panel ${record.isCorrect ? "is-correct" : "is-wrong"}`;
    this.feedbackPanel.innerHTML = `
      <p class="feedback-title">${record.isCorrect ? "Correct" : "Incorrect"}</p>
      <div class="feedback-list">${lines.map((line) => `<div>${line}</div>`).join("")}</div>
    `;
  }

  advanceToNextQuestion() {
    if (!this.session || !this.session.answeredCurrentQuestion) {
      return;
    }

    this.clearAutoNextTimer();
    if (this.session.index >= this.session.questions.length - 1) {
      this.finishSession();
      return;
    }

    this.session.index += 1;
    this.renderCurrentQuestion();
  }

  finishSession() {
    if (!this.session) {
      return;
    }

    const summary = this.buildSessionSummary(this.session.answers);
    this.renderSummary(summary);
    this.showScreen("summary");
  }

  buildSessionSummary(records) {
    const totalQuestions = records.length;
    const correct = records.filter((record) => record.isCorrect).length;
    const accuracy = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
    const averageResponseMs =
      totalQuestions > 0 ? records.reduce((sum, record) => sum + record.responseTimeMs, 0) / totalQuestions : 0;
    const confidentErrors = records.filter((record) => record.isConfidentError).length;

    const suffixCounts = new Map();
    records
      .filter((record) => !record.isCorrect && record.suffix)
      .forEach((record) => {
        suffixCounts.set(record.suffix, (suffixCounts.get(record.suffix) || 0) + 1);
      });
    const mostMissedSuffixes = [...suffixCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([suffix]) => suffix);

    const confusionCounts = new Map();
    records
      .filter((record) => !record.isCorrect)
      .forEach((record) => {
        const key = `${record.userAnswer} -> ${record.correctAnswer}`;
        confusionCounts.set(key, (confusionCounts.get(key) || 0) + 1);
      });
    const mostConfusedPos = [...confusionCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;

    return {
      totalQuestions,
      correct,
      accuracy,
      averageResponseMs,
      confidentErrors,
      mostMissedSuffixes,
      mostConfusedPos: mostConfusedPos ? mostConfusedPos[0] : "None",
      focus: this.session.focus
    };
  }

  renderSummary(summary) {
    this.summaryTitle.textContent = `Practice Complete · ${FOCUS_LABELS[summary.focus]}`;
    this.summaryMetrics.innerHTML = this.renderMetricCards([
      { label: "Total Questions", value: String(summary.totalQuestions) },
      { label: "Correct", value: String(summary.correct) },
      { label: "Accuracy", value: `${summary.accuracy}%` },
      { label: "Average Time", value: formatDurationMs(summary.averageResponseMs) },
      { label: "Confident Errors", value: String(summary.confidentErrors) }
    ]);

    const highlights = [
      {
        label: "Most Missed Suffixes",
        value: summary.mostMissedSuffixes.length > 0 ? summary.mostMissedSuffixes.join(", ") : "None"
      },
      {
        label: "Most Confused POS",
        value: summary.mostConfusedPos
      }
    ];
    this.summaryHighlights.innerHTML = highlights
      .map((item) => `<div class="summary-note"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</div>`)
      .join("");

    const canReviewMistakes = this.buildPracticePool("mistakes").length > 0;
    this.summaryReviewBtn.disabled = !canReviewMistakes;
  }

  appendPracticeRecord(record) {
    this.practiceHistory.unshift(record);
    this.savePracticeHistory();
  }

  renderMetricCards(metrics) {
    return metrics
      .map(
        (metric) => `
          <div class="metric-card">
            <span class="metric-label">${escapeHtml(metric.label)}</span>
            <span class="metric-value">${escapeHtml(metric.value)}</span>
          </div>
        `
      )
      .join("");
  }

  buildProgressSnapshot() {
    const attempts = this.practiceHistory.length;
    const correct = this.practiceHistory.filter((record) => record.isCorrect).length;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    const averageResponseMs =
      attempts > 0 ? this.practiceHistory.reduce((sum, record) => sum + record.responseTimeMs, 0) / attempts : 0;
    const confidentErrors = this.practiceHistory.filter((record) => record.isConfidentError).length;
    const activeMistakes = Object.values(this.mistakeBank).filter((entry) => {
      const question = this.getQuestionForRecord({
        questionId: entry.questionId,
        prompt: entry.prompt,
        correctAnswer: entry.correctAnswer,
        suffix: entry.suffix,
        category: entry.category,
        timestamp: entry.lastWrongAt || Date.now()
      });
      return this.getMistakePriority(question) > 0;
    }).length;

    const suffixCounts = new Map();
    this.practiceHistory
      .filter((record) => !record.isCorrect && record.suffix)
      .forEach((record) => {
        suffixCounts.set(record.suffix, (suffixCounts.get(record.suffix) || 0) + 1);
      });

    const weakSuffixes = [...suffixCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([suffix]) => suffix);

    return {
      attempts,
      accuracy,
      averageResponseMs,
      confidentErrors,
      activeMistakes,
      weakSuffixes,
      questionCount: this.questions.length
    };
  }

  renderMenuOverview() {
    const snapshot = this.buildProgressSnapshot();
    const cards = [
      { label: "Question Bank", value: String(snapshot.questionCount) },
      { label: "Attempts", value: String(snapshot.attempts) },
      { label: "Accuracy", value: snapshot.attempts > 0 ? `${snapshot.accuracy}%` : "--" },
      { label: "Active Mistakes", value: String(snapshot.activeMistakes) }
    ];

    if (this.legacyStats && (this.legacyStats.bestAccuracy || this.legacyStats.bestTimeMs)) {
      const legacyValue = [
        this.legacyStats.bestAccuracy != null ? `${this.legacyStats.bestAccuracy}%` : null,
        this.legacyStats.bestTimeMs != null ? formatDurationMs(this.legacyStats.bestTimeMs, 0) : null
      ]
        .filter(Boolean)
        .join(" / ");
      cards.push({ label: "Legacy Best", value: legacyValue || "--" });
    }

    this.menuOverview.innerHTML = `
      ${cards
        .map(
          (card) => `
            <div class="overview-card">
              <span class="overview-label">${escapeHtml(card.label)}</span>
              <span class="overview-value">${escapeHtml(card.value)}</span>
            </div>
          `
        )
        .join("")}
      <div class="overview-card">
        <span class="overview-label">Current Settings</span>
        <span class="overview-value">${escapeHtml(`${this.settings.questionsPerSession} Q · ${FOCUS_LABELS[this.settings.practiceFocus]}`)}</span>
      </div>
    `;
  }

  renderProgressOverlay() {
    const snapshot = this.buildProgressSnapshot();
    this.progressOverview.innerHTML = `
      <div class="overview-card">
        <span class="overview-label">Total Attempts</span>
        <span class="overview-value">${escapeHtml(String(snapshot.attempts))}</span>
      </div>
      <div class="overview-card">
        <span class="overview-label">Overall Accuracy</span>
        <span class="overview-value">${escapeHtml(snapshot.attempts > 0 ? `${snapshot.accuracy}%` : "--")}</span>
      </div>
      <div class="overview-card">
        <span class="overview-label">Average Time</span>
        <span class="overview-value">${escapeHtml(snapshot.attempts > 0 ? formatDurationMs(snapshot.averageResponseMs) : "--")}</span>
      </div>
      <div class="overview-card">
        <span class="overview-label">Confident Errors</span>
        <span class="overview-value">${escapeHtml(String(snapshot.confidentErrors))}</span>
      </div>
      <div class="overview-card">
        <span class="overview-label">Weak Suffixes</span>
        <span class="overview-value">${escapeHtml(snapshot.weakSuffixes.length > 0 ? snapshot.weakSuffixes.join(", ") : "None")}</span>
      </div>
    `;

    this.progressLogTbody.innerHTML = "";
    if (this.practiceHistory.length === 0) {
      const row = document.createElement("tr");
      row.innerHTML = '<td colspan="7">尚無 Practice Log。完成第一輪練習後會自動寫入。</td>';
      this.progressLogTbody.appendChild(row);
      return;
    }

    this.practiceHistory.slice(0, 100).forEach((record) => {
      const row = document.createElement("tr");
      row.className = record.isCorrect ? "log-correct" : record.isConfidentError ? "log-confident-error" : "log-wrong";
      row.innerHTML = `
        <td>${escapeHtml(record.prompt)}</td>
        <td>${escapeHtml(record.userAnswer || "—")}</td>
        <td>${escapeHtml(record.correctAnswer)}</td>
        <td>${record.isCorrect ? "Correct" : "Incorrect"}</td>
        <td>${escapeHtml(formatDurationMs(record.responseTimeMs))}</td>
        <td>${record.isConfidentError ? "Yes" : ""}</td>
        <td>${escapeHtml(formatDateTime(record.timestamp))}</td>
      `;
      this.progressLogTbody.appendChild(row);
    });
  }

  openProgressOverlay() {
    this.renderProgressOverlay();
    this.openOverlay(this.progressOverlay);
  }

  clearPracticeHistory() {
    if (!window.confirm("確定清除 Practice Log？既有新記錄會被移除，但舊版 localStorage 內容不會被刪除。")) {
      return;
    }
    this.practiceHistory = [];
    this.savePracticeHistory();
    this.renderMenuOverview();
    this.renderProgressOverlay();
  }

  clearMistakeBank() {
    if (!window.confirm("確定重設 Mistake Bank？這會清空新的錯題權重資料。")) {
      return;
    }
    this.mistakeBank = {};
    this.saveMistakeBank();
    this.renderMenuOverview();
    this.renderProgressOverlay();
  }

  applySettingsToForm() {
    this.settingsSessionSize.value = String(clampQuestionsPerSession(this.settings.questionsPerSession));
    this.settingsFocus.value = normalizePracticeFocus(this.settings.practiceFocus);
    this.settingsShowHint.checked = Boolean(this.settings.showSuffixHintAfterAnswer);
    this.settingsAutoNext.checked = Boolean(this.settings.autoNextQuestion);
  }

  openSettingsOverlay() {
    this.applySettingsToForm();
    this.openOverlay(this.settingsOverlay);
  }

  saveSettings() {
    this.settings.questionsPerSession = clampQuestionsPerSession(this.settingsSessionSize.value);
    this.settings.practiceFocus = normalizePracticeFocus(this.settingsFocus.value);
    this.settings.showSuffixHintAfterAnswer = Boolean(this.settingsShowHint.checked);
    this.settings.autoNextQuestion = Boolean(this.settingsAutoNext.checked);
    this.savePrefs();
    this.renderMenuOverview();
    this.closeOverlay(this.settingsOverlay);
  }

  openQuestionBankOverlay() {
    this.clearQuestionBankForm();
    this.renderQuestionBankTable();
    this.openOverlay(this.questionBankOverlay);
  }

  normalizeSuffixInput(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }
    return trimmed.startsWith("-") ? trimmed : `-${trimmed}`;
  }

  clearQuestionBankForm() {
    this.questionBankEditIndex.value = "";
    this.questionBankWord.value = "";
    this.questionBankPos.value = POS_CHOICES[0];
    this.questionBankSuffix.value = "";
  }

  fillQuestionBankForm(index) {
    const row = this.wordBank[index];
    if (!row) {
      return;
    }
    this.questionBankEditIndex.value = String(index);
    this.questionBankWord.value = row.word;
    this.questionBankPos.value = row.pos;
    this.questionBankSuffix.value = row.suffix;
  }

  renderQuestionBankTable() {
    const query = String(this.questionBankFilter.value || "").trim().toLowerCase();
    this.questionBankTbody.innerHTML = "";

    this.wordBank.forEach((row, index) => {
      if (
        query &&
        !row.word.toLowerCase().includes(query) &&
        !row.pos.toLowerCase().includes(query) &&
        !row.suffix.toLowerCase().includes(query)
      ) {
        return;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.word)}</td>
        <td>${escapeHtml(row.pos)}</td>
        <td>${escapeHtml(row.suffix)}</td>
        <td>
          <button type="button" class="btn-link" data-action="edit" data-index="${index}">Edit</button>
          <button type="button" class="btn-link" data-action="delete" data-index="${index}">Delete</button>
        </td>
      `;
      this.questionBankTbody.appendChild(tr);
    });

    const visibleRows = this.questionBankTbody.querySelectorAll("tr").length;
    this.questionBankCount.textContent = `題庫共 ${this.wordBank.length} 筆，目前顯示 ${visibleRows} 筆。`;
  }

  onQuestionBankTableClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.getAttribute("data-action");
    const index = Number.parseInt(String(button.getAttribute("data-index")), 10);
    if (!Number.isFinite(index) || index < 0 || index >= this.wordBank.length) {
      return;
    }

    if (action === "edit") {
      this.fillQuestionBankForm(index);
      return;
    }

    if (action === "delete") {
      this.wordBank.splice(index, 1);
      this.saveWordBankToStorage();
      this.renderQuestionBankTable();
      this.renderMenuOverview();
      this.renderProgressOverlay();
    }
  }

  onQuestionBankSubmit(event) {
    event.preventDefault();

    const word = String(this.questionBankWord.value || "").trim();
    const pos = this.questionBankPos.value;
    const suffix = this.normalizeSuffixInput(this.questionBankSuffix.value);
    if (!word || !POS_CHOICES.includes(pos) || !suffix) {
      return;
    }

    const entry = { word, pos, suffix };
    const editIndex = this.questionBankEditIndex.value;
    if (editIndex !== "") {
      const index = Number.parseInt(editIndex, 10);
      if (Number.isFinite(index) && index >= 0 && index < this.wordBank.length) {
        this.wordBank[index] = entry;
      }
    } else {
      this.wordBank.push(entry);
    }

    this.saveWordBankToStorage();
    this.clearQuestionBankForm();
    this.renderQuestionBankTable();
    this.renderMenuOverview();
    this.renderProgressOverlay();
  }

  mergeSeedWordBank() {
    this.wordBank = dedupeWordEntries([...this.wordBank, ...this.seedWordBank]);
    this.saveWordBankToStorage();
    this.renderQuestionBankTable();
    this.renderMenuOverview();
  }

  onQuestionBankImport(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "[]"));
        if (!Array.isArray(data)) {
          throw new Error("JSON 必須是陣列。");
        }
        this.wordBank = dedupeWordEntries([...this.wordBank, ...data]);
        this.saveWordBankToStorage();
        this.renderQuestionBankTable();
        this.renderMenuOverview();
      } catch (error) {
        window.alert(`匯入失敗：${error.message || error}`);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  exportWordBank() {
    const blob = new Blob([JSON.stringify(this.wordBank, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    this.downloadBlob(blob, "question-bank.json");
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async fetchWordBankFromFile() {
    try {
      const response = await fetch("words.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load words.json (${response.status})`);
      }
      const data = await response.json();
      return Array.isArray(data) ? dedupeWordEntries(data) : this.getFallbackWordBank();
    } catch (_error) {
      return this.getFallbackWordBank();
    }
  }

  getFallbackWordBank() {
    return dedupeWordEntries([
      { word: "happiness", pos: "Noun", suffix: "-ness" },
      { word: "productivity", pos: "Noun", suffix: "-ity" },
      { word: "realize", pos: "Verb", suffix: "-ize" },
      { word: "beautiful", pos: "Adjective", suffix: "-ful" },
      { word: "quickly", pos: "Adverb", suffix: "-ly" }
    ]);
  }

  showScreen(name) {
    const screens = {
      menu: this.menuScreen,
      practice: this.practiceScreen,
      summary: this.summaryScreen
    };

    Object.entries(screens).forEach(([screenName, screen]) => {
      screen.classList.toggle("hidden", screenName !== name);
    });

    if (name === "practice") {
      this.startPracticeClock();
    } else {
      this.stopPracticeClock();
      this.clearAutoNextTimer();
    }

    if (name === "menu") {
      this.session = null;
    }
  }

  startPracticeClock() {
    this.stopPracticeClock();
    this.practiceClockTimer = window.setInterval(() => this.updatePracticeHeader(), 200);
  }

  stopPracticeClock() {
    if (this.practiceClockTimer) {
      window.clearInterval(this.practiceClockTimer);
      this.practiceClockTimer = null;
    }
  }

  clearAutoNextTimer() {
    if (this.autoNextTimer) {
      window.clearTimeout(this.autoNextTimer);
      this.autoNextTimer = null;
    }
  }

  confirmExitPractice() {
    if (!this.session) {
      this.showScreen("menu");
      return;
    }
    if (this.session.answers.length > 0 && !window.confirm("離開目前練習？本輪未完成內容不會進入 Review Summary。")) {
      return;
    }
    this.showScreen("menu");
  }

  openOverlay(overlay) {
    overlay.classList.remove("hidden");
    overlay.classList.add("active");
  }

  closeOverlay(overlay) {
    overlay.classList.add("hidden");
    overlay.classList.remove("active");
  }

  closeAllOverlays() {
    [this.questionBankOverlay, this.progressOverlay, this.settingsOverlay].forEach((overlay) => {
      this.closeOverlay(overlay);
    });
  }

  onKeyDown(event) {
    const activeOverlay = [this.questionBankOverlay, this.progressOverlay, this.settingsOverlay].find(
      (overlay) => overlay.classList.contains("active")
    );

    if (event.key === "Escape") {
      if (activeOverlay) {
        this.closeOverlay(activeOverlay);
        return;
      }
      if (!this.practiceScreen.classList.contains("hidden")) {
        this.confirmExitPractice();
      }
      return;
    }

    if (
      activeOverlay ||
      this.practiceScreen.classList.contains("hidden") ||
      !this.session ||
      this.session.answeredCurrentQuestion
    ) {
      return;
    }

    const lookup = {
      a: 0,
      1: 0,
      b: 1,
      2: 1,
      c: 2,
      3: 2,
      d: 3,
      4: 3
    };
    const index = lookup[event.key.toLowerCase()];
    if (index == null) {
      return;
    }

    const question = this.getCurrentQuestion();
    if (!question || !question.choices[index]) {
      return;
    }

    this.onChoiceSelected(question.choices[index]);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new PracticeApp();
  app.init();
});