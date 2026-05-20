/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexProps {
  formula: string; // changed from 'expression' to match the prop I'll likely pass
  block?: boolean;
  className?: string;
}

export const Latex: React.FC<LatexProps> = ({ formula, block = false, className = '' }) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(formula, containerRef.current, {
          throwOnError: true, // Throw error so we can catch it
          displayMode: block || false,
        });
      } catch (e: any) {
        console.error("KaTeX rendering error:", e);
        // Display error message in a visible way
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="color: red; border: 1px solid red; padding: 5px; margin: 5px; background-color: #ffe0e0;">
            <strong>KaTeX Error:</strong> ${e.message || 'Unknown error'}<br/>
            <code>${formula}</code>
          </div>`;
        }
      }
    }
  }, [formula, block]);

  return <span ref={containerRef} className={className} />;
};
