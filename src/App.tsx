import React, { useState, useEffect, useRef } from 'react';
import { TransferFunction, PlotType, ConsoleEntry } from './types';
import { MatlabInterpreter } from './utils/matlabParser';
import { createTF, tfToLatex } from './utils/math';
import { BodePlot } from './components/plots/BodePlot';
import { RootLocusPlot } from './components/plots/RootLocusPlot';
import { NyquistPlot } from './components/plots/NyquistPlot';
import { StepResponsePlot } from './components/plots/StepResponsePlot';
import { PZMapPlot } from './components/plots/PZMapPlot';
import { 
  Play, RotateCcw, Download, Terminal, 
  Activity, Compass, Radio, BarChart3, Crosshair, 
  Sparkles, Layers
} from 'lucide-react';

const interpreter = new MatlabInterpreter();

// Presets
const PRESETS: { [name: string]: { code: string; title: string; defaultTab: PlotType } } = {
  '115_ust_p2': {
    title: '115 台聯大 P2 (四階雙複數極點根軌跡)',
    defaultTab: 'rlocus',
    code: `% 115 台聯大 自動控制 第 2 題
% 探討開迴路四極點之閉迴路根軌跡與穩定性
s = tf('s');
G = 1 / ((s + 1)^2 * (s^2 + 2*s + 5));

% 繪製根軌跡
rlocus(G);
`
  },
  '115_ust_p3': {
    title: '115 台聯大 P3 (心形 Nyquist 與切線感度圓)',
    defaultTab: 'nyquist',
    code: `% 115 台聯大 自動控制 第 3 題
% 奈氏心形軌跡與穩健感度圓 r0 = 0.1288 驗證
s = tf('s');
G = (s + 2) / (s * (s + 0.5) * (s^2 + s + 1));

% 繪製奈氏圖
nyquist(G);
`
  },
  '112_ncku_step': {
    title: '112 成大電機 (標準二階時域規格分析)',
    defaultTab: 'step',
    code: `% 112 成大電機 二階標準欠阻尼系統
% wn = 5 rad/s, zeta = 0.5
s = tf('s');
G = 25 / (s * (s + 5));
T = feedback(G, 1);

% 繪製閉迴路階躍響應
step(T);
`
  },
  'lead_compensator': {
    title: '頻域設計 (超前補償器 Lead Compensator)',
    defaultTab: 'bode',
    code: `% 串聯超前補償器改善相角邊限 PM
s = tf('s');
G = 10 / (s * (s + 2));
Gc = 4 * (s + 2) / (s + 8);
G_open = Gc * G;

% 繪製波德圖檢驗 PM 與 GM
bode(G_open);
`
  },
  'unstable_stabilization': {
    title: '右半平面極點系統之閉迴路穩定化',
    defaultTab: 'pzmap',
    code: `% 開迴路具有不穩定極點 s = +1
s = tf('s');
G = (s + 2) / ((s - 1) * (s + 4));
T = feedback(5 * G, 1);

% 繪製閉迴路極零點分佈
pzmap(T);
`
  }
};

