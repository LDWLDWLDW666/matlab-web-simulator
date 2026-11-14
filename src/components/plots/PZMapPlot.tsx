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

    // Background: Pure White
    ctx.fillStyle = '#ffffff';
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

    // Subtle Grid (Light Grey)
    const sigmaTicks = getNiceTicks(visibleMinSigma, visibleMaxSigma, Math.max(4, Math.floor(plotW / 80)));
    const omegaTicks = getNiceTicks(visibleMinOmega, visibleMaxOmega, Math.max(4, Math.floor(plotH / 60)));

    ctx.strokeStyle = '#f1f5f9';
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

    // Real Axis
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(pad + plotW, y0);
    ctx.stroke();

    // Imaginary Axis (Red Stability Boundary)
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(x0, pad);
    ctx.lineTo(x0, pad + plotH);
    ctx.stroke();

    // Draw Zeros (o) - Deep Green (#166534)
    tf.zeros.forEach(z => {
      const x = toPxX(z.re);
      const y = toPxY(z.im);
      ctx.strokeStyle = '#166534';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#333333';
      ctx.font = '10px "Fira Code", monospace';
      ctx.fillText(`(${formatTick(z.re)}, ${formatTick(z.im)})`, x + 9, y - 4);
    });

    // Draw Poles (x) - Stable: Deep Green (#166534), Unstable: Red (#dc2626)
    tf.poles.forEach(p => {
      const x = toPxX(p.re);
      const y = toPxY(p.im);
      const isRHP = p.re > 1e-4;
      const poleColor = isRHP ? '#dc2626' : '#166534';
      ctx.strokeStyle = poleColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.stroke();

      ctx.fillStyle = poleColor;
      ctx.font = '10px "Fira Code", monospace';
      ctx.fillText(`(${formatTick(p.re)}, ${formatTick(p.im)})`, x + 9, y - 4);
    });

    ctx.restore(); // Restore clip

    // Draw Axis Labels: 80% Black (#333333)
    ctx.fillStyle = '#333333';
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

    // Border
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, zoom, pan]);

  const hasRHP = tf.poles.some(p => p.re > 1e-4);

  return (
    <div className="relative w-full h-full flex flex-col bg-white rounded-lg overflow-hidden border border-neutral-200 select-none shadow-sm">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-[#f8fafc] border-b border-neutral-200 text-xs gap-2">
        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-[11px] text-[#333333]">
          <span className="font-bold text-[#333333]">Pole-Zero Map (極零點圖)</span>
          <span className="text-[#166534] font-semibold">✕ 左半面極點 (穩定)</span>
          <span className="text-[#dc2626] font-semibold">✕ 右半面極點 (不穩定)</span>
          <span className="text-[#166534]">○ 零點</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded font-bold ${!hasRHP ? "bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]" : "bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]"}`}>
            {!hasRHP ? "無右半平面極點 (開迴路穩定)" : "具右半極點 (開迴路不穩定)"}
          </span>
        </div>
      </div>

      <div 
        className={`flex-1 w-full relative bg-white ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur border border-neutral-200 p-1 rounded-lg shadow-sm">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#333333] rounded transition-all"
            title="放大"
          >
            <ZoomIn className="w-4 h-4 text-[#166534]" />
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#333333] rounded transition-all"
            title="縮小"
          >
            <ZoomOut className="w-4 h-4 text-[#166534]" />
          </button>
          <div className="w-[1px] h-4 bg-neutral-200 mx-0.5" />
          <button
            onClick={handleReset}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#555555] rounded transition-all flex items-center gap-1 text-[11px]"
            title="復原預設視角"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#555555]" />
            <span className="hidden sm:inline">重設</span>
          </button>
          <div className="text-[10px] text-[#555555] font-mono px-1">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Tip Badge */}
        <div className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-[#555555] bg-white/90 px-2 py-0.5 rounded border border-neutral-200 pointer-events-none shadow-xs">
          <Move className="w-3 h-3 text-[#166534]" />
          <span className="hidden sm:inline">滾輪/雙指縮放 • 滑鼠/單指拖曳平移</span>
          <span className="sm:hidden">雙指縮放 • 單指平移</span>
        </div>
      </div>
    </div>
  );
};
