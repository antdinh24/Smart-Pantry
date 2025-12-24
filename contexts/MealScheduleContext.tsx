import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { MealSchedule, Meal, DayOfWeek } from '../types';
import { getMockMealSchedules } from '../services/mockDataService';

interface MealScheduleContextType {
  schedules: MealSchedule[];
  addMeal: (day: string, meal: Omit<Meal, 'id'>) => void;
  removeMeal: (day: string, mealId: number) => void;
  updateMeal: (day: string, mealId: number, updates: Partial<Meal>) => void;
  getMealsForDay: (day: string) => Meal[];
}

const MealScheduleContext = createContext<MealScheduleContextType | undefined>(undefined);

export function MealScheduleProvider({ children }: { children: ReactNode }) {
  const [schedules, setSchedules] = useState<MealSchedule[]>(getMockMealSchedules());

  const addMeal = useCallback((day: string, meal: Omit<Meal, 'id'>) => {
    setSchedules(prev => prev.map(schedule => {
      if (schedule.day === day) {
        const newId = Math.max(...schedule.meals.map(m => m.id), 0) + 1;
        return {
          ...schedule,
          meals: [...schedule.meals, { ...meal, id: newId }],
        };
      }
      return schedule;
    }));
  }, []);

  const removeMeal = useCallback((day: string, mealId: number) => {
    setSchedules(prev => prev.map(schedule => {
      if (schedule.day === day) {
        return {
          ...schedule,
          meals: schedule.meals.filter(meal => meal.id !== mealId),
        };
      }
      return schedule;
    }));
  }, []);

  const updateMeal = useCallback((day: string, mealId: number, updates: Partial<Meal>) => {
    setSchedules(prev => prev.map(schedule => {
      if (schedule.day === day) {
        return {
          ...schedule,
          meals: schedule.meals.map(meal => 
            meal.id === mealId ? { ...meal, ...updates } : meal
          ),
        };
      }
      return schedule;
    }));
  }, []);

  const getMealsForDay = useCallback((day: string) => {
    const schedule = schedules.find(s => s.day === day);
    return schedule?.meals || [];
  }, [schedules]);

  const value: MealScheduleContextType = {
    schedules,
    addMeal,
    removeMeal,
    updateMeal,
    getMealsForDay,
  };

  return <MealScheduleContext.Provider value={value}>{children}</MealScheduleContext.Provider>;
}

export function useMealSchedule() {
  const context = useContext(MealScheduleContext);
  if (context === undefined) {
    throw new Error('useMealSchedule must be used within a MealScheduleProvider');
  }
  return context;
}

