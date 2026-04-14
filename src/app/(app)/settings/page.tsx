import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppearanceSettings } from "@/components/features/settings/appearance-settings";
import { TimezoneSettings } from "@/components/features/settings/timezone-settings";
import { EnergyProfileEditor } from "@/components/features/settings/energy-profile";
import { PersonalitySettings } from "@/components/features/settings/personality-settings";
import { SavedLocations } from "@/components/features/settings/saved-locations";
import { CommuteTimes } from "@/components/features/settings/commute-times";
import { CalendarSettings } from "@/components/features/settings/calendar-settings";
import { NotificationSettings } from "@/components/features/settings/notification-settings";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Preferences, integrations, and locations.
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearanceSettings />
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timezone</CardTitle>
        </CardHeader>
        <CardContent>
          <TimezoneSettings />
        </CardContent>
      </Card>

      {/* AI Personality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Haiku Personality</CardTitle>
        </CardHeader>
        <CardContent>
          <PersonalitySettings />
        </CardContent>
      </Card>

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

      {/* Commute Times */}
      <CommuteTimes />

      {/* Calendar Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Calendar Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarSettings />
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationSettings />
        </CardContent>
      </Card>
    </div>
  );
}
