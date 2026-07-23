'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import React, { forwardRef } from 'react';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, sideOffset = 8, children, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      className={['common-tooltip-content', className].filter(Boolean).join(' ')}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    >
      {children}
      <PopoverPrimitive.Arrow className="common-tooltip-arrow" />
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
));

PopoverContent.displayName = PopoverPrimitive.Content.displayName;
