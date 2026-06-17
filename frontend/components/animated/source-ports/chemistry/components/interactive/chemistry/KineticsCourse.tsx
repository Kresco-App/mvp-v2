/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps, react/display-name, prefer-const, @typescript-eslint/no-unused-expressions */
'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Thermometer, FlaskConical, ArrowRight, Activity, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const LessonCard = ({ title, icon: Icon, children, color = "indigo" }: any) => (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6`}>
        <div className={`bg-${color}-50 p-4 border-b border-${color}-100 flex items-center gap-3`}>
            <div className={`p-2 bg-${color}-100 rounded-lg text-${color}-600`}>
                <Icon size={20} />
            </div>
            <h3 className={`text-lg font-bold text-${color}-900`}>{title}</h3>
        </div>
        <div className="p-6">
            {children}
        </div>
    </div>
);

// I. Definitions Component
export const KineticsIntro: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-8 rounded-3xl text-white shadow-xl mb-8">
                <h1 className="text-3xl font-extrabold mb-4 flex items-center gap-3">
                    <FlaskConical size={32} /> Transformations Lentes et Rapides
                </h1>
                <p className="text-teal-100 text-lg">
                    Comprendre la cinétique chimique : vitesse de réaction et facteurs cinétiques.
                </p>
            </div>

            <LessonCard title="I. Distinction Lente / Rapide" icon={Clock} color="blue">
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-sky-50 p-4 rounded-xl border border-sky-100">
                        <h4 className="font-bold text-sky-800 mb-2 flex items-center gap-2">
                            <Zap size={18} className="text-yellow-500" /> Transformation Rapide
                        </h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Une transformation est dite <strong>rapide</strong> si elle se fait en une durée trop courte pour être suivie par l'œil nu ou par les instruments de mesure courants.
                        </p>
                        <div className="mt-3 text-xs bg-white p-2 rounded border border-sky-100 text-slate-500">
                            <strong>Exemples :</strong> Explosion, Précipitation (AgCl), Réactions acide-base violentes.
                        </div>
                    </div>

                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <h4 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                            <Clock size={18} className="text-indigo-500" /> Transformation Lente
                        </h4>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Une transformation est dite <strong>lente</strong> si elle dure assez longtemps (secondes, minutes, heures) pour être suivie (mesure de concentration, couleur...).
                        </p>
                        <div className="mt-3 text-xs bg-white p-2 rounded border border-indigo-100 text-slate-500">
                            <strong>Exemples :</strong> Rouille (oxydation du fer), Fermentation, Réaction des ions iodure avec l'eau oxygénée.
                        </div>
                    </div>
                </div>
            </LessonCard>
        </div>
    );
};

// II. Factors Component
export const KineticsFactors: React.FC = () => {
    const [temperature, setTemperature] = useState(25); // Celsius

    // Generate data based on temperature
    const generateData = () => {
        const data = [];
        const C0 = 1.0;
        // k varies with T. Let's say k = 0.05 at 25C. 
        // Rough pseudo-Arrhenius: k ~ exp(T/20) factor
        const k = 0.05 * Math.pow(1.5, (temperature - 25) / 10);

        for (let t = 0; t <= 60; t += 5) {
            data.push({
                time: t,
                reactant: (C0 * Math.exp(-k * t)).toFixed(3),
                product: (C0 * (1 - Math.exp(-k * t))).toFixed(3)
            });
        }
        return data;
    };

    const data = generateData();

    return (
        <LessonCard title="II. Facteurs Cinétiques" icon={TrendingUp} color="emerald">
            <p className="text-slate-600 mb-6">
                Un facteur cinétique est un paramètre physique capable de modifier la <strong>vitesse</strong> d'une transformation chimique.
            </p>

            <div className="space-y-6">
                {/* Temperature Interactive Demo */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="flex-1 space-y-4">
                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                <Thermometer className="text-rose-500" /> 1. La Température
                            </h4>
                            <p className="text-sm text-slate-600">
                                En général, plus la température est élevée, plus l'agitation thermique est grande et plus les chocs efficaces sont fréquents. La vitesse augmente.
                            </p>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-bold text-slate-500">
                                    <span>Froid ({0}°C)</span>
                                    <span className="text-rose-600">{temperature}°C</span>
                                    <span>Chaud (80°C)</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="80"
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseInt(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                <p className="text-xs text-slate-500 italic">
                                    Ajustez la température pour voir l'effet sur la disparition du réactif.
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 h-64 bg-white rounded-lg p-2 border border-slate-100 shadow-inner">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} label={{ value: 'Temps (s)', position: 'insideBottom', offset: -5 }} />
                                    <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 1]} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        labelStyle={{ color: '#64748b' }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Line type="monotone" dataKey="reactant" name="Réactif" stroke="#ef4444" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="product" name="Produit" stroke="#10b981" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Concentration */}
                <div className="flex gap-4 items-start">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-lg shrink-0 mt-1">
                        <Activity size={20} />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800">2. La Concentration des réactifs</h4>
                        <p className="text-sm text-slate-600 mt-1">
                            Plus la concentration initiale des réactifs est élevée, plus la probabilité de collision entre les entités réactives est grande. La vitesse de réaction est donc plus élevée.
                        </p>
                    </div>
                </div>
            </div>
        </LessonCard>
    );
}

// III. Quenching Component
export const KineticsQuenching: React.FC = () => {
    return (
        <LessonCard title="III. La Trempe Chimique" icon={Activity} color="amber">
            <p className="text-slate-600 mb-4">
                La trempe est l'opération qui consiste à refroidir brutalement un milieu réactionnel pour <strong>stopper</strong> (ou ralentir considérablement) la réaction.
            </p>
            <div className="bg-amber-50 p-4 rounded border border-amber-100 flex gap-4 items-center">
                <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-lg border-2 border-white">
                    <Thermometer size={24} />
                </div>
                <div>
                    <span className="font-bold text-amber-900 block">Pourquoi faire une trempe ?</span>
                    <span className="text-sm text-amber-800">Pour figer la composition du système à un instant t et réaliser un dosage précis.</span>
                </div>
            </div>
        </LessonCard>
    );
}

// Default export
export const KineticsCourse: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 font-sans">
            <KineticsIntro />
            <KineticsFactors />
            <KineticsQuenching />
        </div>
    );
};
