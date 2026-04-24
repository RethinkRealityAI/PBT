import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { Mic, MicOff, Loader2, Volume2, Square, CheckCircle, AlertCircle, RefreshCw, Lightbulb, MessageSquare } from 'lucide-react';
import { Scenario } from '../types';

interface LiveVoiceChatProps {
  scenario: Scenario;
}

interface EvaluationReport {
  success: boolean;
  empathyScore: number;
  evidenceScore: number;
  assertivenessScore: number;
  feedback: string;
  areasForImprovement: string;
}

interface SimulationMetrics {
  durationSeconds: number;
  timeInRed: number;
  timeInYellow: number;
  timeInGreen: number;
  regressions: number;
  turns: number;
}

const endSimulationDeclaration: FunctionDeclaration = {
  name: "endSimulation",
  description: "Call this function to end the simulation ONLY when the user has successfully resolved the scenario (tension is green) or failed to do so after many turns. Provide a comprehensive evaluation of their advocacy skills.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      success: {
        type: Type.BOOLEAN,
        description: "Whether the user successfully advocated for the patient and resolved the issue."
      },
      empathyScore: {
        type: Type.INTEGER,
        description: "Score from 1-10 for empathy"
      },
      evidenceScore: {
        type: Type.INTEGER,
        description: "Score from 1-10 for evidence-based practice"
      },
      assertivenessScore: {
        type: Type.INTEGER,
        description: "Score from 1-10 for assertiveness"
      },
      feedback: {
        type: Type.STRING,
        description: "Detailed feedback on the user's performance."
      },
      areasForImprovement: {
        type: Type.STRING,
        description: "Specific areas where the user can improve."
      }
    },
    required: ["success", "empathyScore", "evidenceScore", "assertivenessScore", "feedback", "areasForImprovement"]
  }
};

const updateEmotionDeclaration: FunctionDeclaration = {
  name: "updateEmotion",
  description: "Call this function to update the visual emotion orb based on the current state of the conversation. Use 'red' for tense/escalated, 'yellow' for neutral/progressing, and 'green' for de-escalated/resolved.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      emotion: {
        type: Type.STRING,
        description: "The current emotion state: 'red', 'yellow', or 'green'"
      }
    },
    required: ["emotion"]
  }
};

