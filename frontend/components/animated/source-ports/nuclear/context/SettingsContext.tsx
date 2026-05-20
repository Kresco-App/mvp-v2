/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SettingsContextType {
  examMode: boolean;
  toggleExamMode: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [examMode, setExamMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('examMode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('examMode', examMode.toString());
  }, [examMode]);

  const toggleExamMode = () => {
    setExamMode(prev => !prev);
  };

  return (
    <SettingsContext.Provider value={{ examMode, toggleExamMode }}>
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
