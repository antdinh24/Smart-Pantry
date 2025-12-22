"use client"

import { ArrowLeft, Camera, ImageIcon, Scan } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function ScanPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="flex-1 text-xl font-bold text-foreground">Scan Item</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Camera Preview Area */}
        <Card className="mb-6 overflow-hidden">
          <div className="relative aspect-square bg-gradient-to-br from-muted to-muted/50">
            {/* Scanner Frame */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-64 w-64">
                {/* Corner Borders */}
                <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-primary" />
                <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-primary" />
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-primary" />
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-primary" />

                {/* Scan Icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Scan className="h-16 w-16 text-primary/30" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Instructions */}
        <div className="mb-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-foreground">Position barcode in frame</h2>
          <p className="text-sm text-muted-foreground">Align the barcode within the scanning area</p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button className="w-full" size="lg">
            <Camera className="mr-2 h-5 w-5" />
            Start Camera
          </Button>

          <Button variant="outline" className="w-full bg-transparent" size="lg">
            <ImageIcon className="mr-2 h-5 w-5" />
            Upload from Gallery
          </Button>
        </div>

        {/* Tips Card */}
        <Card className="mt-6 bg-muted/50 p-4">
          <h3 className="mb-2 font-semibold text-foreground">Scanning Tips</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                1
              </span>
              <span>Ensure good lighting for best results</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                2
              </span>
              <span>Hold your device steady while scanning</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                3
              </span>
              <span>Keep barcode flat and within the frame</span>
            </li>
          </ul>
        </Card>
      </main>
    </div>
  )
}
