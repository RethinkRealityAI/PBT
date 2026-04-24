import React, { useState, useEffect } from 'react';
import { Scenario, SimulationMessage } from '../types';
import { evaluateAdvocacyResponse, generateRoleplayMessage } from '../services/geminiService';
import { Send, RefreshCw, MessageSquare, AlertCircle, CheckCircle, Lightbulb, Mic, Type as TypeIcon, Loader2 } from 'lucide-react';
import { LiveVoiceChat } from './LiveVoiceChat';

const SCENARIOS: Scenario[] = [
  {
    id: '1',
    title: 'The "Drug Seeking" Label',
    description: 'A 24-year-old male presents to the ED with 10/10 pain. The triage nurse rolls her eyes and says, "He is here every week for Dilaudid."',
    clinicalContext: 'Patient has a known history of HbSS. Vitals: HR 110, BP 145/90, SpO2 94% on RA. He is writhing in pain. No signs of respiratory depression. Guidelines indicate rapid initiation of analgesia.',
    biasChallenge: 'Overcoming the "frequent flyer" stigma and ensuring timely pain management despite staff skepticism.',
    goals: [
      'Validate the patient\'s pain professionally',
      'Cite SCD pain management guidelines (e.g., rapid analgesia)',
      'Successfully persuade the nurse to administer medication without further delay'
    ]
  },
  {
    id: '2',
    title: 'Dismissed Symptoms',
    description: 'A 19-year-old female complains of new chest pain and shortness of breath. The attending says, "It is probably just her usual crisis pain/anxiety."',
    clinicalContext: 'Patient has Acute Chest Syndrome risk. New hypoxia (dropped from 99% to 92%). Attending is busy and dismissive.',
    biasChallenge: 'Advocating for a full workup (CXR, blood gas) for a potentially life-threatening complication labeled as "anxiety".',
    goals: [
      'Highlight the objective change in clinical status (hypoxia)',
      'Assert the risk of Acute Chest Syndrome',
      'Secure an order for a chest X-ray and blood gas'
    ]
  },
  {
    id: '3',
    title: 'Inadequate Pain Management',
    description: 'A 28-year-old female is admitted for a vaso-occlusive crisis. The covering physician prescribes a low dose of oral pain medication, stating, "We need to be careful with opioids."',
    clinicalContext: 'Patient has a history of severe VOC requiring IV PCA. Current pain is 9/10. Oral meds are insufficient. Guidelines recommend individualized, rapid, and aggressive pain management, often requiring IV opioids.',
    biasChallenge: 'Advocating for appropriate, guideline-concordant IV pain management and challenging the unfounded fear of opioid addiction in SCD patients.',
    goals: [
      'Address the physician\'s concern about opioids respectfully but firmly',
      'Reference the patient\'s history and individualized pain plan',
      'Obtain an order for appropriate IV pain medication'
    ]
  },
  {
    id: '4',
    title: 'Disrespectful Bedside Manner',
    description: 'A 35-year-old male is in the hospital. A consulting specialist enters the room, doesn\'t introduce themselves, and speaks over the patient, ignoring his questions about his care plan.',
    clinicalContext: 'Patient is stable but anxious about his treatment plan. He has experienced medical trauma in the past. Respectful, patient-centered communication is essential.',
    biasChallenge: 'Intervening to ensure the patient is heard, respected, and included in shared decision-making, addressing the specialist\'s dismissive behavior.',
    goals: [
      'Interrupt the specialist politely to center the patient',
      'Ensure the patient\'s specific questions are answered',
      'Model respectful, trauma-informed communication'
    ]
  }
];

