import { tauriInvoke } from '../tauriClient';
import { Phase1Settings } from '../../components/app/types';

export function getPhase1Settings() {
  return tauriInvoke<Phase1Settings>('get_phase1_settings');
}

export function setPhase1Settings(settings: Phase1Settings) {
  return tauriInvoke<void>('set_phase1_settings', { settings });
}
