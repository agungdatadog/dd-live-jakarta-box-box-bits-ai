import { create } from 'zustand';
import charactersData from '@/data/characters.json';

export type Character = typeof charactersData[0];

interface DreamTeamState {
  selectedPrincipal: Character | null;
  selectedDriver: Character | null;
  selectedDriver2: Character | null;
  selectedEngineer: Character | null;
  selectedEngineer2: Character | null;
  selectedStrategy: Character | null;
  selectedTechDirector: Character | null;
  setPrincipal: (character: Character) => void;
  setDriver: (character: Character) => void;
  setDriver2: (character: Character) => void;
  setEngineer: (character: Character) => void;
  setEngineer2: (character: Character) => void;
  setStrategy: (character: Character) => void;
  setTechDirector: (character: Character) => void;
  reset: () => void;
}

export const useDreamTeamStore = create<DreamTeamState>((set) => ({
  selectedPrincipal: null,
  selectedDriver: null,
  selectedDriver2: null,
  selectedEngineer: null,
  selectedEngineer2: null,
  selectedStrategy: null,
  selectedTechDirector: null,
  setPrincipal: (character) => set({ selectedPrincipal: character }),
  setDriver: (character) => set({ selectedDriver: character }),
  setDriver2: (character) => set({ selectedDriver2: character }),
  setEngineer: (character) => set({ selectedEngineer: character }),
  setEngineer2: (character) => set({ selectedEngineer2: character }),
  setStrategy: (character) => set({ selectedStrategy: character }),
  setTechDirector: (character) => set({ selectedTechDirector: character }),
  reset: () => set({ 
    selectedPrincipal: null, 
    selectedDriver: null, 
    selectedDriver2: null,
    selectedEngineer: null,
    selectedEngineer2: null,
    selectedStrategy: null,
    selectedTechDirector: null
  }),
}));
