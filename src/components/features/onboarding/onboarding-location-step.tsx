"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Search, Loader2, X } from "lucide-react";
import { useAddressSearch } from "@/hooks/use-address-search";

interface LocationData {
  name: string;
  latitude: string;
  longitude: string;
}

interface Props {
  homeLocation: LocationData | null;
  onHomeChange: (loc: LocationData | null) => void;
  secondLocation: LocationData | null;
  onSecondChange: (loc: LocationData | null) => void;
}

function LocationInput({
  label,
  defaultName,
  value,
  onChange,
  onClear,
}: {
  label: string;
  defaultName: string;
  value: LocationData | null;
  onChange: (loc: LocationData) => void;
  onClear?: () => void;
}) {
  const { query, setQuery, results, setResults, isSearching } = useAddressSearch();
  const [name, setName] = useState(value?.name ?? defaultName);

  const handleSelect = (result: (typeof results)[0]) => {
    onChange({
      name: name.trim() || defaultName,
      latitude: result.lat,
      longitude: result.lon,
    });
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {onClear && value && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={onClear}>
            <X className="h-3 w-3 mr-1" />
            Remove
          </Button>
        )}
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Home, Campus, Work"
        className="mb-2"
      />
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address..."
            className="pl-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
            {results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value && (
        <p className="text-xs text-green-600">
          Location set for &ldquo;{value.name}&rdquo;
        </p>
      )}
    </div>
  );
}

export function OnboardingLocationStep({ homeLocation, onHomeChange, secondLocation, onSecondChange }: Props) {
  const [showSecond, setShowSecond] = useState(!!secondLocation);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Adding locations helps me recommend the right tasks when you&apos;re in the right place.
        </p>
      </div>

      <LocationInput
        label="Where's home?"
        defaultName="Home"
        value={homeLocation}
        onChange={onHomeChange}
      />

      {!showSecond ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowSecond(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add another location
        </Button>
      ) : (
        <LocationInput
          label="Where else do you go?"
          defaultName="Campus"
          value={secondLocation}
          onChange={onSecondChange}
          onClear={() => {
            onSecondChange(null);
            setShowSecond(false);
          }}
        />
      )}
    </div>
  );
}
