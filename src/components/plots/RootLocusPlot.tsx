import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction, CNumber } from '../../types';
import { computeRootLocus, findRoots, polyAdd, polyScale } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
}

export const RootLocusPlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [gainK, setGainK] = useState<number>(1.0);
  const [closedLoopPoles, setClosedLoopPoles] = useState<CNumber[]>([]);

  // Pan & Zoom State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { branches, paths, asymptotes } = useMemo(() => computeRootLocus(tf), [tf]);

  // Compute closed loop poles for current gain K
  useEffect(() => {
    try {
      const charPoly = polyAdd(tf.den, polyScale(tf.num, gainK));
      const roots = findRoots(charPoly);
      setClosedLoopPoles(roots);
    } catch (e) {
      console.error(e);
    }
  }, [tf, gainK]);

  // Auto-fit initial range when tf changes
  const baseRange = useMemo(() => {
    let minSigma = -6, maxSigma = 2, maxOmega = 5;
    const allRoots = branches.flatMap(b => b.roots).concat(tf.poles).concat(tf.zeros);
    if (allRoots.length > 0) {
      const sigmas = allRoots.map(r => r.re).filter(v => isFinite(v) && Math.abs(v) < 200);
      const omegas = allRoots.map(r => Math.abs(r.im)).filter(v => isFinite(v) && Math.abs(v) < 200);
      if (sigmas.length > 0) {
        minSigma = Math.min(...sigmas, -3);
        maxSigma = Math.max(...sigmas, 1.5);
      }
      if (omegas.length > 0) {
        maxOmega = Math.max(...omegas, 3);
      }
    }
    const padX = Math.max((maxSigma - minSigma) * 0.25, 1.5);
    const padY = Math.max(maxOmega * 0.25, 1.5);
    return {
      minSigma: minSigma - padX,
      maxSigma: maxSigma + padX,
      maxOmega: maxOmega + padY
    };
  }, [tf, branches]);

  // Reset View
  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Zoom In / Out
  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.05, Math.min(prev * factor, 100)));
  };

  // Mouse Wheel Zoom (centered at mouse pointer)
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
        const nextZoom = Math.max(0.05, Math.min(prev * factor, 100));
        // Adjust pan to keep mouse position anchored
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

  // Mouse Drag to Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
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

  // Render Canvas
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

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    // Calculate current visible range given zoom and pan
    const pad = 45;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    // Base coordinate transformation
    const sRange = baseRange.maxSigma - baseRange.minSigma;
    const oRange = 2 * baseRange.maxOmega;

    // Pixel scale per math unit
    const ppuX = (plotW / sRange) * zoom;
    const ppuY = (plotH / oRange) * zoom;

    // Center of origin (0, 0)
    const originX = pad + ((0 - baseRange.minSigma) / sRange) * plotW * zoom + pan.x;
    const originY = pad + ((baseRange.maxOmega - 0) / oRange) * plotH * zoom + pan.y;

    const toPxX = (sigma: number) => originX + sigma * ppuX;
    const toPxY = (omega: number) => originY - omega * ppuY;

    // Math bounds of visible viewport
    const visibleMinSigma = (pad - originX) / ppuX;
    const visibleMaxSigma = (W - pad - originX) / ppuX;
    const visibleMaxOmega = (originY - pad) / ppuY;
    const visibleMinOmega = (originY - (H - pad)) / ppuY;

    // Clip to plot box
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, plotW, plotH);
    ctx.clip();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Dynamic Nice Ticks for Sigma and Omega
    const sigmaTicks = getNiceTicks(visibleMinSigma, visibleMaxSigma, Math.floor(plotW / 80));
    const omegaTicks = getNiceTicks(visibleMinOmega, visibleMaxOmega, Math.floor(plotH / 60));

    // Draw Grid Lines
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

    // Real Axis (sigma)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(pad + plotW, y0);
    ctx.stroke();

    // Imaginary Axis (j omega) - Red stability line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, pad);
    ctx.lineTo(x0, pad + plotH);
    ctx.stroke();

    // Draw Asymptotes
    if (asymptotes.angles.length > 0) {
      const ax = toPxX(asymptotes.centroid);
      const r = Math.max(plotW, plotH) * 4;
      ctx.strokeStyle = '#a855f7';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;

      asymptotes.angles.forEach(ang => {
        const rad = (ang * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(ax, y0);
        ctx.lineTo(ax + r * Math.cos(rad), y0 - r * Math.sin(rad));
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // Draw Root Locus Trajectories with smooth continuous paths
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    paths.forEach(path => {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        if (!isFinite(pt.re) || !isFinite(pt.im)) continue;

        // Discontinuity guard: never draw a line jumping across the real axis
        if (started && i > 0) {
          const prev = path[i - 1];
          const crossAxis = (prev.im > 0.08 && pt.im < -0.08) || (prev.im < -0.08 && pt.im > 0.08);
          const largeJump = Math.hypot(pt.re - prev.re, pt.im - prev.im) > 15;
          if (crossAxis || largeJump) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
        }

        const x = toPxX(pt.re);
        const y = toPxY(pt.im);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });

    // Draw Open Loop Zeros (o)
    tf.zeros.forEach(z => {
      const zx = toPxX(z.re);
      const zy = toPxY(z.im);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(zx, zy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Draw Open Loop Poles (x)
    tf.poles.forEach(p => {
      const px = toPxX(p.re);
      const py = toPxY(p.im);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 5);
      ctx.lineTo(px + 5, py + 5);
      ctx.moveTo(px + 5, py - 5);
      ctx.lineTo(px - 5, py + 5);
      ctx.stroke();
    });

    // Draw Current Closed Loop Poles for gain K (magenta squares)
    closedLoopPoles.forEach(clp => {
      const cx = toPxX(clp.re);
      const cy = toPxY(clp.im);
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 5, cy - 5, 10, 10);
    });

    ctx.restore(); // Restore clipping

    // Draw Tick Labels outside / near axes
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Fira Code", monospace';

    // Sigma tick labels along bottom
    sigmaTicks.forEach(s => {
      const x = toPxX(s);
      if (x >= pad && x <= pad + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(s), x, H - pad + 18);
      }
    });

    // Omega tick labels along left
    omegaTicks.forEach(o => {
      const y = toPxY(o);
      if (y >= pad && y <= pad + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(o === 0 ? '0' : (o > 0 ? `+j${formatTick(o)}` : `-j${formatTick(Math.abs(o))}`), pad - 8, y + 4);
      }
    });

    // Outer border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, branches, asymptotes, closedLoopPoles, zoom, pan, baseRange]);

  const dominantPole = closedLoopPoles.reduce<CNumber | null>((dom, p) => {
    if (!dom || p.re > dom.re) return p;
    return dom;
  }, null);

  const wn = dominantPole ? dominantPole.abs() : 0;
  const zeta = wn > 1e-6 && dominantPole ? -dominantPole.re / wn : 0;
  const isClosedLoopStable = closedLoopPoles.every(p => p.re < 0);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800 select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Root Locus (根軌跡圖)</span>
          <span className="text-sky-400">✕ 開迴路極點</span>
          <span className="text-amber-400">○ 開迴路零點</span>
          <span className="text-pink-400">■ 閉迴路極點 (K)</span>
          <span className="text-purple-400">- - 漸近線</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            漸近線交點 σa = <strong className="text-purple-400">{asymptotes.centroid.toFixed(2)}</strong>
          </span>
          <span className={`px-2 py-0.5 rounded font-bold ${isClosedLoopStable ? "bg-emerald-950 text-emerald-400 border border-emerald-700" : "bg-rose-950 text-rose-400 border border-rose-700"}`}>
            {isClosedLoopStable ? `閉迴路穩定 (K=${gainK.toFixed(2)})` : `閉迴路不穩定 (K=${gainK.toFixed(2)})`}
          </span>
        </div>
      </div>

      {/* Canvas Area with Pan/Zoom Mouse Handlers */}
      <div 
        className={`flex-1 w-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Floating Zoom & Pan Toolbar */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 p-1 rounded-lg shadow-lg">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all"
            title="放大 (或使用滑鼠滾輪)"
          >
            <ZoomIn className="w-4 h-4 text-sky-400" />
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all"
            title="縮小 (或使用滑鼠滾輪)"
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
          <span>滾輪平滑縮放座標軸 • 按住滑鼠左鍵自由平移</span>
        </div>
      </div>

      {/* Gain Slider Footer */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-3 w-1/2">
          <span className="font-semibold text-slate-300 whitespace-nowrap">動態迴路增益 K:</span>
          <input
            type="range"
            min="0.05"
            max="50"
            step="0.05"
            value={gainK}
            onChange={e => setGainK(parseFloat(e.target.value))}
            className="w-full accent-pink-500 cursor-pointer"
          />
          <span className="font-mono text-pink-400 font-bold w-12">{gainK.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>主導極點: <strong className="text-slate-200 font-mono">{dominantPole?.toString() || 'N/A'}</strong></span>
          <span>阻尼比 ζ: <strong className="text-emerald-400 font-mono">{zeta.toFixed(3)}</strong></span>
          <span>自然頻率 ωn: <strong className="text-sky-400 font-mono">{wn.toFixed(2)}</strong> rad/s</span>
        </div>
      </div>
    </div>
  );
};
