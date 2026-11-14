# MATLAB Control Web Studio (自動控制線上模擬器)

A modern, high-performance web-based MATLAB control systems simulator built with **React 18 + TypeScript + Vite + Tailwind CSS v4**.

## 🚀 快速啟動 (Quick Start)

### 方式一：一鍵批次檔啟動 (推薦)
直接雙擊根目錄的 `啟動MATLAB網頁模擬器.bat`，將自動開啟瀏覽器並啟動本地開發伺服器 `http://localhost:3000`。

### 方式二：終端機命令啟動
```bash
cd matlab-web-simulator
npm install
npm run dev
```

### 方式三：部署至 Vercel (如同 korean-study-ochre.vercel.app)
1. 將本專案推送到您的 GitHub Repository。
2. 登入 [Vercel](https://vercel.com/)，點擊「Add New Project」並匯入該 Repo。
3. Framework Preset 選擇 `Vite`，點擊 `Deploy` 即可在數十秒內獲得專屬的 `https://your-matlab-studio.vercel.app` 公開網址！
或在本機終端機直接執行：
```bash
npx vercel
```

---

## 🛠️ 核心功能亮點 (Key Features)

- **MATLAB 語法直譯器 (MATLAB REPL & Script Editor)**：
  - 支援傳遞函數定義：`s = tf('s')`, `G = 1 / (s * (s + 2))`, `tf([num], [den])`
  - 支援代數運算、串聯並聯、回授：`feedback(G, 1)`、`series`、`parallel`
  - 支援繪圖調度：`bode(G)`、`rlocus(G)`、`nyquist(G)`、`step(G)`、`pzmap(G)`、`damp(G)`
- **五大多功能圖形視窗 (Interactive Figure Window)**：
  - **Root Locus (根軌跡)**：全自動漸近線、出發/到達角、**動態迴路增益 K 滑桿**、即時閉迴路極點追蹤與阻尼比 $\zeta$、自然頻率 $\omega_n$ 顯示。
  - **Bode Diagram (波德圖)**：幅值與相位雙子圖、連續相位解繞、增益邊限 $\text{GM}$、相角邊限 $\text{PM}$、穿越頻率 $\omega_{gc}, \omega_{pc}$ 視覺化標記。
  - **Nyquist Diagram (奈氏圖)**：正負全頻率軌跡、方向箭頭、$(-1, j0)$ 臨界點標註、**切線感度圓半徑 $r_0$ 即時檢驗（115 台聯大真題核心考點）**。
  - **Step Response (階躍響應)**：RK4 高精確數值積分求解、動態標示上升時間 $t_r$、峰值時間 $t_p$、超調量 $M_p(\%)$、調節時間 $t_s(2\%)$ 與穩態誤差。
  - **Pole-Zero Map (極零點圖)**：S 平面等阻尼比徑向線（$\zeta = 0.2 \sim 0.8$）與等自然頻率同心圓（$\omega_n$）。
- **內建歷屆經典範本**：
  - 115 台聯大 P2（四階複數極點軌跡）
  - 115 台聯大 P3（心形奈氏圖與感度圓）
  - 112 成大電機（二階標準欠阻尼時域規格）
  - 超前補償器（Lead Compensator）頻域相位改善
  - 右半平面極點系統之閉迴路穩定化
