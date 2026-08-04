import type { ReactNode } from "react";
import { Squiggle } from "@/components/ui/squiggle";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="relative inline-block text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
          <Squiggle className="absolute -bottom-1 left-0 h-2.5 w-full" />
        </h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
