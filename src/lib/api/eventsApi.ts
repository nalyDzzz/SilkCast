import { BackendEvent } from '../../components/app/types';
import { tauriListen } from '../tauriClient';

export function subscribeBackendEvents(
  onEvent: (event: BackendEvent) => void
): Promise<() => void> {
  return tauriListen<BackendEvent>('backend:event', onEvent);
}
