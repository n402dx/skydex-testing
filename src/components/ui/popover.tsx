import {Popover as BasePopover} from '@base-ui/react/popover';
import * as React from 'react';
import {cn} from '../../lib/utils';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;

export function PopoverContent({
  className,
  align = 'end',
  side = 'bottom',
  sideOffset = 8,
  ...props
}: React.ComponentPropsWithoutRef<typeof BasePopover.Popup> & {
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
}) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-[900]">
        <BasePopover.Popup
          className={cn(
            'w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none',
            className,
          )}
          {...props}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
