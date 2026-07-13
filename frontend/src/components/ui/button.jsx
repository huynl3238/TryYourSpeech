import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[#D97757] text-white hover:bg-[#B5674A] active:scale-[0.98]',
        destructive: 'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]',
        outline: 'border border-zinc-200 bg-white hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.98]',
        secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 active:scale-[0.98]',
        ghost: 'hover:bg-zinc-100 hover:text-zinc-900 active:scale-[0.98]',
        link: 'text-[#D97757] underline-offset-4 hover:underline',
        success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
