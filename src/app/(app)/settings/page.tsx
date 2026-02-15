import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnergyProfileEditor } from "@/components/features/settings/energy-profile";
import { SavedLocations } from "@/components/features/settings/saved-locations";
import { CalendarSettings } from "@/components/features/settings/calendar-settings";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Preferences, integrations, and locations.
        </p>
      </div>

      {/* Energy Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Energy Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <EnergyProfileEditor />
        </CardContent>
      </Card>

      {/* Saved Locations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Saved Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <SavedLocations />
        </CardContent>
      </Card>

      {/* Calendar Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Calendar Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarSettings />
        </CardContent>
      </Card>
    </div>
  );
}
