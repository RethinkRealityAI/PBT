import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Scenario, SimulationMessage } from '../types';
import { evaluateAdvocacyResponse, generateRoleplayMessage } from '../services/geminiService';
import {
  Send, AlertCircle, CheckCircle, Lightbulb,
  Mic, Type as TypeIcon, Loader2, ArrowRight, ArrowLeft, RotateCcw
} from 'lucide-react';

// Code-split the voice chat — its WebSocket/Live API code is ~unused by text mode.
const LiveVoiceChat = lazy(() =>
  import('./LiveVoiceChat').then(m => ({ default: m.LiveVoiceChat }))
);

interface CharacterInfo {
  name: string;
  role: string;
  initials: string;
  avatarClass: string;
}

const DEFAULT_CHARACTER: CharacterInfo = {
  name: 'Clinician',
  role: 'Healthcare Provider',
  initials: '?',
  avatarClass: 'from-slate-400 to-slate-600',
};

const CHARACTERS: Record<string, CharacterInfo> = {
  '1': { name: 'Nurse Williams', role: 'Triage Nurse, ED',       initials: 'NW', avatarClass: 'from-rose-400 to-rose-600'   },
  '2': { name: 'Dr. Chen',       role: 'Attending Physician',     initials: 'DC', avatarClass: 'from-violet-400 to-violet-600' },
  '3': { name: 'Dr. Park',       role: 'Covering Physician',      initials: 'DP', avatarClass: 'from-amber-400 to-amber-600'  },
  '4': { name: 'Dr. Martinez',   role: 'Consulting Specialist',   initials: 'DM', avatarClass: 'from-sky-400 to-sky-600'     },
};

const SCENARIOS: Scenario[] = [
  {
    id: '1',
    title: 'The "Drug Seeking" Label',
    description: 'A 24-year-old male presents to the ED with 10/10 pain. The triage nurse rolls her eyes and says, "He is here every week for Dilaudid."',
    clinicalContext: 'Patient has a known history of HbSS. Vitals: HR 110, BP 145/90, SpO2 94% on RA. He is writhing in pain. No signs of respiratory depression. Guidelines indicate rapid initiation of analgesia.',
    biasChallenge: 'Overcoming the "frequent flyer" stigma and ensuring timely pain management despite staff skepticism.',
    goals: [
      "Validate the patient's pain professionally",
      'Cite SCD pain management guidelines (e.g., rapid analgesia)',
      'Successfully persuade the nurse to administer medication without further delay',
    ],
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
      'Secure an order for a chest X-ray and blood gas',
    ],
  },
  {
    id: '3',
    title: 'Inadequate Pain Management',
    description: 'A 28-year-old female is admitted for a vaso-occlusive crisis. The covering physician prescribes a low dose of oral pain medication, stating, "We need to be careful with opioids."',
    clinicalContext: 'Patient has a history of severe VOC requiring IV PCA. Current pain is 9/10. Oral meds are insufficient. Guidelines recommend individualized, rapid, and aggressive pain management, often requiring IV opioids.',
    biasChallenge: 'Advocating for appropriate, guideline-concordant IV pain management and challenging the unfounded fear of opioid addiction in SCD patients.',
    goals: [
      "Address the physician's concern about opioids respectfully but firmly",
      "Reference the patient's history and individualized pain plan",
      'Obtain an order for appropriate IV pain medication',
    ],
  },
  {
    id: '4',
    title: 'Disrespectful Bedside Manner',
    description: "A 35-year-old male is in the hospital. A consulting specialist enters the room, doesn't introduce themselves, and speaks over the patient, ignoring his questions about his care plan.",
    clinicalContext: 'Patient is stable but anxious about his treatment plan. He has experienced medical trauma in the past. Respectful, patient-centered communication is essential.',
    biasChallenge: "Intervening to ensure the patient is heard, respected, and included in shared decision-making, addressing the specialist's dismissive behavior.",
    goals: [
      'Interrupt the specialist politely to center the patient',
      "Ensure the patient's specific questions are answered",
      'Model respectful, trauma-informed communication',
    ],
  },
];

