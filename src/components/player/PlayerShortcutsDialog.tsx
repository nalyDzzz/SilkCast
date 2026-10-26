import { PLAYER_SHORTCUTS } from '@/components/player/playerShortcuts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShortcutList } from '@/components/player/ShortcutList';

type PlayerShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PlayerShortcutsDialog({
  open,
  onOpenChange,
}: PlayerShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Work anywhere in the player. Scroll the mouse wheel over the video
            to change volume.
          </DialogDescription>
        </DialogHeader>
        <ShortcutList shortcuts={PLAYER_SHORTCUTS} />
      </DialogContent>
    </Dialog>
  );
}
