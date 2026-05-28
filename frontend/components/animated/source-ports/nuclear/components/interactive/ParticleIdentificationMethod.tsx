/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars */
'use client';

import React from 'react';

export const ParticleIdentificationMethod: React.FC = () => {
  return (
    <div className="bg-white p-2 md:p-4 rounded-lg border border-amber-100 mb-4">
      <p className="text-xs md:text-sm text-slate-500 mb-2 uppercase font-bold">Exemple :</p>
      <p className="text-center font-mono text-base md:text-xl mb-4">
        <sup>210</sup><sub>84</sub>Po &rarr; <sup>A</sup><sub>Z</sub>Pb + <sup>4</sup><sub>2</sub>He
      </p>

      <div className="w-full">
        <p className="text-slate-700 italic font-serif mb-2 text-xs md:text-sm text-center">"D'après les lois de Soddy :"</p>
        
        {/* Horizontal Scroll Container */}
        <div className="w-full overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-thumb-amber-200 scrollbar-track-transparent scroll-smooth">
          <div className="flex items-center justify-center min-w-max md:min-w-0 gap-4 px-4 pr-8">
            
            {/* First System */}
            <div className="flex items-center">
                <span className="text-4xl md:text-6xl text-slate-300 font-light select-none scale-y-110">{'{'}</span>
                <div className="font-mono text-sm md:text-base space-y-2 ml-2 text-slate-800">
                    <div className="whitespace-nowrap">210 = A + 4</div>
                    <div className="whitespace-nowrap">84 = Z + 2</div>
                </div>
            </div>

            <span className="text-2xl text-slate-400">&rArr;</span>

            {/* Second System (Solution) */}
            <div className="flex items-center">
                <span className="text-4xl md:text-6xl text-slate-300 font-light select-none scale-y-110">{'{'}</span>
                <div className="font-mono text-sm md:text-base space-y-2 ml-2 text-slate-800">
                    <div className="whitespace-nowrap">A = 210 - 4 = <span className="font-bold text-purple-600">206</span></div>
                    <div className="whitespace-nowrap">Z = 84 - 2 = <span className="font-bold text-rose-600">82</span></div>
                </div>
            </div>

          </div>
          {/* Scroll Hint for Mobile */}
          <div className="md:hidden text-center mt-2">
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-full">
                &larr; Glissez pour voir &rarr;
            </span>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center font-bold text-slate-800 border-t border-slate-100 pt-2 text-xs md:text-sm">
        Le noyau fils est donc du Plomb-206 (<sup>206</sup><sub>82</sub>Pb).
      </p>
    </div>
  );
};
