import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Recipe } from '../types';
import { mockRecipes } from '../services/mockDataService';

interface RecipesContextType {
  recipes: Recipe[];
  favorites: number[];
  addFavorite: (recipeId: number) => void;
  removeFavorite: (recipeId: number) => void;
  isFavorite: (recipeId: number) => boolean;
  getRecipeById: (id: number) => Recipe | undefined;
  getFilteredRecipes: (sortBy?: 'match' | 'time' | 'name') => Recipe[];
}

const RecipesContext = createContext<RecipesContextType | undefined>(undefined);

export function RecipesProvider({ children }: { children: ReactNode }) {
  const [recipes] = useState<Recipe[]>(mockRecipes);
  const [favorites, setFavorites] = useState<number[]>([]);

  const addFavorite = useCallback((recipeId: number) => {
    setFavorites(prev => [...prev, recipeId]);
  }, []);

  const removeFavorite = useCallback((recipeId: number) => {
    setFavorites(prev => prev.filter(id => id !== recipeId));
  }, []);

  const isFavorite = useCallback((recipeId: number) => {
    return favorites.includes(recipeId);
  }, [favorites]);

  const getRecipeById = useCallback((id: number) => {
    return recipes.find(recipe => recipe.id === id);
  }, [recipes]);

  const getFilteredRecipes = useCallback((sortBy: 'match' | 'time' | 'name' = 'match') => {
    const sorted = [...recipes];
    
    switch (sortBy) {
      case 'match':
        sorted.sort((a, b) => b.matchScore - a.matchScore);
        break;
      case 'time':
        sorted.sort((a, b) => {
          const timeA = parseInt(a.time.replace(/\D/g, '')) || 0;
          const timeB = parseInt(b.time.replace(/\D/g, '')) || 0;
          return timeA - timeB;
        });
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    
    return sorted;
  }, [recipes]);

  const value: RecipesContextType = {
    recipes,
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    getRecipeById,
    getFilteredRecipes,
  };

  return <RecipesContext.Provider value={value}>{children}</RecipesContext.Provider>;
}

export function useRecipes() {
  const context = useContext(RecipesContext);
  if (context === undefined) {
    throw new Error('useRecipes must be used within a RecipesProvider');
  }
  return context;
}

