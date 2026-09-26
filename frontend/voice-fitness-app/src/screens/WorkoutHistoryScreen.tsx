import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { globalStyles, COLORS } from '../styles/theme';
import { Workout } from '../types';
import { MockWorkoutRepository } from '../services/mockServices';

export const WorkoutHistoryScreen = () => {
  const [history, setHistory] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const data = await MockWorkoutRepository.getWorkoutHistory('user-123');
      setHistory(data);
      setLoading(false);
    };
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <View style={globalStyles.container}>
        <Text style={{ textAlign: 'center', marginTop: 50 }}>Loading history...</Text>
      </View>
    );
  }

  return (
    <View style={globalStyles.container}>
      <Text style={globalStyles.title}>Workout History</Text>
      
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={globalStyles.card}>
            <View style={styles.header}>
              <Text style={styles.workoutName}>{item.name}</Text>
              <Text style={styles.date}>{new Date(item.timestamp).toLocaleDateString()}</Text>
            </View>
            
            {item.exercises.map((ex, idx) => (
              <View key={idx} style={styles.exerciseRow}>
                <Text style={styles.exerciseText}>{ex.exercise_name}</Text>
                <Text style={styles.setsText}>{ex.sets.length} sets</Text>
              </View>
            ))}
          </View>
        )}
      />
      
      <TouchableOpacity 
        style={[globalStyles.button, { marginTop: 20 }]} 
        onPress={() => {}} // Navigate back to setup
      >
        <Text style={globalStyles.buttonText}>Start New Workout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 8,
  },
  workoutName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  date: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  exerciseText: {
    fontSize: 16,
    color: COLORS.text,
  },
  setsText: {
    fontSize: 16,
    color: COLORS.textLight,
    fontWeight: '500',
  },
});
