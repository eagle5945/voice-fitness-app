export type UnitPreference = 'kg' | 'lbs';

export interface User {
  id: string;
  username: string;
  settings: {
    unit_preference: UnitPreference;
    voice_wake_word_enabled: boolean;
  };
}

export interface Set {
  id: string;
  weight: number;
  reps: number;
  status: 'success' | 'failure' | 'partial';
  recorded_at: string;
  raw_transcript: string;
}

export interface ExerciseSession {
  id: string;
  exercise_id: string;
  exercise_name: string;
  target_weight: number;
  target_reps: number;
  sets: Set[];
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  timestamp: string;
  exercises: ExerciseSession[];
}
