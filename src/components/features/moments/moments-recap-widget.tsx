"use client";

import { Card } from "@/components/ui/card";
import { MomentDetailSheet } from "./moment-detail-sheet";
import { MomentChip, useMomentLogging } from "./moments-bar";
import { MOMENT_TYPES } from "./moment-constants";

/**
 * Full Moments input surface, embedded in today's Recap. Moments only
 * describe "right now," so this only renders when the caller is looking
 * at today — not when browsing a past day.
 */
interface MomentsRecapWidgetProps {
  onLogged?: () => void;
}

export function MomentsRecapWidget({ onLogged }: MomentsRecapWidgetProps = {}) {
  const logging = useMomentLogging(onLogged);

  return (
    <>
      <Card className="p-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium">Log a moment</h2>
          <p className="text-xs text-muted-foreground">
            Tap to log now. Long-press to add intensity or a note.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="toolbar"
          aria-label="Log a moment"
        >
          {MOMENT_TYPES.map((type) => (
            <MomentChip
              key={type}
              type={type}
              onTap={() => logging.logQuick(type)}
              onLongPress={() => logging.openDetail(type)}
              layout="wrap"
            />
          ))}
        </div>
      </Card>

      <MomentDetailSheet
        open={logging.detailOpen}
        onOpenChange={logging.setDetailOpen}
        type={logging.detailType}
        onSave={logging.handleDetailSave}
      />
    </>
  );
}
