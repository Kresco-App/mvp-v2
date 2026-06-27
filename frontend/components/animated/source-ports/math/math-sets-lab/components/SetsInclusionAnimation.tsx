/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
/* oxlint-disable react-doctor/effect-needs-cleanup -- D3 handlers are attached to generated SVG nodes and removed during effect cleanup. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { easeElasticOut } from 'd3-ease';
import { select } from 'd3-selection';
import 'd3-transition';
import { useTheme } from '../context/ThemeContext';

interface SetsInclusionProps {
    speed?: number;
}

function setToneClasses(setId: string | undefined) {
    switch (setId) {
        case 'R':
            return { border: 'border-red-500', text: 'text-red-500' };
        case 'Q':
            return { border: 'border-purple-500', text: 'text-purple-500' };
        case 'D':
            return { border: 'border-amber-500', text: 'text-amber-500' };
        case 'Z':
            return { border: 'border-emerald-500', text: 'text-emerald-500' };
        case 'N':
            return { border: 'border-blue-500', text: 'text-blue-500' };
        default:
            return { border: 'border-transparent', text: 'text-slate-500' };
    }
}

export default function SetsInclusionAnimation({ speed = 1 }: SetsInclusionProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // State to hold selected set details for the UI panel
    const [selectedSet, setSelectedSet] = useState<{ id: string, name: string, label: string, desc: string, examples: string, color: string } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        let resizeObserver: ResizeObserver | null = null;
        let isRendered = false;

        const renderChart = () => {
            if (!containerRef.current) return;

            const width = containerRef.current.clientWidth;
            // Guard against 0 width during initialization or hidden tabs
            if (width === 0) return;

            // Clear previous SVG robustly
            select(containerRef.current).selectAll('*').remove();

            // make room for the info panel below
            const height = containerRef.current.clientHeight - (selectedSet ? 100 : 0);
            const actualHeight = containerRef.current.clientHeight;
            const cx = width / 2;
            const cy = height / 2;

            const svg = select(containerRef.current)
                .append('svg')
                .attr('width', width)
                .attr('height', actualHeight)
                .attr('viewBox', [0, 0, width, actualHeight])
                .attr('style', 'max-width: 100%; height: auto; transition: opacity 300ms ease, transform 300ms ease;');

            const sets = [
                { id: 'R', label: 'ℝ', name: 'Nombres Réels', desc: 'L\'ensemble de tous les nombres rationnels et irrationnels. Ils remplissent toute la droite numérique.', examples: 'π, e, √2, 0.333..., 42', color: '#EF4444', radius: Math.min(width, height) * 0.45 },
                { id: 'Q', label: 'ℚ', name: 'Nombres Rationnels', desc: 'Nombres pouvant s\'écrire sous la forme d\'une fraction a/b où a et b sont des entiers (b ≠ 0).', examples: '1/3, -5/7, 0.5', color: '#A855F7', radius: Math.min(width, height) * 0.35 },
                { id: 'D', label: 'ⅅ', name: 'Nombres Décimaux', desc: 'Nombres possédant un nombre fini de chiffres après la virgule (fractions de la forme a/10^n).', examples: '1.5, -0.25, 4.0', color: '#F59E0B', radius: Math.min(width, height) * 0.28 },
                { id: 'Z', label: 'ℤ', name: 'Nombres Entiers Relatifs', desc: 'Tous les nombres entiers naturels ainsi que leurs opposés négatifs.', examples: '-3, -2, -1, 0, 1, 2, 3', color: '#10B981', radius: Math.min(width, height) * 0.21 },
                { id: 'N', label: 'ℕ', name: 'Nombres Entiers Naturels', desc: 'Les nombres entiers positifs (incluant souvent zéro), utilisés pour compter.', examples: '0, 1, 2, 3, 4...', color: '#3B82F6', radius: Math.min(width, height) * 0.14 },
            ];

            // Draw sets from largest to smallest so they stack correctly
            const setGroups = svg.selectAll('g.set')
                .data(sets)
                .enter()
                .append('g')
                .attr('class', 'set cursor-pointer')
                .attr('transform', `translate(${cx}, ${cy})`);

            // Circles
            setGroups.append('circle')
                .attr('r', 0) // Start at 0 for animation
                .attr('fill', d => isDark ? `${d.color}15` : `${d.color}20`)
                .attr('stroke', d => d.color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', (_d, i) => i === 2 ? '5,5' : 'none')
                .style('filter', isDark ? 'drop-shadow(0 0 8px rgba(0,0,0,0.5))' : 'none')
                // Interactivity
                .on('mouseover', function (_event, d) {
                    // Highlight the path
                    select(this)
                        .transition()
                        .duration(200)
                        .attr('stroke-width', 4)
                        .attr('fill', isDark ? `${d.color}30` : `${d.color}40`);

                    // Enlarge label
                    select((this.parentNode as any).querySelector('text.set-label'))
                        .transition()
                        .duration(200)
                        .attr('font-size', '28px');
                })
                .on('mouseout', function (_event, d) {
                    // Remove highlight if not selected
                    if (selectedSet?.id !== d.id) {
                        select(this)
                            .transition()
                            .duration(200)
                            .attr('stroke-width', 2)
                            .attr('fill', isDark ? `${d.color}15` : `${d.color}20`);

                        select((this.parentNode as any).querySelector('text.set-label'))
                            .transition()
                            .duration(200)
                            .attr('font-size', '20px');
                    }
                })
                .on('click', (event, d) => {
                    // Reset all to normal
                    svg.selectAll('circle')
                        .transition()
                        .duration(200)
                        .attr('stroke-width', 2)
                        .attr('fill', (sd: any) => isDark ? `${sd.color}15` : `${sd.color}20`);
                    svg.selectAll('text.set-label')
                        .transition()
                        .duration(200)
                        .attr('font-size', '20px');

                    // Highlight clicked
                    select(event.currentTarget)
                        .transition()
                        .duration(200)
                        .attr('stroke-width', 4)
                        .attr('fill', isDark ? `${d.color}30` : `${d.color}40`);
                    select((event.currentTarget.parentNode as any).querySelector('text.set-label'))
                        .transition()
                        .duration(200)
                        .attr('font-size', '28px');

                    setSelectedSet(d);
                })
                // Intro Transition
                .transition()
                .duration(1500 / speed)
                .delay((_d, i) => (sets.length - 1 - i) * 800 / speed)
                .ease(easeElasticOut.amplitude(1).period(0.5))
                .attr('r', d => d.radius);

            // Labels
            setGroups.append('text')
                .attr('class', 'set-label pointer-events-none')
                .attr('x', () => 0)
                .attr('y', d => -d.radius + 24)
                .text(d => d.label)
                .attr('text-anchor', 'middle')
                .attr('font-size', '20px')
                .attr('font-weight', 'bold')
                .attr('fill', d => d.color)
                .attr('opacity', 0)
                .transition()
                .duration(1000 / speed)
                .delay((_d, i) => (sets.length - 1 - i) * 800 / speed + 500)
                .attr('opacity', 1);

            // Floating Elements
            const elementsData = [
                { set: 'R', val: 'π', angle: Math.PI * 0.2, dist: 0.9, info: 'Nombre irrationnel (transcendant)' },
                { set: 'R', val: 'e', angle: Math.PI * 0.8, dist: 0.85, info: '≈ 2.718 (Base du log népérien)' },
                { set: 'R', val: '√2', angle: Math.PI * 1.5, dist: 0.85, info: 'Irrationnel (Rapport diagonale/côté)' },
                { set: 'Q', val: '1/3', angle: Math.PI * 0.4, dist: 0.85, info: 'Périodique : 0.333...' },
                { set: 'Q', val: '-5/7', angle: Math.PI * 1.2, dist: 0.85, info: 'Fraction irréductible' },
                { set: 'D', val: '1.5', angle: Math.PI * 0.6, dist: 0.8, info: '= 15/10 (Fini)' },
                { set: 'D', val: '-0.25', angle: Math.PI * 1.8, dist: 0.8, info: '= -25/100 (Fini)' },
                { set: 'Z', val: '-1', angle: Math.PI * 0.3, dist: 0.7, info: 'Entier négatif' },
                { set: 'Z', val: '-42', angle: Math.PI * 1.4, dist: 0.7, info: 'La réponse' },
                { set: 'N', val: '0', angle: Math.PI * 0.5, dist: 0.3, info: 'L\'élément neutre' },
                { set: 'N', val: '1', angle: Math.PI * 1.5, dist: 0.5, info: 'L\'unité' },
                { set: 'N', val: '2', angle: Math.PI * 0.9, dist: 0.5, info: 'Premier nombre pair' },
            ];

            elementsData.forEach(el => {
                const setObj = sets.find(s => s.id === el.set);
                if (setObj) {
                    const smallerSetObj = sets[sets.indexOf(setObj) + 1];
                    const rMin = smallerSetObj ? smallerSetObj.radius : 0;
                    const rMax = setObj.radius;
                    const rActual = rMin + (rMax - rMin) * el.dist * 0.9;

                    (el as any).x = cx + Math.cos(el.angle) * rActual;
                    (el as any).y = cy + Math.sin(el.angle) * rActual;
                    (el as any).color = setObj.color;
                }
            });

            // Tooltip div (invisible initially)
            const tooltip = select(containerRef.current)
                .append('div')
                .attr('class', 'absolute z-10 pointer-events-none opacity-0 transition-[opacity] duration-200 ease-out motion-reduce:transition-none backdrop-blur-md rounded-lg p-2 text-xs border shadow-lg')
                .style('background', isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)')
                .style('border-color', isDark ? '#475569' : '#E2E8F0')
                .style('color', isDark ? '#F1F5F9' : '#1E293B');

            svg.selectAll('text.element')
                .data(elementsData)
                .enter()
                .append('text')
                .attr('class', 'element font-mono text-sm cursor-help')
                .attr('x', (d: any) => d.x)
                .attr('y', (d: any) => d.y)
                .text((d: any) => d.val)
                .attr('text-anchor', 'middle')
                .attr('alignment-baseline', 'middle')
                .attr('fill', isDark ? '#F1F5F9' : '#1E293B')
                .attr('opacity', 0)
                .style('animation', 'math-set-float 3s ease-in-out infinite alternate')
                .style('animation-delay', (_d, i) => `${i * 0.2}s`)
                .on('mouseover', function (event, d) {
                    select(this)
                        .transition()
                        .duration(200)
                        .attr('font-size', '20px')
                        .attr('font-weight', 'bold')
                        .attr('fill', (d: any) => d.color);

                    // Show tooltip
                    tooltip.transition().duration(200).style('opacity', 1);
                    tooltip.html(`<strong>${d.val}</strong><br/>${d.info}`)
                        .style('left', `${event.pageX + 10}px`)
                        .style('top', `${event.pageY - 28}px`);
                })
                .on('mousemove', function (event) {
                    tooltip
                        .style('left', `${event.pageX + 10}px`)
                        .style('top', `${event.pageY - 28}px`);
                })
                .on('mouseout', function () {
                    select(this)
                        .transition()
                        .duration(200)
                        .attr('font-size', '14px')
                        .attr('font-weight', 'normal')
                        .attr('fill', isDark ? '#F1F5F9' : '#1E293B');

                    tooltip.transition().duration(200).style('opacity', 0);
                })
                .transition()
                .duration(1000 / speed)
                .delay((d: any) => {
                    const setIndex = sets.findIndex(s => s.id === d.set);
                    return (sets.length - 1 - setIndex) * 800 / speed + 800;
                })
                .attr('opacity', 1);

            isRendered = true;
        };

        // Initialize ResizeObserver to redraw when container size changes and is > 0
        resizeObserver = new ResizeObserver(() => {
            // Only re-render on resize if it hasn't rendered yet or if we want responsive redraws
            // For animations, we might just want to render once when dimensions are available
            if (!isRendered && containerRef.current && containerRef.current.clientWidth > 0) {
                renderChart();
            }
        });

        resizeObserver.observe(containerRef.current);

        // Initial attempt
        renderChart();

        // Cleanup tooltip on unmount or re-render
        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            select(containerRef.current).selectAll('*').interrupt().remove();
        };
    }, [isDark, speed, selectedSet]);

    const selectedTone = setToneClasses(selectedSet?.id);

    return (
        <div className="w-full h-full flex flex-col items-center">
            {/* SVG Container */}
            <div ref={containerRef} className="w-full flex-1 relative min-h-[400px]" />

            {/* Info Panel for Selected Set */}
            <div className={`w-full max-w-2xl mt-4 p-4 rounded-xl border transition-[background-color,border-color,opacity,transform] duration-150 ease-out motion-reduce:transition-none ${isDark ? 'bg-slate-800/50' : 'bg-white/50'} ${selectedSet ? selectedTone.border : 'border-transparent'} ${selectedSet ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none absolute bottom-0'}`}>
                {selectedSet && (
                    <div className="flex items-start gap-4">
                        <div className={`text-4xl font-bold flex-shrink-0 ${selectedTone.text}`}>
                            {selectedSet.label}
                        </div>
                        <div>
                            <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{selectedSet.name}</h3>
                            <p className={`text-sm mt-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {selectedSet.desc}
                            </p>
                            <p className="text-xs mt-2 font-mono">
                                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Exemples: </span>
                                <span className={selectedTone.text}>{selectedSet.examples}</span>
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {!selectedSet && (
                <div className={`mt-4 text-sm font-medium motion-safe:animate-[pulse_1.5s_ease-in-out_infinite] motion-reduce:animate-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Cliquez sur un ensemble ou survolez un nombre pour plus de détails
                </div>
            )}
        </div>
    );
}
