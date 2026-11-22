function copyTextFallback(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  textArea.setAttribute('readonly', '');
  document.body.appendChild(textArea);
  try {
    textArea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

/**
 * Copies text via an optional custom host handler, falling back to `navigator.clipboard`
 * and `document.execCommand('copy')` for unfocused embedded WebViews.
 */
export async function copyTextWithFallback(
  text: string,
  onCopy?: (text: string) => boolean | Promise<boolean>,
): Promise<boolean> {
  if (onCopy) {
    try {
      return Boolean(await onCopy(text));
    } catch {
      return false;
    }
  }
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return copyTextFallback(text);
  } catch {
    return copyTextFallback(text);
  }
}