const Simulator: React.FC = () => {
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [viewMode, setViewMode]     = useState<'details' | 'simulation'>('details');
  const [mode, setMode]             = useState<'voice' | 'text'>('voice');
  const [messages, setMessages]     = useState<SimulationMessage[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Incremented on every new initiation; stale async callbacks check before writing state.
  const generationRef   = useRef(0);
  const messagesEndRef  = useRef<HTMLDivElement>(null);

  const activeScenario = SCENARIOS[currentScenarioIndex];
  const character      = CHARACTERS[activeScenario.id] ?? DEFAULT_CHARACTER;

  // ── Auto-scroll to latest message ──────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Initiate text scenario when entering simulation ─────────────────────────
  // useCallback ensures the effect dep is stable across renders for the same
  // scenario; the generation counter inside prevents stale API responses from
  // landing if the user navigates away and back quickly.
  const initiateTextScenario = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    try {
      const aiMsg = await generateRoleplayMessage(activeScenario, []);
      if (generation !== generationRef.current) return; // stale — discard
      setMessages([aiMsg]);
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [activeScenario]);

  useEffect(() => {
    if (
      viewMode === 'simulation' &&
      mode === 'text' &&
      messages.length === 0 &&
      !loading &&
      !isCompleted
    ) {
      initiateTextScenario();
    }
  }, [viewMode, mode, messages.length, loading, isCompleted, initiateTextScenario]);

  // ── Navigation helpers ──────────────────────────────────────────────────────
  const resetSimulation = useCallback(() => {
    generationRef.current++; // invalidate any in-flight request
    setMessages([]);
    setInput('');
    setIsCompleted(false);
  }, []);

  const goToScenario = useCallback((index: number) => {
    setCurrentScenarioIndex(index);
    resetSimulation();
    setViewMode('details');
  }, [resetSimulation]);

  const handleNextScenario = () => goToScenario((currentScenarioIndex + 1) % SCENARIOS.length);
  const handlePrevScenario = () => goToScenario((currentScenarioIndex - 1 + SCENARIOS.length) % SCENARIOS.length);

  const handleModeChange = (newMode: 'voice' | 'text') => {
    if (newMode === mode) return;
    setMode(newMode);
    resetSimulation();
  };

  // ── Message submission ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || isCompleted) return;

    const userMsg: SimulationMessage = { role: 'user', text: input };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setLoading(true);

    try {
      const userTurns = newHistory.filter((m) => m.role === 'user').length;

      if (userTurns >= 3) {
        // Build transcript excluding any earlier feedback messages so the
        // evaluator only sees the raw roleplay exchange.
        const roleplays = newHistory.filter((m) => !m.feedback);
        const fullTranscript = roleplays
          .map((m) => `${m.role === 'user' ? 'USER' : 'SCENARIO'}: ${m.text}`)
          .join('\n\n');

        const feedback = await evaluateAdvocacyResponse(
          activeScenario,
          `Full Conversation Transcript:\n${fullTranscript}`
        );
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: "I've analyzed your advocacy approach.", feedback },
        ]);
        setIsCompleted(true);
      } else {
        // Pass only the pre-submit history as context; the service appends the
        // user message itself so it constructs the correct turn order.
        const aiMsg = await generateRoleplayMessage(activeScenario, messages, input);
        setMessages((prev) => [...prev, aiMsg]);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-grow w-full max-w-4xl mx-auto px-3 md:px-4 mt-16 pt-6 md:mt-20 mb-10 relative">

      {/* Scenario navigation */}
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <button
          onClick={handlePrevScenario}
          aria-label="Previous scenario"
          className="w-10 h-10 flex items-center justify-center rounded-full liquid-glass text-slate-600 hover:text-slate-900 transition-all active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-2 flex-grow text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Scenario {currentScenarioIndex + 1} of {SCENARIOS.length}
          </p>
          <div className="flex gap-2 items-center">
            {SCENARIOS.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to scenario ${i + 1}`}
                onClick={() => i !== currentScenarioIndex && goToScenario(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === currentScenarioIndex
                    ? 'w-7 h-2.5 bg-gradient-to-r from-red-500 to-rose-500 shadow-sm shadow-red-500/30'
                    : 'w-2.5 h-2.5 bg-slate-300 hover:bg-slate-400 cursor-pointer'
                }`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleNextScenario}
          aria-label="Next scenario"
          className="w-10 h-10 flex items-center justify-center rounded-full liquid-glass text-slate-600 hover:text-slate-900 transition-all active:scale-95"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {viewMode === 'details' ? (
        /* ── Details card ──────────────────────────────────────────────── */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex-grow flex items-start py-2">
          <div className="liquid-glass-elevated rounded-[2.5rem] w-full overflow-hidden">

            <div className="relative px-6 pt-7 pb-5 md:px-10 md:pt-9 md:pb-6 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/8 via-rose-400/4 to-transparent" />
              <div className="absolute -top-10 -right-10 w-44 h-44 bg-red-200/20 rounded-full blur-3xl" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30 shrink-0 rotate-3">
                  <ActivityIcon className="h-6 w-6 md:h-7 md:w-7 text-white -rotate-3" />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-red-500/80 mb-1">
                    Clinical Scenario
                  </p>
                  <h3 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight leading-tight">
                    {activeScenario.title}
                  </h3>
                </div>
              </div>
              <div className="relative z-10 mt-5 border-t border-white/50" />
            </div>

            <div className="px-6 pb-7 md:px-10 md:pb-10 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard label="The Situation" labelColor="text-slate-400">
                  {activeScenario.description}
                </InfoCard>
                <InfoCard label="Clinical Context" labelColor="text-indigo-500">
                  {activeScenario.clinicalContext}
                </InfoCard>
              </div>

              <div className="bg-red-50/70 rounded-2xl p-5 border border-red-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center gap-2 mb-2.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-red-600">The Challenge</p>
                </div>
                <p className="text-red-900 text-[14px] md:text-[15px] leading-relaxed font-medium">
                  {activeScenario.biasChallenge}
                </p>
              </div>

              <div className="bg-emerald-50/70 rounded-2xl p-5 border border-emerald-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-700">Your Goals</p>
                </div>
                <ul className="space-y-2.5">
                  {activeScenario.goals.map((goal, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-emerald-200/70 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                        <span className="text-[9px] font-bold text-emerald-700">{i + 1}</span>
                      </span>
                      <span className="text-emerald-950 text-[14px] md:text-[15px] font-medium leading-relaxed">{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Mode selector + CTA */}
              <div className="pt-3">
                <div className="flex justify-center gap-3 mb-4">
                  <ModeButton active={mode === 'voice'} onClick={() => setMode('voice')} gradient="from-red-600 to-rose-500" shadow="shadow-red-500/25">
                    <Mic className="h-4 w-4" /> Live Voice
                  </ModeButton>
                  <ModeButton active={mode === 'text'} onClick={() => setMode('text')} gradient="from-indigo-600 to-blue-500" shadow="shadow-indigo-500/25">
                    <TypeIcon className="h-4 w-4" /> Text Chat
                  </ModeButton>
                </div>
                <button
                  onClick={() => setViewMode('simulation')}
                  className="w-full flex justify-center items-center gap-3 bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl text-[15px] font-bold transition-all hover:scale-[1.01] active:scale-[0.99] shadow-[0_8px_30px_rgba(15,23,42,0.22),0_2px_8px_rgba(15,23,42,0.12)] hover:shadow-[0_12px_40px_rgba(15,23,42,0.28)] relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative z-10">Begin Simulation</span>
                  <ArrowRight className="relative z-10 h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
                </button>
              </div>
            </div>
          </div>
        </div>

      ) : (
        /* ── Simulation view ────────────────────────────────────────────── */
        <div className="flex flex-col liquid-glass-elevated rounded-[2rem] animate-in fade-in zoom-in-[0.985] duration-350 flex-grow min-h-[580px] overflow-hidden mb-2">

          {/* Header */}
          <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-white/40 bg-white/20 backdrop-blur-sm shrink-0">
            <button
              onClick={() => { setViewMode('details'); resetSimulation(); }}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors bg-white/50 px-3 py-1.5 rounded-full border border-white/70 active:scale-95"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <p className="flex-1 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate hidden sm:block px-4 max-w-[180px] mx-auto">
              {activeScenario.title}
            </p>

            <div className="flex bg-white/60 p-1 rounded-xl border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] gap-0.5">
              <SimModeButton active={mode === 'voice'} onClick={() => handleModeChange('voice')} gradient="from-red-600 to-rose-500" shadow="shadow-red-500/20">
                <Mic className="h-3 w-3" /> Voice
              </SimModeButton>
              <SimModeButton active={mode === 'text'} onClick={() => handleModeChange('text')} gradient="from-indigo-600 to-blue-500" shadow="shadow-indigo-500/20">
                <TypeIcon className="h-3 w-3" /> Text
              </SimModeButton>
            </div>
          </div>

          {mode === 'text' ? (
            <div className="flex flex-col flex-grow overflow-hidden relative">
              {/* Message list */}
              <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-5" style={{ paddingBottom: '84px' }}>

                {/* Initial loading — AI is speaking first */}
                {messages.length === 0 && loading && (
                  <div className="flex items-end gap-3 animate-in fade-in duration-300">
                    <CharacterAvatar character={character} />
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 mb-1.5 ml-1">
                        {character.name} · {character.role}
                      </p>
                      <TypingIndicator />
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <MessageBubble
                    key={idx}
                    msg={msg}
                    character={character}
                    onRetry={resetSimulation}
                  />
                ))}

                {/* Mid-conversation loading indicator */}
                {loading && messages.length > 0 && (
                  <div className="flex items-end gap-3 animate-in fade-in duration-200">
                    <CharacterAvatar character={character} />
                    <TypingIndicator />
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 bg-white/70 backdrop-blur-2xl border-t border-white/60 shadow-[0_-8px_24px_rgba(0,0,0,0.03)]">
                {isCompleted ? (
                  /* Completed state — prompt retry or scenario change */
                  <div className="flex items-center justify-center gap-3 py-1">
                    <p className="text-sm font-semibold text-slate-500">Simulation complete</p>
                    <button
                      onClick={resetSimulation}
                      className="flex items-center gap-2 bg-slate-900 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-all active:scale-95 shadow-md shadow-slate-900/15"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Try Again
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={loading ? 'Waiting for response…' : 'Respond as the healthcare advocate…'}
                      className="flex-grow bg-white/80 rounded-2xl px-5 py-3.5 text-slate-800 placeholder-slate-400 font-medium text-[15px] border border-white/80 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-300/60 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.04)] disabled:opacity-60"
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="bg-slate-900 text-white w-11 h-11 rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center active:scale-95 shrink-0 shadow-md shadow-slate-900/15"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </form>
                )}
              </div>
            </div>

          ) : (
            <div className="flex-grow flex flex-col pt-2 overflow-hidden">
              <Suspense fallback={
                <div className="flex-grow flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                </div>
              }>
                <LiveVoiceChat scenario={activeScenario} />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Reusable layout sub-components ───────────────────────────────────────── */

const InfoCard = ({
  label, labelColor, children,
}: {
  label: string; labelColor: string; children: React.ReactNode;
}) => (
  <div className="bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.03)]">
    <p className={`text-[10px] font-extrabold uppercase tracking-[0.2em] ${labelColor} mb-2.5`}>{label}</p>
    <p className="text-slate-700 text-[14px] md:text-[15px] leading-relaxed font-medium">{children}</p>
  </div>
);

const ModeButton = ({
  active, onClick, gradient, shadow, children,
}: {
  active: boolean; onClick: () => void; gradient: string; shadow: string; children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-200 ${
      active
        ? `bg-gradient-to-r ${gradient} text-white shadow-lg ${shadow}`
        : 'bg-white/60 text-slate-600 border border-white/80 hover:bg-white/80 hover:text-slate-800'
    }`}
  >
    {children}
  </button>
);

const SimModeButton = ({
  active, onClick, gradient, shadow, children,
}: {
  active: boolean; onClick: () => void; gradient: string; shadow: string; children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
      active
        ? `bg-gradient-to-r ${gradient} text-white shadow-sm ${shadow}`
        : 'text-slate-500 hover:text-slate-800'
    }`}
  >
    {children}
  </button>
);

/* ── Chat sub-components ───────────────────────────────────────────────────── */

const CharacterAvatar = ({ character }: { character: CharacterInfo }) => (
  <div
    className={`w-9 h-9 rounded-full bg-gradient-to-br ${character.avatarClass} flex items-center justify-center shrink-0 shadow-md border-2 border-white`}
  >
    <span className="text-[10px] font-extrabold text-white">{character.initials}</span>
  </div>
);

const TypingIndicator = () => (
  <div className="bg-white/80 backdrop-blur-md px-5 py-4 rounded-3xl rounded-bl-sm shadow-[0_4px_16px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] border border-white/80 inline-flex gap-1.5 items-center">
    <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
);

interface MessageBubbleProps {
  msg: SimulationMessage;
  character: CharacterInfo;
  onRetry?: () => void;
}

const MessageBubble = ({ msg, character, onRetry }: MessageBubbleProps) => {
  if (msg.role === 'user') {
    return (
      <div className="flex flex-col items-end animate-in fade-in slide-in-from-bottom-2 duration-300">
        <p className="text-[11px] font-bold text-slate-400 mb-1.5 mr-1">You · Healthcare Advocate</p>
        <div className="bg-slate-800 text-white px-5 py-3.5 rounded-3xl rounded-tr-sm max-w-[85%] shadow-[0_4px_20px_rgba(15,23,42,0.15),0_1px_4px_rgba(15,23,42,0.1)]">
          <p className="text-[15px] font-medium leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }

  if (msg.feedback) {
    return (
      <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
        <FeedbackPanel feedback={msg.feedback} onRetry={onRetry} />
      </div>
    );
  }

  const isError = msg.text === 'Error connecting to AI.';

  return (
    <div className="flex items-end gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <CharacterAvatar character={character} />
      <div className="max-w-[85%]">
        <p className="text-[11px] font-bold text-slate-400 mb-1.5 ml-1">
          {character.name} · {character.role}
        </p>
        <div
          className={`text-slate-800 px-5 py-3.5 rounded-3xl rounded-bl-sm shadow-[0_4px_16px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] border ${
            isError
              ? 'bg-red-50/80 border-red-200/80 text-red-800'
              : 'bg-white/80 backdrop-blur-md border-white/80'
          }`}
        >
          <p className="text-[15px] font-medium leading-relaxed">{msg.text}</p>
        </div>
      </div>
    </div>
  );
};

/* ── Feedback panel ────────────────────────────────────────────────────────── */

interface FeedbackPanelProps {
  feedback: NonNullable<SimulationMessage['feedback']>;
  onRetry?: () => void;
}

const FeedbackPanel = ({ feedback, onRetry }: FeedbackPanelProps) => (
  <div className="bg-white/70 backdrop-blur-2xl border border-white/80 rounded-[1.8rem] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] my-2">

    <div className="bg-gradient-to-r from-indigo-50/90 to-blue-50/80 px-6 py-4 border-b border-indigo-100/50 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
      <span className="font-extrabold text-indigo-900 text-[11px] tracking-[0.18em] uppercase">
        Advocacy Analysis
      </span>
    </div>

    <div className="px-6 py-6 grid grid-cols-3 gap-4 border-b border-slate-100/50">
      <ScoreRing score={feedback.empathyScore}       label="Empathy"  />
      <ScoreRing score={feedback.evidenceScore}      label="Evidence" />
      <ScoreRing score={feedback.assertivenessScore} label="Assert."  />
    </div>

    <div className="px-6 py-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Critique</p>
        </div>
        <p className="text-[14px] md:text-[15px] text-slate-700 font-medium leading-relaxed bg-white/60 p-4 rounded-2xl border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          {feedback.critique}
        </p>
      </div>

      <div className="bg-emerald-50/80 border border-emerald-100/80 p-5 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <div className="flex items-center gap-2 mb-2.5">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Recommended Approach
          </p>
        </div>
        <p className="text-[14px] md:text-[15px] text-emerald-950 font-semibold leading-relaxed">
          "{feedback.betterAlternative}"
        </p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="w-full flex items-center justify-center gap-2 bg-white/60 hover:bg-white/90 text-slate-700 font-bold text-sm px-6 py-3 rounded-2xl border border-white/80 transition-all active:scale-[0.99] hover:shadow-sm"
        >
          <RotateCcw className="h-4 w-4" /> Try Again
        </button>
      )}
    </div>
  </div>
);

/* ── Score ring ────────────────────────────────────────────────────────────── */

const ScoreRing = ({ score, label }: { score: number; label: string }) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // Double rAF: first frame lets the browser paint the empty ring,
    // second frame triggers the CSS transition fill animation.
    let inner: number;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setAnimated(true));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, []);

  const strokeWidth = 4;
  const radius      = 22; // actual circle radius (28 - strokeWidth/2 fits in 56px viewBox)
  const circ        = 2 * Math.PI * radius;
  const offset      = animated ? circ - (Math.min(Math.max(score, 0), 10) / 10) * circ : circ;

  let strokeColor = '#f59e0b'; // amber — mid range
  let textColor   = 'text-amber-600';
  if (score >= 8) { strokeColor = '#10b981'; textColor = 'text-emerald-600'; }
  if (score <= 4) { strokeColor = '#ef4444'; textColor = 'text-red-600'; }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-14 h-14">
        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90" aria-hidden="true">
          <circle cx="28" cy="28" r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
          <circle
            cx="28" cy="28" r={radius}
            fill="none" stroke={strokeColor} strokeWidth={strokeWidth}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center" aria-label={`${label}: ${score} out of 10`}>
          <span className={`text-sm font-extrabold ${textColor}`}>{score}</span>
        </div>
      </div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">{label}</p>
    </div>
  );
};

/* ── Icons ─────────────────────────────────────────────────────────────────── */

export const ActivityIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={className}
  >
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

export default Simulator;
