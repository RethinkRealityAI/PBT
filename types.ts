export interface Resource {
  id: string;
  title: string;
  description: string;
  category: 'Clinical' | 'Advocacy' | 'Patient Education' | 'Bias Training';
  link: string;
  icon?: string;
}

export interface StatData {
  label: string;
  value: number;
  comparisonValue?: number;
  description: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  clinicalContext: string;
  biasChallenge: string; // The specific bias to overcome (e.g., drug seeking labeling)
  goals: string[];
}

export interface SimulationMessage {
  role: 'user' | 'ai';
  text: string;
  feedback?: {
    empathyScore: number;
    evidenceScore: number;
    assertivenessScore: number;
    critique: string;
    betterAlternative: string;
  };
}

export enum AppView {
  HOME = 'HOME',
  SIMULATOR = 'SIMULATOR',
  RESOURCES = 'RESOURCES',
  DATA = 'DATA'
}