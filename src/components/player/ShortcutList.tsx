import type { PlayerShortcut } from '@/components/player/playerShortcuts';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

export function ShortcutList({ shortcuts }: { shortcuts: PlayerShortcut[] }) {
  return (
    <dl className="divide-y text-sm">
      {shortcuts.map((shortcut) => (
        <div
          key={shortcut.action}
          className="flex items-center justify-between gap-4 py-2"
        >
          <dt className="text-muted-foreground">{shortcut.description}</dt>
          <dd>
            <KbdGroup>
              {shortcut.display.map((label) => (
                <Kbd key={label}>{label}</Kbd>
              ))}
            </KbdGroup>
          </dd>
        </div>
      ))}
    </dl>
  );
}
