import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { WorkoutSetupScreen } from './src/screens/WorkoutSetupScreen';
import { ActiveSessionScreen } from './src/screens/ActiveSessionScreen';
import { WorkoutHistoryScreen } from './src/screens/WorkoutHistoryScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Setup">
        <Stack.Screen name="Setup" component={WorkoutSetupScreen} options={{ title: 'Fitness Setup' }} />
        <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} options={{ title: 'Workout in Progress' }} />
        <Stack.Screen name="History" component={WorkoutHistoryScreen} options={{ title: 'Your Progress' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
