import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-orange-100 text-orange-700',
        secondary: 'border-transparent bg-zinc-100 text-zinc-700',
        destructive: 'border-transparent bg-red-100 text-red-700',
        outline: 'border-zinc-200 text-zinc-700',
        success: 'border-transparent bg-emerald-100 text-emerald-700',
        warning: 'border-transparent bg-amber-100 text-amber-700',
        speaker: 'border-transparent bg-orange-100 text-orange-700',
        listener: 'border-transparent bg-sky-100 text-sky-700',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
