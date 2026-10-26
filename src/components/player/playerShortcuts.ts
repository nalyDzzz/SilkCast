export type PlayerAction =
  | 'togglePlay'
  | 'toggleFullscreen'
  | 'toggleMute'
  | 'seekBackward'
  | 'seekForward'
  | 'volumeUp'
  | 'volumeDown'
  | 'previousItem'
  | 'nextItem'
  | 'toggleQueue'
  | 'showShortcuts'
  | 'exit';

export type PlayerShortcut = {
  action: PlayerAction;
  /** Values of KeyboardEvent.key, compared case-insensitively. */
  keys: string[];
  /** Labels shown to the user. */
  display: string[];
  description: string;
};

export const PLAYER_SHORTCUTS: PlayerShortcut[] = [
  {
    action: 'togglePlay',
    keys: [' ', 'k'],
    display: ['Space', 'K'],
    description: 'Play / pause',
  },
  {
    action: 'toggleFullscreen',
    keys: ['f'],
    display: ['F'],
    description: 'Toggle fullscreen',
  },
  {
    action: 'toggleMute',
    keys: ['m'],
    display: ['M'],
    description: 'Mute / unmute',
  },
  {
    action: 'volumeUp',
    keys: ['ArrowUp'],
    display: ['↑'],
    description: 'Volume up',
  },
  {
    action: 'volumeDown',
    keys: ['ArrowDown'],
    display: ['↓'],
    description: 'Volume down',
  },
  {
    action: 'seekBackward',
    keys: ['ArrowLeft', 'j'],
    display: ['←', 'J'],
    description: 'Back 10 seconds (movies & episodes)',
  },
  {
    action: 'seekForward',
    keys: ['ArrowRight', 'l'],
    display: ['→', 'L'],
    description: 'Forward 10 seconds (movies & episodes)',
  },
  {
    action: 'previousItem',
    keys: ['PageUp', 'p'],
    display: ['PgUp', 'P'],
    description: 'Previous channel / episode',
  },
  {
    action: 'nextItem',
    keys: ['PageDown', 'n'],
    display: ['PgDn', 'N'],
    description: 'Next channel / episode',
  },
  {
    action: 'toggleQueue',
    keys: ['c', 'e'],
    display: ['C', 'E'],
    description: 'Show channel list / episodes',
  },
  {
    action: 'showShortcuts',
    keys: ['?'],
    display: ['?'],
    description: 'Show keyboard shortcuts',
  },
  {
    action: 'exit',
    keys: ['Escape'],
    display: ['Esc'],
    description: 'Exit fullscreen, or leave the player',
  },
];

const ACTION_BY_KEY = new Map<string, PlayerAction>(
  PLAYER_SHORTCUTS.flatMap((shortcut) =>
    shortcut.keys.map((key) => [key.toLowerCase(), shortcut.action] as const)
  )
);

export function resolvePlayerAction(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): PlayerAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  return ACTION_BY_KEY.get(event.key.toLowerCase()) ?? null;
}