export const LiveVoiceChat: React.FC<LiveVoiceChatProps> = ({ scenario }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ role: string, text: string }[]>([]);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [emotion, setEmotion] = useState<string>('red'); // Default to red (tense)
  const [metrics, setMetrics] = useState<SimulationMetrics | null>(null);

  const sessionRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef(0);
  const resumptionHandleRef = useRef<string | null>(null);

  // Metrics tracking refs
  const startTimeRef = useRef<number>(0);
  const lastEmotionChangeTimeRef = useRef<number>(0);
  const timeInEmotionRef = useRef<{red: number, yellow: number, green: number}>({red: 0, yellow: 0, green: 0});
  const regressionsRef = useRef<number>(0);
  const turnCountRef = useRef<number>(0);
  const currentEmotionRef = useRef<string>('red');

  const startSession = async () => {
    try {
      // If we are in the AI Studio editor and no key is selected, prompt for it
      if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
        await (window as any).aistudio.openSelectKey();
      }

      isActiveRef.current = true;
      setIsConnecting(true);
      setError(null);
      setReport(null);
      setMetrics(null);
      setTranscript([]);
      setEmotion('red');
      setIsAiSpeaking(false);

      // Reset metrics
      startTimeRef.current = Date.now();
      lastEmotionChangeTimeRef.current = Date.now();
      timeInEmotionRef.current = { red: 0, yellow: 0, green: 0 };
      regressionsRef.current = 0;
      turnCountRef.current = 0;
      currentEmotionRef.current = 'red';

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (audioContextRef.current.state === 'suspended') {
        try { await audioContextRef.current.resume(); } catch (e) {}
      }

      const systemInstruction = `
You are participating in a clinical advocacy simulation for Sickle Cell Disease (SCD).
You will roleplay as the colleague or patient described in the scenario.
The user is a healthcare provider practicing their advocacy skills.

SCENARIO CONTEXT:
${scenario.clinicalContext}

THE SITUATION:
${scenario.description}

RESOLUTION GOALS:
${scenario.goals.map(g => '- ' + g).join('\n')}

YOUR ROLE:
Act as the person the user needs to advocate to (e.g., the dismissive nurse, the busy attending, or the patient).
Respond naturally to the user's spoken advocacy attempts.
If they are empathetic, evidence-based, and assertive, you can gradually concede or agree.
If they are passive or aggressive, you might remain dismissive or defensive.
Keep your responses relatively brief, conversational, and realistic.

CRITICAL INSTRUCTIONS:
1. START THE CONVERSATION: You must speak first. As soon as the session begins, deliver a 1-2 sentence opening statement in character that sets up the conflict (e.g., "I don't think he needs this medication, he might be drug seeking."). Do NOT wait for the user to speak first.
2. TAKE TURNS: After your opening, wait for the user to respond. Speak once per turn, then stop and wait.
3. UPDATE EMOTION: Call the \`updateEmotion\` tool at the start and whenever the tension level meaningfully shifts. Start with 'red', move to 'yellow' as the user makes good points, and 'green' when resolved.
4. END SIMULATION — BE PATIENT: Do NOT call \`endSimulation\` early. Only call it after AT LEAST 4 substantive user turns AND one of: (a) tension has reached 'green' and held for a turn, or (b) the conversation is hopelessly deadlocked after 6+ turns. Never end on the first or second user turn.
5. IF YOU HEAR SILENCE OR UNCLEAR AUDIO: Simply stay in character and wait. Do not end the simulation.
`;

      // Re-initialize the AI client to pick up the latest API key if it was just selected
      const currentAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const sessionPromise = currentAi.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: async () => {
            setIsConnected(true);
            setIsConnecting(false);

            // Send the initial cue FIRST so the AI starts its opening before the mic can feed it silence.
            try {
              const session = await sessionPromise;
              session.sendClientContent({
                turns: [{ role: "user", parts: [{ text: "Begin the simulation now. Deliver your opening statement in character." }] }],
                turnComplete: true
              });
            } catch (e) {
              console.error("Error sending initial cue:", e);
            }

            // Only then start capturing the user's mic.
            startRecording(sessionPromise);
          },
          onmessage: async (message: any) => {
            // Check for tool calls
            if (message.toolCall) {
              const calls = message.toolCall.functionCalls || [];
              for (const call of calls) {
                let args = call.args;
                if (typeof args === 'string') {
                  try { args = JSON.parse(args); } catch (e) { args = {} as any; }
                }

                if (call.name === 'endSimulation') {
                  const now = Date.now();
                  const oldEmotion = currentEmotionRef.current;
                  const timeSpent = now - lastEmotionChangeTimeRef.current;
                  if (oldEmotion === 'red' || oldEmotion === 'yellow' || oldEmotion === 'green') {
                     timeInEmotionRef.current[oldEmotion as keyof typeof timeInEmotionRef.current] += timeSpent;
                  }

                  setMetrics({
                    durationSeconds: Math.floor((now - startTimeRef.current) / 1000),
                    timeInRed: Math.floor(timeInEmotionRef.current.red / 1000),
                    timeInYellow: Math.floor(timeInEmotionRef.current.yellow / 1000),
                    timeInGreen: Math.floor(timeInEmotionRef.current.green / 1000),
                    regressions: regressionsRef.current,
                    turns: turnCountRef.current
                  });
                  setReport(args as EvaluationReport);
                  // Respond to the tool call before closing so the server records a clean termination
                  try {
                    const session = await sessionPromise;
                    session.sendToolResponse({
                      functionResponses: [{ id: call.id, name: call.name, response: { result: "acknowledged" } }]
                    });
                  } catch (e) {}
                  stopSession();
                  return;
                } else if (call.name === 'updateEmotion') {
                  if (args.emotion) {
                    const newEmotion = args.emotion;
                    const now = Date.now();
                    const oldEmotion = currentEmotionRef.current;
                    
                    const timeSpent = now - lastEmotionChangeTimeRef.current;
                    if (oldEmotion === 'red' || oldEmotion === 'yellow' || oldEmotion === 'green') {
                       timeInEmotionRef.current[oldEmotion as keyof typeof timeInEmotionRef.current] += timeSpent;
                    }
                    
                    if ((oldEmotion === 'green' && (newEmotion === 'yellow' || newEmotion === 'red')) ||
                        (oldEmotion === 'yellow' && newEmotion === 'red')) {
                        regressionsRef.current += 1;
                    }
                    
                    currentEmotionRef.current = newEmotion;
                    lastEmotionChangeTimeRef.current = now;
                    setEmotion(newEmotion);
                  }
                  // Send tool response so the model can continue
                  sessionPromise.then((session: any) => {
                    try {
                      session.sendToolResponse({
                        functionResponses: [{
                          id: call.id,
                          name: call.name,
                          response: { result: "success" }
                        }]
                      });
                    } catch (e) {}
                  });
                }
              }
            }

            // Handle ALL audio output chunks (not just parts[0])
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              const b64 = part?.inlineData?.data;
              if (b64) playAudioChunk(b64);
            }

            // Handle interruption (user started speaking mid-AI-response):
            // actually stop the buffered sources so the user doesn't hear the
            // AI keep talking after they cut it off.
            if (message.serverContent?.interrupted) {
              stopAllPlayback();
            }

            // Turn complete — AI finished speaking. Count this as one turn.
            if (message.serverContent?.turnComplete) {
              turnCountRef.current += 1;
              setIsAiSpeaking(false);
            }

            // Capture resumption handle so we can survive a transient drop.
            const handle = message.sessionResumptionUpdate?.newHandle;
            if (handle && typeof handle === 'string') {
              resumptionHandleRef.current = handle;
            }

            // AI transcription (only delivered when outputAudioTranscription is enabled).
            // Concat streaming chunks while the speaker doesn't change.
            const aiText = message.serverContent?.outputTranscription?.text;
            if (aiText) {
              setTranscript(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'ai') {
                  return [...prev.slice(0, -1), { role: 'ai', text: last.text + aiText }];
                }
                return [...prev, { role: 'ai', text: aiText }];
              });
            }

            // User transcription (only delivered when inputAudioTranscription is enabled).
            const userText = message.serverContent?.inputTranscription?.text;
            if (userText) {
              setTranscript(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'user') {
                  return [...prev.slice(0, -1), { role: 'user', text: last.text + userText }];
                }
                return [...prev, { role: 'user', text: userText }];
              });
            }
          },
          onclose: (event?: any) => {
            console.log("Live session closed.", { code: event?.code, reason: event?.reason });
            // Only surface a message if the user didn't stop it themselves and no report was generated
            if (isActiveRef.current) {
              const reason = event?.reason || 'The server closed the connection unexpectedly.';
              setError(`Session ended: ${reason}`);
            }
            stopSession();
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            const msg = err?.message || String(err) || '';
            const isAuth = msg.toLowerCase().includes('api key') || msg.includes('401') || msg.includes('403');
            setError(isAuth
              ? "Authentication failed. Check that your GEMINI_API_KEY is set in Netlify and trigger a new deploy."
              : `Connection error: ${msg || 'WebSocket closed unexpectedly.'}`
            );
            stopSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [endSimulationDeclaration, updateEmotionDeclaration] }],
          // Resilience: keep a handle so transient disconnects don't lose context.
          sessionResumption: resumptionHandleRef.current
            ? { handle: resumptionHandleRef.current }
            : {},
          // Long simulations: let the server slide the context window instead
          // of hitting hard token limits and terminating.
          contextWindowCompression: { slidingWindow: {} },
        },
      });

      sessionRef.current = sessionPromise;

    } catch (err: any) {
      console.error("Failed to start session:", err);
      setError(err.message || "Failed to connect to Live API");
      setIsConnecting(false);
    }
  };

  const startRecording = async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } });
      mediaStreamRef.current = stream;

      const recordingContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      recordingContextRef.current = recordingContext;
      if (recordingContext.state === 'suspended') {
        try { await recordingContext.resume(); } catch (e) {}
      }

      // AudioWorklet keeps PCM conversion off the main thread (replaces the
      // deprecated ScriptProcessorNode).
      await recordingContext.audioWorklet.addModule('/pcm-recorder-worklet.js');

      const source = recordingContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(recordingContext, 'pcm-recorder', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { chunkSize: 2048 },
      });

      workletNode.port.onmessage = (event: MessageEvent) => {
        if (!isActiveRef.current) return;
        const pcm16Buffer: ArrayBuffer = event.data;
        const base64Data = arrayBufferToBase64(pcm16Buffer);

        sessionPromise.then((session: any) => {
          if (!isActiveRef.current) return;
          try {
            session.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          } catch (e) {}
        });
      };

      source.connect(workletNode);
      // The Live API wants no local playback of the mic. Connect to a muted
      // destination just to keep the graph alive without echoing the user's
      // own voice back to them.
      const muteGain = recordingContext.createGain();
      muteGain.gain.value = 0;
      workletNode.connect(muteGain).connect(recordingContext.destination);

      workletNodeRef.current = workletNode;
      setIsRecording(true);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      const msg = (err as any)?.name === 'NotAllowedError'
        ? "Microphone permission denied. Enable it in your browser settings and reload."
        : (err as any)?.name === 'NotFoundError'
          ? "No microphone detected. Plug one in or select one in your system audio settings."
          : "Microphone unavailable. Check browser permissions and try again.";
      setError(msg);
      stopSession();
    }
  };

  // Chunk-based base64 encoding — faster than the per-byte String.fromCharCode
  // loop, especially since this runs on every captured PCM frame.
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + CHUNK)) as any
      );
    }
    return btoa(binary);
  };

  const playAudioChunk = (base64Audio: string) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    setIsAiSpeaking(true);

    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // PCM 16-bit to Float32
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }

    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;

    // Track the source so interruptions can actually cancel in-flight audio.
    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const stopAllPlayback = () => {
    for (const src of activeSourcesRef.current) {
      try { src.stop(); } catch (e) {}
      try { src.disconnect(); } catch (e) {}
    }
    activeSourcesRef.current.clear();
    nextPlayTimeRef.current = audioContextRef.current?.currentTime ?? 0;
    setIsAiSpeaking(false);
  };

  const stopSession = () => {
    isActiveRef.current = false;
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
        if (typeof session.close === 'function') {
          try { session.close(); } catch (e) {}
        }
      });
      sessionRef.current = null;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.port.onmessage = null; } catch (e) {}
      try { workletNodeRef.current.port.close(); } catch (e) {}
      try { workletNodeRef.current.disconnect(); } catch (e) {}
      workletNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (recordingContextRef.current) {
      try { recordingContextRef.current.close(); } catch (e) {}
      recordingContextRef.current = null;
    }
    // Stop any in-flight playback before closing the output context.
    for (const src of activeSourcesRef.current) {
      try { src.stop(); } catch (e) {}
      try { src.disconnect(); } catch (e) {}
    }
    activeSourcesRef.current.clear();
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setIsRecording(false);
    setIsAiSpeaking(false);
  };

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  const ScoreCard = ({ label, score }: { label: string, score: number }) => {
    let colorClass = "text-amber-500";
    if (score >= 8) colorClass = "text-emerald-600";
    if (score <= 4) colorClass = "text-rose-600";
  
    return (
      <div className="text-center p-4 rounded-xl bg-white/70 border border-white/50 shadow-sm backdrop-blur-md">
        <div className={`text-3xl font-bold ${colorClass} drop-shadow-sm`}>{score || 0}/10</div>
        <div className="text-xs text-slate-700 font-bold uppercase tracking-wide mt-1">{label}</div>
      </div>
    );
  }

  // Determine orb colors based on emotion
  let orbColor = 'bg-red-500 shadow-red-500/50';
  let orbCoreColor = 'bg-red-300';
  if (emotion === 'yellow') {
    orbColor = 'bg-yellow-400 shadow-yellow-400/50';
    orbCoreColor = 'bg-yellow-200';
  } else if (emotion === 'green') {
    orbColor = 'bg-emerald-500 shadow-emerald-500/50';
    orbCoreColor = 'bg-emerald-300';
  }

  const safeString = (val: any) => {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.join(' ');
    if (val === null || val === undefined) return '';
    return JSON.stringify(val);
  };

  return (
    <div className="flex flex-col flex-grow bg-slate-50/50 backdrop-blur-xl relative w-full h-full pb-10 overflow-y-auto">
      {/* Dynamic Background based on emotion */}
      <div className={`absolute inset-0 opacity-20 transition-colors duration-1000 ease-in-out z-0 pointer-events-none ${
        emotion === 'red' ? 'bg-gradient-to-br from-red-500/30 to-rose-900/30' :
        emotion === 'yellow' ? 'bg-gradient-to-br from-yellow-500/30 to-amber-900/30' :
        'bg-gradient-to-br from-emerald-500/30 to-teal-900/30'
      }`}></div>

      <div className="p-4 border-b border-white/20 bg-white/10 backdrop-blur-md flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-indigo-400" />
          <h3 className="font-semibold text-slate-800">Live Voice Simulation</h3>
        </div>
        <div>
          {isConnected ? (
            <button
              onClick={stopSession}
              className="flex items-center gap-2 bg-white/20 text-red-600 px-4 py-1.5 rounded-lg hover:bg-white/40 transition-all border border-red-200/50 backdrop-blur-md text-sm font-medium"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              End Simulation
            </button>
          ) : report ? (
            <button
              onClick={() => setReport(null)}
              className="flex items-center gap-2 bg-white/40 text-slate-800 px-4 py-1.5 rounded-lg hover:bg-white/60 transition-all border border-white/50 backdrop-blur-md text-sm font-medium"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-grow p-6 overflow-y-auto w-full flex flex-col z-10 scrollbar-hide">
        {error && (
          <div className="glass-panel bg-red-500/20 border-red-500/30 text-red-900 p-4 rounded-xl w-full text-sm backdrop-blur-md mb-6 shrink-0">
            {error}
          </div>
        )}

        {/* Scenario briefing — shown before the session starts so the user knows what they're walking into */}
        {!isConnected && !isConnecting && !report && (
          <div className="max-w-2xl w-full m-auto bg-white/70 backdrop-blur-md border border-white/80 rounded-[2rem] shadow-xl shadow-slate-200/50 overflow-hidden shrink-0">
            <div className="px-6 md:px-8 pt-6 md:pt-8 pb-5 bg-gradient-to-br from-indigo-50/60 to-white/30 border-b border-white/60">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-[1.2rem] flex items-center justify-center shadow-inner rotate-3 shrink-0">
                  <Mic className="h-7 w-7 text-indigo-500 -rotate-3" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">Voice Simulation Briefing</p>
                  <h3 className="text-slate-900 font-extrabold text-lg md:text-2xl tracking-tight leading-snug">{scenario.title}</h3>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-5 text-left">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Clinical context</p>
                <p className="text-sm md:text-[15px] text-slate-800 leading-relaxed font-medium">{scenario.clinicalContext}</p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">The situation</p>
                <p className="text-sm md:text-[15px] text-slate-800 leading-relaxed font-medium">{scenario.description}</p>
              </div>

              <div className="bg-gradient-to-br from-rose-50/80 to-amber-50/60 border border-rose-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700 mb-1.5">Bias challenge to overcome</p>
                <p className="text-sm text-rose-950 leading-relaxed font-semibold">{scenario.biasChallenge}</p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Your goals</p>
                <ul className="space-y-1.5">
                  {scenario.goals.map((goal, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm md:text-[15px] text-slate-800 font-medium leading-relaxed">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                      <span>{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
                <p className="text-xs md:text-sm text-indigo-900 font-semibold leading-relaxed">
                  When you hit Start, the character will speak first. Respond out loud — the simulation tracks tension on the red/yellow/green orb and ends when you de-escalate or hit a turn limit.
                </p>
              </div>
            </div>
          </div>
        )}

        {isConnecting && (
          <div className="text-center text-slate-600 max-w-md p-8 md:p-12 shrink-0 m-auto bg-white/70 backdrop-blur-md border border-white/80 rounded-[2rem] shadow-xl shadow-slate-200/50">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-inner rotate-3">
               <Loader2 className="h-10 w-10 text-indigo-500 animate-spin -rotate-3" />
            </div>
            <p className="mb-3 text-slate-800 font-extrabold text-xl md:text-2xl tracking-tight">Connecting...</p>
            <p className="text-sm md:text-base text-slate-600 font-medium">Entering simulation environment.</p>
          </div>
        )}

        {isConnected && (
          <div className="w-full flex md:flex-row flex-col items-center justify-center m-auto max-w-3xl border border-white/80 rounded-[2rem] md:rounded-[2.5rem] bg-white/50 backdrop-blur-md shadow-xl p-4 sm:p-6 md:p-12 gap-8 md:gap-16 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-[2.5rem] pointer-events-none"></div>
            <div className="flex flex-col items-center flex-1 relative z-10">
              <div className={`relative mb-8 md:mb-10 w-32 h-32 md:w-40 md:h-40 flex items-center justify-center transition-transform duration-500 hover:scale-105 ${isAiSpeaking ? 'scale-110' : 'scale-100'}`}>
                {/* Outer Glow */}
                <div className={`absolute inset-0 rounded-full blur-2xl opacity-50 transition-colors duration-1000 ${orbColor} ${isAiSpeaking ? 'animate-pulse' : ''}`}></div>
                
                {/* Secondary Ring */}
                <div className={`absolute inset-4 rounded-full blur-md opacity-80 transition-colors duration-1000 ${orbColor} ${isAiSpeaking ? 'animate-ping' : ''}`} style={{ animationDuration: '3s' }}></div>
                
                {/* Core */}
                <div className={`absolute inset-8 rounded-full shadow-[inset_0_0_20px_rgba(255,255,255,0.8)] backdrop-blur-sm border border-white/50 transition-colors duration-1000 ${orbCoreColor} flex items-center justify-center`}>
                   {isAiSpeaking && <div className="absolute inset-2 bg-white/40 rounded-full blur-sm animate-pulse"></div>}
                </div>
              </div>
              <div className="flex gap-3 bg-white/60 p-2.5 rounded-full shadow-inner border border-white/80 mt-4 md:mt-0">
                <span className={`h-3 w-3 rounded-full ${emotion === 'red' ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]' : 'bg-slate-300'} transition-all duration-500`}></span>
                <span className={`h-3 w-3 rounded-full ${emotion === 'yellow' ? 'bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.8)]' : 'bg-slate-300'} transition-all duration-500`}></span>
                <span className={`h-3 w-3 rounded-full ${emotion === 'green' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'bg-slate-300'} transition-all duration-500`}></span>
              </div>
              <p className="text-[10px] md:text-xs text-slate-500 mt-3 md:mt-4 uppercase tracking-widest font-extrabold">Tension Level</p>
            </div>
            
            <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left space-y-3 md:space-y-4">
              <div className="bg-indigo-100/50 text-indigo-700 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block mr-2 animate-pulse"></span>
                Live Simulation
              </div>
              <h3 className="text-slate-800 font-extrabold text-xl md:text-3xl tracking-tight">Speak naturally</h3>
              <p className="text-slate-600 text-[13px] md:text-base font-medium leading-relaxed max-w-sm">
                The AI is listening and will respond as the person in the scenario. Use persuasive, evidence-based language to de-escalate the tension.
              </p>
              <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-2" />
               <button
                 onClick={stopSession}
                 className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold transition-colors text-sm"
               >
                 <Square className="h-4 w-4 fill-current" /> End Early
               </button>
            </div>
          </div>
        )}

        {/* Live transcript shown during the call so the user sees what both sides said */}
        {isConnected && transcript.length > 0 && (
          <div className="w-full max-w-3xl m-auto mt-6 mb-2 bg-white/60 backdrop-blur-md border border-white/70 rounded-[2rem] shadow-lg shadow-slate-200/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-white/60 bg-white/40 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Live transcript</p>
            </div>
            <div className="max-h-64 overflow-y-auto px-5 py-4 space-y-3 scrollbar-hide">
              {transcript.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-500 text-white rounded-br-md font-medium shadow-sm'
                      : 'bg-white/80 text-slate-800 rounded-bl-md font-medium border border-white shadow-sm'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {report && (
          <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 mx-auto mt-4 md:mt-8 pb-10">
            <div className="glass-panel bg-white/70 backdrop-blur-xl border border-white/80 overflow-hidden shadow-2xl shadow-slate-200/50 rounded-[2.5rem]">
              <div className={`px-6 md:px-8 py-6 border-b flex items-center justify-between relative overflow-hidden ${report.success ? 'bg-gradient-to-r from-emerald-50/90 to-teal-50/90 border-emerald-100' : 'bg-gradient-to-r from-amber-50/90 to-orange-50/90 border-amber-100'}`}>
                {/* Decorative blob */}
                <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 ${report.success ? 'bg-emerald-200/40' : 'bg-amber-200/40'}`}></div>
                
                <div className="flex items-center gap-4 relative z-10">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${report.success ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                    {report.success ? (
                      <CheckCircle className="h-6 w-6 drop-shadow-sm" />
                    ) : (
                      <AlertCircle className="h-6 w-6 drop-shadow-sm" />
                    )}
                  </div>
                  <div>
                    <h3 className={`text-xl md:text-2xl font-extrabold tracking-tight ${report.success ? 'text-emerald-900' : 'text-amber-900'}`}>
                      {report.success ? 'Advocacy Successful' : 'Advocacy Needs Work'}
                    </h3>
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500 drop-shadow-sm">Simulation Complete</span>
                  </div>
                </div>
                <button 
                  onClick={() => window.location.reload()}
                  className="hidden md:flex items-center gap-2 bg-white/60 hover:bg-white text-slate-700 px-4 py-2 rounded-xl font-bold transition-all text-sm border border-white/80 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] relative z-10"
                >
                  <RefreshCw className="h-4 w-4" /> Try Again
                </button>
              </div>
              
              {metrics && (
                <div className="p-6 md:p-8 bg-slate-50/50 border-b border-white/60 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 relative">
                  <div className="bg-white/60 backdrop-blur-md p-4 text-center rounded-2xl border border-white shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                    <div className="text-2xl font-extrabold text-slate-800">{metrics.durationSeconds}s</div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-1">Duration</div>
                  </div>
                  <div className="bg-white/60 backdrop-blur-md p-4 text-center rounded-2xl border border-white shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)]">
                    <div className="text-2xl font-extrabold text-slate-800">{metrics.turns}</div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-1">Turns Taken</div>
                  </div>
                  <div className="bg-red-50/60 backdrop-blur-md p-4 text-center rounded-2xl border border-red-100 shadow-[0_2px_10px_-3px_rgba(239,68,68,0.1)]">
                    <div className="text-2xl font-extrabold text-red-600">{metrics.timeInRed}s</div>
                    <div className="text-[10px] uppercase font-bold text-red-500 tracking-widest mt-1">Time in Red</div>
                  </div>
                  <div className="bg-amber-50/60 backdrop-blur-md p-4 text-center rounded-2xl border border-amber-100 shadow-[0_2px_10px_-3px_rgba(245,158,11,0.1)]">
                    <div className="text-2xl font-extrabold text-amber-600">{metrics.regressions}</div>
                    <div className="text-[10px] uppercase font-bold text-amber-500 tracking-widest mt-1">Regressions</div>
                  </div>
                </div>
              )}

              <div className="p-6 md:p-8 grid grid-cols-3 gap-4 md:gap-6 border-b border-white/60">
                 <ScoreCard label="Empathy" score={report.empathyScore} />
                 <ScoreCard label="Evidence" score={report.evidenceScore} />
                 <ScoreCard label="Assertiveness" score={report.assertivenessScore} />
              </div>

              <div className="p-6 md:p-8 space-y-6 md:space-y-8 bg-white/30 backdrop-blur-sm">
                <div>
                  <h5 className="text-[11px] font-bold text-slate-500 flex items-center mb-3 uppercase tracking-widest">
                    <MessageSquare className="h-4 w-4 text-indigo-500 mr-2" /> Comprehensive Feedback
                  </h5>
                  <p className="text-sm md:text-base text-slate-800 leading-relaxed font-medium bg-white/50 p-5 md:p-6 rounded-2xl border border-white shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] backdrop-blur-sm">{safeString(report.feedback)}</p>
                </div>
                
                <div className="bg-gradient-to-br from-indigo-50/80 to-blue-50/80 backdrop-blur-md border border-indigo-100 p-5 md:p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(99,102,241,0.1)]">
                  <h5 className="text-[11px] font-bold text-indigo-700 flex items-center mb-3 uppercase tracking-widest">
                    <Lightbulb className="h-4 w-4 text-indigo-500 mr-2" /> Areas for Improvement
                  </h5>
                  <p className="text-sm md:text-base text-indigo-950 leading-relaxed font-semibold">{safeString(report.areasForImprovement)}</p>
                </div>
                
                <div className="flex md:hidden justify-center mt-6">
                  <button 
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-2 bg-white/60 hover:bg-white text-slate-700 px-6 py-3 rounded-xl font-bold transition-all text-sm border border-white/80 shadow-sm"
                  >
                    <RefreshCw className="h-4 w-4" /> Try Scenario Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      {!isConnected && !report && (
        <div className="mt-auto p-4 md:p-6 pb-6 lg:pb-8 z-10 flex justify-center bg-transparent shrink-0">
          <button
            onClick={startSession}
            disabled={isConnecting}
            className="w-full md:w-auto flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:shadow-none text-white px-8 py-4 rounded-full shadow-[0_0_40px_rgba(15,23,42,0.3)] hover:shadow-[0_0_60px_rgba(15,23,42,0.4)] disabled:opacity-50 transition-all font-bold text-lg group active:scale-95 relative overflow-hidden"
          >
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
             <div className="relative z-10 flex items-center gap-3">
              {isConnecting ? (
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              ) : (
                <Mic className="h-6 w-6 text-white group-hover:scale-110 transition-transform" />
              )}
              {isConnecting ? 'Initializing...' : 'Start Voice Chat'}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
