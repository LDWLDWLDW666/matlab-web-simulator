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
  SlidersHorizontal, Code2, Calculator, CheckCircle2, AlertCircle,
  Sliders, ChevronUp, ChevronDown, ArrowRight, ArrowLeft
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

  // Mobile View Tab: 'editor' (formula/params) vs 'plot' (canvas graph)
  const [mobileTab, setMobileTab] = useState<'editor' | 'plot'>('editor');

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

  // Global Adjustable Parameters (Supports negative K)
  const [gainK, setGainK] = useState<number>(1.0);
  const [sensitivityR, setSensitivityR] = useState<number>(0.1288);
  const [tEnd, setTEnd] = useState<number>(10);

  // Terminal Console visibility toggle
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);

  const [commandInput, setCommandInput] = useState<string>('');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([
    {
      id: 'init-1',
      type: 'info',
      text: '系統已就緒。可直接調整增益 K（支援負增益）、輸入方程式或點選考題即刻生圖。'
    }
  ]);
  const [, setVariables] = useState<Record<string, any>>({});
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
    setMobileTab('plot');
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

  // Compute closed loop poles for current gain K (supports negative K)
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

  const plotTabNames: Record<PlotType, string> = {
    rlocus: '根軌跡',
    bode: '波德圖',
    nyquist: '奈氏圖',
    step: '階躍響應',
    pzmap: '極零點分佈',
    nichols: '尼克爾斯'
  };

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-white text-[#333333] font-sans overflow-hidden select-none">
      {/* Top Navbar: Clean White Background, 80% Black Text, Deep Green Brand */}
      <header className="h-13 bg-white border-b border-neutral-200 flex items-center justify-between px-3 md:px-5 flex-shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#166534] flex items-center justify-center font-bold text-white text-sm shadow-xs">
            G(s)
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm md:text-base tracking-tight text-[#333333]">自動控制全能模擬器</span>
              <span className="text-[10px] bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] px-1.5 py-0.2 rounded font-mono font-medium hidden sm:inline">直覺免指令版</span>
            </div>
            <p className="text-[10px] text-[#666666] hidden md:block">直接輸入方程式、支援負增益 K 即刻生圖</p>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="flex items-center bg-[#f8fafc] p-1 rounded-lg border border-neutral-200">
          <button
            onClick={() => setInputMode('formula')}
            className={`flex items-center gap-1 px-2.5 md:px-3 py-1 rounded text-xs font-semibold transition-all ${
              inputMode === 'formula'
                ? 'bg-[#166534] text-white shadow-xs'
                : 'text-[#666666] hover:text-[#333333]'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">直覺方程式</span>
            <span className="sm:hidden">方程式</span>
          </button>
          <button
            onClick={() => setInputMode('code')}
            className={`flex items-center gap-1 px-2.5 md:px-3 py-1 rounded text-xs font-semibold transition-all ${
              inputMode === 'code'
                ? 'bg-[#166534] text-white shadow-xs'
                : 'text-[#666666] hover:text-[#333333]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">MATLAB 腳本</span>
            <span className="sm:hidden">腳本</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportPlot}
            className="flex items-center gap-1.5 bg-white hover:bg-neutral-50 text-[#333333] text-xs font-semibold px-2.5 md:px-3 py-1.5 rounded border border-neutral-300 transition-all shadow-xs"
            title="匯出圖表 PNG"
          >
            <Download className="w-3.5 h-3.5 text-[#166534]" />
            <span className="hidden sm:inline">匯出圖表</span>
          </button>
        </div>
      </header>

      {/* Mobile View Tab Switcher (Visible strictly on mobile < md) */}
      <div className="md:hidden flex items-center bg-white border-b border-neutral-200 p-1 flex-shrink-0">
        <button
          onClick={() => setMobileTab('editor')}
          className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === 'editor'
              ? 'bg-[#166534] text-white'
              : 'text-[#666666] hover:text-[#333333]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          方程式與參數
        </button>
        <button
          onClick={() => setMobileTab('plot')}
          className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === 'plot'
              ? 'bg-[#166534] text-white'
              : 'text-[#666666] hover:text-[#333333]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          圖表視窗 ({plotTabNames[activeTab]})
        </button>
      </div>

      {/* Main Workspace (Split View on Desktop, Tabbed on Mobile) */}
      <div className="flex-1 flex overflow-hidden relative bg-white">
        {/* ================= LEFT PANEL: Inputs & Parameters ================= */}
        <div 
          className={`
            w-full md:w-[380px] lg:w-[420px] border-r border-neutral-200 flex flex-col bg-[#f8fafc]/70 flex-shrink-0 overflow-y-auto
            ${mobileTab === 'editor' ? 'flex' : 'hidden md:flex'}
          `}
        >
          {inputMode === 'formula' ? (
            /* ================= MODE 1: VISUAL FORMULA MODE ================= */
            <div className="p-3 md:p-4 space-y-3 flex flex-col pb-16 md:pb-4">
              {/* Card 1: Direct Equation Input */}
              <div className="bg-white border border-neutral-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <span className="text-xs font-bold text-[#166534] flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    輸入系統轉移函數 G(s)
                  </span>
                  <span className="text-[10px] text-[#666666] font-mono">支援因式 (s+1)^2</span>
                </div>

                {/* Numerator */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label className="font-semibold text-[#333333]">分子多項式 N(s) :</label>
                    <span className="text-[10px] text-[#666666]">如: 1, 10*(s+2)</span>
                  </div>
                  <input
                    type="text"
                    value={formulaNum}
                    onChange={(e) => {
                      setFormulaNum(e.target.value);
                      applyFormula(e.target.value, formulaDen);
                    }}
                    placeholder="例如: 10 * (s + 2) 或 25"
                    className="w-full bg-white border border-neutral-300 focus:border-[#166534] rounded-lg px-3 py-2 text-xs font-mono text-[#333333] outline-none transition-all select-text shadow-xs"
                  />
                </div>

                {/* Fraction Divider */}
                <div className="relative py-0.5 flex items-center justify-center">
                  <div className="w-full border-t border-neutral-200"></div>
                  <span className="absolute bg-white px-2 text-[9px] text-[#666666] font-bold uppercase">除以 (Over)</span>
                </div>

                {/* Denominator */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label className="font-semibold text-[#333333]">分母多項式 D(s) :</label>
                    <span className="text-[10px] text-[#666666]">如: s*(s+2)*(s+4)</span>
                  </div>
                  <input
                    type="text"
                    value={formulaDen}
                    onChange={(e) => {
                      setFormulaDen(e.target.value);
                      applyFormula(formulaNum, e.target.value);
                    }}
                    placeholder="例如: (s + 1)^2 * (s^2 + 2*s + 5)"
                    className="w-full bg-white border border-neutral-300 focus:border-[#166534] rounded-lg px-3 py-2 text-xs font-mono text-[#333333] outline-none transition-all select-text shadow-xs"
                  />
                </div>

                {/* Error Banner: Red 20% Style */}
                {formulaError && (
                  <div className="flex items-center gap-2 p-2 bg-[#fef2f2] border border-[#fecaca] rounded text-[#dc2626] text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{formulaError}</span>
                  </div>
                )}
              </div>

              {/* Card 2: Interactive Gain K (Supports Negative Values!) */}
              <div className="bg-white border border-neutral-200 rounded-xl p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <span className="text-xs font-bold text-[#166534] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    迴路增益 K 調校 (支援負值)
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isClosedLoopStable ? "bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]" : "bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]"}`}>
                    {isClosedLoopStable ? "閉迴路穩定" : "閉迴路不穩定"}
                  </span>
                </div>

                {/* K Slider and Direct Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#333333] font-semibold">設定增益 K:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[#666666] font-mono text-[11px]">K =</span>
                      <input
                        type="number"
                        step="0.1"
                        value={gainK}
                        onChange={(e) => setGainK(parseFloat(e.target.value) || 0)}
                        className="w-20 bg-white border border-neutral-300 rounded px-2 py-1 text-center font-mono text-[#166534] font-bold text-xs outline-none focus:border-[#166534] select-text shadow-xs"
                      />
                    </div>
                  </div>

                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="0.1"
                    value={gainK}
                    onChange={(e) => setGainK(parseFloat(e.target.value))}
                    className="w-full accent-[#166534] cursor-pointer h-2 bg-neutral-200 rounded-lg"
                  />

                  {/* K Quick Buttons (Including negative K presets!) */}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    {[-20, -5, -1, 1, 5, 20].map((kv) => (
                      <button
                        key={kv}
                        onClick={() => setGainK(kv)}
                        className={`flex-1 py-1 rounded text-[11px] font-mono border transition-all ${
                          gainK === kv
                            ? 'bg-[#166534] text-white border-[#166534] font-bold'
                            : 'bg-white text-[#333333] border-neutral-200 hover:border-[#166534]'
                        }`}
                      >
                        {kv > 0 ? `+${kv}` : kv}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Closed Loop Specs at this K */}
                <div className="bg-[#f8fafc] p-2.5 rounded-lg border border-neutral-200 space-y-1 text-xs">
                  <div className="flex justify-between text-[#666666]">
                    <span>阻尼比 ζ:</span>
                    <strong className="text-[#166534] font-mono">{zeta.toFixed(3)}</strong>
                  </div>
                  <div className="flex justify-between text-[#666666]">
                    <span>自然頻率 ωn:</span>
                    <strong className="text-[#166534] font-mono">{wn.toFixed(2)} rad/s</strong>
                  </div>
                  <div className="flex justify-between text-[#666666]">
                    <span>主導極點:</span>
                    <strong className="text-[#333333] font-mono text-[11px]">{dominantPole?.toString() || 'N/A'}</strong>
                  </div>
                </div>
              </div>

              {/* Card 3: Quick Click Exam Presets */}
              <div className="bg-white border border-neutral-200 rounded-xl p-3.5 shadow-xs space-y-2">
                <span className="text-xs font-bold text-[#333333] flex items-center gap-1.5 border-b border-neutral-200 pb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#166534]" />
                  點選經典歷屆考題快速帶入
                </span>
                <div className="space-y-1.5 pt-1">
                  {FORMULA_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleLoadFormulaPreset(p)}
                      className="w-full text-left p-2 rounded-lg bg-white hover:bg-[#f8fafc] border border-neutral-200 hover:border-[#166534] text-xs transition-all group shadow-xs"
                    >
                      <div className="font-semibold text-[#333333] group-hover:text-[#166534]">{p.title}</div>
                      <div className="font-mono text-[10px] text-[#666666] truncate mt-0.5">
                        G(s) = ({p.num}) / ({p.den})
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Only: Button to jump to plot */}
              <div className="md:hidden pt-2">
                <button
                  onClick={() => setMobileTab('plot')}
                  className="w-full py-2.5 bg-[#166534] hover:bg-green-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>查看即時圖表視窗</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* ================= MODE 2: MATLAB CODE SCRIPT MODE ================= */
            <div className="flex flex-col h-full pb-16 md:pb-0 bg-white">
              <div className="h-9 px-4 bg-[#f8fafc] border-b border-neutral-200 flex items-center justify-between text-xs text-[#666666]">
                <span className="font-semibold text-[#333333] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#166534]"></span>
                  MATLAB 腳本 (main.m)
                </span>
                <button
                  onClick={() => {
                    runScript();
                    setMobileTab('plot');
                  }}
                  className="flex items-center gap-1 bg-[#166534] hover:bg-green-800 text-white text-[11px] px-2.5 py-1 rounded shadow-xs"
                >
                  <Play className="w-3 h-3 fill-current" /> 執行生圖
                </button>
              </div>

              <div className="flex-1 p-3 bg-white font-mono text-xs overflow-auto">
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.shiftKey && e.key === 'Enter') {
                      e.preventDefault();
                      runScript();
                      setMobileTab('plot');
                    }
                  }}
                  spellCheck={false}
                  className="w-full h-full bg-transparent text-[#333333] outline-none resize-none leading-relaxed font-mono select-text"
                  placeholder="% 在此輸入 MATLAB 程式碼"
                />
              </div>

              <div className="p-3 border-t border-neutral-200 bg-[#f8fafc] flex items-center justify-between text-xs">
                <span className="text-[#666666]">範本:</span>
                <select 
                  onChange={(e) => {
                    const p = SCRIPT_PRESETS[e.target.value];
                    if (p) {
                      setCode(p.code);
                      setActiveTab(p.defaultTab);
                      runScript(p.code);
                    }
                  }}
                  className="bg-white text-[#333333] text-xs rounded border border-neutral-300 px-2 py-1 shadow-xs"
                >
                  {Object.entries(SCRIPT_PRESETS).map(([key, item]) => (
                    <option key={key} value={key}>{item.title}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ================= RIGHT PANEL: Figure Studio & Parameter Bar ================= */}
        <div 
          className={`
            flex-1 flex flex-col overflow-hidden bg-white
            ${mobileTab === 'plot' ? 'flex' : 'hidden md:flex'}
          `}
        >
          {/* Top 5 Plot Switcher Tabs (Scrollable on Mobile) */}
          <div className="h-11 bg-white border-b border-neutral-200 flex items-center justify-between px-3 md:px-4 flex-shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none py-1">
              <button
                onClick={() => setActiveTab('rlocus')}
                className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'rlocus'
                    ? 'bg-[#166534] text-white shadow-xs'
                    : 'text-[#666666] hover:text-[#333333] hover:bg-neutral-100'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                根軌跡
              </button>

              <button
                onClick={() => setActiveTab('bode')}
                className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'bode'
                    ? 'bg-[#166534] text-white shadow-xs'
                    : 'text-[#666666] hover:text-[#333333] hover:bg-neutral-100'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                波德圖
              </button>

              <button
                onClick={() => setActiveTab('nyquist')}
                className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'nyquist'
                    ? 'bg-[#166534] text-white shadow-xs'
                    : 'text-[#666666] hover:text-[#333333] hover:bg-neutral-100'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                奈氏圖
              </button>

              <button
                onClick={() => setActiveTab('step')}
                className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'step'
                    ? 'bg-[#166534] text-white shadow-xs'
                    : 'text-[#666666] hover:text-[#333333] hover:bg-neutral-100'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                階躍響應
              </button>

              <button
                onClick={() => setActiveTab('pzmap')}
                className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'pzmap'
                    ? 'bg-[#166534] text-white shadow-xs'
                    : 'text-[#666666] hover:text-[#333333] hover:bg-neutral-100'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                極零點
              </button>
            </div>

            {/* Mobile Back Button or Desktop Model Badge */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setMobileTab('editor')}
                className="md:hidden flex items-center gap-1 text-[11px] bg-[#f8fafc] text-[#166534] px-2 py-1 rounded border border-neutral-300 font-medium"
              >
                <ArrowLeft className="w-3 h-3" />
                改方程式
              </button>
              <div className="hidden lg:flex items-center gap-1.5 bg-[#f8fafc] px-2.5 py-0.5 rounded border border-neutral-200 text-xs font-mono">
                <span className="text-[#666666]">受控廠:</span>
                <span className="text-[#166534] font-bold">K · G(s)</span>
              </div>
            </div>
          </div>

          {/* ================= PERMANENT PARAMETER BAR ================= */}
          <div className="min-h-10 bg-[#f8fafc] border-b border-neutral-200 px-3 md:px-4 py-1.5 flex flex-wrap items-center justify-between text-xs flex-shrink-0 gap-2">
            {/* Loop Gain K slider + input (Supports negative K) */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#166534] whitespace-nowrap flex items-center gap-1 text-[11px]">
                <Sliders className="w-3.5 h-3.5" />
                增益 K:
              </span>
              <input
                type="number"
                step="0.1"
                value={gainK}
                onChange={e => setGainK(parseFloat(e.target.value) || 0)}
                className="w-16 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-center font-mono text-[#166534] font-bold text-xs select-text shadow-xs"
              />
              <input
                type="range"
                min="-50"
                max="50"
                step="0.1"
                value={gainK}
                onChange={e => setGainK(parseFloat(e.target.value))}
                className="w-24 sm:w-32 accent-[#166534] cursor-pointer h-1.5"
              />
              <div className="hidden sm:flex items-center gap-1">
                {[-10, -1, 1, 10].map(kv => (
                  <button
                    key={kv}
                    onClick={() => setGainK(kv)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all ${
                      gainK === kv
                        ? 'bg-[#166534] text-white border-[#166534]'
                        : 'bg-white text-[#333333] border-neutral-300 hover:bg-neutral-100'
                    }`}
                  >
                    K={kv > 0 ? `+${kv}` : kv}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Specific plot controls */}
            <div className="flex items-center gap-3 text-[#333333] text-[11px]">
              {activeTab === 'nyquist' && (
                <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-neutral-200">
                  <span className="text-[#166534] font-semibold whitespace-nowrap">感度圓 r₀:</span>
                  <input
                    type="number"
                    min="0.01"
                    max="1.5"
                    step="0.01"
                    value={sensitivityR}
                    onChange={e => setSensitivityR(Math.max(0.01, parseFloat(e.target.value) || 0.1))}
                    className="w-14 bg-white border border-neutral-300 rounded px-1 py-0.5 text-center font-mono text-[#166534] text-xs select-text"
                  />
                </div>
              )}

              {activeTab === 'step' && (
                <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-neutral-200">
                  <span className="text-[#166534] font-semibold whitespace-nowrap">時長:</span>
                  <input
                    type="range"
                    min="2"
                    max="50"
                    step="1"
                    value={tEnd}
                    onChange={e => setTEnd(parseInt(e.target.value))}
                    className="w-16 accent-[#166534] cursor-pointer h-1.5"
                  />
                  <span className="font-mono text-[#166534] font-bold w-6">{tEnd}s</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-[#666666]">
                <span className="hidden sm:inline">ζ = <strong className="text-[#166534] font-mono">{zeta.toFixed(3)}</strong></span>
                <span className="hidden sm:inline">ωn = <strong className="text-[#166534] font-mono">{wn.toFixed(2)}</strong></span>
                <span className={`px-2 py-0.5 rounded font-bold ${isClosedLoopStable ? "bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]" : "bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]"}`}>
                  {isClosedLoopStable ? "閉迴路穩定" : "閉迴路不穩定"}
                </span>
              </div>
            </div>
          </div>

          {/* Active Plot Canvas Area */}
          <div className="flex-1 p-2 md:p-3 overflow-hidden relative bg-white">
            <ErrorBoundary fallbackTitle="圖形渲染異常">
              {activeTab === 'bode' && <BodePlot tf={currentTF} gainK={gainK} />}
              {activeTab === 'rlocus' && <RootLocusPlot tf={currentTF} gainK={gainK} setGainK={setGainK} />}
              {activeTab === 'nyquist' && <NyquistPlot tf={currentTF} gainK={gainK} sensitivityR={sensitivityR} setSensitivityR={setSensitivityR} />}
              {activeTab === 'step' && <StepResponsePlot tf={currentTF} gainK={gainK} tEnd={tEnd} />}
              {activeTab === 'pzmap' && <PZMapPlot tf={currentTF} />}
            </ErrorBoundary>
          </div>

          {/* Collapsible Bottom Console */}
          <div className={`border-t border-neutral-200 flex flex-col bg-white transition-all ${isConsoleOpen ? 'h-32' : 'h-7'}`}>
            <button
              onClick={() => setIsConsoleOpen(prev => !prev)}
              className="h-7 px-3 md:px-4 bg-[#f8fafc] hover:bg-neutral-100 border-b border-neutral-200 flex items-center justify-between text-xs text-[#666666] w-full cursor-pointer select-none"
            >
              <span className="font-semibold text-[#333333] flex items-center gap-1.5 text-[11px]">
                <Terminal className="w-3.5 h-3.5 text-[#166534]" />
                系統終端輸出 (Output Log)
                <span className="text-[10px] text-[#666666] font-normal">({isConsoleOpen ? '收起' : '展開'})</span>
              </span>
              {isConsoleOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>

            {isConsoleOpen && (
              <>
                <div className="flex-1 overflow-auto p-2.5 font-mono text-xs text-[#333333] space-y-1 bg-white">
                  {consoleLogs.map(log => (
                    <div key={log.id} className="whitespace-pre-wrap leading-relaxed text-[11px]">
                      {log.type === 'command' && <span className="text-[#166534] font-bold">{log.text}</span>}
                      {log.type === 'error' && <span className="text-[#dc2626] font-semibold">{log.text}</span>}
                      {log.type === 'info' && <span className="text-[#666666] italic">{log.text}</span>}
                      {log.type === 'output' && <span className="text-[#333333]">{log.text}</span>}
                    </div>
                  ))}
                  <div ref={consoleBottomRef} />
                </div>

                <form onSubmit={handleCommandSubmit} className="h-8 px-3 bg-[#f8fafc] border-t border-neutral-200 flex items-center gap-2">
                  <span className="font-mono text-[#166534] font-bold text-xs select-none">&gt;&gt;</span>
                  <input
                    type="text"
                    value={commandInput}
                    onChange={e => setCommandInput(e.target.value)}
                    placeholder="可輸入 MATLAB 指令，例如 damp(G), margin(G)"
                    className="flex-1 bg-transparent border-none text-xs text-[#333333] font-mono focus:outline-none select-text"
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
