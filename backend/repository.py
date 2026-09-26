import sqlite3
from typing import List, Optional
from models import User, UserSettings, UnitPreference, Workout, ExerciseSession, Set, SetStatus

class IWorkoutRepository:
    def save_set(self, set_obj: Set) -> bool:
        raise NotImplementedError
    
    def get_workout_history(self, user_id: str) -> List[Workout]:
        raise NotImplementedError

class SQLiteWorkoutRepository(IWorkoutRepository):
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    unit_preference TEXT NOT NULL,
                    voice_wake_word_enabled INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS workouts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                );
                CREATE TABLE IF NOT EXISTS exercise_sessions (
                    id TEXT PRIMARY KEY,
                    workout_id TEXT NOT NULL,
                    exercise_id TEXT NOT NULL,
                    target_weight REAL NOT NULL,
                    target_reps INTEGER NOT NULL,
                    FOREIGN KEY (workout_id) REFERENCES workouts (id)
                );
                CREATE TABLE IF NOT EXISTS sets (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    weight REAL NOT NULL,
                    reps INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    recorded_at TEXT NOT NULL,
                    raw_transcript TEXT,
                    FOREIGN KEY (session_id) REFERENCES exercise_sessions (id)
                );
            ''')

    def save_user(self, user: User):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO users (id, username, unit_preference, voice_wake_word_enabled) VALUES (?, ?, ?, ?)",
                (user.id, user.username, user.settings.unit_preference.value, int(user.settings.voice_wake_word_enabled))
            )

    def save_workout(self, workout: Workout):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO workouts (id, user_id, name, timestamp) VALUES (?, ?, ?, ?)",
                (workout.id, workout.user_id, workout.name, workout.timestamp)
            )

    def save_exercise_session(self, session: ExerciseSession, workout_id: str):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO exercise_sessions (id, workout_id, exercise_id, target_weight, target_reps) VALUES (?, ?, ?, ?, ?)",
                (session.id, workout_id, session.exercise_id, session.target_weight, session.target_reps)
            )

    def save_set(self, set_obj: Set) -> bool:
        if not set_obj.session_id:
            return False
        try:
            with self._get_connection() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO sets (id, session_id, weight, reps, status, recorded_at, raw_transcript) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (set_obj.id, set_obj.session_id, set_obj.weight, set_obj.reps, set_obj.status.value, set_obj.recorded_at, set_obj.raw_transcript)
                )
            return True
        except Exception as e:
            print(f"Error saving set: {e}")
            return False

    def get_workout_history(self, user_id: str) -> List[Workout]:
        workouts = []
        with self._get_connection() as conn:
            workout_rows = conn.execute("SELECT * FROM workouts WHERE user_id = ? ORDER BY timestamp DESC", (user_id,)).fetchall()
            
            for w_row in workout_rows:
                workout = Workout(
                    id=w_row['id'],
                    user_id=w_row['user_id'],
                    name=w_row['name'],
                    timestamp=w_row['timestamp'],
                    exercises=[]
                )
                
                session_rows = conn.execute("SELECT * FROM exercise_sessions WHERE workout_id = ?", (workout.id,)).fetchall()
                for s_row in session_rows:
                    session = ExerciseSession(
                        id=s_row['id'],
                        exercise_id=s_row['exercise_id'],
                        target_weight=s_row['target_weight'],
                        target_reps=s_row['target_reps'],
                        sets=[]
                    )
                    
                    set_rows = conn.execute("SELECT * FROM sets WHERE session_id = ?", (session.id,)).fetchall()
                    for set_row in set_rows:
                        set_obj = Set(
                            id=set_row['id'],
                            weight=set_row['weight'],
                            reps=set_row['reps'],
                            status=SetStatus(set_row['status']),
                            recorded_at=set_row['recorded_at'],
                            raw_transcript=set_row['raw_transcript'],
                            session_id=set_row['session_id']
                        )
                        session.sets.append(set_obj)
                    
                    workout.exercises.append(session)
                
                workouts.append(workout)
        
        return workouts
