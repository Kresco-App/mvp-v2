/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

interface PascalTriangleProps {
    rows: number;
    isPlaying: boolean;
    onStepChange?: (step: number, totalSteps: number) => void;
    onComplete?: () => void;
    stepTrigger: number; // Increment to advance one step manually
    speed: number;
}

// Build Pascal's triangle data
function buildPascal(n: number): number[][] {
    const triangle: number[][] = [[1]];
    for (let r = 1; r < n; r++) {
        const row = [1];
        for (let c = 1; c < r; c++) {
            row.push(triangle[r - 1][c - 1] + triangle[r - 1][c]);
        }
        row.push(1);
        triangle.push(row);
    }
    return triangle;
}

// Compute total animation steps: each cell is one step
function totalSteps(rows: number): number {
    let count = 0;
    for (let r = 0; r < rows; r++) count += r + 1;
    return count;
}

// Map step index to (row, col)
function stepToCell(step: number): { row: number; col: number } {
    let s = 0;
    for (let r = 0; ; r++) {
        for (let c = 0; c <= r; c++) {
            if (s === step) return { row: r, col: c };
            s++;
        }
    }
}

export default function PascalTriangleAnimation({
    rows,
    isPlaying,
    onStepChange,
    onComplete,
    stepTrigger,
    speed,
}: PascalTriangleProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [currentStep, setCurrentStep] = useState(-1);
    const [activeAddition, setActiveAddition] = useState<{ row: number; col: number } | null>(null);
    const lastStepTrigger = useRef(stepTrigger);

    const triangle = buildPascal(rows);
    const total = totalSteps(rows);

    // Reset when rows changes
    useEffect(() => {
        setCurrentStep(-1);
        setActiveAddition(null);
    }, [rows]);

    // Manual step trigger
    useEffect(() => {
        if (stepTrigger !== lastStepTrigger.current) {
            lastStepTrigger.current = stepTrigger;
            setCurrentStep(prev => {
                const next = Math.min(prev + 1, total - 1);
                return next;
            });
        }
    }, [stepTrigger, total]);

    // Auto-play
    useEffect(() => {
        if (!isPlaying) return;
        const interval = setInterval(() => {
            setCurrentStep(prev => {
                if (prev >= total - 1) {
                    onComplete?.();
                    return prev;
                }
                return prev + 1;
            });
        }, 600 / speed);
        return () => clearInterval(interval);
    }, [isPlaying, total, speed, onComplete]);

    // Report step changes
    useEffect(() => {
        onStepChange?.(currentStep, total);
    }, [currentStep, total, onStepChange]);

    // Set active addition for the current step
    useEffect(() => {
        if (currentStep < 0) {
            setActiveAddition(null);
            return;
        }
        const cell = stepToCell(currentStep);
        if (cell.row > 0 && cell.col > 0 && cell.col < cell.row) {
            setActiveAddition(cell);
        } else {
            setActiveAddition(null);
        }
    }, [currentStep]);

    // Draw
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const parent = canvas.parentElement;
        if (!parent) return;

        const dpr = window.devicePixelRatio || 1;
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        // Colors
        const bgColor = isDark ? '#0F172A' : '#F8FAFC';
        const cellBg = isDark ? '#1E293B' : '#FFFFFF';
        const cellBorder = isDark ? '#334155' : '#E2E8F0';
        const textColor = isDark ? '#F1F5F9' : '#1E293B';
        const dimTextColor = isDark ? '#475569' : '#CBD5E1';
        const accentColor = '#F59E0B'; // Amber
        const arrowColor = isDark ? '#94A3B8' : '#64748B';
        const additionHighlight = '#10B981'; // Emerald
        const oneColor = '#3B82F6'; // Blue for 1s

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // Layout calculations
        const cellSize = Math.min(48, Math.max(32, Math.min(w / (rows + 2), (h - 60) / (rows + 1))));
        const cellGap = cellSize * 0.25;
        const totalCellW = cellSize + cellGap;
        const startY = 40;

        // Calculate cell positions
        const positions: { x: number; y: number; row: number; col: number; value: number }[] = [];
        let stepIdx = 0;

        for (let r = 0; r < rows; r++) {
            const rowWidth = triangle[r].length * totalCellW - cellGap;
            const xStart = (w - rowWidth) / 2;

            for (let c = 0; c < triangle[r].length; c++) {
                positions.push({
                    x: xStart + c * totalCellW + cellSize / 2,
                    y: startY + r * (cellSize + cellGap * 2) + cellSize / 2,
                    row: r,
                    col: c,
                    value: triangle[r][c],
                });
                stepIdx++;
            }
        }

        // Draw arrows first (behind cells)
        stepIdx = 0;
        for (let r = 1; r < rows; r++) {
            for (let c = 0; c < triangle[r].length; c++) {
                // Check if this cell is visible
                let cellStepIdx = 0;
                for (let rr = 0; rr < r; rr++) cellStepIdx += triangle[rr].length;
                cellStepIdx += c;

                if (cellStepIdx > currentStep) continue;

                const child = positions.find(p => p.row === r && p.col === c);
                if (!child) continue;

                // Left parent arrow
                if (c > 0) {
                    const leftParent = positions.find(p => p.row === r - 1 && p.col === c - 1);
                    if (leftParent) {
                        const isActiveLeft = activeAddition && activeAddition.row === r && activeAddition.col === c;
                        drawArrow(ctx, leftParent.x, leftParent.y + cellSize / 2 + 2,
                            child.x - cellSize * 0.15, child.y - cellSize / 2 - 2,
                            isActiveLeft ? additionHighlight : arrowColor,
                            isActiveLeft ? 2.5 : 1.5,
                            isActiveLeft ? 1 : 0.4);
                    }
                }

                // Right parent arrow
                if (c < triangle[r].length - 1) {
                    const rightParent = positions.find(p => p.row === r - 1 && p.col === c);
                    if (rightParent) {
                        const isActiveRight = activeAddition && activeAddition.row === r && activeAddition.col === c;
                        drawArrow(ctx, rightParent.x, rightParent.y + cellSize / 2 + 2,
                            child.x + cellSize * 0.15, child.y - cellSize / 2 - 2,
                            isActiveRight ? additionHighlight : arrowColor,
                            isActiveRight ? 2.5 : 1.5,
                            isActiveRight ? 1 : 0.4);
                    }
                }
            }
        }

        // Draw cells
        stepIdx = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < triangle[r].length; c++) {
                const pos = positions.find(p => p.row === r && p.col === c);
                if (!pos) { stepIdx++; continue; }

                const isVisible = stepIdx <= currentStep;
                const isCurrentStep = stepIdx === currentStep;
                const isActive = activeAddition && activeAddition.row === r && activeAddition.col === c;
                const isOne = triangle[r][c] === 1;

                if (!isVisible) {
                    // Draw placeholder
                    ctx.fillStyle = isDark ? '#1E293B40' : '#E2E8F040';
                    roundRect(ctx, pos.x - cellSize / 2, pos.y - cellSize / 2, cellSize, cellSize, 8);
                    ctx.fill();

                    ctx.fillStyle = dimTextColor;
                    ctx.font = `600 ${cellSize * 0.3}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('?', pos.x, pos.y);
                    stepIdx++;
                    continue;
                }

                // Cell background
                ctx.save();
                if (isCurrentStep) {
                    // Glow for current step
                    ctx.shadowColor = accentColor;
                    ctx.shadowBlur = 16;
                }

                ctx.fillStyle = isCurrentStep ? (isDark ? '#78350F' : '#FEF3C7')
                    : isActive ? (isDark ? '#064E3B' : '#D1FAE5')
                        : cellBg;
                roundRect(ctx, pos.x - cellSize / 2, pos.y - cellSize / 2, cellSize, cellSize, 8);
                ctx.fill();
                ctx.restore();

                // Cell border
                ctx.strokeStyle = isCurrentStep ? accentColor
                    : isActive ? additionHighlight
                        : isOne ? oneColor
                            : cellBorder;
                ctx.lineWidth = isCurrentStep ? 2.5 : isActive ? 2 : 1.5;
                roundRect(ctx, pos.x - cellSize / 2, pos.y - cellSize / 2, cellSize, cellSize, 8);
                ctx.stroke();

                // Number
                ctx.fillStyle = isCurrentStep ? accentColor
                    : isActive ? additionHighlight
                        : isOne ? oneColor
                            : textColor;
                ctx.font = `700 ${cellSize * 0.4}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(triangle[r][c]), pos.x, pos.y);

                // Show addition formula above the active cell
                if (isActive && isCurrentStep && r > 0 && c > 0 && c < r) {
                    const leftVal = triangle[r - 1][c - 1];
                    const rightVal = triangle[r - 1][c];
                    const formula = `${leftVal} + ${rightVal} = ${triangle[r][c]}`;

                    // Draw formula below the cell, big and clear
                    ctx.fillStyle = additionHighlight;
                    ctx.font = `800 ${cellSize * 0.38}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(formula, pos.x, pos.y + cellSize / 2 + 8);
                }

                stepIdx++;
            }
        }

        // Title info
        const progress = currentStep < 0 ? 0 : Math.min(100, Math.round(((currentStep + 1) / total) * 100));
        ctx.fillStyle = dimTextColor;
        ctx.font = `500 12px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`Étape ${Math.max(0, currentStep + 1)} / ${total}  (${progress}%)`, w - 16, 12);

    }, [isDark, rows, triangle, currentStep, activeAddition, total]);

    // Redraw on changes
    useEffect(() => {
        draw();
    }, [draw]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => draw();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [draw]);

    return (
        <div className="w-full h-full relative">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </div>
    );
}

// Helper: draw rounded rectangle path
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Helper: draw arrow
function drawArrow(
    ctx: CanvasRenderingContext2D,
    fromX: number, fromY: number,
    toX: number, toY: number,
    color: string,
    lineWidth: number,
    opacity: number
) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    // Line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headLen = 6;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}
