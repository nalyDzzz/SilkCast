import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type PlayerIconButtonProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  label: string;
  shortcut?: string;
  children: ReactNode;
};

export const playerButtonClassName =
  'text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/40 disabled:opacity-40';

export function PlayerIconButton({
  label,
  shortcut,
  className,
  children,
  ...props
}: PlayerIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn(playerButtonClassName, '[&_svg]:size-5', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}
