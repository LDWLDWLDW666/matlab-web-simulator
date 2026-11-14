import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { simulateStepResponse } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
}

export const StepResponsePlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { t, y, specs } = useMemo(() => simulateStepResponse(tf), [tf]);

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

    const margin = { top: 35, right: 40, bottom: 45, left: 65 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    const baseTMax = t[t.length - 1] || 10;
    const yMinRaw = Math.min(...y, 0);
    const yMaxRaw = Math.max(...y, 1.2 * specs.yss, 1);
    const baseYMin = Math.floor(yMinRaw * 10) / 10;
    const baseYMax = Math.ceil(yMaxRaw * 10) / 10;
    const baseYRange = baseYMax - baseYMin;

    // Viewport bounds
    const ppuX = (plotW / baseTMax) * zoom;
    const ppuY = (plotH / baseYRange) * zoom;

    const originX = margin.left + pan.x;
    const originY = margin.top + (1 - (0 - baseYMin) / baseYRange) * plotH * zoom + pan.y;

    const toPxX = (currT: number) => originX + currT * ppuX;
    const toPxY = (currY: number) => originY - currY * ppuY;

    // Visible ranges in math units
    const visibleMinT = Math.max(0, (margin.left - originX) / ppuX);
    const visibleMaxT = (margin.left + plotW - originX) / ppuX;
    const visibleMaxY = (originY - margin.top) / ppuY;
    const visibleMinY = (originY - (margin.top + plotH)) / ppuY;

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, plotH);
    ctx.clip();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(margin.left, margin.top, plotW, plotH);

    // Dynamic nice ticks
    const tTicks = getNiceTicks(visibleMinT, visibleMaxT, Math.floor(plotW / 80));
    const yTicks = getNiceTicks(visibleMinY, visibleMaxY, Math.floor(plotH / 50));

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    tTicks.forEach(val => {
      const xPos = toPxX(val);
      ctx.beginPath();
      ctx.moveTo(xPos, margin.top);
      ctx.lineTo(xPos, margin.top + plotH);
      ctx.stroke();
    });

    yTicks.forEach(val => {
      const yPos = toPxY(val);
      ctx.beginPath();
      ctx.moveTo(margin.left, yPos);
      ctx.lineTo(margin.left + plotW, yPos);
      ctx.stroke();
    });

    // Steady state line yss
    const yssPx = toPxY(specs.yss);
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(margin.left, yssPx);
    ctx.lineTo(margin.left + plotW, yssPx);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2% Settling envelope band
    const yssPlus = toPxY(specs.yss * 1.02);
    const yssMinus = toPxY(specs.yss * 0.98);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
    ctx.fillRect(margin.left, Math.min(yssPlus, yssMinus), plotW, Math.abs(yssMinus - yssPlus));

    // Response Curve
    ctx.beginPath();
    for (let i = 0; i < t.length; i++) {
      const xPos = toPxX(t[i]);
      const yPos = toPxY(y[i]);
      if (i === 0) ctx.moveTo(xPos, yPos);
      else ctx.lineTo(xPos, yPos);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Annotate Peak Time tp & Mp
    if (specs.tp > 0 && specs.Mp > 0) {
      const tpPx = toPxX(specs.tp);
      const ypPx = toPxY(specs.yss * (1 + specs.Mp / 100));

      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tpPx, margin.top + plotH);
      ctx.lineTo(tpPx, ypPx);
      ctx.moveTo(margin.left, ypPx);
      ctx.lineTo(tpPx, ypPx);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(tpPx, ypPx, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Peak: ${specs.Mp.toFixed(1)}% (tp = ${specs.tp.toFixed(2)}s)`, tpPx + 8, ypPx - 8);
    }

    // Annotate Settling Time ts
    if (specs.ts > 0) {
      const tsPx = toPxX(specs.ts);
      ctx.strokeStyle = '#10b981';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tsPx, margin.top);
      ctx.lineTo(tsPx, margin.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#10b981';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`ts = ${specs.ts.toFixed(2)}s`, tsPx, margin.top + 16);
    }

    ctx.restore(); // Restore clip

    // Draw Labels outside
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Fira Code", monospace';

    tTicks.forEach(val => {
      const xPos = toPxX(val);
      if (xPos >= margin.left && xPos <= margin.left + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(val), xPos, margin.top + plotH + 18);
      }
    });

    yTicks.forEach(val => {
      const yPos = toPxY(val);
      if (yPos >= margin.top && yPos <= margin.top + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(formatTick(val), margin.left - 8, yPos + 4);
      }
    });

    // Border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (seconds)', margin.left + plotW / 2, H - 10);

  }, [t, y, specs, zoom, pan]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800 select-none">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Step Response (階躍響應)</span>
          <span className="text-sky-400">― 輸出 y(t)</span>
          <span className="text-slate-400">- - 穩態值 yss</span>
          <span className="text-emerald-400">±2% 誤差帶</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            上升時間 tr = <strong className="text-sky-400">{specs.tr.toFixed(2)}s</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            峰值時間 tp = <strong className="text-amber-400">{specs.tp.toFixed(2)}s</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            超調量 Mp = <strong className="text-pink-400">{specs.Mp.toFixed(1)}%</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            調節時間 ts = <strong className="text-emerald-400">{specs.ts.toFixed(2)}s</strong>
          </span>
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
            title="放大響應圖"
          >
            <ZoomIn className="w-4 h-4 text-sky-400" />
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all"
            title="縮小響應圖"
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
          <span>滾輪縮放響應圖 • 滑鼠拖曳任意移動時間與幅值</span>
        </div>
      </div>
    </div>
  );
};
