import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PlayerTransientNoticeProps = {
  durationMs: number;
  className?: string;
  children: ReactNode;
};

/**
 * Renders its children for a limited time. Remount it (change its `key`) to
 * show a new notice.
 */
export function PlayerTransientNotice({
  durationMs,
  className,
  children,
}: PlayerTransientNoticeProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className={cn(
        'animate-in rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm fade-in-0',
        className
      )}
    >
      {children}
    </div>
  );
}
