import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TeamsState {
  enabled: boolean;
  webhookUrl: string;
  recipients: string[];
  systemLink: string;
  setEnabled: (v: boolean) => void;
  setWebhookUrl: (v: string) => void;
  setRecipients: (v: string[]) => void;
  setSystemLink: (v: string) => void;
}

export const useTeamsStore = create<TeamsState>()(
  persist(
    (set) => ({
      enabled: false,
      webhookUrl: '',
      recipients: [],
      systemLink: '',
      setEnabled: (v) => set({ enabled: v }),
      setWebhookUrl: (v) => set({ webhookUrl: v }),
      setRecipients: (v) => set({ recipients: v }),
      setSystemLink: (v) => set({ systemLink: v }),
    }),
    { name: 'vsms-teams-settings' }
  )
);