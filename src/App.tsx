import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TransferFunction, PlotType, ConsoleEntry, CNumber } from './types';
import { MatlabInterpreter } from './utils/matlabParser';
import { createTF, findRoots, polyAdd, polyScale } from './utils/math';
import { BodePlot } from './components/plots/BodePlot';
import { RootLocusPlot } from './components/plots/RootLocusPlot';
import { NyquistPlot } from './components/plots/NyquistPlot';
import { StepResponsePlot } from './components/plots/StepResponsePlot';
import { PZMapPlot } from './components/plots/PZMapPlot';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Play, Download, Terminal, 
  Activity, Compass, Radio, BarChart3, Crosshair, 
  Sparkles, SlidersHorizontal, Code2, Calculator, CheckCircle2, AlertCircle,
  Sliders, ChevronUp, ChevronDown
} from 'lucide-react';

const interpreter = new MatlabInterpreter();

// Preset Equations for Visual Formula Mode
const FORMULA_PRESETS = [
  {
    title: '115 台聯大 P2 (四階雙複數極點)',
    num: '1',
    den: '(s + 1)^2 * (s^2 + 2*s + 5)',
    tab: 'rlocus' as PlotType
  },
  {
    title: '115 台聯大 P3 (心形奈氏圖與感度圓)',
    num: 's + 2',
    den: 's * (s + 0.5) * (s^2 + s + 1)',
    tab: 'nyquist' as PlotType
  },
  {
    title: '112 成大電機 (二階標準欠阻尼響應)',
    num: '25',
    den: 's^2 + 4*s + 25',
    tab: 'step' as PlotType
  },
  {
    title: '經典三階 Type 1 系統 (頻寬與裕度分析)',
    num: '10',
    den: 's * (s + 2) * (s + 4)',
    tab: 'rlocus' as PlotType
  },
  {
    title: '非最小相位系統 (具右半平面零點)',
    num: '-(s - 2)',
    den: '(s + 1) * (s + 3)',
    tab: 'step' as PlotType
  },
  {
    title: '倒單擺不穩定受控廠 (RHP 開迴路極點)',
    num: '1',
    den: 's^2 - 9',
    tab: 'pzmap' as PlotType
  }
];

// Presets for Code Mode
const SCRIPT_PRESETS: { [name: string]: { code: string; title: string; defaultTab: PlotType } } = {
  '115_ust_p2': {
    title: '115 台聯大 P2 (四階根軌跡腳本)',
    defaultTab: 'rlocus',
    code: `% 115 台聯大 自動控制 第 2 題\ns = tf('s');\nG = 1 / ((s + 1)^2 * (s^2 + 2*s + 5));\nrlocus(G);`
  },
  '115_ust_p3': {
    title: '115 台聯大 P3 (奈氏圖腳本)',
    defaultTab: 'nyquist',
    code: `% 115 台聯大 自動控制 第 3 題\ns = tf('s');\nG = (s + 2) / (s * (s + 0.5) * (s^2 + s + 1));\nnyquist(G);`
  },
  '112_ncku_step': {
    title: '112 成大電機 (閉迴路階躍響應)',
    defaultTab: 'step',
    code: `% 112 成大電機 二階標準欠阻尼系統\ns = tf('s');\nG = 25 / (s * (s + 5));\nT = feedback(G, 1);\nstep(T);`
  },
  'lead_compensator': {
    title: '頻域設計 (超前補償器 Lead Compensator)',
    defaultTab: 'bode',
    code: `% 串聯超前補償器改善相角邊限 PM\ns = tf('s');\nG = 10 / (s * (s + 2));\nGc = 4 * (s + 2) / (s + 8);\nG_open = Gc * G;\nbode(G_open);`
  }
};

