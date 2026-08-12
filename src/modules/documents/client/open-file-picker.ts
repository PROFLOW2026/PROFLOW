/**
 * Opens a hidden `<input type="file">` from a visible button.
 *
 * Clearing `value` before `click()` is required so selecting the same file
 * again still fires `change` (desktop Chrome / Android gallery).
 */
export function openFilePicker(input: HTMLInputElement | null): boolean {
  if (!input || input.disabled) return false;
  input.value = '';
  input.click();
  return true;
}
