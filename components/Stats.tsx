import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, AreaChart, Area, PieChart, Pie } from 'recharts';
import { Activity, Clock, ThumbsDown, HeartPulse, DollarSign } from 'lucide-react';

const ED_WAIT_DATA = [
  { name: 'General Population', waitTime: 60 },
  { name: 'Sickle Cell Patients', waitTime: 95 },
];

const PAIN_RELIEF_DATA = [
  { name: 'Long Bone Fracture', minutes: 40 },
  { name: 'Vaso-Occlusive Crisis', minutes: 75 },
];

const LIFE_EXPECTANCY_DATA = [
  { year: '1979', scd: 28, general: 73 },
  { year: '1989', scd: 38, general: 75 },
  { year: '1999', scd: 42, general: 76 },
  { year: '2009', scd: 48, general: 78 },
  { year: '2019', scd: 54, general: 79 },
];

const FUNDING_DATA = [
  { name: 'Cystic Fibrosis', funding: 255, color: '#3b82f6' }, // Approximate NIH funding per affected individual
  { name: 'Sickle Cell Disease', funding: 81, color: '#ef4444' },
];

const Stats: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 relative z-10">
      <div className="mb-12 text-center glass-panel p-8 max-w-3xl mx-auto">
        <h2 className="text-3xl font-extrabold text-slate-900 drop-shadow-sm">The Reality Gap</h2>
        <p className="mt-4 text-xl text-slate-700 font-medium">
          Data shows significant disparities in how Sickle Cell Disease is treated and funded compared to other conditions. Awareness is the first step to advocacy.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 mb-12">
        {/* Chart 1: ED Wait Times */}
        <div className="glass-panel p-6 rounded-3xl shadow-lg border-white/60 bg-white/40">
          <div className="flex items-center mb-6">
            <div className="p-3 bg-orange-100/80 backdrop-blur-sm rounded-xl mr-4 border border-orange-200/50 shadow-sm">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Average ED Wait Times (Minutes)</h3>
              <p className="text-sm text-slate-600 font-medium">Time from door to provider evaluation</p>
            </div>
          </div>
          
          <div className="h-64 w-full bg-white/50 rounded-xl p-4 border border-white/60 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ED_WAIT_DATA} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#cbd5e1" />
                <XAxis type="number" stroke="#475569" />
                <YAxis type="category" dataKey="name" width={120} tick={{fontSize: 12, fill: '#334155', fontWeight: 600}} stroke="#475569" />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.4)'}} contentStyle={{borderRadius: '12px', border: '1px solid rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                <Bar dataKey="waitTime" fill="#ea580c" radius={[0, 8, 8, 0]} barSize={40}>
                   {
                      ED_WAIT_DATA.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 1 ? '#ef4444' : '#94a3b8'} />
                      ))
                    }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 glass-panel bg-red-50/50 border-red-200/50 p-5 rounded-xl text-sm text-slate-800 border-l-4 border-l-red-500 shadow-sm font-medium">
            <strong className="text-red-700">Insight:</strong> SCD patients wait on average 50% longer to be seen by a physician than the general population, despite often presenting with higher acuity pain.
          </div>
        </div>

        {/* Chart 2: Time to Analgesia */}
        <div className="glass-panel p-6 rounded-3xl shadow-lg border-white/60 bg-white/40">
           <div className="flex items-center mb-6">
            <div className="p-3 bg-blue-100/80 backdrop-blur-sm rounded-xl mr-4 border border-blue-200/50 shadow-sm">
              <ThumbsDown className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Time to First Analgesia</h3>
              <p className="text-sm text-slate-600 font-medium">Comparison with Long Bone Fracture</p>
            </div>
          </div>

          <div className="h-64 w-full bg-white/50 rounded-xl p-4 border border-white/60 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PAIN_RELIEF_DATA} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                <XAxis dataKey="name" tick={{fontSize: 12, fill: '#334155', fontWeight: 600}} stroke="#475569" />
                <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#475569', fontWeight: 600 }} stroke="#475569" />
                <Tooltip cursor={{fill: 'rgba(255,255,255,0.4)'}} contentStyle={{borderRadius: '12px', border: '1px solid rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                <Bar dataKey="minutes" fill="#3b82f6" radius={[8, 8, 0, 0]} barSize={60}>
                    {
                      PAIN_RELIEF_DATA.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 1 ? '#ef4444' : '#94a3b8'} />
                      ))
                    }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 glass-panel bg-red-50/50 border-red-200/50 p-5 rounded-xl text-sm text-slate-800 border-l-4 border-l-red-500 shadow-sm font-medium">
            <strong className="text-red-700">Insight:</strong> Despite guidelines recommending analgesia within 30-60 mins, SCD patients experience significant delays compared to other objective pain conditions.
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-12">
        {/* Chart 3: Life Expectancy */}
        <div className="glass-panel p-6 rounded-3xl shadow-lg border-white/60 bg-white/40">
          <div className="flex items-center mb-6">
            <div className="p-3 bg-rose-100/80 backdrop-blur-sm rounded-xl mr-4 border border-rose-200/50 shadow-sm">
              <HeartPulse className="h-6 w-6 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Life Expectancy Gap</h3>
              <p className="text-sm text-slate-600 font-medium">SCD vs. General Population (Years)</p>
            </div>
          </div>
          
          <div className="h-64 w-full bg-white/50 rounded-xl p-4 border border-white/60 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={LIFE_EXPECTANCY_DATA} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorGen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" stroke="#475569" tick={{fontSize: 12, fontWeight: 600}} />
                <YAxis stroke="#475569" tick={{fontSize: 12, fontWeight: 600}} />
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <Tooltip contentStyle={{borderRadius: '12px', border: '1px solid rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" dataKey="general" name="General Population" stroke="#94a3b8" fillOpacity={1} fill="url(#colorGen)" />
                <Area type="monotone" dataKey="scd" name="SCD Patients" stroke="#ef4444" fillOpacity={1} fill="url(#colorScd)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 glass-panel bg-rose-50/50 border-rose-200/50 p-5 rounded-xl text-sm text-slate-800 border-l-4 border-l-rose-500 shadow-sm font-medium">
            <strong className="text-rose-700">Insight:</strong> While life expectancy for SCD patients has improved over the decades, a staggering gap of over 20 years still remains compared to the general population.
          </div>
        </div>

        {/* Chart 4: Funding Disparities */}
        <div className="glass-panel p-6 rounded-3xl shadow-lg border-white/60 bg-white/40">
           <div className="flex items-center mb-6">
            <div className="p-3 bg-emerald-100/80 backdrop-blur-sm rounded-xl mr-4 border border-emerald-200/50 shadow-sm">
              <DollarSign className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">NIH Funding Disparity</h3>
              <p className="text-sm text-slate-600 font-medium">Funding per affected individual ($)</p>
            </div>
          </div>

          <div className="h-64 w-full bg-white/50 rounded-xl p-4 border border-white/60 shadow-inner flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={FUNDING_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="funding"
                  label={({ name, value }) => `${name}: $${value}`}
                  labelLine={false}
                >
                  {FUNDING_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{borderRadius: '12px', border: '1px solid rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 glass-panel bg-emerald-50/50 border-emerald-200/50 p-5 rounded-xl text-sm text-slate-800 border-l-4 border-l-emerald-500 shadow-sm font-medium">
            <strong className="text-emerald-700">Insight:</strong> Sickle Cell Disease receives roughly one-third of the federal funding per patient compared to Cystic Fibrosis, despite affecting three times as many Americans.
          </div>
        </div>
      </div>

      <div className="mt-12 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-10 text-center text-white shadow-xl border border-slate-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10">
          <Activity className="h-14 w-14 mx-auto text-red-500 mb-5 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
          <h3 className="text-3xl font-bold mb-3 tracking-tight">Change the Statistics</h3>
          <p className="max-w-2xl mx-auto text-slate-300 mb-0 text-lg font-medium leading-relaxed">
            Every advocacy interaction counts. By using standardized protocols and challenging bias, you directly contribute to reducing these time-to-treatment numbers.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Stats;