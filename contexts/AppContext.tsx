import React, { ReactNode } from 'react';
import { PantryProvider } from './PantryContext';
import { GroceryProvider } from './GroceryContext';
import { RecipesProvider } from './RecipesContext';
import { MealScheduleProvider } from './MealScheduleContext';

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <PantryProvider>
      <GroceryProvider>
        <RecipesProvider>
          <MealScheduleProvider>
            {children}
          </MealScheduleProvider>
        </RecipesProvider>
      </GroceryProvider>
    </PantryProvider>
  );
}

