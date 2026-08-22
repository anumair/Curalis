import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function LandingPage() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>City Health Clinic</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Scaffold is live — patient, doctor, and admin portals are built out
          per the engineering brief's build order.
        </CardContent>
      </Card>
    </div>
  )
}
