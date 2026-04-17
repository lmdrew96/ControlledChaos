"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Brain, Calendar, MapPin, Bell, Users, Pill, Siren } from "lucide-react";
import { DisplayNameSettings } from "./display-name-settings";
import { AppearanceSettings } from "./appearance-settings";
import { TimezoneSettings } from "./timezone-settings";
import { PersonalitySettings } from "./personality-settings";
import { SavedLocations } from "./saved-locations";
import { CommuteTimes } from "./commute-times";
import { CalendarSettings } from "./calendar-settings";
import { NotificationSettings } from "./notification-settings";
import { CrisisDetectionSettings } from "./crisis-detection-settings";
import { FriendsSettings } from "./friends-settings";
import { MedicationSettings } from "./medication-settings";
import { useSearchParams } from "next/navigation";

export function SettingsTabs() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs = new Set(["profile", "ai-energy", "calendar", "locations", "notifications", "crisis-detection", "friends", "medications"]);
  const defaultTab = tabParam && validTabs.has(tabParam) ? tabParam : "profile";

  return (
    <Tabs defaultValue={defaultTab} className="space-y-6">
      <TabsList className="w-full flex overflow-x-auto overflow-y-hidden flex-nowrap justify-start gap-1 bg-transparent p-0 border-b rounded-none h-auto pb-0">
        <TabsTrigger
          value="profile"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Profile</span>
        </TabsTrigger>
        <TabsTrigger
          value="ai-energy"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Brain className="h-4 w-4" />
          <span className="hidden sm:inline">AI & Energy</span>
        </TabsTrigger>
        <TabsTrigger
          value="calendar"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Calendar className="h-4 w-4" />
          <span className="hidden sm:inline">Calendar</span>
        </TabsTrigger>
        <TabsTrigger
          value="locations"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <MapPin className="h-4 w-4" />
          <span className="hidden sm:inline">Locations</span>
        </TabsTrigger>
        <TabsTrigger
          value="notifications"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Bell className="h-4 w-4" />
          <span className="hidden sm:inline">Notifications</span>
        </TabsTrigger>
        <TabsTrigger
          value="crisis-detection"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Siren className="h-4 w-4" />
          <span className="hidden sm:inline">Crisis</span>
        </TabsTrigger>
        <TabsTrigger
          value="friends"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Friends</span>
        </TabsTrigger>
        <TabsTrigger
          value="medications"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Pill className="h-4 w-4" />
          <span className="hidden sm:inline">Medications</span>
        </TabsTrigger>
      </TabsList>

      {/* Profile */}
      <TabsContent value="profile" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Display Name</CardTitle>
          </CardHeader>
          <CardContent>
            <DisplayNameSettings />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Timezone</CardTitle>
          </CardHeader>
          <CardContent>
            <TimezoneSettings />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <AppearanceSettings />
          </CardContent>
        </Card>
      </TabsContent>

      {/* AI & Energy */}
      <TabsContent value="ai-energy" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Personality</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonalitySettings />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Calendar */}
      <TabsContent value="calendar">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Calendar Integration</CardTitle>
          </CardHeader>
          <CardContent>
            <CalendarSettings />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Locations */}
      <TabsContent value="locations" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Saved Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <SavedLocations />
          </CardContent>
        </Card>
        <CommuteTimes />
      </TabsContent>

      {/* Notifications */}
      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationSettings />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Crisis Detection */}
      <TabsContent value="crisis-detection">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Crisis Detection</CardTitle>
          </CardHeader>
          <CardContent>
            <CrisisDetectionSettings />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Friends */}
      <TabsContent value="friends" className="space-y-6">
        <FriendsSettings />
      </TabsContent>

      {/* Medications */}
      <TabsContent value="medications" className="space-y-6">
        <MedicationSettings />
      </TabsContent>
    </Tabs>
  );
}
