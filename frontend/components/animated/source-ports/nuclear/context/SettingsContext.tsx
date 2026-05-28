/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

interface SettingsContextType {
  examMode: boolean;
  toggleExamMode: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);
const EXAM_MODE_STORAGE_KEY = 'examMode';

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [examMode, setExamMode] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setExamMode(localStorage.getItem(EXAM_MODE_STORAGE_KEY) === 'true');
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) localStorage.setItem(EXAM_MODE_STORAGE_KEY, examMode.toString());
  }, [examMode, isHydrated]);

  const toggleExamMode = useCallback(() => {
    setExamMode(prev => !prev);
  }, []);
  const value = useMemo(() => ({ examMode, toggleExamMode }), [examMode, toggleExamMode]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    return { examMode: false, toggleExamMode: () => undefined };
  }
  return context;
};
