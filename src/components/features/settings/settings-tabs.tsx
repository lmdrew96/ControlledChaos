"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Brain, Calendar, MapPin, Bell, Users, Pill, Siren, Flame } from "lucide-react";
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
import { RoomManager } from "@/components/parallel-play/RoomManager";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback } from "react";

const VALID_TABS = new Set([
  "profile",
  "ai-energy",
  "calendar",
  "locations",
  "notifications",
  "crisis-detection",
  "friends",
  "medications",
  "rooms",
]);

export function SettingsTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : "profile";

  // Controlled: tab selection lives in the URL so reloads preserve it.
  // (This matters in the desktop PWA where a stray controllerchange can
  // reload the page mid-session.)
  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "profile") {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [searchParams, router]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
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
        <TabsTrigger
          value="rooms"
          className="gap-1.5 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Flame className="h-4 w-4" />
          <span className="hidden sm:inline">Rooms</span>
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

      {/* Parallel Play rooms */}
      <TabsContent value="rooms" className="space-y-6">
        <RoomManager />
      </TabsContent>
    </Tabs>
  );
}
