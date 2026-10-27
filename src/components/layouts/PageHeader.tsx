import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Title block for utility pages (Settings, Help, Watch history, Sources). */
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('space-y-2 pb-2', className)}>
      <h1 className="font-display-italic text-[2.6rem] leading-none font-medium">{title}</h1>
      {description ? <p className="text-[15px] text-muted-foreground">{description}</p> : null}
      {children}
    </header>
  );
}
