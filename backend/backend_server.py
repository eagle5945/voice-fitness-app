import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from voice_processor import VoiceProcessor
from repository import SQLiteWorkoutRepository
from models import Set, SetStatus, Workout, ExerciseSession, User, UserSettings, UnitPreference

app = FastAPI(title="Voice Fitness App Backend")

# Initialize components
processor = VoiceProcessor()
repo = SQLiteWorkoutRepository("fitness_app.db")

# Pydantic models for API requests/responses
class VoiceInputRequest(BaseModel):
    text: str
    target_reps: int
    target_weight: float

class SetRequest(BaseModel):
    id: str
    session_id: str
    weight: float
    reps: int
    status: str
    recorded_at: str
    raw_transcript: str

class WorkoutRequest(BaseModel):
    id: str
    user_id: str
    name: str
    timestamp: str

class SessionRequest(BaseModel):
    id: str
    workout_id: str
    exercise_id: str
    target_weight: float
    target_reps: int

class SetResponse(BaseModel):
    reps: int
    weight: float
    status: str

@app.post("/process-voice", response_model=SetResponse)
async def process_voice(request: VoiceInputRequest):
    context = {
        "target_reps": request.target_reps,
        "target_weight": request.target_weight
    }
    result = processor.process_voice_input(request.text, context)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    parsed_set = result["parsed_set"]
    return SetResponse(
        reps=parsed_set["reps"],
        weight=parsed_set["weight"],
        status=parsed_set["status"]
    )

@app.post("/save-set")
async def save_set(req: SetRequest):
    set_obj = Set(
        id=req.id,
        weight=req.weight,
        reps=req.reps,
        status=SetStatus(req.status),
        recorded_at=req.recorded_at,
        raw_transcript=req.raw_transcript,
        session_id=req.session_id
    )
    success = repo.save_set(set_obj)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save set to database")
    return {"success": True}

@app.post("/create-workout")
async def create_workout(req: WorkoutRequest):
    workout = Workout(
        id=req.id,
        user_id=req.user_id,
        name=req.name,
        timestamp=req.timestamp
    )
    repo.save_workout(workout)
    return {"success": True}

@app.post("/create-session")
async def create_session(req: SessionRequest):
    session = ExerciseSession(
        id=req.id,
        exercise_id=req.exercise_id,
        target_weight=req.target_weight,
        target_reps=req.target_reps
    )
    repo.save_exercise_session(session, req.workout_id)
    return {"success": True}

@app.get("/history/{user_id}")
async def get_history(user_id: str):
    history = repo.get_workout_history(user_id)
    
    result = []
    for w in history:
        workout_dict = {
            "id": w.id,
            "user_id": w.user_id,
            "name": w.name,
            "timestamp": w.timestamp,
            "exercises": [
                {
                    "id": s.id,
                    "exercise_id": s.exercise_id,
                    "target_weight": s.target_weight,
                    "target_reps": s.target_reps,
                    "sets": [
                        {
                            "id": st.id,
                            "weight": st.weight,
                            "reps": st.reps,
                            "status": st.status.value,
                            "recorded_at": st.recorded_at,
                            "raw_transcript": st.raw_transcript
                        } for st in s.sets
                    ]
                } for s in w.exercises
            ]
        }
        result.append(workout_dict)
    
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
