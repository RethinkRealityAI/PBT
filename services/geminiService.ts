import { GoogleGenAI, Type } from "@google/genai";
import { Scenario, SimulationMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System instruction for the "Mentor" persona
const SYSTEM_INSTRUCTION = `
You are an expert Medical Advocacy Mentor specializing in Sickle Cell Disease (SCD) care and health equity.
Your goal is to help healthcare providers practice advocating for SCD patients in difficult clinical scenarios where implicit bias or lack of knowledge is present.

When the user submits a response to a scenario:
1. Analyze their response for:
   - Empathy: Did they validate the patient's pain/experience?
   - Evidence-Based Practice: Did they cite guidelines (e.g., ASH guidelines) or appropriate protocols?
   - Assertiveness: Did they professionally challenge bias or delay in care?
2. Provide a structured critique.
3. Suggest a specific, better phrasing they could use next time.
4. Keep the tone constructive, professional, and encouraging.

Do not roleplay the patient unless asked. Instead, act as the supervisor/mentor grading the interaction.
`;

export const generateRoleplayMessage = async (
  scenario: Scenario,
  chatHistory: SimulationMessage[],
  userMessage?: string
): Promise<SimulationMessage> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    let instructions = `
You are acting as the colleague or patient in a Sickle Cell Disease (SCD) clinical advocacy simulation.
The user is a healthcare provider practicing their advocacy skills.

SCENARIO CONTEXT:
${scenario.clinicalContext}

THE SITUATION:
${scenario.description}

YOUR ROLE:
Act as the person the user needs to advocate to.
Respond naturally to the user's advocacy attempts.
If they are empathetic, evidence-based, and assertive, you can gradually concede or agree.
If they are passive or aggressive, you might remain dismissive or defensive.
Keep your responses relatively brief, conversational, and realistic.

CRITICAL INSTRUCTIONS:
- Do not grade them here. Just roleplay.
`;

    if (chatHistory.length === 0 && !userMessage) {
        instructions += `\nSTART THE CONVERSATION: You must speak first. Deliver a 1-2 sentence opening statement in character that sets up the conflict (e.g., "I don't think he needs this medication, he might be drug seeking.").`;
    }

    const contents = chatHistory.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));

    if (userMessage) {
        contents.push({ role: 'user', parts: [{ text: userMessage }] });
    }

    if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Please begin the simulation.' }] });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-preview",
      contents: contents,
      config: {
        systemInstruction: instructions,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return { role: 'ai', text };
  } catch (error) {
     console.error(error);
     return { role: 'ai', text: "Error connecting to AI." };
  }
};

export const evaluateAdvocacyResponse = async (
  scenario: Scenario,
  userResponse: string
): Promise<SimulationMessage['feedback']> => {
  try {
    const prompt = `
      SCENARIO CONTEXT:
      ${scenario.clinicalContext}

      BIAS CHALLENGE:
      ${scenario.biasChallenge}

      USER'S ADVOCACY RESPONSE:
      "${userResponse}"

      Evaluate this response. Return JSON only.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            empathyScore: { type: Type.INTEGER, description: "Score from 1-10" },
            evidenceScore: { type: Type.INTEGER, description: "Score from 1-10" },
            assertivenessScore: { type: Type.INTEGER, description: "Score from 1-10" },
            critique: { type: Type.STRING, description: "Brief analysis of what went well and what didn't." },
            betterAlternative: { type: Type.STRING, description: "A highly effective script the user could have said instead." },
          },
          required: ["empathyScore", "evidenceScore", "assertivenessScore", "critique", "betterAlternative"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text);
  } catch (error) {
    console.error("Error evaluating advocacy:", error);
    // Fallback in case of error
    return {
      empathyScore: 0,
      evidenceScore: 0,
      assertivenessScore: 0,
      critique: "Unable to process AI feedback at this time. Please try again.",
      betterAlternative: "N/A"
    };
  }
};