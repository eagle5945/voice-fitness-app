import { Set, ExerciseSession, Workout } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export const ApiVoiceService = {
  processVoiceInput: async (audioData: Blob, context: ExerciseSession): Promise<{
    success: boolean;
    parsedSet?: Partial<Set>;
    error?: string;
  }> => {
    try {
      // In a real scenario, we would send the audio blob. 
      // For this integration, we simulate the STT layer sending text to the backend.
      // Since we don't have a real microphone in this environment, we'll mock the transcript.
      const mockTranscript = "I did 12 reps"; 

      const response = await fetch(`${API_BASE_URL}/process-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: mockTranscript,
          target_reps: context.target_reps,
          target_weight: context.target_weight,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: err };
      }

      const data = await response.json();
      return {
        success: true,
        parsedSet: {
          reps: data.reps,
          weight: data.weight,
          status: data.status,
        },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
};

export const ApiWorkoutRepository = {
  saveSet: async (set: Set & { session_id: string }): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/save-set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(set),
      });
      return response.ok;
    } catch (e) {
      console.error('Error saving set:', e);
      return false;
    }
  },

  getWorkoutHistory: async (userId: string): Promise<Workout[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/history/${userId}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      console.error('Error fetching history:', e);
      return [];
    }
  },
};
