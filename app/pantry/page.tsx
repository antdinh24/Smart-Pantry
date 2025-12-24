"use client"

import { useState } from "react"
import { ArrowLeft, Search, Filter, Plus, Package, AlertCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const pantryItems = [
  { id: 1, name: "Whole Milk", category: "Dairy", quantity: "1 gallon", expiry: "2 days", urgent: true },
  { id: 2, name: "Greek Yogurt", category: "Dairy", quantity: "3 cups", expiry: "3 days", urgent: true },
  { id: 3, name: "Cheddar Cheese", category: "Dairy", quantity: "8 oz", expiry: "2 weeks", urgent: false },
  { id: 4, name: "Chicken Breast", category: "Meat", quantity: "2 lbs", expiry: "4 days", urgent: false },
  { id: 5, name: "Romaine Lettuce", category: "Produce", quantity: "1 head", expiry: "1 day", urgent: true },
  { id: 6, name: "Tomatoes", category: "Produce", quantity: "6 units", expiry: "5 days", urgent: false },
  { id: 7, name: "Pasta", category: "Pantry", quantity: "1 lb", expiry: "6 months", urgent: false },
  { id: 8, name: "Olive Oil", category: "Pantry", quantity: "750 ml", expiry: "1 year", urgent: false },
]

export default function PantryPage() {
  const [searchQuery, setSearchQuery] = useState("")

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
            <h1 className="flex-1 text-xl font-bold text-foreground">My Pantry</h1>
            <Button size="icon" className="bg-primary text-primary-foreground">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Search and Filter */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Stats */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-foreground">47 items</p>
            <p className="text-sm text-muted-foreground">Across 8 categories</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">3 expiring soon</span>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-3">
          {pantryItems.map((item) => (
            <Card key={item.id} className={`p-4 ${item.urgent ? "border-destructive/30 bg-destructive/5" : ""}`}>
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                    item.urgent ? "bg-destructive/10" : "bg-primary/10"
                  }`}
                >
                  <Package className={`h-6 w-6 ${item.urgent ? "text-destructive" : "text-primary"}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    {item.urgent && <AlertCircle className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{item.category}</span>
                    <span>•</span>
                    <span>{item.quantity}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${item.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                    {item.expiry}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
