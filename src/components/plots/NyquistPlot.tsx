import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { freqResp } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
}

export const NyquistPlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sensitivityR, setSensitivityR] = useState<number>(0.1288); // 115 UST default
  const [showSensitivity, setShowSensitivity] = useState<boolean>(true);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.1, Math.min(prev * factor, 50)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 0.87;

      setZoom(prev => {
        const nextZoom = Math.max(0.1, Math.min(prev * factor, 50));
        const scaleChange = nextZoom / prev;
        setPan(p => ({
          x: mouseX - (mouseX - p.x) * scaleChange,
          y: mouseY - (mouseY - p.y) * scaleChange
        }));
        return nextZoom;
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width <= 10 || rect.height <= 10) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    const pad = 40;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    // Origin center
    const cx = pad + plotW / 2 + pan.x;
    const cy = pad + plotH / 2 + pan.y;

    // Base unit scale
    const basePPU = (Math.min(plotW, plotH) / 4) * zoom;

    const toPxX = (re: number) => cx + re * basePPU;
    const toPxY = (im: number) => cy - im * basePPU;

    const visibleMinRe = (pad - cx) / basePPU;
    const visibleMaxRe = (pad + plotW - cx) / basePPU;
    const visibleMaxIm = (cy - pad) / basePPU;
    const visibleMinIm = (cy - (pad + plotH)) / basePPU;

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, plotW, plotH);
    ctx.clip();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Dynamic grid circles
    const maxVisibleDist = Math.max(
      Math.hypot(visibleMinRe, visibleMinIm),
      Math.hypot(visibleMaxRe, visibleMaxIm)
    );
    const circleTicks = getNiceTicks(0, maxVisibleDist, 5).filter(r => r > 0);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    circleTicks.forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * basePPU, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Axes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, cy);
    ctx.lineTo(pad + plotW, cy);
    ctx.moveTo(cx, pad);
    ctx.lineTo(cx, pad + plotH);
    ctx.stroke();

    // Critical point (-1, 0)
    const critX = toPxX(-1);
    const critY = toPxY(0);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(critX - 7, critY - 7);
    ctx.lineTo(critX + 7, critY + 7);
    ctx.moveTo(critX + 7, critY - 7);
    ctx.lineTo(critX - 7, critY + 7);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('(-1, j0)', critX, critY + 18);

    // Sensitivity Circle centered at (-1, 0) with radius r0 (115 UST P3)
    if (showSensitivity && sensitivityR > 0) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(critX, critY, sensitivityR * basePPU, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#10b981';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`r₀ = ${sensitivityR.toFixed(4)}`, critX + sensitivityR * basePPU + 6, critY - 6);
    }

    // Sample frequencies for Nyquist contour
    const N = 600;
    const wMin = 1e-2, wMax = 1e3;
    const logMin = Math.log10(wMin), logMax = Math.log10(wMax);

    const posPts: { x: number; y: number }[] = [];
    const negPts: { x: number; y: number }[] = [];

    for (let i = 0; i <= N; i++) {
      const w = Math.pow(10, logMin + (i / N) * (logMax - logMin));
      const resp = freqResp(tf, w);
      const re = resp.val.re;
      const im = resp.val.im;

      posPts.push({ x: toPxX(re), y: toPxY(im) });
      negPts.push({ x: toPxX(re), y: toPxY(-im) });
    }

    // Positive Frequency Curve (Solid Blue)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    posPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Negative Frequency Curve (Dashed Sky Blue)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    negPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore(); // Restore clip

    // Draw Labels outside
    const reTicks = getNiceTicks(visibleMinRe, visibleMaxRe, Math.floor(plotW / 80));
    const imTicks = getNiceTicks(visibleMinIm, visibleMaxIm, Math.floor(plotH / 60));

    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Fira Code", monospace';

    reTicks.forEach(re => {
      const x = toPxX(re);
      if (x >= pad && x <= pad + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(re), x, H - pad + 16);
      }
    });

    imTicks.forEach(im => {
      const y = toPxY(im);
      if (y >= pad && y <= pad + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(im === 0 ? '0' : (im > 0 ? `+j${formatTick(im)}` : `-j${formatTick(Math.abs(im))}`), pad - 8, y + 4);
      }
    });

    // Border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, sensitivityR, showSensitivity, zoom, pan]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800 select-none">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Nyquist Diagram (奈氏圖)</span>
          <span className="text-sky-400">― 正頻率 (ω &gt; 0)</span>
          <span className="text-sky-600">- - 負頻率 (ω &lt; 0)</span>
          <span className="text-rose-400">✕ 臨界點 (-1, j0)</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showSensitivity}
              onChange={e => setShowSensitivity(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
            感度圓 (Sensitivity Circle)
          </label>
        </div>
      </div>

      <div 
        className={`flex-1 w-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Floating Zoom Toolbar */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 p-1 rounded-lg shadow-lg">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all"
            title="放大"
          >
            <ZoomIn className="w-4 h-4 text-sky-400" />
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all"
            title="縮小"
          >
            <ZoomOut className="w-4 h-4 text-sky-400" />
          </button>
          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
          <button
            onClick={handleReset}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all flex items-center gap-1 text-[11px]"
            title="復原預設視角"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            重設視角
          </button>
          <div className="text-[10px] text-slate-400 font-mono px-1">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Tip Badge */}
        <div className="absolute bottom-3 left-4 flex items-center gap-1 text-[11px] text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800 pointer-events-none">
          <Move className="w-3 h-3 text-sky-400" />
          <span>滾輪平滑縮放座標 • 按住滑鼠左鍵自由平移奈氏圖</span>
        </div>
      </div>

      {/* Control Footer */}
      {showSensitivity && (
        <div className="flex items-center justify-between px-6 py-2 bg-slate-950 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-3 w-1/2">
            <span className="text-emerald-400 font-semibold whitespace-nowrap">切線感度圓半徑 r₀:</span>
            <input
              type="range"
              min="0.02"
              max="1.0"
              step="0.005"
              value={sensitivityR}
              onChange={e => setSensitivityR(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <span className="font-mono text-emerald-400 font-bold w-16">{sensitivityR.toFixed(4)}</span>
          </div>
          <span className="text-slate-400 text-[11px]">
            115 台聯大 P3 考點：檢驗 |1 + G(jω)| ≥ r₀
          </span>
        </div>
      )}
    </div>
  );
};
