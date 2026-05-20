/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import EmbeddedLabCard from './EmbeddedLabCard';
import SingleWavePage from '../pages/SingleWavePage';
import InterferencePage from '../pages/InterferencePage';
import LongitudinalWavePage from '../pages/LongitudinalWavePage';
import MultiMediumPage from '../pages/MultiMediumPage';
import CircularWavePage from '../pages/CircularWavePage';

export type OndesEmbedModule =
  | 'single'
  | 'interference'
  | 'longitudinal'
  | 'multimedium'
  | 'circular';

interface OndesCourseEmbedProps {
  modules?: OndesEmbedModule[];
  className?: string;
}

type WavePage =
  | 'single'
  | 'interference'
  | 'longitudinal'
  | 'multimedium'
  | 'circular';

const noopNavigate = (_page: WavePage) => undefined;

export default function OndesCourseEmbed({
  modules = ['single', 'interference', 'longitudinal', 'multimedium', 'circular'],
  className = '',
}: OndesCourseEmbedProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {modules.map((module) => {
        if (module === 'single') {
          return (
            <EmbeddedLabCard
              key="single"
              title="Onde Simple"
              subtitle="Carte autonome a placer sous une video de cours."
              accentColor="orange"
            >
              <SingleWavePage onNavigate={noopNavigate} />
            </EmbeddedLabCard>
          );
        }

        if (module === 'interference') {
          return (
            <EmbeddedLabCard
              key="interference"
              title="Collision et Interference"
              subtitle="Carte autonome a placer sous une video de cours."
              accentColor="blue"
            >
              <InterferencePage onNavigate={noopNavigate} />
            </EmbeddedLabCard>
          );
        }

        if (module === 'longitudinal') {
          return (
            <EmbeddedLabCard
              key="longitudinal"
              title="Onde Longitudinale"
              subtitle="Carte autonome a placer sous une video de cours."
              accentColor="orange"
            >
              <LongitudinalWavePage onNavigate={noopNavigate} />
            </EmbeddedLabCard>
          );
        }

        if (module === 'multimedium') {
          return (
            <EmbeddedLabCard
              key="multimedium"
              title="Comparaison de Milieux"
              subtitle="Carte autonome a placer sous une video de cours."
              accentColor="blue"
            >
              <MultiMediumPage onNavigate={noopNavigate} />
            </EmbeddedLabCard>
          );
        }

        return (
          <EmbeddedLabCard
            key="circular"
            title="Onde Circulaire"
            subtitle="Carte autonome a placer sous une video de cours."
            accentColor="orange"
          >
            <CircularWavePage onNavigate={noopNavigate} />
          </EmbeddedLabCard>
        );
      })}
    </div>
  );
}
