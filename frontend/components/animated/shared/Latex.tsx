'use client';

import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexProps {
  formula: string;
  block?: boolean;
  className?: string;
}

export const Latex: React.FC<LatexProps> = ({ formula, block = false, className = '' }) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      katex.render(formula, containerRef.current, {
        throwOnError: true,
        displayMode: block,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('KaTeX rendering error:', error);

      if (!containerRef.current) return;

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
  }, [formula, block]);

  return <span ref={containerRef} className={className} />;
};
