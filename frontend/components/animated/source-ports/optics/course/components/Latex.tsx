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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error("KaTeX rendering error:", error);
        // Display error message in a visible way
        if (containerRef.current) {
          const errorBox = document.createElement('span');
          Object.assign(errorBox.style, {
            backgroundColor: '#ffe0e0',
            border: '1px solid red',
            color: 'red',
            display: block ? 'block' : 'inline-block',
            margin: '5px',
            padding: '5px',
          });
          const label = document.createElement('strong');
          label.textContent = 'KaTeX Error: ';
          const code = document.createElement('code');
          code.textContent = formula;
          errorBox.append(label, document.createTextNode(message), document.createElement('br'), code);
          containerRef.current.replaceChildren(errorBox);
        }
      }
    }
  }, [formula, block]);

  return <span ref={containerRef} className={className} />;
};
