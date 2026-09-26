import { Set, ExerciseSession, Workout } from '../types';

export const MockVoiceService = {
  processVoiceInput: async (audioData: Blob, context: ExerciseSession): Promise<{
    success: boolean;
    parsedSet?: Set;
    error?: string;
  }> => {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Mock logic: simulate a successful parse
    return {
      success: true,
      parsedSet: {
        id: Math.random().toString(36).substr(2, 9),
        weight: context.target_weight,
        reps: context.target_reps, // In a real app, this would come from audioData
        status: 'success',
        recorded_at: new Date().toISOString(),
        raw_transcript: "I did 12 reps",
      }
    };
  },
};

export const MockWorkoutRepository = {
  saveSet: async (set: Set): Promise<boolean> => {
    console.log('Saving set to SQLite:', set);
    return true;
  },
  getWorkoutHistory: async (userId: string): Promise<Workout[]> => {
    return [
      {
        id: 'w1',
        user_id: userId,
        name: 'Push Day',
        timestamp: '2023-10-01T10:00:00Z',
        exercises: [
          {
            id: 'e1',
            exercise_id: 'ex1',
            exercise_name: 'Bench Press',
            target_weight: 100,
            target_reps: 10,
            sets: [
              { id: 's1', weight: 100, reps: 10, status: 'success', recorded_at: '...', raw_transcript: '10 reps' },
              { id: 's2', weight: 100, reps: 8, status: 'failure', recorded_at: '...', raw_transcript: 'only 8' },
            ]
          }
        ]
      }
    ];
  }
};