export const App: React.FC = () => {
  // Input Mode: 'formula' (zero-code visual) vs 'code' (MATLAB script)
  const [inputMode, setInputMode] = useState<'formula' | 'code'>('formula');

  // Formula inputs
  const [formulaNum, setFormulaNum] = useState<string>('1');
  const [formulaDen, setFormulaDen] = useState<string>('(s + 1)^2 * (s^2 + 2*s + 5)');
  const [formulaError, setFormulaError] = useState<string | null>(null);

  // Script input
  const [code, setCode] = useState<string>(SCRIPT_PRESETS['115_ust_p2'].code);

  // Active plot tab
  const [activeTab, setActiveTab] = useState<PlotType>('rlocus');

  // Active transfer function
  const [currentTF, setCurrentTF] = useState<TransferFunction>(() => {
    return createTF([1], [1, 4, 10, 12, 5]); // Initial TF for 115 UST P2
  });

  // Global Adjustable Parameters
  const [gainK, setGainK] = useState<number>(1.0);
  const [sensitivityR, setSensitivityR] = useState<number>(0.1288);
  const [tEnd, setTEnd] = useState<number>(10);

  // Terminal Console visibility toggle (default collapsed in Formula mode)
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);

  const [commandInput, setCommandInput] = useState<string>('');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([
    {
      id: 'init-1',
      type: 'info',
      text: '系統已就緒。可直接調整增益 K、感度圓 r₀ 或輸入方程式即刻生圖。'
    }
  ]);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);

  // Parse formula inputs directly
  const applyFormula = (numStr = formulaNum, denStr = formulaDen) => {
    try {
      interpreter.reset();
      const numVal = interpreter.evalExpression(numStr);
      const denVal = interpreter.evalExpression(denStr);

      if (!numVal || !denVal) {
        setFormulaError('請輸入有效的多項式或因式');
        return;
      }

      const tf = interpreter.divide(numVal, denVal);
      if (tf && tf.type === 'tf') {
        setCurrentTF(tf);
        setFormulaError(null);
        setConsoleLogs(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'output',
            text: `已更新受控廠轉移函數 G(s):\n分子階數: ${tf.num.length - 1}, 分母階數: ${tf.den.length - 1}\n極點: ${tf.poles.map(p => p.toString()).join(', ')}`
          }
        ]);
      } else {
        setFormulaError('計算結果非合法傳遞函數');
      }
    } catch (e: any) {
      setFormulaError(e.message);
    }
  };

  // Run script code
  const runScript = (scriptText = code) => {
    interpreter.reset();
    const res = interpreter.execute(scriptText);
    setVariables({ ...res.variables });

    if (res.targetTF) {
      setCurrentTF(res.targetTF);
    }
    if (res.activePlot) {
      setActiveTab(res.activePlot);
    }

    setConsoleLogs(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'output',
        text: res.output,
        tf: res.targetTF
      }
    ]);
  };

  // Auto-apply initial formula
  useEffect(() => {
    applyFormula('1', '(s + 1)^2 * (s^2 + 2*s + 5)');
  }, []);

  // Quick preset click in Formula Mode
  const handleLoadFormulaPreset = (p: typeof FORMULA_PRESETS[0]) => {
    setFormulaNum(p.num);
    setFormulaDen(p.den);
    setActiveTab(p.tab);
    applyFormula(p.num, p.den);
  };

  // Execute single command in REPL
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;

    const cmd = commandInput.trim();
    setCommandInput('');

    setConsoleLogs(prev => [
      ...prev,
      { id: Date.now().toString(), type: 'command', text: `>> ${cmd}` }
    ]);

    const res = interpreter.execute(cmd);
    setVariables({ ...res.variables });

    if (res.targetTF) {
      setCurrentTF(res.targetTF);
    }
    if (res.activePlot) {
      setActiveTab(res.activePlot);
    }

    setConsoleLogs(prev => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        type: 'output',
        text: res.output,
        tf: res.targetTF
      }
    ]);
  };

  // Export current plot canvas to PNG
  const exportPlot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `ControlStudio_${activeTab}_plot.png`;
    a.click();
  };

  // Compute closed loop poles for current gain K
  const closedLoopPoles = useMemo(() => {
    try {
      const charPoly = polyAdd(currentTF.den, polyScale(currentTF.num, gainK));
      return findRoots(charPoly);
    } catch {
      return [];
    }
  }, [currentTF, gainK]);

  const dominantPole = useMemo(() => {
    if (closedLoopPoles.length === 0) return null;
    return closedLoopPoles.reduce<CNumber | null>((dom, p) => {
      if (!dom || p.re > dom.re) return p;
      return dom;
    }, null);
  }, [closedLoopPoles]);

  const wn = dominantPole ? dominantPole.abs() : 0;
  const zeta = wn > 1e-6 && dominantPole ? -dominantPole.re / wn : 0;
  const isClosedLoopStable = closedLoopPoles.every(p => p.re < 0);

  // Derived properties from currentTF
  const poles = currentTF.poles || [];
  const zeros = currentTF.zeros || [];
  const systemOrder = currentTF.den.length - 1;
  const numZeros = currentTF.num.length - 1;
  const originPoles = poles.filter(p => Math.hypot(p.re, p.im) < 1e-4).length;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-sky-900/30">
            G(s)
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white">自動控制全能繪圖工作室</span>
              <span className="text-[10px] bg-emerald-950 border border-emerald-600 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-semibold">直覺免指令版</span>
            </div>
            <p className="text-[11px] text-slate-400">免記 MATLAB 指令，直接輸入方程式或調校 K 值即刻繪圖</p>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setInputMode('formula')}
            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-md text-xs font-semibold transition-all ${
              inputMode === 'formula'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            📐 直覺方程式模式 (推薦)
          </button>
          <button
            onClick={() => setInputMode('code')}
            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-md text-xs font-semibold transition-all ${
              inputMode === 'code'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            💻 MATLAB 代碼模式
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportPlot}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-md border border-slate-700 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            匯出圖表 (PNG)
          </button>
        </div>
      </header>

      {/* Main Workspace (Split View) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Equation Inputs or MATLAB Script */}
        <div className="w-[430px] border-r border-slate-800 flex flex-col bg-slate-900/50 flex-shrink-0 overflow-y-auto">
          {inputMode === 'formula' ? (
            /* ================= MODE 1: VISUAL FORMULA MODE ================= */
            <div className="p-4 space-y-4 flex flex-col">
              {/* Card 1: Direct Equation Input */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4" />
                    輸入系統轉移函數 G(s)
                  </span>
                  <span className="text-[11px] text-slate-500">支援因式與多項式</span>
                </div>

                {/* Numerator */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label className="font-semibold text-slate-300">分子多項式 N(s) :</label>
                    <span className="text-[10px] text-slate-500">如: 10, s+2, 5*(s+1)</span>
                  </div>
                  <input
                    type="text"
                    value={formulaNum}
                    onChange={(e) => {
                      setFormulaNum(e.target.value);
                      applyFormula(e.target.value, formulaDen);
                    }}
                    placeholder="例如: 10 * (s + 2) 或 25"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-xs font-mono text-sky-300 outline-none transition-all"
                  />
                </div>

                {/* Fraction Divider */}
                <div className="relative py-0.5 flex items-center justify-center">
                  <div className="w-full border-t-2 border-slate-700"></div>
                  <span className="absolute bg-slate-900 px-2 text-[10px] text-slate-500 font-bold uppercase">除以 (Over)</span>
                </div>

                {/* Denominator */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label className="font-semibold text-slate-300">分母多項式 D(s) :</label>
                    <span className="text-[10px] text-slate-500">如: s*(s+2)*(s+4), s^2+4s+13</span>
                  </div>
                  <input
                    type="text"
                    value={formulaDen}
                    onChange={(e) => {
                      setFormulaDen(e.target.value);
                      applyFormula(formulaNum, e.target.value);
                    }}
                    placeholder="例如: s * (s + 2) * (s + 4)"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 outline-none transition-all"
                  />
                </div>

                {/* Error Banner */}
                {formulaError && (
                  <div className="flex items-center gap-2 p-2 bg-rose-950/60 border border-rose-800 rounded text-rose-300 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{formulaError}</span>
                  </div>
                )}
              </div>

              {/* Card 2: Interactive Gain K & Parameter Tuning (Left Panel Mirror) */}
              <div className="bg-slate-900 border border-pink-900/40 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-pink-400 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4" />
                    🎛️ 迴路增益 K 即時調整
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isClosedLoopStable ? "bg-emerald-950 text-emerald-400 border border-emerald-700" : "bg-rose-950 text-rose-400 border border-rose-700"}`}>
                    {isClosedLoopStable ? "閉迴路穩定" : "閉迴路不穩定"}
                  </span>
                </div>

                {/* K Slider and Direct Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold">設定增益 K:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 font-mono text-[11px]">K =</span>
                      <input
                        type="number"
                        min="0.01"
                        max="1000"
                        step="0.1"
                        value={gainK}
                        onChange={(e) => setGainK(Math.max(0.01, parseFloat(e.target.value) || 0.1))}
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center font-mono text-pink-400 font-bold text-xs outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={gainK}
                    onChange={(e) => setGainK(parseFloat(e.target.value))}
                    className="w-full accent-pink-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                  />

                  {/* K Quick Buttons */}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    {[0.5, 1, 5, 10, 25, 48].map((kv) => (
                      <button
                        key={kv}
                        onClick={() => setGainK(kv)}
                        className={`flex-1 py-1 rounded text-[11px] font-mono border transition-all ${
                          gainK === kv
                            ? 'bg-pink-600 text-white border-pink-500 font-bold'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        {kv}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Closed Loop Specs at this K */}
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>阻尼比 ζ:</span>
                    <strong className="text-emerald-400 font-mono">{zeta.toFixed(3)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>自然頻率 ωn:</span>
                    <strong className="text-sky-400 font-mono">{wn.toFixed(2)} rad/s</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>主導極點:</span>
                    <strong className="text-slate-200 font-mono text-[11px]">{dominantPole?.toString() || 'N/A'}</strong>
                  </div>
                </div>
              </div>

              {/* Card 3: Quick Click Exam Presets */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                  點選經典歷屆考題快速帶入
                </span>
                <div className="space-y-1.5 pt-1">
                  {FORMULA_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleLoadFormulaPreset(p)}
                      className="w-full text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500 text-xs transition-all group"
                    >
                      <div className="font-semibold text-slate-200 group-hover:text-sky-400">{p.title}</div>
                      <div className="font-mono text-[10px] text-slate-500 truncate mt-0.5">
                        G(s) = ({p.num}) / ({p.den})
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ================= MODE 2: MATLAB CODE SCRIPT MODE ================= */
            <div className="flex flex-col h-full">
              <div className="h-9 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  MATLAB 腳本編輯 (main.m)
                </span>
                <button
                  onClick={() => runScript()}
                  className="flex items-center gap-1 bg-sky-600 hover:bg-sky-500 text-white text-[11px] px-2.5 py-1 rounded"
                >
                  <Play className="w-3 h-3 fill-current" /> 執行腳本
                </button>
              </div>

              <div className="flex-1 p-3 bg-slate-950 font-mono text-xs overflow-auto">
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.shiftKey && e.key === 'Enter') {
                      e.preventDefault();
                      runScript();
                    }
                  }}
                  spellCheck={false}
                  className="w-full h-full bg-transparent text-sky-200 outline-none resize-none leading-relaxed font-mono"
                  placeholder="% 在此輸入 MATLAB 程式碼"
                />
              </div>

              <div className="p-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs">
                <span className="text-slate-400">範本:</span>
                <select 
                  onChange={(e) => {
                    const p = SCRIPT_PRESETS[e.target.value];
                    if (p) {
                      setCode(p.code);
                      setActiveTab(p.defaultTab);
                      runScript(p.code);
                    }
                  }}
                  className="bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1"
                >
                  {Object.entries(SCRIPT_PRESETS).map(([key, item]) => (
                    <option key={key} value={key}>{item.title}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Figure Studio & Permanent Parameters Bar */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {/* Top 5 Plot Switcher Tabs */}
          <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 mr-1 select-none">選擇圖表:</span>
              <button
                onClick={() => setActiveTab('rlocus')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'rlocus'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                根軌跡 (Root Locus)
              </button>

              <button
                onClick={() => setActiveTab('bode')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'bode'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                波德圖 (Bode Plot)
              </button>

              <button
                onClick={() => setActiveTab('nyquist')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'nyquist'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                奈氏圖 (Nyquist Plot)
              </button>

              <button
                onClick={() => setActiveTab('step')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'step'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                階躍響應 (Step Response)
              </button>

              <button
                onClick={() => setActiveTab('pzmap')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'pzmap'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                極零點分佈 (PZ-Map)
              </button>
            </div>

            {/* Model Badge */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">目前繪圖受控廠:</span>
              <span className="text-sky-400 font-bold">K · G(s)</span>
            </div>
          </div>

          {/* ================= PERMANENT TOP PARAMETER CONTROL BAR ================= */}
          <div className="h-11 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between text-xs flex-shrink-0">
            {/* Left: Loop Gain K slider + input */}
            <div className="flex items-center gap-3">
              <span className="font-bold text-pink-400 whitespace-nowrap flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5" />
                迴路增益 K:
              </span>
              <input
                type="number"
                min="0.01"
                max="1000"
                step="0.1"
                value={gainK}
                onChange={e => setGainK(Math.max(0.01, parseFloat(e.target.value) || 0.1))}
                className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-center font-mono text-pink-400 font-bold text-xs"
              />
              <input
                type="range"
                min="0.1"
                max="100"
                step="0.1"
                value={gainK}
                onChange={e => setGainK(parseFloat(e.target.value))}
                className="w-36 accent-pink-500 cursor-pointer"
              />
              <div className="flex items-center gap-1">
                {[0.5, 1, 5, 10, 25, 48].map(kv => (
                  <button
                    key={kv}
                    onClick={() => setGainK(kv)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all ${
                      gainK === kv
                        ? 'bg-pink-600 text-white border-pink-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    K={kv}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Specific controls or status */}
            <div className="flex items-center gap-4 text-slate-300">
              {activeTab === 'nyquist' && (
                <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  <span className="text-emerald-400 font-semibold whitespace-nowrap">感度圓 r₀:</span>
                  <input
                    type="number"
                    min="0.01"
                    max="1.5"
                    step="0.01"
                    value={sensitivityR}
                    onChange={e => setSensitivityR(Math.max(0.01, parseFloat(e.target.value) || 0.1))}
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono text-emerald-400 text-xs"
                  />
                  <input
                    type="range"
                    min="0.01"
                    max="1.0"
                    step="0.005"
                    value={sensitivityR}
                    onChange={e => setSensitivityR(parseFloat(e.target.value))}
                    className="w-20 accent-emerald-500 cursor-pointer"
                  />
                </div>
              )}

              {activeTab === 'step' && (
                <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  <span className="text-sky-400 font-semibold whitespace-nowrap">模擬時長 tend:</span>
                  <input
                    type="range"
                    min="2"
                    max="50"
                    step="1"
                    value={tEnd}
                    onChange={e => setTEnd(parseInt(e.target.value))}
                    className="w-24 accent-sky-500 cursor-pointer"
                  />
                  <span className="font-mono text-sky-400 font-bold w-8">{tEnd}s</span>
                </div>
              )}

              <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                <span>阻尼比 ζ = <strong className="text-emerald-400 font-mono">{zeta.toFixed(3)}</strong></span>
                <span>自然頻率 ωn = <strong className="text-sky-400 font-mono">{wn.toFixed(2)}</strong></span>
                <span className={`px-2 py-0.5 rounded font-bold ${isClosedLoopStable ? "bg-emerald-950 text-emerald-400 border border-emerald-700" : "bg-rose-950 text-rose-400 border border-rose-700"}`}>
                  {isClosedLoopStable ? "閉迴路穩定" : "閉迴路不穩定"}
                </span>
              </div>
            </div>
          </div>

          {/* Active Plot Canvas Area (Full Height!) */}
          <div className="flex-1 p-3 overflow-hidden">
            <ErrorBoundary fallbackTitle="圖形渲染異常">
              {activeTab === 'bode' && <BodePlot tf={currentTF} gainK={gainK} />}
              {activeTab === 'rlocus' && <RootLocusPlot tf={currentTF} gainK={gainK} setGainK={setGainK} />}
              {activeTab === 'nyquist' && <NyquistPlot tf={currentTF} gainK={gainK} sensitivityR={sensitivityR} setSensitivityR={setSensitivityR} />}
              {activeTab === 'step' && <StepResponsePlot tf={currentTF} gainK={gainK} tEnd={tEnd} />}
              {activeTab === 'pzmap' && <PZMapPlot tf={currentTF} />}
            </ErrorBoundary>
          </div>

          {/* Collapsible Bottom Console */}
          <div className={`border-t border-slate-800 flex flex-col bg-slate-900 transition-all ${isConsoleOpen ? 'h-36' : 'h-7'}`}>
            <button
              onClick={() => setIsConsoleOpen(prev => !prev)}
              className="h-7 px-4 bg-slate-900 hover:bg-slate-850 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 w-full cursor-pointer select-none"
            >
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                系統終端輸出 (Output Log)
                <span className="text-[10px] text-slate-500 font-normal">({isConsoleOpen ? '點擊收起' : '點擊展開'})</span>
              </span>
              {isConsoleOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>

            {isConsoleOpen && (
              <>
                <div className="flex-1 overflow-auto p-3 font-mono text-xs text-slate-300 space-y-1 bg-slate-950">
                  {consoleLogs.map(log => (
                    <div key={log.id} className="whitespace-pre-wrap leading-relaxed">
                      {log.type === 'command' && <span className="text-sky-400 font-bold">{log.text}</span>}
                      {log.type === 'error' && <span className="text-rose-400 font-semibold">{log.text}</span>}
                      {log.type === 'info' && <span className="text-slate-400 italic">{log.text}</span>}
                      {log.type === 'output' && <span className="text-slate-200">{log.text}</span>}
                    </div>
                  ))}
                  <div ref={consoleBottomRef} />
                </div>

                <form onSubmit={handleCommandSubmit} className="h-8 px-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
                  <span className="font-mono text-sky-400 font-bold text-xs select-none">&gt;&gt;</span>
                  <input
                    type="text"
                    value={commandInput}
                    onChange={e => setCommandInput(e.target.value)}
                    placeholder="可輸入 MATLAB 指令，例如 damp(G), margin(G)"
                    className="flex-1 bg-transparent border-none text-xs text-slate-100 font-mono focus:outline-none"
                  />
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
