import { useEffect } from 'react';
import { CircleArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import { installPendingUpdate } from '@/components/updates/installPendingUpdate';
import {
  markUpdateAnnounced,
  useAppUpdateStore,
  wasUpdateAnnounced,
} from '@/store/appUpdateStore';

const UPDATE_TOAST_ID = 'app-update-available';
const UPDATE_TOAST_DURATION_MS = 15_000;

/**
 * Announces each new version once. The top bar keeps offering it after that,
 * so ignoring the toast doesn't lose the update. Mount this outside the
 * full-window player: an update found during playback waits until it closes.
 */
export function useUpdateToast() {
  const version = useAppUpdateStore((state) => state.update?.version ?? null);
  // Don't offer a one-click install next to a download that is already running.
  const idle = useAppUpdateStore(
    (state) => state.phase === 'idle' || state.phase === 'checking'
  );

  useEffect(() => {
    if (!version || !idle || wasUpdateAnnounced(version)) {
      return;
    }

    markUpdateAnnounced(version);
    toast(`SilkCast ${version} is available`, {
      id: UPDATE_TOAST_ID,
      icon: <CircleArrowUp className="size-4 text-thread" />,
      description: 'Installing restarts the app. You can also do it later from the top bar.',
      duration: UPDATE_TOAST_DURATION_MS,
      action: {
        label: 'Install',
        onClick: () => void installPendingUpdate(),
      },
      actionButtonStyle: {
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
      },
    });
  }, [version, idle]);

  // Leaving for the player shouldn't carry the toast over the picture.
  useEffect(() => () => void toast.dismiss(UPDATE_TOAST_ID), []);
}
