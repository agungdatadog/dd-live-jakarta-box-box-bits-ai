import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

interface UserState {
  userId: string;
  username: string;
  hasSetName: boolean;
  setUsername: (name: string) => void;
  initialize: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  userId: '',
  username: 'GuestDoggo',
  hasSetName: false,
  setUsername: (name: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('username', name);
    }
    set({ username: name, hasSetName: true });
  },
  initialize: () => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('usr_id');
      if (!id) {
        id = uuidv4();
        localStorage.setItem('usr_id', id);
      }
      const storedName = localStorage.getItem('username');
      set({
        userId: id,
        username: storedName || 'GuestDoggo',
        hasSetName: !!storedName,
      });
    }
  },
}));
