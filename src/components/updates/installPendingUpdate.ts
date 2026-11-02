import { toast } from 'sonner';
import { useAppUpdateStore } from '@/store/appUpdateStore';

/** Installs the pending update, whichever control asked for it. */
export async function installPendingUpdate() {
  const error = await useAppUpdateStore.getState().installUpdate();
  if (error) {
    toast.error("Couldn't install the update", { description: error });
  }
}
