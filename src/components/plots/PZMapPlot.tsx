import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { useCanvasTouchPanZoom } from '../../utils/useCanvasTouch';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
}

export const PZMapPlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    const pad = Math.min(45, Math.max(25, W * 0.08));
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const allPts = tf.poles.concat(tf.zeros);
    let maxR = 4;
    allPts.forEach(pt => {
      const mag = Math.hypot(pt.re, pt.im);
      if (isFinite(mag) && mag > maxR && mag < 200) maxR = mag * 1.3;
    });

    const basePPU = (Math.min(plotW, plotH) / (maxR * 2.2)) * zoom;
    const originX = pad + plotW / 2 + pan.x;
    const originY = pad + plotH / 2 + pan.y;

    const toPxX = (re: number) => originX + re * basePPU;
    const toPxY = (im: number) => originY - im * basePPU;

    const visibleMinSigma = (pad - originX) / basePPU;
    const visibleMaxSigma = (W - pad - originX) / basePPU;
    const visibleMaxOmega = (originY - pad) / basePPU;
    const visibleMinOmega = (originY - (H - pad)) / basePPU;

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, plotW, plotH);
    ctx.clip();

    // Subtle Grid (Slate)
    const sigmaTicks = getNiceTicks(visibleMinSigma, visibleMaxSigma, Math.max(4, Math.floor(plotW / 80)));
    const omegaTicks = getNiceTicks(visibleMinOmega, visibleMaxOmega, Math.max(4, Math.floor(plotH / 60)));

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    sigmaTicks.forEach(s => {
      const x = toPxX(s);
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + plotH);
      ctx.stroke();
    });

    omegaTicks.forEach(o => {
      const y = toPxY(o);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + plotW, y);
      ctx.stroke();
    });

    // Real and Imaginary Axes
    const x0 = toPxX(0);
    const y0 = toPxY(0);

    // Real Axis (Slate)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(pad + plotW, y0);
    ctx.stroke();

    // Imaginary Axis (Red stability line)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, pad);
    ctx.lineTo(x0, pad + plotH);
    ctx.stroke();

    // Draw Zeros (o) (Sky Blue outline)
    tf.zeros.forEach(z => {
      const x = toPxX(z.re);
      const y = toPxY(z.im);
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = '#090d16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Fira Code", monospace';
      ctx.fillText(`(${formatTick(z.re)}, ${formatTick(z.im)})`, x + 9, y - 4);
    });

    // Draw Poles (x) (Stable: Sky Blue, Unstable: Red)
    tf.poles.forEach(p => {
      const x = toPxX(p.re);
      const y = toPxY(p.im);
      const isRHP = p.re > 1e-4;
      ctx.strokeStyle = isRHP ? '#ef4444' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.stroke();

      ctx.fillStyle = isRHP ? '#ef4444' : '#38bdf8';
      ctx.font = '10px "Fira Code", monospace';
      ctx.fillText(`(${formatTick(p.re)}, ${formatTick(p.im)})`, x + 9, y - 4);
    });

    ctx.restore(); // Restore clip

    // Draw Axis Labels outside (Slate)
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "Fira Code", monospace';

    sigmaTicks.forEach(s => {
      const x = toPxX(s);
      if (x >= pad && x <= pad + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(s), x, H - pad + 15);
      }
    });

    omegaTicks.forEach(o => {
      const y = toPxY(o);
      if (y >= pad && y <= pad + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(o === 0 ? '0' : (o > 0 ? `+j${formatTick(o)}` : `-j${formatTick(Math.abs(o))}`), pad - 6, y + 3);
      }
    });

    // Border (Slate)
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, zoom, pan]);

  const hasRHP = tf.poles.some(p => p.re > 1e-4);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800 select-none">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-slate-950 border-b border-slate-800 text-xs gap-2">
        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-[11px]">
          <span className="font-semibold text-slate-200">Pole-Zero Map (極零點圖)</span>
          <span className="text-sky-400">✕ 左半平面極點 (穩定)</span>
          <span className="text-red-400">✕ 右半平面極點 (不穩定)</span>
          <span className="text-sky-300">○ 零點</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded font-bold ${!hasRHP ? "bg-slate-800 text-sky-400 border border-slate-700" : "bg-red-950/80 text-red-400 border border-red-700"}`}>
            {!hasRHP ? "開迴路無右半極點 (BIBO穩定)" : "具右半極點 (開迴路不穩定)"}
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

        {/* Floating Toolbar */}
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
