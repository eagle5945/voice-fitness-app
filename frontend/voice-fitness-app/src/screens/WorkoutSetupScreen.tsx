import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { globalStyles, COLORS } from '../styles/theme';
import { ExerciseSession } from '../types';

const MOCK_TEMPLATES = [
  { id: 't1', name: 'Push Day', exercises: ['Bench Press', 'Overhead Press', 'Triceps Extension'] },
  { id: 't2', name: 'Pull Day', exercises: ['Deadlift', 'Pull Ups', 'Bicep Curls'] },
];

export const WorkoutSetupScreen = ({ navigation }: any) => {
  const [templateId, setTemplateId] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [targetReps, setTargetReps] = useState('');

  const handleStartWorkout = () => {
    const session: ExerciseSession = {
      id: Math.random().toString(),
      exercise_id: 'ex1',
      exercise_name: exerciseName || 'General Exercise',
      target_weight: parseFloat(targetWeight) || 0,
      target_reps: parseInt(targetReps) || 0,
      sets: [],
    };
    navigation.navigate('ActiveSession', { session });
  };

  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>Workout Setup</Text>
      
      <Text style={styles.label}>Select Template</Text>
      <FlatList
        data={MOCK_TEMPLATES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.templateItem, templateId === item.id && styles.templateSelected]} 
            onPress={() => setTemplateId(item.id)}
          >
            <Text style={[styles.templateText, templateId === item.id && styles.textWhite]}>{item.name}</Text>
          </TouchableOpacity>
        )}
        style={styles.templateList}
      />

      <View style={globalStyles.card}>
        <Text style={styles.label}>Current Exercise</Text>
        <TextInput 
          style={globalStyles.input} 
          placeholder="e.g. Bench Press" 
          value={exerciseName} 
          onChangeText={setExerciseName} 
        />
        
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.label}>Target Weight (kg)</Text>
            <TextInput 
              style={globalStyles.input} 
              keyboardType="numeric" 
              placeholder="100" 
              value={targetWeight} 
              onChangeText={setTargetWeight} 
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Target Reps</Text>
            <TextInput 
              style={globalStyles.input} 
              keyboardType="numeric" 
              placeholder="10" 
              value={targetReps} 
              onChangeText={setTargetReps} 
            />
          </View>
        </View>
      </View>

      <TouchableOpacity style={globalStyles.button} onPress={handleStartWorkout}>
        <Text style={globalStyles.buttonText}>Start Session</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 8,
    fontWeight: '500',
  },
  templateList: {
    marginBottom: 20,
  },
  templateItem: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  templateSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  templateText: {
    fontSize: 16,
    color: COLORS.text,
  },
  textWhite: {
    color: '#FFF',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
