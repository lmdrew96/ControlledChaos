"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParallelPlay } from "@/lib/parallel-play/context";
import { cn } from "@/lib/utils";
import { RoomPicker } from "./RoomPicker";

interface ParallelPlayToggleProps {
  className?: string;
}

/**
 * Header/nav button that gates entry into Parallel Play.
 *
 * - Not in a room → tap opens the room picker.
 * - In a room → tap toggles the overlay (presence stays alive even when
 *   overlay is hidden — see context).
 */
export function ParallelPlayToggle({ className }: ParallelPlayToggleProps) {
  const { isInRoom, isReady, isOverlayVisible, toggleOverlay } = useParallelPlay();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!isReady) return null;

  function handleClick() {
    if (isInRoom) {
      toggleOverlay();
    } else {
      setPickerOpen(true);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        onClick={handleClick}
        aria-label={
          isInRoom
            ? isOverlayVisible
              ? "Hide parallel play"
              : "Show parallel play"
            : "Enter a parallel play room"
        }
      >
        <Flame
          className={cn(
            "h-4 w-4 transition-colors",
            isInRoom ? "text-amber-500" : "text-muted-foreground",
          )}
          fill={isInRoom ? "currentColor" : "none"}
        />
      </Button>
      <RoomPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
