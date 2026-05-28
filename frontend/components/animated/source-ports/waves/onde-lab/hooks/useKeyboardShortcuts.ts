/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsConfig {
    onPlayPause?: () => void;
    onReset?: () => void;
    onStop?: () => void;
}

/**
 * Hook for global keyboard shortcuts
 * - Space: Play/Pause
 * - R: Reset
 * - Escape: Stop (pause + reset)
 */
export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
    const { onPlayPause, onReset, onStop } = config;

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                onPlayPause?.();
                break;
            case 'KeyR':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    onReset?.();
                }
                break;
            case 'Escape':
                e.preventDefault();
                onStop?.();
                break;
        }
    }, [onPlayPause, onReset, onStop]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
