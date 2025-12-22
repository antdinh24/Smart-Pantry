"use client"

import { Package, Scan, ChefHat, ShoppingCart, Receipt, Crown } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <Package className="h-6 w-6 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Smart Pantry</h1>
            </div>
            <Button variant="ghost" size="icon">
              <Crown className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Main Actions */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link href="/pantry">
              <Card className="cursor-pointer p-6 transition-colors hover:bg-accent">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">My Pantry</h3>
                <p className="text-sm text-muted-foreground">View all items</p>
              </Card>
            </Link>

            <Link href="/scan">
              <Card className="cursor-pointer p-6 transition-colors hover:bg-accent">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Scan className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">Scan Item</h3>
                <p className="text-sm text-muted-foreground">Add with barcode</p>
              </Card>
            </Link>

            <Link href="/recipes">
              <Card className="cursor-pointer p-6 transition-colors hover:bg-accent">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <ChefHat className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">AI Recipes</h3>
                <p className="text-sm text-muted-foreground">Generate ideas</p>
              </Card>
            </Link>

            <Link href="/grocery">
              <Card className="cursor-pointer p-6 transition-colors hover:bg-accent">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <ShoppingCart className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">Grocery List</h3>
                <p className="text-sm text-muted-foreground">Plan shopping</p>
              </Card>
            </Link>
          </div>
        </div>

        {/* Expiring Soon Alert */}
        <Card className="mb-6 border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <Package className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 font-semibold text-foreground">3 items expiring soon</h3>
              <p className="text-sm text-muted-foreground">Milk, Yogurt, Lettuce</p>
            </div>
          </div>
        </Card>

        {/* Receipt Scanner CTA */}
        <Card className="bg-primary p-6 text-primary-foreground">
          <div className="flex items-center gap-4">
            <Receipt className="h-12 w-12" />
            <div className="flex-1">
              <h3 className="mb-1 font-bold">Scan Your Receipt</h3>
              <p className="text-sm opacity-90">Automatically add items to your pantry</p>
            </div>
            <Button variant="secondary" size="sm">
              Scan
            </Button>
          </div>
        </Card>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-card">
        <div className="container mx-auto flex justify-around px-4 py-3">
          <Button variant="ghost" size="sm" className="flex flex-col gap-1">
            <Package className="h-5 w-5 text-primary" />
            <span className="text-xs text-primary">Home</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex flex-col gap-1">
            <Scan className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Scan</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex flex-col gap-1">
            <ChefHat className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Recipes</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex flex-col gap-1">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">List</span>
          </Button>
        </div>
      </nav>
    </div>
  )
}
