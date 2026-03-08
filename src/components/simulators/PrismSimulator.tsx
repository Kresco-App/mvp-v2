import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Triangle, Settings2, Info, Droplet, Sun, Zap } from 'lucide-react';
import { calculatePrism, SimulationResult } from './PrismLogic';
import { Slider } from '../ui/Slider';

// A custom hook to handle responsive canvas
const useResponsiveCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (parent) {
      setSize({ width: parent.clientWidth, height: parent.clientHeight });
    }

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });

    if (parent) {
      resizeObserver.observe(parent);
    }

    return () => {
      if (parent) {
        resizeObserver.unobserve(parent);
      }
    };
  }, []);

  return { canvasRef, ...size };
};

export const PrismSimulator: React.FC = () => {
  // Main state for physics
  const [incidentAngle, setIncidentAngle] = useState(45); // degrees
  const [prismAngle, setPrismAngle] = useState(60); // degrees

  // Local state for smooth sliding
  const [localIncidentAngle, setLocalIncidentAngle] = useState(incidentAngle);
  const [localPrismAngle, setLocalPrismAngle] = useState(prismAngle);

  const [showWhiteLight, setShowWhiteLight] = useState(true);

  const { canvasRef, width, height } = useResponsiveCanvas();

  useEffect(() => { setLocalIncidentAngle(incidentAngle) }, [incidentAngle]);
  useEffect(() => { setLocalPrismAngle(prismAngle) }, [prismAngle]);

  const simulation: SimulationResult = useMemo(() => {
    if (width === 0 || height === 0) {
      return { geometry: { A: { x: 0, y: 0 }, B: { x: 0, y: 0 }, C: { x: 0, y: 0 }, P: { x: 0, y: 0 } }, incidentRay: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, rays: [], stats: null };
    }
    // Use main state for calculation
    return calculatePrism(width, height, incidentAngle, prismAngle, showWhiteLight);
  }, [width, height, incidentAngle, prismAngle, showWhiteLight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The drawing logic doesn't need to change, it depends on the memoized `simulation`
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f172a'; // Slate 900
    ctx.fillRect(0, 0, width, height);

    const { A, B, C } = simulation.geometry;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f8fafc'; // Slate 50
    ctx.lineWidth = 1;
    ctx.stroke();

    const ir = simulation.incidentRay;
    ctx.strokeStyle = showWhiteLight ? '#ffffff' : '#fef08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ir.start.x, ir.start.y);
    ctx.lineTo(ir.end.x, ir.end.y);
    ctx.stroke();

    simulation.rays.forEach(ray => {
      ctx.strokeStyle = ray.color;
      ctx.lineWidth = ray.width;
      ctx.globalAlpha = ray.alpha;
      ctx.beginPath();
      if (ray.segments.length > 0) {
        ctx.moveTo(ray.segments[0].start.x, ray.segments[0].start.y);
        ray.segments.forEach(seg => ctx.lineTo(seg.end.x, seg.end.y));
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });

  }, [simulation, width, height, showWhiteLight]);

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-xl border border-slate-100 my-8">
      <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-8">

        <div className="lg:col-span-2 w-full aspect-square lg:aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-200">
          <canvas ref={canvasRef} width={width} height={height} className="w-full h-full" />
        </div>

        <div className="lg:col-span-1 mt-6 lg:mt-0">
          <div className="space-y-6">

            <div>
              <label className="text-sm font-bold text-slate-700 mb-3 block">Source de Lumière</label>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setShowWhiteLight(false)}
                  className={`w-1/2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${!showWhiteLight ? 'bg-white text-yellow-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                  <Droplet size={16} /> Laser
                </button>
                <button
                  onClick={() => setShowWhiteLight(true)}
                  className={`w-1/2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${showWhiteLight ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                  <Sun size={16} /> Soleil
                </button>
              </div>
            </div>

            {simulation.stats && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Données de Simulation</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Incidence (i)</span>
                    <span className="font-mono font-bold text-slate-700">{simulation.stats.i.toFixed(1)}°</span>
                  </div>
                  {!simulation.stats.tir ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Réfraction (r)</span>
                        <span className="font-mono text-slate-600">{simulation.stats.r.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Sortie (i')</span>
                        <span className="font-mono font-bold text-emerald-600">{simulation.stats.i_prime.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between bg-yellow-50 p-1.5 rounded mt-2">
                        <span className="text-yellow-800 font-bold">Déviation (D)</span>
                        <span className="font-mono font-bold text-yellow-800">{simulation.stats.D.toFixed(1)}°</span>
                      </div>
                    </>
                  ) : (
                    <div className="bg-rose-50 text-rose-600 p-3 rounded text-sm font-bold text-center mt-2 border border-rose-100">
                      Réflexion Totale Interne
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-slate-700">Angle d'Incidence (i)</label>
                <span className="font-mono text-yellow-600 font-bold bg-yellow-50 px-2 py-0.5 rounded text-sm">
                  {localIncidentAngle}°
                </span>
              </div>
              <Slider
                value={[localIncidentAngle]}
                onValueChange={([value]) => {
                  setLocalIncidentAngle(value);
                  setIncidentAngle(value);
                }}
                min={0} max={85} step={1}
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-slate-700">Angle du Prisme (A)</label>
                <span className="font-mono text-yellow-600 font-bold bg-yellow-50 px-2 py-0.5 rounded text-sm">
                  {localPrismAngle}°
                </span>
              </div>
              <Slider
                value={[localPrismAngle]}
                onValueChange={([value]) => {
                  setLocalPrismAngle(value);
                  setPrismAngle(value);
                }}
                min={30} max={75} step={1}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};