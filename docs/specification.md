# Product Requirements Document: Voice Fitness App

> Historical draft. The current personal iPhone PWA MVP, including online voice recognition, is defined in [mvp-design.md](mvp-design.md). Requirements below are retained for reference and do not override that design.

## 1. Overview
The Voice Fitness App is a cross-platform mobile application designed to minimize manual data entry during strength training. Users configure their workout parameters and use voice commands to log completed sets, allowing them to maintain focus on their workout and minimize phone interaction.

## 2. Target Audience
- Strength trainees, bodybuilders, and powerlifters.
- Users who find manual logging tedious during high-intensity sessions.
- Users with accessibility needs who prefer voice interaction.

## 3. Core User Stories
### 3.1 Workout Setup
- **As a user**, I want to select or create a workout template so I don't have to enter exercises every time.
- **As a user**, I want to define the target weight and reps for my current set so the app knows what to expect.

### 3.2 Voice Logging
- **As a user**, I want to trigger a voice recording after a set (e.g., via a button or wake-word) and say "10 reps" or "12 reps at 100kg" to log the result.
- **As a user**, I want the app to automatically detect if I completed the target or failed, based on my voice input.
- **As a user**, I want immediate audio or visual confirmation that my set was recorded correctly.

### 3.3 Review and Correction
- **As a user**, I want to see a history of my sets in real-time so I can verify the voice-to-data conversion.
- **As a user**, I want to manually edit a set if the voice recognition misinterpreted my input.

## 4. Functional Requirements
### 4.1 Voice-to-Data Pipeline
- **Audio Capture**: Low-latency recording of short voice clips.
- **Speech-to-Text (STT)**: Conversion of audio to raw text.
- **Intent Parsing**: Extraction of `reps` and `weight` from raw text.
- **Validation**: Cross-referencing parsed data with the current exercise context.

### 4.2 Data Management
- **Workout Tracking**: Ability to store and track multiple exercises per session.
- **Historical Logs**: Storage of past workouts for progress tracking.
- **Local Storage**: Full offline capability for gym environments.

## 5. Non-Functional Requirements
- **Latency**: Voice-to-record time should be < 2 seconds.
- **Privacy**: Voice data should ideally be processed on-device to ensure privacy and offline availability.
- **Cross-platform**: Consistent behavior on both iOS and Android.
- **Modularity**: The Voice-to-Data logic must be decoupled from the UI for independent testing (Harness-driven development).

## 6. Constraints
- Must operate in noisy gym environments (requires noise cancellation or robust STT).
- Must handle varying voice accents and terminology (e.g., "reps", "hits", "done").
