/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

interface PascalProps {
    rows: number;
    stepSpeed: number;
    isPlaying: boolean;
    onComplete?: () => void;
    currentStepCounter: number; // to allow stepping from parent
}

type ComputationStep = 'idle' | 'highlight_parents' | 'compute_child' | 'show_result';

export default function PascalTriangleLab({ rows, stepSpeed, isPlaying, onComplete, currentStepCounter }: PascalProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // State for generation
    const [currentRow, setCurrentRow] = useState(0);
    const [currentCol, setCurrentCol] = useState(0);
    const [stepPhase, setStepPhase] = useState<ComputationStep>('idle');
    const [triangleInfo, setTriangleInfo] = useState<number[][]>([[1]]);

    const textPrimary = isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]';
    const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#64748B]';

    // Precalculate all rows for positioning
    const maxTriangleRow = Math.max(0, rows - 1);
    const cellRadius = 24;
    const xSpacing = 60;
    const ySpacing = 70;

    // We do generation logic via effects
    const stepDuration = 1000 / stepSpeed;

    useEffect(() => {
        // Reset when rows change or playing starts from finish
        setTriangleInfo([[1]]);
        setCurrentRow(0);
        setCurrentCol(0);
        setStepPhase('idle');
    }, [rows]);

    const performStep = () => {
        if (currentRow > maxTriangleRow) {
            if (onComplete) onComplete();
            return;
        }

        // Logic for next state
        if (currentRow === 0) {
            // first row is just [1]
            setCurrentRow(1);
            setCurrentCol(0);
            setStepPhase('highlight_parents');
            setTriangleInfo([[1]]);
            return;
        }

        switch (stepPhase) {
            case 'idle':
            case 'show_result':
                // Move to next cell
                let nextCol = currentCol + 1;
                let nextRow = currentRow;

                if (nextCol > nextRow) {
                    nextCol = 0;
                    nextRow++;
                }

                if (nextRow > maxTriangleRow) {
                    setCurrentRow(nextRow);
                    if (onComplete) onComplete();
                    break;
                }

                setCurrentRow(nextRow);
                setCurrentCol(nextCol);

                // If it's the edges (1s), we don't really have two parents to compute, but we still animate from the single parent
                setStepPhase('highlight_parents');
                break;

            case 'highlight_parents':
                setStepPhase('compute_child');
                break;

            case 'compute_child':
                // actual addition calculation
                const prevRowArr = triangleInfo[currentRow - 1] || [];
                const leftParent = currentCol === 0 ? 0 : prevRowArr[currentCol - 1];
                const rightParent = currentCol === currentRow ? 0 : prevRowArr[currentCol];
                const newValue = leftParent + rightParent;

                setTriangleInfo(prev => {
                    const newTri = [...prev];
                    if (!newTri[currentRow]) {
                        newTri[currentRow] = [];
                    }
                    newTri[currentRow][currentCol] = newValue;
                    return newTri;
                });
                setStepPhase('show_result');
                break;
        }
    };

    // Auto play logic
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (isPlaying && currentRow <= maxTriangleRow) {
            timer = setTimeout(() => {
                performStep();
            }, stepDuration);
        }
        return () => clearTimeout(timer);
    }, [isPlaying, stepPhase, currentRow, currentCol, stepDuration]);

    // Manual step logic
    useEffect(() => {
        if (!isPlaying && currentStepCounter > 0) {
            performStep();
        }
    }, [currentStepCounter]);

    // Helpers for rendering
    const getCellX = (r: number, c: number) => {
        const rowWidth = r * xSpacing;
        const startX = -rowWidth / 2;
        return startX + c * xSpacing;
    };
    const getCellY = (r: number) => r * ySpacing - (maxTriangleRow * ySpacing) / 4;

    const renderArrows = () => {
        if (currentRow === 0 || currentRow > maxTriangleRow) return null;
        if (stepPhase === 'idle') return null;

        const startXLeft = getCellX(currentRow - 1, currentCol - 1);
        const startYLeft = getCellY(currentRow - 1) + cellRadius;
        const startXRight = getCellX(currentRow - 1, currentCol);
        const startYRight = getCellY(currentRow - 1) + cellRadius;

        const endX = getCellX(currentRow, currentCol);
        const endY = getCellY(currentRow) - cellRadius;

        const opacity = stepPhase === 'highlight_parents' ? 0.5 : (stepPhase === 'compute_child' || stepPhase === 'show_result' ? 1 : 0);
        const arrowColor = isDark ? '#3B82F6' : '#2563EB';

        // Arrows from parents if they exist
        const hasLeftParent = currentCol > 0;
        const hasRightParent = currentCol < currentRow;

        return (
            <svg className="absolute left-0 top-0 h-full w-full overflow-visible pointer-events-none">
                <g transform="translate(50%, 50%)">
                    <AnimatePresence>
                        {hasLeftParent && (
                            <motion.path
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity }}
                                transition={{ duration: 0.3 }}
                                d={`M ${startXLeft} ${startYLeft} L ${endX - 5} ${endY - 5}`}
                                stroke={arrowColor}
                                strokeWidth="2"
                                fill="none"
                                markerEnd="url(#arrowhead)"
                            />
                        )}
                        {hasRightParent && (
                            <motion.path
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity }}
                                transition={{ duration: 0.3 }}
                                d={`M ${startXRight} ${startYRight} L ${endX + 5} ${endY - 5}`}
                                stroke={arrowColor}
                                strokeWidth="2"
                                fill="none"
                                markerEnd="url(#arrowhead)"
                            />
                        )}
                    </AnimatePresence>
                    <defs>
                        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
                            <polygon points="0 0, 6 3, 0 6" fill={arrowColor} />
                        </marker>
                    </defs>
                </g>
            </svg>
        );
    };

    const isCurrentCell = (r: number, c: number) => r === currentRow && c === currentCol;
    const isParentCell = (r: number, c: number) => {
        if (currentRow === 0 || currentRow > maxTriangleRow) return false;
        if (stepPhase === 'idle') return false;
        if (r !== currentRow - 1) return false;
        return c === currentCol - 1 || c === currentCol;
    };

    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            {/* Legend / Equation display */}
            <div className={`absolute top-4 left-4 ${isDark ? 'bg-slate-800' : 'bg-white'} p-4 rounded-xl shadow-lg border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <h3 className={`text-sm font-bold mb-2 ${textPrimary}`}>Construction</h3>
                <div className={`text-xs ${textSecondary} font-mono flex flex-col gap-1`}>
                    <div>Règle : <span className="text-blue-500 font-bold">C(n,k) = C(n-1,k-1) + C(n-1,k)</span></div>
                    {stepPhase !== 'idle' && currentRow > 0 && currentRow <= maxTriangleRow && (
                        <motion.div
                            key={`${currentRow}-${currentCol}-${stepPhase}`}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20"
                        >
                            <div className="flex items-center gap-2 text-sm">
                                <span className={isParentCell(currentRow - 1, currentCol - 1) ? 'text-amber-500 font-bold' : ''}>
                                    {currentCol > 0 ? (triangleInfo[currentRow - 1]?.[currentCol - 1] ?? 0) : 0}
                                </span>
                                <span>+</span>
                                <span className={isParentCell(currentRow - 1, currentCol) ? 'text-amber-500 font-bold' : ''}>
                                    {currentCol < currentRow ? (triangleInfo[currentRow - 1]?.[currentCol] ?? 0) : 0}
                                </span>
                                <span>=</span>
                                <span className="text-emerald-500 font-bold">
                                    {stepPhase === 'show_result' ? (triangleInfo[currentRow]?.[currentCol] ?? '?') : '?'}
                                </span>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>

            {renderArrows()}

            {/* Triangle Nodes */}
            <div className="relative w-full h-full flex items-center justify-center">
                {triangleInfo.map((rowArr, rIndex) => (
                    rowArr.map((val, cIndex) => {
                        // Only render nodes that we have started computing or finalized
                        if (rIndex > currentRow) return null;
                        if (rIndex === currentRow && cIndex > currentCol) return null;

                        const x = getCellX(rIndex, cIndex);
                        const y = getCellY(rIndex);

                        const isCurr = isCurrentCell(rIndex, cIndex);
                        const isPar = isParentCell(rIndex, cIndex);

                        // Prevent premature rendering of current cell if we haven't computed it yet
                        if (isCurr && (stepPhase === 'highlight_parents' || stepPhase === 'compute_child')) {
                            return null;
                        }

                        let nodeStyle = isDark ? 'bg-slate-800 text-slate-200 border-slate-600' : 'bg-white text-slate-800 border-slate-300';
                        if (isCurr && stepPhase === 'show_result') {
                            nodeStyle = 'bg-emerald-500 text-white border-emerald-400 font-bold shadow-lg shadow-emerald-500/20';
                        } else if (isPar && stepPhase !== 'idle') {
                            nodeStyle = 'bg-amber-400 text-white border-amber-300 font-bold scale-105 shadow-md shadow-amber-500/20 z-10';
                        }

                        const nodeScale = isCurr ? 1.1 : (isPar ? 1.05 : 1);

                        return (
                            <motion.div
                                key={`${rIndex}-${cIndex}`}
                                initial={{ opacity: 0, scale: 0, x, y: y - 20 }}
                                animate={{ opacity: 1, scale: nodeScale, x, y }}
                                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                className={`absolute left-1/2 top-1/2 -ml-6 -mt-6 flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors duration-300 ${nodeStyle}`}
                            >
                                {val}
                            </motion.div>
                        );
                    })
                ))}
            </div>
        </div>
    );
}
