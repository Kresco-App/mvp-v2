/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import { useRef, useCallback } from 'react';

/**
 * Data point for the displacement-time graph
 */
export interface TracerDataPoint {
    time: number;
    displacement: number;
    velocity: number;
}

/**
 * Configuration for the tracer history
 */
export interface TracerHistoryConfig {
    maxDuration: number;
    maxPoints: number;
}

const DEFAULT_CONFIG: TracerHistoryConfig = {
    maxDuration: 10,
    maxPoints: 600,
};

/**
 * Hook to manage tracer point history for displacement-time graph
 * Supports 2 tracer points
 */
export function useTracerHistory(config: Partial<TracerHistoryConfig> = {}) {
    const { maxDuration, maxPoints } = { ...DEFAULT_CONFIG, ...config };
    
    // Two history arrays for two tracers
    const history1Ref = useRef<TracerDataPoint[]>([]);
    const history2Ref = useRef<TracerDataPoint[]>([]);
    
    const lastTime1Ref = useRef<number>(-1);
    const lastTime2Ref = useRef<number>(-1);
    
    /**
     * Add a new data point to tracer 1
     */
    const addPoint1 = useCallback((point: TracerDataPoint) => {
        if (point.time <= lastTime1Ref.current) return;
        lastTime1Ref.current = point.time;
        
        const history = history1Ref.current;
        history.push({ ...point });
        
        while (history.length > maxPoints) history.shift();
        
        const minTime = point.time - maxDuration;
        while (history.length > 0 && history[0].time < minTime) history.shift();
    }, [maxDuration, maxPoints]);
    
    /**
     * Add a new data point to tracer 2
     */
    const addPoint2 = useCallback((point: TracerDataPoint) => {
        if (point.time <= lastTime2Ref.current) return;
        lastTime2Ref.current = point.time;
        
        const history = history2Ref.current;
        history.push({ ...point });
        
        while (history.length > maxPoints) history.shift();
        
        const minTime = point.time - maxDuration;
        while (history.length > 0 && history[0].time < minTime) history.shift();
    }, [maxDuration, maxPoints]);
    
    /**
     * Clear all history data
     */
    const clear = useCallback(() => {
        history1Ref.current = [];
        history2Ref.current = [];
        lastTime1Ref.current = -1;
        lastTime2Ref.current = -1;
    }, []);
    
    /**
     * Clear history for a specific tracer
     */
    const clearTracer = useCallback((tracerNum: 0 | 1) => {
        if (tracerNum === 0) {
            history1Ref.current = [];
            lastTime1Ref.current = -1;
        } else {
            history2Ref.current = [];
            lastTime2Ref.current = -1;
        }
    }, []);
    
    return {
        history1Ref,
        history2Ref,
        addPoint1,
        addPoint2,
        clear,
        clearTracer,
    };
}

export type TracerHistoryHook = ReturnType<typeof useTracerHistory>;
