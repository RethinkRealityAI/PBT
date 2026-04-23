import React, { useState, useEffect } from 'react';
import { ArrowRight, ShieldCheck, Users, BrainCircuit, Activity, Heart, CheckCircle2, Mic } from 'lucide-react';
import { AppView } from '../types';
import { motion, AnimatePresence } from 'motion/react';

const AnimatedShowcase = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const cycle = () => {
      setStep(0);
      setTimeout(() => setStep(1), 1000); // Context appears
      setTimeout(() => setStep(2), 3500); // User reply appears
      setTimeout(() => setStep(3), 5500); // Focus on orb/analysis
      setTimeout(() => setStep(4), 7500); // Feedback appears
    };
    
    cycle();
    const interval = setInterval(cycle, 12000); // Loop every 12s
    return () => clearInterval(interval);
  }, []);

  const orbColors = [
    "bg-red-500 shadow-red-500",      // Step 0
    "bg-red-500 shadow-red-500",      // Step 1
    "bg-yellow-400 shadow-yellow-400",// Step 2 & 3
    "bg-emerald-500 shadow-emerald-500",// Step 3 (at end)
    "bg-emerald-500 shadow-emerald-500",// Step 4
  ];

  return (
    <motion.div 
      className="relative mx-auto w-[280px] sm:w-[320px] h-[580px] rounded-[3rem] border-[12px] border-slate-900 overflow-hidden md:w-[600px] md:h-[420px] md:rounded-xl md:border-[6px] md:border-slate-800 flex flex-col bg-slate-50 group z-10"
      animate={{
        y: [0, -15, 0],
        boxShadow: step >= 3 && step < 4 
            ? "0 30px 60px -15px rgba(250, 204, 21, 0.4)" 
            : step === 4 
                ? "0 30px 60px -15px rgba(16, 185, 129, 0.4)"
                : "0 30px 60px -15px rgba(0, 0, 0, 0.3)"
      }}
      transition={{
        y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
        boxShadow: { duration: 1 }
      }}
    >
      
      {/* Mobile Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-slate-900 rounded-b-3xl md:hidden z-30 flex justify-center items-center">
         <div className="w-12 h-1.5 bg-slate-800 rounded-full mt-1"></div>
      </div>
      
      {/* Mobile Bottom Indicator */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-slate-300 md:hidden z-30 rounded-full"></div>
      
      {/* Desktop Window Controls */}
      <div className="hidden md:flex absolute top-0 left-0 w-full h-10 bg-slate-800 items-center px-4 gap-2 z-30 shadow-md">
        <div className="w-3 h-3 rounded-full bg-red-400"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
        <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
        <div className="mx-auto text-[11px] font-bold text-slate-400 tracking-wider">LIVE SIMULATION</div>
      </div>

      {/* Background Orb Animation */}
      <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none flex items-center justify-center">
         <motion.div 
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.03, 0.08, 0.03],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className={`w-[400px] h-[400px] rounded-full blur-3xl transition-colors duration-1000 ${orbColors[step] || 'bg-red-500'}`}
         />
      </div>

      {/* Content Container */}
      <div className="relative z-10 w-full h-full flex flex-col p-4 pt-12 md:p-6 md:pt-14 gap-4 overflow-hidden">
         
        <AnimatePresence>
          {step >= 1 && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex gap-3 items-start"
            >
                <div className="w-8 h-8 rounded-full bg-red-100 flex-shrink-0 flex items-center justify-center mt-1 shadow-sm">
                  <Activity className="h-4 w-4 text-red-600" />
                </div>
                <div className="bg-white/90 backdrop-blur-md p-3 px-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100/50 text-[13px] md:text-sm leading-relaxed font-medium text-slate-700 w-full">
                  Patient arrives with VOC. Vitals stable. Pain reported as 9/10. Standard protocol recommends analgesia within 30 minutes.
                </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {step >= 2 && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex gap-3 items-start flex-row-reverse"
            >
               <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 flex items-center justify-center mt-1 shadow-sm text-white text-xs font-bold font-mono">
                YOU
              </div>
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-3 px-4 rounded-2xl rounded-tr-none shadow-md border border-slate-700 text-[13px] md:text-sm leading-relaxed font-medium text-white max-w-[85%] text-right">
                I am initiating the individualized pain protocol immediately. Order for IV opioids placed.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Glowing Orb display */}
        <AnimatePresence>
          {step >= 3 && step < 4 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center flex-grow mt-4"
            >
              <div className="relative flex items-center justify-center">
                <motion.div 
                   animate={{ scale: [1, 1.4, 1] }} 
                   transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                   className={`w-16 h-16 rounded-full blur-xl absolute opacity-60 bg-yellow-400`} 
                />
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg relative z-10 transition-colors duration-500 bg-yellow-400`}>
                   <BrainCircuit className="h-5 w-5 text-yellow-900" />
                </div>
              </div>
              <motion.p 
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500 mt-5"
              >
                Analyzing Response...
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {step >= 4 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
              className="mt-auto glass-panel p-4 md:p-5 bg-emerald-50/90 backdrop-blur-md border-emerald-100/80 rounded-2xl shadow-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 drop-shadow-sm" />
                <span className="text-[11px] md:text-xs font-bold text-emerald-800 uppercase tracking-wider">Evaluation Complete</span>
              </div>
              <p className="text-[13px] md:text-sm font-medium text-emerald-950 leading-relaxed">
                Excellent. 10/10 for Evidence-based practice. Time-to-Analgesia standard upheld (under 30 mins).
              </p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
};

interface HomeProps {
  onChangeView: (view: AppView) => void;
}

const Home: React.FC<HomeProps> = ({ onChangeView }) => {
  return (
    <div className="relative z-10 w-full overflow-x-hidden">
      {/* Hero Section */}
      <div className="relative border-b border-red-500/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-20 pb-16 md:pb-28 relative flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          <div className="w-full lg:w-1/2 flex-shrink-0 z-10">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full glass-panel bg-red-500/10 border-red-200/40 text-red-700 text-xs md:text-sm font-bold mb-6 md:mb-8 shadow-sm tracking-wide">
              <span className="flex h-2 w-2 bg-red-500 rounded-full mr-2.5 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></span>
              Ontario Health Quality Standards for SCD
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1] mb-6 drop-shadow-sm">
              Standardize Excellence in <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-rose-500">Sickle Cell Care.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-700 mb-8 md:mb-10 leading-relaxed font-medium max-w-2xl">
              Equip yourself and your team with the tools to dismantle systemic bias, master clinical advocacy, and adhere to Ontario's Quality Standards for evidence-based, compassionate care.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <button 
                onClick={() => onChangeView(AppView.SIMULATOR)}
                className="w-full sm:w-auto inline-flex justify-center items-center px-8 py-4 border border-transparent text-lg font-bold rounded-2xl shadow-xl shadow-red-500/25 text-white bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all group"
              >
                Try the Simulation <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
          
          {/* Hero Visual - Animated Showcaswe */}
          <div className="w-full lg:w-1/2 relative flex justify-center mt-8 lg:mt-0 flex-shrink-0" style={{ perspective: '1000px' }}>
            <motion.div 
              initial={{ opacity: 0, rotateY: 15, rotateX: 5, scale: 0.9 }}
              animate={{ opacity: 1, rotateY: 0, rotateX: 0, scale: 1 }}
              transition={{ duration: 1.2, type: "spring", bounce: 0.4 }}
              className="relative w-full flex justify-center"
            >
              <AnimatedShowcase />
            </motion.div>
          </div>
        </div>
      </div>

      {/* The Pledge & Quality Standards Section */}
      <div className="py-20 md:py-32 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-sm text-red-600 font-bold tracking-widest uppercase mb-3">Our Core Commitment</h2>
            <p className="text-3xl md:text-4xl lg:text-5xl leading-tight font-extrabold tracking-tight text-slate-900 drop-shadow-sm max-w-4xl mx-auto">
              Center of Quality Guidelines for Sickle Cell Disease Care
            </p>
            <p className="mt-6 max-w-2xl text-lg md:text-xl text-slate-700 mx-auto font-medium leading-relaxed">
              We pledge to uphold the highest standards of care, explicitly aligning with the <strong className="text-slate-900">Ontario Health Quality Standards</strong>. We commit to eradicating disparities and ensuring every patient receives rapid, respectful, and evidence-based treatment.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            <StandardCard 
              icon={<Activity className="h-6 w-6 text-red-600" />}
              title="Rapid Analgesia"
              description="Patients presenting to the emergency department for a vaso-occlusive pain crisis are triaged as highly urgent and receive analgesia within 30 minutes of triage or 60 minutes of registration."
              colorClass="bg-red-50 border-red-100"
            />
            <StandardCard 
              icon={<Heart className="h-6 w-6 text-rose-600" />}
              title="Individualized Plans"
              description="Patients with SCD have an individualized treatment plan for managing vaso-occlusive pain crises that is easily accessible in all care settings."
              colorClass="bg-rose-50 border-rose-100"
            />
            <StandardCard 
              icon={<ShieldCheck className="h-6 w-6 text-emerald-600" />}
              title="Equitable & Respectful Care"
              description="Patients receive care that is free from racism and stigma. Providers actively challenge biases and validate patient self-reports of pain without judgment."
              colorClass="bg-emerald-50 border-emerald-100"
            />
             <StandardCard 
              icon={<BrainCircuit className="h-6 w-6 text-indigo-600" />}
              title="Comprehensive Assessment"
              description="Patients presenting with acute complications are assessed for critical, life-threatening conditions like acute chest syndrome and managed collaboratively with specialists."
              colorClass="bg-indigo-50 border-indigo-100"
            />
             <StandardCard 
              icon={<Users className="h-6 w-6 text-orange-600" />}
              title="Transitions of Care"
              description="Patients experience seamless, coordinated transitions between pediatric, adult, and community care settings to prevent gaps in specialized treatment."
              colorClass="bg-orange-50 border-orange-100"
            />
             <div className="glass-panel p-8 rounded-3xl shadow-sm border-slate-200 bg-white/70 flex flex-col justify-center items-center text-center">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Start Upholding the Standard</h3>
              <button 
                onClick={() => onChangeView(AppView.SIMULATOR)}
                className="w-full inline-flex justify-center items-center px-6 py-3 border border-slate-200 text-sm font-bold rounded-xl text-slate-800 bg-white hover:bg-slate-50 transition-all shadow-sm"
              >
                Launch Simulator
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StandardCard = ({ icon, title, description, colorClass }: { icon: React.ReactNode, title: string, description: string, colorClass: string }) => (
  <div className="glass-panel p-8 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 border-white/60 bg-white/80 group flex flex-col">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 border transition-transform group-hover:scale-110 ${colorClass}`}>
      {icon}
    </div>
    <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-3">{title}</h3>
    <p className="text-slate-600 font-medium leading-relaxed text-sm md:text-base flex-grow">{description}</p>
  </div>
);

export default Home;