const Simulator: React.FC = () => {
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'details' | 'simulation'>('details');
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [messages, setMessages] = useState<SimulationMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const activeScenario = SCENARIOS[currentScenarioIndex];

  const handleNextScenario = () => {
    setCurrentScenarioIndex((prev) => (prev + 1) % SCENARIOS.length);
    setMessages([]);
    setInput('');
    setViewMode('details');
  };

  const handlePrevScenario = () => {
    setCurrentScenarioIndex((prev) => (prev - 1 + SCENARIOS.length) % SCENARIOS.length);
    setMessages([]);
    setInput('');
    setViewMode('details');
  };

  useEffect(() => {
    if (viewMode === 'simulation' && mode === 'text' && messages.length === 0 && !loading) {
      initiateTextScenario();
    }
  }, [viewMode, mode, messages.length]);

  const initiateTextScenario = async () => {
    setLoading(true);
    const aiMsg = await generateRoleplayMessage(activeScenario, []);
    setMessages([aiMsg]);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeScenario || loading) return;

    const userMsg: SimulationMessage = { role: 'user', text: input };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setLoading(true);

    const userTurns = newHistory.filter(m => m.role === 'user').length;
    
    if (userTurns >= 3) {
      // Evaluate the roleplay
      const fullTranscript = newHistory.map(m => `${m.role === 'user' ? 'USER' : 'SCENARIO'}: ${m.text}`).join('\n\n');
      const feedback = await evaluateAdvocacyResponse(activeScenario, `Full Conversation Transcript:\n${fullTranscript}`);
      
      const aiMsg: SimulationMessage = {
        role: 'ai',
        text: "I've analyzed your advocacy approach across this simulation.",
        feedback: feedback
      };
      setMessages(prev => [...prev, aiMsg]);
    } else {
      const aiMsg = await generateRoleplayMessage(activeScenario, messages, input);
      setMessages(prev => [...prev, aiMsg]);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col flex-grow w-full max-w-5xl mx-auto px-2 md:px-4 mt-20 pt-4 md:mt-24 mb-10 relative">
      {/* Scenario Navigation Header */}
      <div className="flex items-center justify-between bg-white/40 backdrop-blur-3xl border border-white/60 p-2 md:p-3 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-4 shrink-0 relative z-20">
        <button 
          onClick={handlePrevScenario}
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white/60 hover:bg-white text-slate-700 shadow-sm transition-all active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="flex flex-col items-center flex-grow text-center px-2">
          <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500 mb-0.5 mt-1">Scenario {currentScenarioIndex + 1}</span>
          <h2 className="text-sm md:text-base font-extrabold text-slate-800 truncate max-w-[200px] sm:max-w-xs md:max-w-md pb-1">{activeScenario.title}</h2>
        </div>
        <button 
          onClick={handleNextScenario}
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white/60 hover:bg-white text-slate-700 shadow-sm transition-all active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {viewMode === 'details' ? (
        <div className="flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500 mb-10 flex-grow py-4 md:py-8">
           <div className="bg-white/40 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] border border-white/60 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] p-4 sm:p-5 md:p-10 w-full max-w-3xl overflow-hidden relative mt-auto mb-auto">
              <div className="absolute top-0 right-0 w-64 h-64 bg-red-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-200/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3"></div>
              
              <div className="relative z-10 space-y-4 md:space-y-8">
                <div className="text-center mb-5 md:mb-8">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-red-100 to-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-2.5 md:mb-4 shadow-inner transform rotate-3">
                    <ActivityIcon className="h-6 w-6 md:h-8 md:w-8 text-red-500 -rotate-3" />
                  </div>
                  <h3 className="text-[1.35rem] leading-tight md:text-3xl font-extrabold text-slate-800 tracking-tight">{activeScenario.title}</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                  <div className="bg-white/60 backdrop-blur-md p-4 md:p-6 border border-white/80 rounded-2xl md:rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                    <span className="text-[10px] md:text-[11px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1.5 md:mb-2">The Situation</span>
                    <p className="text-slate-700 text-sm md:text-[15px] font-medium leading-relaxed">{activeScenario.description}</p>
                  </div>
                  <div className="bg-white/60 backdrop-blur-md p-4 md:p-6 border border-white/80 rounded-2xl md:rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                     <span className="text-[10px] md:text-[11px] font-extrabold text-indigo-500 uppercase tracking-widest flex items-center mb-1.5 md:mb-2">
                      <ActivityIcon className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1.5" /> Clinical Context
                    </span>
                    <p className="text-slate-700 text-sm md:text-[15px] font-medium leading-relaxed">{activeScenario.clinicalContext}</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-50/80 to-rose-50/80 backdrop-blur-md p-4 md:p-6 border border-red-100 rounded-2xl md:rounded-3xl shadow-[inset_0_2px_10px_rgba(255,255,255,1)]">
                  <span className="text-[10px] md:text-[11px] font-extrabold text-red-600 uppercase tracking-widest flex items-center mb-1.5 md:mb-2">
                    <AlertCircle className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1.5" /> The Challenge
                  </span>
                  <p className="text-red-950 text-sm md:text-[15px] font-medium leading-relaxed">{activeScenario.biasChallenge}</p>
                </div>

                <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/80 backdrop-blur-md p-4 md:p-6 border border-emerald-100 rounded-2xl md:rounded-3xl shadow-[inset_0_2px_10px_rgba(255,255,255,1)]">
                  <span className="text-[10px] md:text-[11px] font-extrabold text-emerald-600 uppercase tracking-widest flex items-center mb-2 md:mb-3">
                    <CheckCircle className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1.5" /> Resolution Goals
                  </span>
                  <ul className="text-emerald-950 text-sm md:text-[15px] space-y-2 md:space-y-3 font-medium">
                    {activeScenario.goals.map((goal, idx) => (
                      <li key={idx} className="flex items-start">
                         <span className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-emerald-200/50 text-emerald-600 flex items-center justify-center shrink-0 mr-2.5 md:mr-3 text-[9px] md:text-[10px] mt-0.5 leading-none font-bold">✓</span>
                         <span className="leading-relaxed">{goal}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 md:pt-6 flex justify-center w-full">
                  <button 
                    onClick={() => setViewMode('simulation')}
                    className="flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-full font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_40px_rgba(15,23,42,0.3)] hover:shadow-[0_0_60px_rgba(15,23,42,0.4)]  w-full sm:w-auto relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                    <span className="relative z-10 flex items-center gap-2">Start Simulation <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>
                  </button>
                </div>
              </div>
           </div>
        </div>
      ) : (
        <div className="flex flex-col bg-white/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/60 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1),0_0_15px_rgba(255,255,255,0.4)] relative z-10 animate-in fade-in zoom-in-95 duration-500 overflow-visible flex-grow mb-10 min-h-[600px]">
           
           {/* Simulation Header */}
           <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/40 bg-white/20 backdrop-blur-sm z-20 shrink-0">
             <button 
               onClick={() => setViewMode('details')}
               className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors bg-white/50 px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-white/60 active:scale-95"
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 md:mr-1.5"><path d="m15 18-6-6 6-6"/></svg> <span className="hidden sm:inline">Back to Details</span><span className="sm:hidden">Back</span>
             </button>
             
             <div className="flex bg-white/60 p-1 md:p-1.5 rounded-2xl border border-white/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] relative z-20">
                <button
                  onClick={() => setMode('voice')}
                  className={`flex items-center px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-sm font-extrabold transition-all outline-none ${mode === 'voice' ? 'bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-lg shadow-red-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'}`}
                >
                  <Mic className="h-4 w-4 mr-2" /> Live Voice
                </button>
                <button
                  onClick={() => setMode('text')}
                  className={`flex items-center px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-sm font-extrabold transition-all outline-none ${mode === 'text' ? 'bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'}`}
                >
                  <TypeIcon className="h-4 w-4 mr-2" /> Text Chat
                </button>
             </div>
           </div>

           <div className="flex flex-col relative h-[600px] flex-grow">
              {mode === 'text' ? (
                 <div className="flex flex-col relative h-full flex-grow overflow-hidden rounded-b-[2.5rem] pb-[72px] md:pb-[88px]">
                    <div className="flex-grow overflow-y-auto p-4 md:p-8 space-y-6">
                       {messages.length === 0 && loading && (
                         <div className="flex justify-center items-center h-full">
                           <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                           <span className="ml-3 text-slate-500 font-medium">Starting Scenario...</span>
                         </div>
                       )}

                       {messages.length === 0 && !loading && (
                        <div className="text-center text-slate-500 mt-12 glass-panel p-6 md:p-8 bg-white/50 backdrop-blur-md border border-white mx-auto max-w-sm rounded-[2rem] shadow-lg shadow-black/5">
                          <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner rotate-3">
                            <MessageSquare className="h-8 w-8 text-indigo-500 -rotate-3" />
                          </div>
                          <h4 className="text-lg font-bold text-slate-800 mb-2">Ready to Advocate</h4>
                          <p className="font-medium text-slate-600 text-[15px] leading-relaxed">Type your response to the scenario here to evaluate your approach.</p>
                        </div>
                      )}

                      {messages.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-2`}>
                          {msg.role === 'user' ? (
                            <div className="bg-slate-800 text-white px-5 py-4 rounded-3xl rounded-tr-sm max-w-[85%] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-700">
                              <p className="text-[15px] font-medium leading-relaxed">{msg.text}</p>
                            </div>
                          ) : (
                            <div className="w-full flex justify-start">
                              {!msg.feedback ? (
                                <div className="bg-white text-slate-800 px-5 py-4 rounded-3xl rounded-tl-sm max-w-[85%] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100">
                                  <p className="text-[15px] font-medium leading-relaxed">{msg.text}</p>
                                </div>
                              ) : (
                                <div className="bg-white/70 backdrop-blur-2xl border border-white w-full overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.06)] mt-2 rounded-[2rem]">
                                  <div className="bg-gradient-to-r from-indigo-50/90 to-blue-50/90 backdrop-blur-md px-5 py-4 flex justify-between items-center shadow-sm relative">
                                    <span className="font-extrabold text-indigo-900 text-[11px] tracking-widest uppercase flex items-center z-10">
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2 animate-pulse"></div>
                                      Advocacy Analysis
                                    </span>
                                  </div>
                                  
                                  <div className="p-4 md:p-6 grid grid-cols-3 gap-3 md:gap-4 border-b border-indigo-100/50">
                                     <ScoreCard label="Empathy" score={msg.feedback.empathyScore} />
                                     <ScoreCard label="Evidence" score={msg.feedback.evidenceScore} />
                                     <ScoreCard label="Assert" score={msg.feedback.assertivenessScore} />
                                  </div>

                                  <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                                    <div>
                                      <h5 className="text-[11px] font-extrabold text-slate-400 flex items-center mb-2.5 uppercase tracking-widest">
                                        <Lightbulb className="h-3.5 w-3.5 text-amber-500 mr-2" /> Critique
                                      </h5>
                                      <p className="text-[14px] md:text-[15px] text-slate-700 font-medium leading-relaxed bg-white/50 p-4 md:p-5 rounded-2xl border border-white shadow-[inset_0_2px_10px_rgba(255,255,255,1)]">{msg.feedback.critique}</p>
                                    </div>
                                    
                                    <div className="bg-emerald-50/80 backdrop-blur-md border border-emerald-100/50 p-4 md:p-5 rounded-2xl">
                                      <h5 className="text-[11px] font-extrabold text-emerald-600 flex items-center mb-2.5 uppercase tracking-widest">
                                        <CheckCircle className="h-3.5 w-3.5 mr-2" /> Recommended
                                      </h5>
                                      <p className="text-[14px] md:text-[15px] text-emerald-950 font-semibold leading-relaxed">"{msg.feedback.betterAlternative}"</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {loading && (
                        <div className="flex items-start max-w-3xl mx-auto w-full">
                           <div className="bg-white px-5 py-4 rounded-3xl rounded-tl-sm shadow-sm border border-slate-100 flex gap-1.5 items-center">
                             <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"></div>
                             <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                             <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                           </div>
                        </div>
                      )}
                    </div>

                    {/* Chat Input */}
                    <div className="p-3 md:p-5 bg-white/80 backdrop-blur-2xl border-t border-white/60 shadow-[0_-10px_30px_rgb(0,0,0,0.02)] shrink-0 z-20 w-full rounded-b-[2.5rem] absolute bottom-0 left-0 right-0 overflow-hidden">
                      <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto relative group">
                        <input
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="Type your response..."
                          className="flex-grow bg-white backdrop-blur-md rounded-2xl px-5 py-4 md:py-4.5 text-slate-800 placeholder-slate-400 font-medium text-[15px] shadow-[0_2px_10px_-3px_rgb(0,0,0,0.05)] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                          disabled={loading}
                        />
                        <button
                          type="submit"
                          disabled={loading || !input.trim()}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white w-10 h-10 md:w-11 md:h-11 rounded-xl hover:bg-slate-800 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex flex-shrink-0 items-center justify-center active:scale-95"
                        >
                          <Send className="h-4 w-4 md:h-5 md:w-5" />
                        </button>
                      </form>
                    </div>
                 </div>
              ) : (
                <div className="flex-grow flex flex-col pt-4 overflow-hidden rounded-b-[2.5rem]">
                  <LiveVoiceChat scenario={activeScenario} />
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export const ActivityIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
);

const ScoreCard = ({ label, score }: { label: string, score: number }) => {
  let colorClass = "text-yellow-600";
  if (score >= 8) colorClass = "text-emerald-600";
  if (score <= 4) colorClass = "text-red-600";

  return (
    <div className="text-center glass-panel bg-white/60 border-white/80 p-3 rounded-xl shadow-sm">
      <div className={`text-xl md:text-2xl font-bold ${colorClass} drop-shadow-sm`}>{score}/10</div>
      <div className="text-[10px] md:text-xs text-slate-600 font-bold uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

export default Simulator;