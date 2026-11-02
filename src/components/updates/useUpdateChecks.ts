import { useEffect } from 'react';
import { useAppUpdateStore } from '@/store/appUpdateStore';

/** Long enough for the first screen to settle before anything can pop up. */
const FIRST_CHECK_DELAY_MS = 5_000;
/** The app can stay open for days on a TV. */
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Looks for a new release shortly after launch and every few hours after that. */
export function useUpdateChecks() {
  useEffect(() => {
    // A dev build has nothing to update, and would offer to replace itself.
    if (!import.meta.env.PROD) {
      return;
    }

    const check = () => {
      void useAppUpdateStore.getState().checkForUpdate({ background: true });
    };
    const firstCheck = window.setTimeout(check, FIRST_CHECK_DELAY_MS);
    const recheck = window.setInterval(check, RECHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(recheck);
    };
  }, []);
}
