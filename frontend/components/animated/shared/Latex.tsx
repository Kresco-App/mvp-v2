'use client';

import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexProps {
  formula: string;
  block?: boolean;
  className?: string;
}

type LatexRenderResult =
  | { kind: 'html'; html: string }
  | { kind: 'error'; message: string }

const LATEX_RENDER_CACHE_MAX = 512
const latexRenderCache = new Map<string, LatexRenderResult>()

export const Latex: React.FC<LatexProps> = React.memo(function Latex({ formula, block = false, className = '' }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const result = renderLatexFormula(formula, block);
    if (result.kind === 'html') {
      containerRef.current.innerHTML = result.html;
      return;
    }

    containerRef.current.replaceChildren(createLatexErrorElement(formula, result.message, block));
  }, [formula, block]);

  return <span ref={containerRef} className={className} />;
});

function renderLatexFormula(formula: string, block: boolean): LatexRenderResult {
  const cacheKey = `${block ? 'block' : 'inline'}:${formula}`
  const cached = latexRenderCache.get(cacheKey)
  if (cached) return cached

  try {
    return rememberLatexRenderResult(cacheKey, {
      kind: 'html',
      html: katex.renderToString(formula, {
        throwOnError: true,
        displayMode: block,
      }),
    })
  } catch (error) {
    return rememberLatexRenderResult(cacheKey, {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

function rememberLatexRenderResult(cacheKey: string, result: LatexRenderResult) {
  if (latexRenderCache.size >= LATEX_RENDER_CACHE_MAX) {
    const first = latexRenderCache.keys().next().value
    if (first !== undefined) latexRenderCache.delete(first)
  }

  latexRenderCache.set(cacheKey, result)
  return result
}

function createLatexErrorElement(formula: string, message: string, block: boolean) {
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
  return errorBox;
}
