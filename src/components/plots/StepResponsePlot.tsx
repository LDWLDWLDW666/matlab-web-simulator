import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { simulateStepResponse, feedback, createTF, polyScale } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { useCanvasTouchPanZoom } from '../../utils/useCanvasTouch';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
  gainK?: number;
  tEnd?: number;
}

export const StepResponsePlot: React.FC<Props> = ({ tf, gainK = 1.0, tEnd }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Closed loop transfer function T(s) = feedback(K * G(s), 1)
  const effectiveTF = useMemo(() => {
    try {
      const kG = createTF(polyScale(tf.num, gainK), tf.den);
      return feedback(kG, 1);
    } catch {
      return tf;
    }
  }, [tf, gainK]);

  const { t, y, specs } = useMemo(() => simulateStepResponse(effectiveTF, tEnd || 10), [effectiveTF, tEnd]);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mobile Touch Pan & Pinch Zoom Hook
  useCanvasTouchPanZoom({
    canvasRef,
    zoom,
    setZoom,
    pan,
    setPan,
    minZoom: 0.1,
    maxZoom: 50,
  });

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

    // Background (Slate Dark)
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    const margin = { 
      left: Math.min(50, Math.max(35, W * 0.1)), 
      right: 25, 
      top: 25, 
      bottom: 35 
    };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    if (plotW <= 10 || plotH <= 10) return;

    const maxT = t.length > 0 ? t[t.length - 1] : 10;
    const yMaxVal = Math.max(1.5, ...y.filter(v => isFinite(v)));
    const yMinVal = Math.min(0, ...y.filter(v => isFinite(v)));

    const ySpan = Math.max(0.5, yMaxVal - yMinVal) * 1.25;
    const tSpan = Math.max(1, maxT);

    const ppuX = (plotW / tSpan) * zoom;
    const ppuY = (plotH / ySpan) * zoom;

    const originX = margin.left + pan.x;
    const originY = margin.top + plotH - ((0 - yMinVal) / ySpan) * plotH * zoom + pan.y;

    const toPxX = (time: number) => originX + time * ppuX;
    const toPxY = (val: number) => originY - val * ppuY;

    const visibleMinT = Math.max(0, (margin.left - originX) / ppuX);
    const visibleMaxT = (margin.left + plotW - originX) / ppuX;
    const visibleMinY = (originY - (margin.top + plotH)) / ppuY;
    const visibleMaxY = (originY - margin.top) / ppuY;

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, plotH);
    ctx.clip();

    // Subtle Grid (Slate)
    const tTicks = getNiceTicks(visibleMinT, visibleMaxT, Math.max(4, Math.floor(plotW / 80)));
    const yTicks = getNiceTicks(visibleMinY, visibleMaxY, Math.max(4, Math.floor(plotH / 50)));

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    tTicks.forEach(tt => {
      const x = toPxX(tt);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + plotH);
      ctx.stroke();
    });

    yTicks.forEach(yy => {
      const yPos = toPxY(yy);
      ctx.beginPath();
      ctx.moveTo(margin.left, yPos);
      ctx.lineTo(margin.left + plotW, yPos);
      ctx.stroke();
    });

    // Steady State target line (1.0 or yss)
    const yssY = toPxY(specs.yss);
    ctx.strokeStyle = '#475569';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, yssY);
    ctx.lineTo(margin.left + plotW, yssY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2% Settling Band
    const yssPlus = toPxY(specs.yss * 1.02);
    const yssMinus = toPxY(specs.yss * 0.98);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.fillRect(margin.left, Math.min(yssPlus, yssMinus), plotW, Math.abs(yssMinus - yssPlus));

    // Response Curve (Sky Blue)
    ctx.beginPath();
    for (let i = 0; i < t.length; i++) {
      const xPos = toPxX(t[i]);
      const yPos = toPxY(y[i]);
      if (i === 0) ctx.moveTo(xPos, yPos);
      else ctx.lineTo(xPos, yPos);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Annotate Peak Time tp & Mp (Sky Blue)
    if (specs.tp > 0 && specs.Mp > 0) {
      const tpPx = toPxX(specs.tp);
      const ypPx = toPxY(specs.yss * (1 + specs.Mp / 100));

      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tpPx, margin.top + plotH);
      ctx.lineTo(tpPx, ypPx);
      ctx.moveTo(margin.left, ypPx);
      ctx.lineTo(tpPx, ypPx);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(tpPx, ypPx, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Peak: ${specs.Mp.toFixed(1)}% (tp = ${specs.tp.toFixed(2)}s)`, tpPx + 6, ypPx - 6);
    }

    // Annotate Settling Time ts (Slate Neutral)
    if (specs.ts > 0) {
      const tsPx = toPxX(specs.ts);
      ctx.strokeStyle = '#94a3b8';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tsPx, margin.top);
      ctx.lineTo(tsPx, margin.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`ts = ${specs.ts.toFixed(2)}s`, tsPx, margin.top + 14);
    }

    ctx.restore(); // Restore clip

    // Draw Labels outside (Slate)
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "Fira Code", monospace';

    tTicks.forEach(tt => {
      const x = toPxX(tt);
      if (x >= margin.left && x <= margin.left + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(tt), x, margin.top + plotH + 15);
      }
    });

    yTicks.forEach(yy => {
      const yPos = toPxY(yy);
      if (yPos >= margin.top && yPos <= margin.top + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(formatTick(yy), margin.left - 6, yPos + 3);
      }
    });

    // Axis titles
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (seconds)', margin.left + plotW / 2, H - 6);

    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Amplitude y(t)', 0, 0);
    ctx.restore();

    // Border (Slate)
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

  }, [t, y, specs, zoom, pan]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800 select-none">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-slate-950 border-b border-slate-800 text-xs gap-2">
        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-[11px]">
          <span className="font-semibold text-slate-200">Step Response (階躍響應)</span>
          <span className="text-sky-400">― 輸出 y(t)</span>
          <span className="text-slate-400">- - 目標值 1.0</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            超調 Mp = <strong className="text-sky-400 font-mono">{specs.Mp > 0 ? `${specs.Mp.toFixed(1)}%` : '0%'}</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            調節時間 ts = <strong className="text-sky-400 font-mono">{specs.ts.toFixed(2)}s</strong>
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
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block" 
          style={{ touchAction: 'none' }}
        />

        {/* Floating Zoom Toolbar */}
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/90 backdrop-blur border border-slate-700 p-1 rounded-lg shadow-lg">
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
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">重設</span>
          </button>
          <div className="text-[10px] text-slate-400 font-mono px-1">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Tip Badge */}
        <div className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 pointer-events-none">
          <Move className="w-3 h-3 text-sky-400" />
          <span className="hidden sm:inline">滾輪/雙指縮放 • 滑鼠/單指拖曳平移</span>
          <span className="sm:hidden">雙指縮放 • 單指平移</span>
        </div>
      </div>
    </div>
  );
};
