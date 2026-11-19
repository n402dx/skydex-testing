import {cva, type VariantProps} from 'class-variance-authority';
import * as React from 'react';
import {cn} from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium font-mono tabular-nums transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'border-emerald-600/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-400',
        warning: 'border-amber-600/35 bg-amber-500/15 text-amber-800 dark:text-amber-400',
        destructive: 'border-red-600/35 bg-red-500/15 text-red-700 dark:text-red-400',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({className, variant, ...props}: BadgeProps) {
  return <span className={cn(badgeVariants({variant}), className)} {...props} />;
}
