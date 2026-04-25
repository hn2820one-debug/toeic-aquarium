# 深海單字水族館（Deep Sea Word Aquarium）

以英文詞性字尾為核心的 2D 教育拖放遊戲。  
技術棧：`HTML5 Canvas + Vanilla JavaScript + CSS3`，零外部框架依賴。

## 專案結構


| 檔案                             | 說明                                                                      |
| ------------------------------ | ----------------------------------------------------------------------- |
| `index.html`                   | 主頁面、HUD、主選單、模式選擇、設定、暫停、結算、教學、單字庫、戰績                                     |
| `style.css`                    | 深海背景、玻璃擬態 Tanks、HUD、連擊 UI、按鈕與 Modal                                     |
| `game.js`                      | 狀態機、雙模式邏輯、魚隻運動、拖放、計分／連擊、本機儲存                                            |
| `words.json`                   | 預設詞庫（已合併本專案舊詞庫 + `toeic_suffix_words_1000.json`，約 1100+ 筆，去重後數量以實際檔案為準） |
| `toeic_suffix_words_1000.json` | TOEIC 字尾詞庫來源檔（合併後可保留作備份；遊戲執行時讀取的是 `words.json`）                         |
| `csv_excel_to_words_json.py`   | CSV／Excel 轉 `words.json`（支援 `--merge-with` 合併去重）                        |
| `Operator WI.md`               | 玩家操作手冊                                                                  |
| `manifest.webmanifest`         | Web App 清單（加到主畫面、standalone）                                            |
| `icon.png`                     | Apple Touch Icon／PWA 圖示                                                 |
| `.nojekyll`                    | 告訴 GitHub Pages 不要用 Jekyll 處理靜態檔                                        |
| `手機使用與GitHub上線教學.md`           | **出街用手機玩**：GitHub 上線步驟 + iPhone 操作詳解                                    |


## 遊戲模式

### Zen 禪修模式

- 固定 **30** 題（與設定裡「每局抽取單字數」無關）。
- **無限時**，無回合倒數壓力。
- **無計分、無連擊**；拖錯仍會記錄弱點字尾。
- 全部魚分類完畢即結算。

### Time Attack 限時模式

- 畫面常態維持 **10** 條魚：拖走一隻即隨機補一隻。
- 依難度有 **回合剩餘時間**（倒數歸零則結束）。
- **計分**：答對 +10，連擊加成為 `(連擊數 − 1) × 2`（第一下答對僅 +10）；答錯 −5。
- **連擊**：每次答對重置 **3 秒**連擊窗；逾時未再答對或答錯則連擊歸零，並有「Combo Broken」提示。
- HUD 顯示分數、COMBO、連擊條與剩餘時間。

主選單用 **遊戲模式** 單選按鈕選擇後，再按 **Start Game**。

## 操作中常用功能

- **暫停**：HUD `Pause` 或鍵盤 `ESC`（教學／覆蓋層開啟時 `ESC` 優先關閉該層）。
- **退出主畫面**：遊戲進行中 HUD 右側 **「退出主畫面」**，確認後返回主選單（**本局不寫入戰績結算**）。
- **單字庫 📚**：在本機瀏覽器管理詞條（localStorage），可匯入／匯出 JSON、與 `words.json` 合併。
- **戰績 📊**：最近對局紀錄（本機）。
- **Settings**：音量、全螢幕、難度、**每局抽取單字數**（主要影響 Zen 以外的需求時可調；Zen 仍固定 30 題）。
- **Tutorial 📖**：字尾速查表；遊戲中開啟會自動暫停，關閉後恢復。

## 詞庫與本機儲存

1. **首次載入**：若瀏覽器尚未存過自訂詞庫，會從 `words.json` 讀入並寫入 `localStorage`（之後以單字庫 UI 為主）。
2. **更新 `words.json` 後**：若要同步到遊戲，可到「單字庫」按 **合併 words.json**，或清除該站台的 localStorage 後重新開啟。
3. **已合併 TOEIC**：`words.json` 已由專案內 `toeic_suffix_words_1000.json` 與舊詞庫合併並 **依 `word + pos + suffix` 去重**。

### `words.json` 格式

```json
[
  {"word": "happiness", "pos": "Noun", "suffix": "-ness"},
  {"word": "beautiful", "pos": "Adjective", "suffix": "-ful"}
]
```

- `pos` 必須為：`Noun` / `Verb` / `Adjective` / `Adverb`

## 本機執行

因使用 `fetch("words.json")`，建議用本機伺服器開啟，避免 `file://` 被瀏覽器限制。

```bash
cd "E:\VScode\Python\Parts of speech fishing"
python -m http.server 8000
```

瀏覽器開啟：`http://localhost:8000`

## 上線到網路（GitHub Pages，免費 HTTPS）

出街用手機練習：把專案推到 GitHub 並開啟 Pages 後，用瀏覽器開網址即可；iPhone 可用 Safari **分享 →加入主畫面**（已含 `manifest` 與 Apple 相關 meta）。

1. 在 GitHub **New repository**（例如 `toeic-aquarium`），**不要**勾選 Add README（若本機已有檔案）。
2. 本專案資料夾**已建立 Git 並完成首次 commit**（分支 `main`）。在本機專案目錄只需連線遠端並上傳（將 `YOUR_USER` / `toeic-aquarium` 改成你的）：
  ```bash
   git remote add origin https://github.com/YOUR_USER/toeic-aquarium.git
   git push -u origin main
  ```
   更細步驟與 iPhone 操作見 `**手機使用與GitHub上線教學.md**`。
3. Repo **Settings → Pages**：**Deploy from a branch**，Branch 選 **main**，folder **/ (root)**，Save。
4. 約 1–2 分鐘後，網址為：`https://YOUR_USER.github.io/toeic-aquarium/`（以 GitHub 顯示為準）。

**說明**：`words.json`、單字庫與戰績存在瀏覽器 **localStorage**，換裝置或清 Cookie 後資料不會跟著網址走；出街同一支手機用同一瀏覽器即可延續練習紀錄。

## 開發者維護

- 調整 `game.js` 後建議手測：兩種模式開局、暫停、**退出主畫面**、結算、單字庫存檔。
- 大量更新詞庫可繼續使用 `csv_excel_to_words_json.py`（合併模式見該檔案註解與 `--help`）。