export const App: React.FC = () => {
  const [code, setCode] = useState<string>(PRESETS['115_ust_p2'].code);
  const [activeTab, setActiveTab] = useState<PlotType>('rlocus');
  const [currentTF, setCurrentTF] = useState<TransferFunction>(() => {
    return createTF([1], [1, 4, 10, 12, 5]); // Initial TF for 115 UST P2
  });
  const [commandInput, setCommandInput] = useState<string>('');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([
    {
      id: 'init-1',
      type: 'info',
      text: 'MATLAB Control Web Studio (v2.0) 已啟動。\n核心數值引擎：Durand-Kerner 複數求根、RK4 階躍數值積分、波德解繞。\n請在腳本區或下方命令行輸入指令（例如：bode(G)、step(T)、rlocus(G)）。'
    }
  ]);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll console
  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  // Execute full script
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

  // Run on mount
  useEffect(() => {
    runScript(PRESETS['115_ust_p2'].code);
  }, []);

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

  // Load Preset
  const loadPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setCode(p.code);
    setActiveTab(p.defaultTab);
    runScript(p.code);
  };

  // Export current plot canvas to PNG
  const exportPlot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `MATLAB_${activeTab}_plot.png`;
    a.click();
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Top Navbar / Toolstrip */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-sky-900/30">
            ML
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white">MATLAB Web Studio</span>
              <span className="text-[10px] bg-sky-950 border border-sky-600 text-sky-400 px-1.5 py-0.2 rounded font-mono font-semibold">CONTROL 2.0</span>
            </div>
            <p className="text-[11px] text-slate-400">自動控制全能動態模擬器</p>
          </div>
        </div>

        {/* Center: Presets */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> 經典試題範本:
          </span>
          <select 
            onChange={(e) => loadPreset(e.target.value)}
            className="bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs rounded-md border border-slate-700 px-3 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {Object.entries(PRESETS).map(([key, item]) => (
              <option key={key} value={key}>{item.title}</option>
            ))}
          </select>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => runScript()}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-md shadow-sm transition-all"
            title="執行腳本 (Shift + Enter)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            執行 (Run)
          </button>

          <button
            onClick={() => {
              setCode('');
              setConsoleLogs([]);
            }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-700 transition-all"
            title="清空腳本與控制台"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            清空
          </button>

          <button
            onClick={exportPlot}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-700 transition-all"
            title="匯出高清 PNG 圖片"
          >
            <Download className="w-3.5 h-3.5" />
            匯出圖表
          </button>
        </div>
      </header>

      {/* Main Workspace (Split View) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Script Editor & Variables */}
        <div className="w-[420px] border-r border-slate-800 flex flex-col bg-slate-900/50 flex-shrink-0">
          {/* Editor Header */}
          <div className="h-9 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500"></span>
              MATLAB Script (main.m)
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Shift + Enter 執行</span>
          </div>

          {/* Code Textarea */}
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
              placeholder="% 請在此編寫 MATLAB 語法&#10;s = tf('s');&#10;G = 1 / (s * (s + 2));&#10;rlocus(G);"
            />
          </div>

          {/* Workspace Variables Inspector */}
          <div className="h-44 border-t border-slate-800 flex flex-col bg-slate-900">
            <div className="h-8 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                工作區變數 (Workspace)
              </span>
              <span className="text-[11px] text-slate-500">{Object.keys(variables).length} 個變數</span>
            </div>
            <div className="flex-1 overflow-auto p-2 text-xs font-mono">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="py-1 px-2">Name</th>
                    <th className="py-1 px-2">Type</th>
                    <th className="py-1 px-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(variables).map(([key, val]) => (
                    <tr key={key} className="border-b border-slate-800/40 hover:bg-slate-800/30 text-slate-300">
                      <td className="py-1 px-2 text-amber-400 font-bold">{key}</td>
                      <td className="py-1 px-2 text-slate-400">{val?.type === 'tf' ? 'tf (LTI)' : typeof val}</td>
                      <td className="py-1 px-2 text-slate-200 truncate max-w-[180px]">
                        {val?.type === 'tf' ? `tf([${val.num.join(', ')}], [${val.den.join(', ')}])` : String(val)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Panel: Figure Window (Visual Studio) & Console */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {/* Plot Navigation Tabs */}
          <div className="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('rlocus')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'rlocus'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                Root Locus (根軌跡)
              </button>

              <button
                onClick={() => setActiveTab('bode')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'bode'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Bode Plot (波德圖)
              </button>

              <button
                onClick={() => setActiveTab('nyquist')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'nyquist'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                Nyquist (奈氏圖)
              </button>

              <button
                onClick={() => setActiveTab('step')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'step'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Step Response (階躍響應)
              </button>

              <button
                onClick={() => setActiveTab('pzmap')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'pzmap'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                PZ Map (極零點圖)
              </button>
            </div>

            {/* Current TF Formula Badge */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">目前繪製模型:</span>
              <span className="text-sky-400 font-bold">G(s)</span>
            </div>
          </div>

          {/* Active Plot Canvas Area */}
          <div className="flex-1 p-3 overflow-hidden">
            {activeTab === 'bode' && <BodePlot tf={currentTF} />}
            {activeTab === 'rlocus' && <RootLocusPlot tf={currentTF} />}
            {activeTab === 'nyquist' && <NyquistPlot tf={currentTF} />}
            {activeTab === 'step' && <StepResponsePlot tf={currentTF} />}
            {activeTab === 'pzmap' && <PZMapPlot tf={currentTF} />}
          </div>

          {/* Bottom Panel: Interactive Command Window (REPL Console) */}
          <div className="h-44 border-t border-slate-800 flex flex-col bg-slate-900">
            <div className="h-7 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                Command Window (互動命令行)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">輸入指令後按 Enter 執行</span>
            </div>

            {/* Console Output Log */}
            <div className="flex-1 overflow-auto p-3 font-mono text-xs text-slate-300 space-y-1.5 bg-slate-950">
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
            <form onSubmit={handleCommandSubmit} className="h-9 px-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <span className="font-mono text-sky-400 font-bold text-xs select-none">&gt;&gt;</span>
              <input
                type="text"
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                placeholder="輸入 MATLAB 指令，例如：bode(G), step(T), rlocus(G), G = 1/(s*(s+3))"
                className="flex-1 bg-transparent border-none text-xs text-slate-100 font-mono focus:outline-none"
              />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
