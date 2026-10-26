/**
 * Radix sliders keep focus on their thumb after a drag and swallow arrow and
 * Page Up/Down keys, which would hijack the player's seek, volume, and channel
 * shortcuts. Drop focus once a change is committed.
 */
export function releaseSliderFocus() {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active.closest('[data-slot="slider"]') !== null
  ) {
    active.blur();
  }
}
