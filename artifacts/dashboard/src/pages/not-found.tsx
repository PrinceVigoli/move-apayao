import { Link } from "wouter"
import { AlertTriangle, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight mb-2 text-foreground">
        404
      </h1>
      <h2 className="text-2xl font-semibold tracking-tight mb-4 text-foreground/80">
        Page Not Found
      </h2>
      <p className="text-muted-foreground max-w-md mb-8">
        The route you're looking for doesn't exist in the control center. It might have been moved or deleted.
      </p>
      <Link href="/">
        <Button className="gap-2">
          <Home className="h-4 w-4" />
          Return to Overview
        </Button>
      </Link>
    </div>
  )
}
