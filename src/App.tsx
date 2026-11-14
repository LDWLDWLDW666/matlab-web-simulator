import React, { useState, useEffect, useRef } from 'react';
import { TransferFunction, PlotType, ConsoleEntry } from './types';
import { MatlabInterpreter } from './utils/matlabParser';
import { createTF } from './utils/math';
import { BodePlot } from './components/plots/BodePlot';
import { RootLocusPlot } from './components/plots/RootLocusPlot';
import { NyquistPlot } from './components/plots/NyquistPlot';
import { StepResponsePlot } from './components/plots/StepResponsePlot';
import { PZMapPlot } from './components/plots/PZMapPlot';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Play, RotateCcw, Download, Terminal, 
  Activity, Compass, Radio, BarChart3, Crosshair, 
  Sparkles, Layers, SlidersHorizontal, Code2, Calculator, CheckCircle2, AlertCircle
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
    tab: 'bode' as PlotType
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

  const [commandInput, setCommandInput] = useState<string>('');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([
    {
      id: 'init-1',
      type: 'info',
      text: '系統已就緒。您可以直接在左側輸入分子與分母方程式，或切換至 MATLAB 模式下指令。'
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

  // Derived properties from currentTF
  const poles = currentTF.poles || [];
  const zeros = currentTF.zeros || [];
  const systemOrder = currentTF.den.length - 1;
  const numZeros = currentTF.num.length - 1;
  const originPoles = poles.filter(p => Math.hypot(p.re, p.im) < 1e-4).length;
  const isStable = poles.every(p => p.re < 0);
  const hasRHP = poles.some(p => p.re > 1e-4);

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
            <p className="text-[11px] text-slate-400">免記 MATLAB 指令，直接輸入轉移函數即刻生圖</p>
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
        <div className="w-[440px] border-r border-slate-800 flex flex-col bg-slate-900/50 flex-shrink-0 overflow-y-auto">
          {inputMode === 'formula' ? (
            /* ================= MODE 1: VISUAL FORMULA MODE ================= */
            <div className="p-4 space-y-4 flex flex-col h-full">
              {/* Card 1: Direct Equation Input */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4" />
                    輸入系統轉移函數 G(s)
                  </span>
                  <span className="text-[11px] text-slate-500">支援因式與多項式展開</span>
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
                <div className="relative py-1 flex items-center justify-center">
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

                {/* Action Button */}
                <button
                  onClick={() => applyFormula(formulaNum, formulaDen)}
                  className="w-full py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:from-sky-700 text-white rounded-lg text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  即刻更新繪圖 (Update Plot)
                </button>
              </div>

              {/* Card 2: Equation Preview & System Stats */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  系統特徵與極零點即時分析
                </span>

                {/* Math Preview */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center font-mono">
                  <div className="text-xs text-slate-400 mb-1">目前解析之轉移函數：</div>
                  <div className="text-sky-300 text-sm font-bold truncate">N(s) = {formulaNum}</div>
                  <div className="w-3/4 mx-auto border-t border-slate-600 my-1"></div>
                  <div className="text-emerald-300 text-sm font-bold truncate">D(s) = {formulaDen}</div>
                </div>

                {/* System Specs Chips */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">系統型態 (Type)</span>
                    <strong className="text-slate-200">Type {originPoles} 系統</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">系統階數 (Order)</span>
                    <strong className="text-slate-200">{systemOrder} 階系統 (n={systemOrder})</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">漸近線數量 (n - m)</span>
                    <strong className="text-purple-400">{Math.max(0, systemOrder - numZeros)} 條漸近線</strong>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">開迴路穩定性</span>
                    <strong className={isStable ? "text-emerald-400" : hasRHP ? "text-rose-400" : "text-amber-400"}>
                      {isStable ? "漸近穩定 (LHP)" : hasRHP ? "不穩定 (RHP)" : "臨界穩定 (虛軸)"}
                    </strong>
                  </div>
                </div>

                {/* Poles and Zeros List */}
                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="text-slate-400 text-[11px] font-semibold">開迴路極點 (Poles ✕)：</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {poles.map((p, idx) => (
                        <span key={idx} className={`px-2 py-0.5 rounded text-[11px] font-mono border ${p.re < 0 ? "bg-sky-950 text-sky-300 border-sky-800" : "bg-rose-950 text-rose-300 border-rose-800"}`}>
                          {p.toString()}
                        </span>
                      ))}
                      {poles.length === 0 && <span className="text-slate-500 text-[11px]">無極點</span>}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[11px] font-semibold">開迴路零點 (Zeros ○)：</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {zeros.map((z, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
                          {z.toString()}
                        </span>
                      ))}
                      {zeros.length === 0 && <span className="text-slate-500 text-[11px]">無有限零點</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Quick Click Exam Presets */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-2 flex-1">
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
              {/* Code Header */}
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

              {/* Code Editor Textarea */}
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

              {/* Preset Selector */}
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

        {/* Right Panel: Figure Studio & Command Window */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {/* Top 5 Plot Switcher Tabs */}
          <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
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
              <span className="text-slate-400">目前繪圖對象:</span>
              <span className="text-sky-400 font-bold">G(s)</span>
            </div>
          </div>

          {/* Active Plot Canvas Area */}
          <div className="flex-1 p-3 overflow-hidden">
            <ErrorBoundary fallbackTitle="圖形渲染異常">
              {activeTab === 'bode' && <BodePlot tf={currentTF} />}
              {activeTab === 'rlocus' && <RootLocusPlot tf={currentTF} />}
              {activeTab === 'nyquist' && <NyquistPlot tf={currentTF} />}
              {activeTab === 'step' && <StepResponsePlot tf={currentTF} />}
              {activeTab === 'pzmap' && <PZMapPlot tf={currentTF} />}
            </ErrorBoundary>
          </div>

          {/* Bottom Panel: Interactive Command Window */}
          <div className="h-36 border-t border-slate-800 flex flex-col bg-slate-900">
            <div className="h-7 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                系統終端輸出 (Output Log)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">支援輸入指令或查看即時運算日誌</span>
            </div>

            {/* Console Output Log */}
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

            {/* Interactive Prompt Input */}
            <form onSubmit={handleCommandSubmit} className="h-8 px-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <span className="font-mono text-sky-400 font-bold text-xs select-none">&gt;&gt;</span>
              <input
                type="text"
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                placeholder="選填：若有需要仍可輸入 MATLAB 指令，例如 damp(G), margin(G)"
                className="flex-1 bg-transparent border-none text-xs text-slate-100 font-mono focus:outline-none"
              />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
