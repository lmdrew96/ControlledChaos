"use client";

import { UserButton } from "@clerk/nextjs";
import { User } from "lucide-react";

export function UserNav() {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!hasClerk) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          avatarBox: "h-8 w-8",
        },
      }}
    />
  );
}
