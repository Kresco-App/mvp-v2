/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useTheme } from '../context/ThemeContext';

interface VariationsProps {
    variation: string; // e.g., 'R', 'R+', 'R-', 'R*', 'R*+', 'R*-'
}

export default function VariationsAnimation({ variation }: VariationsProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    useEffect(() => {
        if (!containerRef.current) return;

        let resizeObserver: ResizeObserver | null = null;
        let isRendered = false;

        const renderChart = () => {
            if (!containerRef.current) return;

            const width = containerRef.current.clientWidth;
            if (width === 0) return;

            // Clear previous
            d3.select(containerRef.current).selectAll('*').remove();

            const height = containerRef.current.clientHeight;
            const cx = width / 2;
            const cy = height / 2;

            const svg = d3.select(containerRef.current)
                .append('svg')
                .attr('width', width)
                .attr('height', height)
                .attr('viewBox', [0, 0, width, height])
                .attr('style', 'max-width: 100%; height: auto;');

            // Draw the real number line
            const lineY = cy;
            const margin = 40;
            const scale = d3.scaleLinear()
                .domain([-5, 5])
                .range([margin, width - margin]);

            // Define colors
            const axisColor = isDark ? '#475569' : '#CBD5E1';
            const textColor = isDark ? '#94A3B8' : '#64748B';
            const highlightColor = '#10B981'; // Emerald
            const excludedColor = isDark ? '#0F172A' : '#FAFAFA';

            // Base Axis Line
            svg.append('line')
                .attr('x1', scale(-5))
                .attr('y1', lineY)
                .attr('x2', scale(5))
                .attr('y2', lineY)
                .attr('stroke', axisColor)
                .attr('stroke-width', 2);

            // Arrows for infinity
            svg.append('polygon')
                .attr('points', `${scale(5)},${lineY - 4} ${scale(5) + 12},${lineY} ${scale(5)},${lineY + 4}`)
                .attr('fill', axisColor);
            svg.append('polygon')
                .attr('points', `${scale(-5)},${lineY - 4} ${scale(-5) - 12},${lineY} ${scale(-5)},${lineY + 4}`)
                .attr('fill', axisColor);

            // Ticks
            const ticks = d3.range(-4, 5);
            svg.selectAll('line.tick')
                .data(ticks)
                .enter()
                .append('line')
                .attr('class', 'tick')
                .attr('x1', d => scale(d))
                .attr('y1', lineY - 5)
                .attr('x2', d => scale(d))
                .attr('y2', lineY + 5)
                .attr('stroke', axisColor)
                .attr('stroke-width', 2);

            svg.selectAll('text.tick')
                .data(ticks)
                .enter()
                .append('text')
                .attr('class', 'tick')
                .attr('x', d => scale(d))
                .attr('y', lineY + 25)
                .text(d => d)
                .attr('text-anchor', 'middle')
                .attr('fill', textColor)
                .attr('font-size', '12px');

            // Logic to determine highlighted regions based on variation
            let highlightStart = -5;
            let highlightEnd = 5;
            let excludeZero = false;
            let showZeroStroke = false;

            switch (variation) {
                case 'R+':
                    highlightStart = 0;
                    break;
                case 'R-':
                    highlightEnd = 0;
                    break;
                case 'R*':
                    excludeZero = true;
                    break;
                case 'R*+':
                    highlightStart = 0;
                    excludeZero = true;
                    break;
                case 'R*-':
                    highlightEnd = 0;
                    excludeZero = true;
                    break;
                case 'R':
                default:
                    break;
            }

            // Highlight Rect(s) - representing the continuous set
            const gHighlight = svg.append('g').attr('class', 'highlights');

            const drawHighlight = (startX: number, endX: number) => {
                gHighlight.append('line')
                    .attr('x1', scale(startX))
                    .attr('y1', lineY)
                    .attr('x2', scale(startX)) // Animate to endX
                    .attr('y2', lineY)
                    .attr('stroke', highlightColor)
                    .attr('stroke-width', 6)
                    .attr('stroke-linecap', 'round')
                    .style('filter', 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.5))')
                    .transition()
                    .duration(800)
                    .ease(d3.easeCubicOut)
                    .attr('x2', scale(endX));
            };

            if (variation === 'R*') {
                // Two segments
                drawHighlight(-5.2, -0.1); // Slight gap for visual
                drawHighlight(0.1, 5.2);
                showZeroStroke = true;
            } else {
                // One segment
                drawHighlight(
                    highlightStart === -5 ? -5.2 : highlightStart,
                    highlightEnd === 5 ? 5.2 : highlightEnd
                );
                if (excludeZero || highlightStart === 0 || highlightEnd === 0) {
                    showZeroStroke = true;
                }
            }

            // The point at Zero
            const zeroX = scale(0);
            const zeroGroup = svg.append('g').attr('class', 'zero-point');

            // Zero marker circle
            zeroGroup.append('circle')
                .attr('cx', zeroX)
                .attr('cy', lineY)
                .attr('r', 0)
                .attr('fill', excludeZero ? excludedColor : highlightColor)
                .attr('stroke', showZeroStroke ? highlightColor : 'none')
                .attr('stroke-width', 2)
                .transition()
                .delay(500)
                .duration(400)
                .attr('r', 6);

            // Explanation text below
            let expl = "L'ensemble de tous les nombres réels.";
            if (variation === 'R+') expl = "Les nombres réels positifs (incluant zéro).";
            else if (variation === 'R-') expl = "Les nombres réels négatifs (incluant zéro).";
            else if (variation === 'R*') expl = "Les nombres réels privés de zéro.";
            else if (variation === 'R*+') expl = "Les nombres réels strictement positifs (excluant zéro).";
            else if (variation === 'R*-') expl = "Les nombres réels strictement négatifs (excluant zéro).";

            svg.append('text')
                .attr('x', cx)
                .attr('y', height - 40)
                .text(expl)
                .attr('text-anchor', 'middle')
                .attr('fill', textColor)
                .attr('font-size', '14px')
                .attr('opacity', 0)
                .transition()
                .delay(800)
                .duration(500)
                .attr('opacity', 1);

            isRendered = true;
        };

        resizeObserver = new ResizeObserver(() => {
            if (!isRendered && containerRef.current && containerRef.current.clientWidth > 0) {
                renderChart();
            }
        });

        resizeObserver.observe(containerRef.current);
        renderChart();

        // Cleanup tooltip on unmount or re-render
        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, [variation, isDark]);

    return (
        <div ref={containerRef} className="w-full h-full min-h-[300px]" />
    );
}
