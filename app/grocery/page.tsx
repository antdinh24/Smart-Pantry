"use client"

import { useState } from "react"
import { ArrowLeft, Plus, X, DollarSign, TrendingUp } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

const groceryItems = [
  { id: 1, name: "Milk", quantity: "1 gallon", price: 4.99, checked: false },
  { id: 2, name: "Bread", quantity: "1 loaf", price: 3.49, checked: false },
  { id: 3, name: "Eggs", quantity: "1 dozen", price: 5.99, checked: true },
  { id: 4, name: "Chicken", quantity: "2 lbs", price: 8.99, checked: false },
  { id: 5, name: "Tomatoes", quantity: "6 units", price: 4.49, checked: false },
]

export default function GroceryPage() {
  const [items, setItems] = useState(groceryItems)
  const [showAddForm, setShowAddForm] = useState(false)

  const totalPrice = items.reduce((sum, item) => sum + (item.checked ? 0 : item.price), 0)
  const checkedCount = items.filter((item) => item.checked).length
  const monthlyAverage = 342.0

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
            <h1 className="flex-1 text-xl font-bold text-foreground">Grocery List</h1>
            <Button size="icon" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Budget Summary */}
        <Card className="mb-6 bg-primary p-4 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Estimated Total</p>
              <p className="text-3xl font-bold">${totalPrice.toFixed(2)}</p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
              <DollarSign className="h-8 w-8" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>{items.length - checkedCount} items remaining</span>
            <span>{checkedCount} completed</span>
          </div>
        </Card>

        <Card className="mb-6 border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Monthly Average</p>
              <p className="text-2xl font-bold text-foreground">${monthlyAverage.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">This trip</p>
              <p
                className={`text-sm font-semibold ${totalPrice > monthlyAverage ? "text-destructive" : "text-primary"}`}
              >
                {totalPrice > monthlyAverage ? "+" : ""}${Math.abs(totalPrice - monthlyAverage).toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        {/* Add Item Form */}
        {showAddForm && (
          <Card className="mb-6 p-4">
            <h3 className="mb-3 font-semibold text-foreground">Add Item</h3>
            <div className="space-y-3">
              <Input placeholder="Item name" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Quantity" />
                <Input placeholder="Price" type="number" step="0.01" />
              </div>
              <Button className="w-full">Add to List</Button>
            </div>
          </Card>
        )}

        {/* Shopping List */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Shopping List</h2>
          <Button variant="ghost" size="sm">
            Clear completed
          </Button>
        </div>

        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className={`p-4 ${item.checked ? "bg-muted/50 opacity-60" : ""}`}>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={item.checked}
                  onCheckedChange={(checked) => {
                    setItems(items.map((i) => (i.id === item.id ? { ...i, checked: checked as boolean } : i)))
                  }}
                />
                <div className="flex-1">
                  <h3 className={`font-semibold ${item.checked ? "line-through" : ""} text-foreground`}>{item.name}</h3>
                  <p className="text-sm text-muted-foreground">{item.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-semibold text-foreground">${item.price.toFixed(2)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
