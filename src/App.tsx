import OpticsCourseEmbed from './components/OpticsCourseEmbed';
import { useTheme } from './context/ThemeContext';

function App() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <main className={`min-h-screen px-4 py-6 sm:px-6 md:px-10 ${isDark ? 'bg-[#0F172A]' : 'bg-[#FAFAFA]'}`}>
      <div className="mx-auto max-w-7xl space-y-3">
        <header className="space-y-1">
          <h1 className={`text-2xl font-bold ${isDark ? 'text-[#F1F5F9]' : 'text-[#1E293B]'}`}>
            Optics Labs Embed Cards
          </h1>
          <p className={`text-sm ${isDark ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>
            Self-contained simulations ready to place under a course video.
          </p>
        </header>

        <OpticsCourseEmbed />
      </div>
    </main>
  );
}

export default App;
