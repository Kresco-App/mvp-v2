/* eslint-disable react/no-unescaped-entities */
'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Activity, FunctionSquare, TrendingUp } from 'lucide-react';

type FunctionType = 'poly' | 'exp' | 'ln';

const SVG_WIDTH = 760;
const SVG_HEIGHT = 360;
const PAD = 34;
const X_MIN = -4;
const X_MAX = 4;
const Y_MIN = -2;
const Y_MAX = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function evaluate(type: FunctionType, x: number) {
  if (type === 'poly') return x * x;
  if (type === 'exp') return Math.exp(x);
  return Math.log(Math.max(0.1, x));
}

function derivative(type: FunctionType, x: number) {
  if (type === 'poly') return 2 * x;
  if (type === 'exp') return Math.exp(x);
  return 1 / Math.max(0.1, x);
}

function toSvgX(x: number) {
  return PAD + ((x - X_MIN) / (X_MAX - X_MIN)) * (SVG_WIDTH - PAD * 2);
}

function toSvgY(y: number) {
  return SVG_HEIGHT - PAD - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (SVG_HEIGHT - PAD * 2);
}

function fromSvgX(clientX: number, rect: DOMRect) {
  const localX = ((clientX - rect.left) / rect.width) * SVG_WIDTH;
  return X_MIN + ((localX - PAD) / (SVG_WIDTH - PAD * 2)) * (X_MAX - X_MIN);
}

function buildFunctionPath(type: FunctionType) {
  const points: string[] = [];
  for (let i = 0; i <= 180; i++) {
    const x = X_MIN + (i / 180) * (X_MAX - X_MIN);
    if (type === 'ln' && x <= 0.08) continue;
    const y = evaluate(type, x);
    if (!Number.isFinite(y) || y < Y_MIN - 1 || y > Y_MAX + 1) continue;
    points.push(`${points.length ? 'L' : 'M'} ${toSvgX(x).toFixed(2)} ${toSvgY(y).toFixed(2)}`);
  }
  return points.join(' ');
}

function buildTangentPath(type: FunctionType, pointX: number) {
  const pointY = evaluate(type, pointX);
  const slope = derivative(type, pointX);
  const x1 = X_MIN;
  const x2 = X_MAX;
  const y1 = slope * (x1 - pointX) + pointY;
  const y2 = slope * (x2 - pointX) + pointY;
  return `M ${toSvgX(x1).toFixed(2)} ${toSvgY(y1).toFixed(2)} L ${toSvgX(x2).toFixed(2)} ${toSvgY(y2).toFixed(2)}`;
}

export const FunctionExplorer: React.FC = () => {
  const [funcType, setFuncType] = useState<FunctionType>('poly');
  const [pointX, setPointX] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const safePointX = funcType === 'ln' ? Math.max(0.15, pointX) : pointX;
  const pointY = evaluate(funcType, safePointX);
  const slope = derivative(funcType, safePointX);

  const functionPath = useMemo(() => buildFunctionPath(funcType), [funcType]);
  const tangentPath = useMemo(() => buildTangentPath(funcType, safePointX), [funcType, safePointX]);

  function selectFunction(next: FunctionType) {
    setFuncType(next);
    if (next === 'ln') setPointX((current) => Math.max(0.3, current));
  }

  function updatePoint(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const min = funcType === 'ln' ? 0.15 : X_MIN;
    setPointX(clamp(fromSvgX(clientX, rect), min, X_MAX));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1.5">
        <button type="button"
          onClick={() => selectFunction('poly')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold transition-all ${
            funcType === 'poly' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          <FunctionSquare size={18} /> f(x) = x^2
        </button>
        <button type="button"
          onClick={() => selectFunction('exp')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold transition-all ${
            funcType === 'exp' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          <TrendingUp size={18} /> f(x) = e^x
        </button>
        <button type="button"
          onClick={() => selectFunction('ln')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold transition-all ${
            funcType === 'ln' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          <Activity size={18} /> f(x) = ln(x)
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="h-[400px] w-full touch-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updatePoint(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.buttons !== 1) return;
            updatePoint(event.clientX);
          }}
          role="img"
          aria-label="Interactive function graph with tangent point"
        >
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#fff" />
          {Array.from({ length: 9 }, (_, index) => {
            const x = X_MIN + index;
            return (
              <line
                key={`x-${x}`}
                x1={toSvgX(x)}
                x2={toSvgX(x)}
                y1={PAD}
                y2={SVG_HEIGHT - PAD}
                stroke={x === 0 ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={x === 0 ? 1.5 : 1}
              />
            );
          })}
          {Array.from({ length: 11 }, (_, index) => {
            const y = Y_MIN + index;
            return (
              <line
                key={`y-${y}`}
                x1={PAD}
                x2={SVG_WIDTH - PAD}
                y1={toSvgY(y)}
                y2={toSvgY(y)}
                stroke={y === 0 ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={y === 0 ? 1.5 : 1}
              />
            );
          })}
          <path d={functionPath} fill="none" stroke="#e11d48" strokeWidth={4} strokeLinecap="round" />
          <path d={tangentPath} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="8 7" opacity={0.75} />
          <circle cx={toSvgX(safePointX)} cy={toSvgY(pointY)} r={10} fill="#fff" stroke="#e11d48" strokeWidth={4} />
        </svg>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="mb-1 text-xs font-bold uppercase text-slate-500">Point (x)</h4>
          <p className="font-mono text-2xl font-bold text-slate-800">{safePointX.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="mb-1 text-xs font-bold uppercase text-slate-500">Image f(x)</h4>
          <p className="font-mono text-2xl font-bold text-rose-600">{pointY.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="mb-1 text-xs font-bold uppercase text-slate-500">Derivee f'(x)</h4>
          <p className="font-mono text-2xl font-bold text-blue-600">{slope.toFixed(2)}</p>
        </div>
      </div>

      <div className="text-sm italic text-slate-500">
        Deplacez le point sur la courbe pour visualiser la tangente et le nombre derive.
      </div>
    </div>
  );
};
