import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return invoke<T>(command, args);
}

export function tauriListen<T>(
  eventName: string,
  handler: (payload: T) => void
): Promise<() => void> {
  return listen<T>(eventName, (event) => {
    handler(event.payload);
  });
}
