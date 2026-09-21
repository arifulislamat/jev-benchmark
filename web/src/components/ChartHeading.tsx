import type { ReactNode } from "react";
import { Info, X } from "lucide-react";
import { Popover } from "radix-ui";

export function ChartHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="chart-heading">
      <h2>{title}</h2>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="chart-info-trigger"
            aria-label={`About ${title.toLowerCase()}`}
          >
            <Info size={18} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="chart-info-content"
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={16}
            aria-label={`About ${title.toLowerCase()}`}
          >
            <div className="chart-info-header">
              <h3>{title}</h3>
              <Popover.Close
                className="chart-info-close"
                aria-label="Close chart information"
              >
                <X size={18} aria-hidden="true" />
              </Popover.Close>
            </div>
            <div className="chart-info-text">{children}</div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
