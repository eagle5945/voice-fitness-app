from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum

class UnitPreference(Enum):
    KG = "kg"
    LBS = "lbs"

class SetStatus(Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"

@dataclass
class UserSettings:
    unit_preference: UnitPreference
    voice_wake_word_enabled: bool

@dataclass
class User:
    id: str
    username: str
    settings: UserSettings

@dataclass
class Set:
    id: str
    weight: float
    reps: int
    status: SetStatus
    recorded_at: str
    raw_transcript: str
    session_id: Optional[str] = None

@dataclass
class ExerciseSession:
    id: str
    exercise_id: str
    target_weight: float
    target_reps: int
    sets: List[Set] = field(default_factory=list)
    workout_id: Optional[str] = None

@dataclass
class Workout:
    id: str
    user_id: str
    name: str
    timestamp: str
    exercises: List[ExerciseSession] = field(default_factory=list)
