import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
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

    const pad = 45;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const pts = [...tf.poles, ...tf.zeros];
    let maxR = 6;
    if (pts.length > 0) {
      const maxVal = Math.max(...pts.map(p => Math.hypot(p.re, p.im)));
      if (maxVal > 0) maxR = Math.ceil(maxVal * 1.5);
    }

    const cx = pad + plotW * 0.65 + pan.x;
    const cy = pad + plotH / 2 + pan.y;
    const ppu = ((Math.min(plotW, plotH) / 2) / maxR) * zoom;

    const toPxX = (sigma: number) => cx + sigma * ppu;
    const toPxY = (omega: number) => cy - omega * ppu;

    const visibleMinSigma = (pad - cx) / ppu;
    const visibleMaxSigma = (pad + plotW - cx) / ppu;
    const visibleMaxOmega = (cy - pad) / ppu;
    const visibleMinOmega = (cy - (pad + plotH)) / ppu;

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, plotW, plotH);
    ctx.clip();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Dynamic nice grid ticks
    const sigmaTicks = getNiceTicks(visibleMinSigma, visibleMaxSigma, Math.floor(plotW / 80));
    const omegaTicks = getNiceTicks(visibleMinOmega, visibleMaxOmega, Math.floor(plotH / 60));

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

    // Constant zeta radial lines (0.2, 0.4, 0.6, 0.8)
    const zetas = [0.2, 0.4, 0.6, 0.8];
    zetas.forEach(z => {
      const theta = Math.acos(z);
      const radL = Math.max(plotW, plotH) * 2;
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([2, 4]);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - radL * Math.cos(theta), cy - radL * Math.sin(theta));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - radL * Math.cos(theta), cy + radL * Math.sin(theta));
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Axes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, cy);
    ctx.lineTo(pad + plotW, cy);
    ctx.stroke();

    // Stability Boundary highlight (Imaginary Axis)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, pad);
    ctx.lineTo(cx, pad + plotH);
    ctx.stroke();

    // Draw Zeros (o)
    tf.zeros.forEach(z => {
      const x = toPxX(z.re);
      const y = toPxY(z.im);
      ctx.strokeStyle = '#f59e0b';
      ctx.fillStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = '11px "Fira Code", monospace';
      ctx.fillText(`(${formatTick(z.re)}, ${formatTick(z.im)})`, x + 10, y - 4);
    });

    // Draw Poles (x)
    tf.poles.forEach(p => {
      const x = toPxX(p.re);
      const y = toPxY(p.im);
      ctx.strokeStyle = p.re < 0 ? '#38bdf8' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();

      ctx.fillStyle = p.re < 0 ? '#38bdf8' : '#ef4444';
      ctx.font = '11px "Fira Code", monospace';
      ctx.fillText(`(${formatTick(p.re)}, ${formatTick(p.im)})`, x + 10, y - 4);
    });

    ctx.restore(); // Restore clip

    // Draw Axis Labels outside
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Fira Code", monospace';

    sigmaTicks.forEach(s => {
      const x = toPxX(s);
      if (x >= pad && x <= pad + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(s), x, H - pad + 16);
      }
    });

    omegaTicks.forEach(o => {
      const y = toPxY(o);
      if (y >= pad && y <= pad + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(o === 0 ? '0' : (o > 0 ? `+j${formatTick(o)}` : `-j${formatTick(Math.abs(o))}`), pad - 8, y + 4);
      }
    });

    // Border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, zoom, pan]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800 select-none">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Pole-Zero Map (極零點分佈圖 pzmap)</span>
          <span className="text-sky-400">✕ 穩定極點 (LHP)</span>
          <span className="text-rose-400">✕ 不穩定極點 (RHP)</span>
          <span className="text-amber-400">○ 零點</span>
          <span className="text-slate-400">- - 恆等阻尼線 (ζ)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            極點數: <strong className="text-sky-400">{tf.poles.length}</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            零點數: <strong className="text-amber-400">{tf.zeros.length}</strong>
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
          <span>滾輪縮放 S 平面 • 滑鼠拖曳任意平移</span>
        </div>
      </div>
    </div>
  );
};
