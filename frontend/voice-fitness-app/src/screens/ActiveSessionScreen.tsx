import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { globalStyles, COLORS } from '../styles/theme';
import { ExerciseSession, Set } from '../types';
import { MockVoiceService, MockWorkoutRepository } from '../services/mockServices';

export const ActiveSessionScreen = ({ route, navigation }: any) => {
  const { session: initialSession } = route.params;
  const [session, setSession] = useState<ExerciseSession>(initialSession);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRecordPress = async () => {
    if (isRecording) {
      setIsRecording(false);
      startProcessing();
    } else {
      setIsRecording(true);
      // In a real app, start audio capture here
    }
  };

  const startProcessing = async () => {
    setIsProcessing(true);
    try {
      // Mock audio blob
      const dummyAudio = new Blob([]); 
      const result = await MockVoiceService.processVoiceInput(dummyAudio, session);
      
      if (result.success && result.parsedSet) {
        const newSet = result.parsedSet;
        await MockWorkoutRepository.saveSet(newSet);
        
        setSession(prev => ({
          ...prev,
          sets: [...prev.sets, newSet]
        }));
        
        // Visual confirmation (User Story 3.2)
        Alert.alert('Recorded!', `Logged ${newSet.reps} reps at ${newSet.weight}kg`);
      } else {
        Alert.alert('Error', result.error || 'Could not parse voice input');
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditSet = (setIndex: number) => {
    // Simplified: Just prompts for new reps
    Alert.prompt('Edit Set', 'Enter corrected reps:', (text) => {
      const updatedSets = [...session.sets];
      updatedSets[setIndex] = { 
        ...updatedSets[setIndex], 
        reps: parseInt(text) || updatedSets[setIndex].reps 
      };
      setSession({ ...session, sets: updatedSets });
    });
  };

  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>{session.exercise_name}</Text>
      
      <View style={[globalStyles.card, styles.targetCard]}>
        <Text style={styles.targetLabel}>TARGET</Text>
        <Text style={styles.targetValue}>
          {session.target_weight}kg  ×  {session.target_reps} reps
        </Text>
      </View>

      <View style={styles.recordContainer}>
        <TouchableOpacity 
          style={[globalStyles.button, styles.recordButton, isRecording && styles.recordingActive]} 
          onPress={handleRecordPress}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={globalStyles.buttonText}>
              {isRecording ? 'Stop & Log' : 'Hold to Record'}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.hintText}>
          {isRecording ? 'Listening...' : 'Say "12 reps" or "10 reps at 100kg"'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Today's Sets</Text>
      <FlatList
        data={session.sets}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={globalStyles.card}>
            <View style={styles.setRow}>
              <View>
                <Text style={styles.setDetail}>
                  Set {index + 1}: {item.reps} reps @ {item.weight}kg
                </Text>
                <Text style={styles.transcript}>"{item.raw_transcript}"</Text>
              </View>
              <TouchableOpacity onPress={() => handleEditSet(index)}>
                <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      
      <TouchableOpacity 
        style={[globalStyles.button, { marginTop: 20, backgroundColor: COLORS.secondary }]} 
        onPress={() => navigation.navigate('History')}
      >
        <Text style={globalStyles.buttonText}>Finish & Save</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  targetCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: 30,
  },
  targetLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: 'bold',
  },
  targetValue: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  recordContainer: {
    alignItems: 'center',
    marginVertical: 40,
  },
  recordButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    fontSize: 20,
  },
  recordingActive: {
    backgroundColor: COLORS.error,
    transform: [{ scale: 1.1 }],
  },
  hintText: {
    marginTop: 15,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: COLORS.text,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setDetail: {
    fontSize: 18,
    fontWeight: '600',
  },
  transcript: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 4,
  },
});
