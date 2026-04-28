# 深海單字水族館（Deep Sea Word Aquarium）

以英文詞性字尾為核心的 2D 教育拖放遊戲。  
技術棧：`HTML5 Canvas + Vanilla JavaScript + CSS3`，零外部框架依賴。

**Live demo → [https://hn2820one-debug.github.io/toeic-aquarium/](https://hn2820one-debug.github.io/toeic-aquarium/)**

---

## 專案結構

| 檔案 | 說明 |
|---|---|
| `index.html` | 主頁面、HUD、主選單、所有模式、設定、暫停、結算、教學、單字庫、戰績、歷史、沙盒記錄 |
| `style.css` | 深海背景、玻璃擬態 Tanks、HUD、連擊 UI、沙盒提示、記錄表格樣式 |
| `game.js` | 狀態機、四種模式邏輯、自適應出題算法、魚隻運動、拖放、計分、本機儲存 |
| `words.json` | 預設詞庫（TOEIC 字尾詞庫合併去重，1000+ 筆） |
| `toeic_suffix_words_1000.json` | TOEIC 字尾詞庫來源檔（備份用） |
| `csv_excel_to_words_json.py` | CSV／Excel 轉 `words.json`（支援 `--merge-with` 合併去重） |
| `manifest.webmanifest` | Web App 清單（PWA，可加到主畫面） |
| `icon.png` | Apple Touch Icon／PWA 圖示 |
| `.nojekyll` | 告訴 GitHub Pages 不要用 Jekyll 處理靜態檔 |
| `手機使用與GitHub上線教學.md` | GitHub Pages 上線步驟 + iPhone 操作詳解 |

---

## 遊戲模式

### Zen 禪修模式

- 依設定抽取單字（預設 30 題），無時限，無計分。
- 全部分類完畢後進入結算。
- 拖錯仍記錄弱點，**詞彙弱點權重**自動調升（下次出題機率增加）。

### Time Attack 限時模式

- 畫面常態維持 **10** 條魚，拖走一隻即隨機補一隻。
- 依難度設有倒數時間（Easy 180s / Normal 120s / Hard 90s）。
- **計分**：答對 +10；連擊加成 `(連擊數 − 1) × 2`；答錯 −5。
- **連擊**：每次答對重置 3 秒連擊窗；逾時或答錯則連擊歸零並顯示「Combo Broken」。

### Static Drill 靜態練習模式

- 每次一隻魚，固定 30 題，完成所有題目後結算。
- 採用**自適應加權出題**：答錯次數多的單字出現機率較高，幫助針對弱點反覆練習。
- 答對則單字權重降低，避免重複強化已熟悉的詞彙。
- 結算頁顯示本局**掌握度進度**。

### Sandbox 沙盒模式

- 每次一隻靜止魚（固定畫面中央），不移動，無出題上限。
- **漸進式提示系統**：
  - 魚出現時：所有 Tank 均不顯示字尾。
  - **2 秒後**：Tank 顯示字尾提醒（例如 `-ness`, `-tion`）。
  - **5 秒後**：正確 Tank 發出黃色光暈。
- 沙盒模式所有操作**不計入 Learning History 與 Word Stats**，純粹建立肌肉記憶。
- 答題後自動清除提示，立刻顯示下一條魚。

---

## 自適應出題算法

所有模式（除 Sandbox）均採用加權隨機選字：

| 條件 | 權重調整 |
|---|---|
| 初始基礎 | 10 |
| 每次答錯 | +5 |
| 每次答對 | −2 |
| 已掌握（連對 3 次）| 降為 1 |

- 權重最低為 1，確保每個字都有機會出現。
- 資料存於 `localStorage`（`wordStats`），跨局累積。

---

## Sandbox Log 沙盒記錄

在主選單點擊 **Sandbox Log 📋** 可查看所有沙盒排序紀錄，並匯出分析。

每筆記錄包含：

| 欄位 | 說明 |
|---|---|
| `word` | 單字 |
| `pos` | 正確詞性 |
| `playerChoice` | 玩家拖入的 Tank |
| `isCorrect` | 是否正確 |
| `timeSec` | 從魚出現到放入的秒數（精確到 0.1s） |
| `hintLevel` | 0 = 無提示（<2s），1 = 字尾可見（2–5s），3 = 發亮（≥5s） |
| `isConfidentError` | true = 在 <2s 內拉錯（自信錯誤） |
| `timestamp` | Unix 毫秒時間戳 |

支援匯出 **JSON** 或 **CSV**，可直接用 Excel / Python 分析弱點模式。

---

## 主選單功能

| 按鈕 | 功能 |
|---|---|
| Start Game | 依選定模式開始遊戲 |
| Tutorial 📖 | 字尾速查表（遊戲中開啟自動暫停） |
| 單字庫 📚 | 新增／編輯／刪除詞條；匯入／匯出 JSON；合併 words.json |
| 戰績 📊 | 最近 50 局對局紀錄 |
| History 📜 | 最近 50 筆排序記錄 + 各單字掌握度進度條 |
| Sandbox Log 📋 | 沙盒記錄查看與匯出 |
| Settings | 音量、全螢幕、難度、每局單字數、魚速、讀音 |

---

## 本機儲存（localStorage）

| Key | 內容 |
|---|---|
| `deepsea_word_aquarium_prefs` | 使用者設定（音量、難度等） |
| `deepsea_word_aquarium_word_bank` | 自訂詞庫 |
| `deepsea_word_aquarium_stats` | 歷次對局戰績 |
| `deepsea_word_aquarium_history` | 最近答題記錄 |
| `deepsea_word_aquarium_learning_history` | 學習歷程（含掌握度） |
| `deepsea_word_aquarium_word_stats` | 各單字答對／答錯次數（自適應算法用） |
| `deepsea_word_aquarium_sandbox_log` | 沙盒模式詳細記錄 |

---

## 詞庫格式

```json
[
  {"word": "happiness", "pos": "Noun", "suffix": "-ness"},
  {"word": "beautiful", "pos": "Adjective", "suffix": "-ful"}
]
```

`pos` 必須為：`Noun` / `Verb` / `Adjective` / `Adverb`

**詞庫更新流程：**
1. 修改 `words.json` 後，開啟「單字庫」→ **合併 words.json**。
2. 或清除該站台的 localStorage 後重新開啟（會自動重新讀入 `words.json`）。

---

## 本機執行

因使用 `fetch("words.json")`，建議用本機伺服器開啟：

```bash
cd "E:\VScode\Python\Parts of speech fishing"
python -m http.server 8000
```

瀏覽器開啟：`http://localhost:8000`

---

## 部署到 GitHub Pages

1. 在 GitHub 建立 repo（例如 `toeic-aquarium`），不勾選 Add README。
2. 推送本機專案：
   ```bash
   git remote add origin https://github.com/YOUR_USER/toeic-aquarium.git
   git push -u origin main
   ```
3. Repo **Settings → Pages**：Deploy from branch `main`，folder `/（root）`，Save。
4. 約 1–2 分鐘後上線：`https://YOUR_USER.github.io/toeic-aquarium/`

iPhone 可在 Safari 開啟後「分享 → 加入主畫面」，以 PWA 方式離線使用。

---

## 操作快捷鍵

| 鍵 | 動作 |
|---|---|
| `ESC` | 關閉目前開啟的浮層；遊戲中暫停／恢復 |

---

## 開發者維護

- 修改 `game.js` 後手測：四種模式開局、暫停、退出主畫面、結算、單字庫存檔。
- 大量更新詞庫可使用 `csv_excel_to_words_json.py`（`--help` 查看合併選項）。
- Sandbox Log 資料存於 localStorage，可隨時從「Sandbox Log」介面匯出備份。
