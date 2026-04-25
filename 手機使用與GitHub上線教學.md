# 手機使用與 GitHub 上線教學（Deep Sea Word Aquarium）

> **關於「幫你直接上傳」**  
> 任何自動程式都**無法代替你**登入 GitHub 帳號執行 `git push`（安全政策：要有你本機的憑證或權杖）。  
> 我已在你電腦上的專案資料夾完成：**`git init`、第一個 `commit`（main 分支）**。  
> 你只要照下面 **「第一次推到 GitHub」** 做一次連線與上傳，之後改程式再 `push` 即可。

---

## 第一部分：第一次推到 GitHub（只做一次）

### 1. 在 GitHub 建立新倉庫

1. 用瀏覽器登入 [GitHub](https://github.com)。
2. 右上角 **+** → **New repository**。
3. **Repository name** 填例如：`toeic-aquarium`（可自訂，以下用這個名字舉例）。
4. 選 **Public**（GitHub Pages 免費站一般用 Public；Private 需付費方案才能 Pages）。
5. **不要**勾選「Add a README file」（避免和本機第一次推送打架）。
6. 按 **Create repository**。

### 2. 在本機連線遠端並上傳

1. 打開 **PowerShell** 或 **終端機**。
2. 進入專案資料夾（路徑請改成你的實際路徑）：

```powershell
cd "E:\VScode\Python\Parts of speech fishing"
```

3. 把遠端指到你的倉庫（**把 `你的帳號` 改成 GitHub 用戶名**）：

```powershell
git remote add origin https://github.com/你的帳號/toeic-aquarium.git
```

若曾加錯遠端，可先刪再重加：

```powershell
git remote remove origin
git remote add origin https://github.com/你的帳號/toeic-aquarium.git
```

4. 推送：

```powershell
git push -u origin main
```

5. 若跳出登入視窗：用 **GitHub 帳號** 或 **Personal Access Token（PAT）** 完成驗證（依 GitHub 目前要求為準）。

6. 成功後，到 GitHub 網頁重新整理倉庫，應可看到 `index.html`、`game.js` 等檔案。

> **若 GitHub 建倉庫時已勾了 README** 導致第一次 `push` 被拒絕：  
> 可改在 GitHub 倉庫頁面照指示「pull 合併」再 push，或刪倉庫重建空倉庫（較單純）。有需要可截圖錯誤訊息再查。

---

## 第二部分：開啟 GitHub Pages（網址給手機用）

1. 打開該倉庫 → **Settings**（設定）。
2. 左欄點 **Pages**。
3. **Build and deployment** → **Source** 選 **Deploy from a branch**。
4. **Branch** 選 **main**，資料夾選 **/ (root)** → **Save**。
5. 等約 **1～2 分鐘**，同一頁會出現網址，形式類似：

   `https://你的帳號.github.io/toeic-aquarium/`

6. 用電腦瀏覽器先開一次，確認能進入主選單、能 **Start Game**。

---

## 第三部分：iPhone 手機操作（出街練習）

### 1. 網路與瀏覽器

- **需要能上網**（至少第一次開頁面時要下載 `words.json` 等檔案；之後部分資料會留在手機本機）。
- 建議用 **Safari**（加入主畫面、全螢幕體驗較完整）。

### 2. 把遊戲「加到主畫面」（像 App）

1. 在 Safari 網址列輸入你的 Pages 網址（上面那一段）。
2. 等頁面載入出現遊戲標題。
3. 點底欄 **分享**（方塊帶向上箭嘴圖示）。
4. 向下捲，點 **加入主畫面**（Add to Home Screen）。
5. 可改捷徑名稱（例如「單字水族館」）→ **加入**。
6. 之後從主畫面圖示打開，會較接近全螢幕、較少瀏覽器欄位干擾。

### 3. 開始玩

1. 開啟遊戲後，在 **主選單** 選 **Zen** 或 **Time Attack**。
2. 點 **Start Game**。
3. 畫面上方是 **四個詞性水槽**（Noun / Verb / Adjective / Adverb），中間海裡有 **寫著英文單字的魚**。
4. **拖曳**：用手指 **按住一條魚**，拖到你認為正確的水槽上方再 **放手**。
5. **答對**：魚會吸進槽裡，有音效／分數（視模式而定）。
6. **答錯**：會扣分（限時模式）、魚會游向正確槽再消失（教學用動畫）；可開 **History 📜** 看紀錄。

### 4. 暫停與離開

- 遊戲中上方 **Pause** 可暫停；**退出主畫面** 會問你是否放棄本局（本局不寫入戰績結算）。
- **單字庫、戰績、學習歷史** 存在 **本機 Safari**，換手機或清除網站資料就不會跟著走。

### 5. 聲音與朗讀

- **鈴聲／媒體音量**：用 iPhone 側邊音量鍵；若開了 **靜音模式**，部分音效仍可能較小，可關靜音試試。
- 遊戲內 **Settings** 可調 **Volume**；**抓取時朗讀** 依系統有無英文語音而定，沒有語音檔時可能無聲。

### 6. 常見問題

| 情況 | 可試做法 |
|------|-----------|
| 白畫面或一直載入 | 檢查 Wi‑Fi／流動數據；關掉分頁重開網址。 |
| 拖曳不順 | 避免多指同時觸控；可直向握機。 |
| 想更新到最新版 | 在 Safari 開著遊戲分頁 → 重新整理；或刪掉主畫面捷徑後再加一次。 |

---

## 第四部分：你之後改完程式再上傳

在專案資料夾：

```powershell
cd "E:\VScode\Python\Parts of speech fishing"
git add .
git commit -m "描述你改了什麼"
git push
```

約 1～2 分鐘後 GitHub Pages 會更新；手機可能要 **重新整理** 才看到新版。

---

## 需要幫忙時請準備

- GitHub **倉庫網址**  
- `git push` 的 **完整錯誤訊息**（複製貼上）  

這樣才能針對登入、權限或分支問題逐步排除。
