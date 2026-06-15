'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Latex } from '@/components/animated/shared/Latex';

interface FormulaCardProps {
  title: string;
  children?: React.ReactNode;
  formula?: string;
  description?: string;
  icon?: React.ReactNode;
}

export const FormulaCard: React.FC<FormulaCardProps> = ({ title, children, formula, description, icon }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative overflow-hidden rounded-3xl bg-white shadow-lg border border-slate-100 my-10 group hover:shadow-xl transition-all duration-300"
    >
      <div className="h-2 w-full bg-gradient-to-r from-cyan-600 via-blue-500 to-indigo-400" />
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {icon && <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 text-slate-600">{icon}</div>}
            <h4 className="text-cyan-900 font-black text-xs uppercase tracking-widest">{title}</h4>
          </div>
          <div className="flex space-x-1 opacity-30">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-900" />
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-900" />
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-900" />
          </div>
        </div>
        <div className="bg-slate-50 rounded-2xl py-10 px-4 md:px-8 border border-slate-100 flex items-center justify-center relative overflow-x-auto min-h-[8rem]">
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#0891b2_1px,transparent_1px)] bg-[length:16px_16px]" />
          <div className="relative z-10 w-full flex justify-center">
            {formula ? (
              <Latex formula={formula} block className="text-xl md:text-2xl lg:text-3xl text-slate-900 font-bold" />
            ) : (
              children
            )}
          </div>
        </div>
        {description && (
          <p className="mt-6 text-slate-500 text-sm text-center font-medium leading-relaxed italic max-w-2xl mx-auto">
            {description}
          </p>
        )}
      </div>
    </motion.div>
  );
};
