/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import type { ReactNode } from 'react';
import { useTheme } from '../context/ThemeContext';

interface EmbeddedLabCardProps {
  title: string;
  subtitle?: string;
  accentColor?: 'orange' | 'blue';
  className?: string;
  children: ReactNode;
}

const accentStyles: Record<'orange' | 'blue', string> = {
  orange: 'text-[#FBAE17]',
  blue: 'text-[#707FFF]',
};

export default function EmbeddedLabCard({
  title,
  subtitle,
  accentColor = 'blue',
  className = '',
  children,
}: EmbeddedLabCardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <section
      className={`overflow-hidden rounded-3xl border shadow-sm ${
        isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'
      } ${className}`}
    >
      <header
        className={`border-b px-5 py-4 ${
          isDark ? 'border-[#334155] bg-[#0F172A]/30' : 'border-[#E2E8F0] bg-[#F8FAFC]'
        }`}
      >
        <h2 className={`text-lg font-bold ${accentStyles[accentColor]}`}>{title}</h2>
        {subtitle ? (
          <p className={`mt-1 text-sm ${isDark ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>{subtitle}</p>
        ) : null}
      </header>

      <div className="embedded-wave-page h-[700px] min-h-[620px]">{children}</div>
    </section>
  );
}
