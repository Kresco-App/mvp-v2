import type { ReactNode } from 'react';
import { useTheme } from '../context/ThemeContext';

interface EmbeddedLabCardProps {
  title: string;
  subtitle?: string;
  canvasContent: ReactNode;
  controlsContent: ReactNode;
  accentColor?: 'amber' | 'cyan' | 'purple';
  className?: string;
}

const accentStyles: Record<'amber' | 'cyan' | 'purple', { title: string }> = {
  amber: { title: 'text-amber-500' },
  cyan: { title: 'text-cyan-500' },
  purple: { title: 'text-purple-500' },
};

export default function EmbeddedLabCard({
  title,
  subtitle,
  canvasContent,
  controlsContent,
  accentColor = 'amber',
  className = '',
}: EmbeddedLabCardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const accent = accentStyles[accentColor];

  return (
    <section
      className={`overflow-hidden rounded-3xl border shadow-sm transition-colors duration-200 ${
        isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'
      } ${className}`}
    >
      <header
        className={`border-b px-5 py-4 ${
          isDark ? 'border-[#334155] bg-[#0F172A]/30' : 'border-[#E2E8F0] bg-[#F8FAFC]'
        }`}
      >
        <h2 className={`text-lg font-bold ${accent.title}`}>{title}</h2>
        {subtitle ? (
          <p className={`mt-1 text-sm ${isDark ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>{subtitle}</p>
        ) : null}
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,2fr)_22rem]">
        <div className={`h-[460px] min-h-[360px] ${isDark ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]'}`}>
          {canvasContent}
        </div>
        <aside
          className={`max-h-[560px] overflow-y-auto p-4 ${
            isDark ? 'bg-[#1E293B] border-l border-[#334155]' : 'bg-white border-l border-[#E2E8F0]'
          }`}
        >
          {controlsContent}
        </aside>
      </div>
    </section>
  );
}
