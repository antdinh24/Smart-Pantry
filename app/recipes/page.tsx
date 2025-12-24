"use client"

import { ArrowLeft, Sparkles, Clock, Users, ChefHat } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const recipes = [
  {
    id: 1,
    name: "Creamy Chicken Pasta",
    time: "30 min",
    servings: 4,
    ingredients: 12,
    matchScore: 95,
  },
  {
    id: 2,
    name: "Greek Salad Bowl",
    time: "15 min",
    servings: 2,
    ingredients: 8,
    matchScore: 90,
  },
  {
    id: 3,
    name: "Tomato Basil Soup",
    time: "25 min",
    servings: 4,
    ingredients: 10,
    matchScore: 85,
  },
]

export default function RecipesPage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="flex-1 text-xl font-bold text-foreground">AI Recipes</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {/* AI Generate Card */}
        <Card className="mb-6 bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Generate New Recipe</h2>
              <p className="text-sm opacity-90">Based on your pantry items</p>
            </div>
          </div>
          <Button variant="secondary" className="w-full">
            <Sparkles className="mr-2 h-4 w-4" />
            Create Recipe with AI
          </Button>
        </Card>

        {/* Suggested Recipes */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Suggested for You</h2>
          <p className="text-sm text-muted-foreground">Based on available ingredients</p>
        </div>

        <div className="space-y-4">
          {recipes.map((recipe) => (
            <Card key={recipe.id} className="overflow-hidden">
              {/* Recipe Image Placeholder */}
              <div className="relative h-40 bg-gradient-to-br from-primary/20 to-primary/5">
                <div className="absolute inset-0 flex items-center justify-center">
                  <ChefHat className="h-16 w-16 text-primary/30" />
                </div>
                {/* Match Score Badge */}
                <div className="absolute right-3 top-3 rounded-full bg-primary px-3 py-1">
                  <span className="text-sm font-bold text-primary-foreground">{recipe.matchScore}% Match</span>
                </div>
              </div>

              {/* Recipe Info */}
              <div className="p-4">
                <h3 className="mb-2 text-lg font-bold text-foreground">{recipe.name}</h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{recipe.time}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{recipe.servings} servings</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ChefHat className="h-4 w-4" />
                    <span>{recipe.ingredients} ingredients</span>
                  </div>
                </div>
                <Button className="mt-4 w-full bg-transparent" variant="outline">
                  View Recipe
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
