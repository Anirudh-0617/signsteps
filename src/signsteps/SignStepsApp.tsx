import { useState } from 'react';
import { ModeTabs } from '../ui/ModeTabs';
import { ThemeSwitch } from '../ui/ThemeSwitch';
import { useTheme } from '../ui/theme';
import { WordPractice } from './WordPractice';
import { TeacherPanel } from './TeacherPanel';
import { ProgressView } from './ProgressView';
import { useProgressStore } from './progressStore';
import '../ui/gloss.css';

type Tab = 'practice' | 'teacher' | 'progress';

const TABS = [
  { id: 'practice', label: 'Practice' },
  { id: 'teacher', label: 'Teacher' },
  { id: 'progress', label: 'Progress' },
] as const;

const WRAP = 'mx-auto w-full max-w-[1400px] px-4 sm:px-6';

export default function SignStepsApp() {
  const [tab, setTab] = useState<Tab>('practice');
  const [theme, toggleTheme] = useTheme();
  const nickname = useProgressStore((s) => s.nickname);
  const avatar = useProgressStore((s) => s.avatar);

  return (
    <div className="v-gloss min-h-svh flex flex-col">
      <a href="#main" className="g-skip">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b g-rule bg-page">
        <div className={`${WRAP} flex flex-wrap items-stretch gap-x-8`}>
          <span className="flex h-14 items-center font-display text-[1.2rem]">SignSteps</span>
          <ModeTabs
            tabs={TABS}
            value={tab}
            onChange={setTab}
            label="Section"
            className="order-last h-11 w-full md:order-none md:h-14 md:w-auto"
          />
          <div className="ml-auto flex h-14 items-center gap-4">
            <button
              type="button"
              onClick={() => setTab('progress')}
              className="flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-1 text-sm text-ink-2 hover:text-ink"
              title="Edit child nickname and avatar"
            >
              <span aria-hidden="true">{avatar}</span>
              <span>{nickname.trim() || 'Learner'}</span>
            </button>
            <ThemeSwitch theme={theme} toggle={toggleTheme} />
          </div>
        </div>
      </header>

      <main id="main" className={`${WRAP} flex-1 py-6`}>
        {tab === 'practice' ? (
          <WordPractice />
        ) : tab === 'teacher' ? (
          <TeacherPanel onAssigned={() => setTab('practice')} />
        ) : (
          <ProgressView />
        )}
      </main>

      <footer className="border-t g-rule">
        <div className={`${WRAP} flex h-12 items-center text-xs text-ink-3`}>
          Prototype. Letter recognition runs on this device; camera video is never uploaded. ASL fingerspelling only.
        </div>
      </footer>
    </div>
  );
}
