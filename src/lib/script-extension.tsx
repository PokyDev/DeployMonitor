/** Icon + color identity per script extension — shared by the Historial card
 * grid, its detail sidebar, and the filter sidebar so the same script always
 * renders the same chip wherever it appears. Mock data only has sh/py/js,
 * but any other extension still renders a neutral fallback chip. */
import { Braces, FileCode, FileCode2, FileTerminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ExtensionKey = 'sh' | 'py' | 'js' | 'default';

export const EXTENSION_STYLE: Record<ExtensionKey, { icon: LucideIcon; tone: string; label: string }> = {
  sh:      { icon: FileTerminal, tone: 'sh',      label: '.sh' },
  py:      { icon: FileCode2,    tone: 'py',      label: '.py' },
  js:      { icon: Braces,       tone: 'js',      label: '.js' },
  default: { icon: FileCode,     tone: 'default', label: 'Otro' },
};

export function getExtensionKey(scriptName: string): ExtensionKey {
  const ext = scriptName.split('.').pop()?.toLowerCase();
  return ext === 'sh' || ext === 'py' || ext === 'js' ? ext : 'default';
}

export type ExtensionIconVariant = 'card' | 'modal' | 'filter';

/** Same icon/color identity rendered at multiple sizes — `card` on the grid
 * tile, `modal` (smaller chip) in the detail header, `filter` in the sidebar
 * facet list — so a card visually carries over into the panels it opens. */
export function ExtensionIcon({ scriptName, variant = 'card' }: { scriptName: string; variant?: ExtensionIconVariant }) {
  return <ExtensionIconForKey extKey={getExtensionKey(scriptName)} variant={variant} />;
}

/** Same as `ExtensionIcon` but for callers (e.g. the filter sidebar) that
 * already have an `ExtensionKey` instead of a full script name. */
export function ExtensionIconForKey({ extKey, variant = 'card' }: { extKey: ExtensionKey; variant?: ExtensionIconVariant }) {
  const { icon: Icon, tone } = EXTENSION_STYLE[extKey];
  return (
    <span className={`history-ext-icon history-ext-icon--${variant} history-ext-icon--${tone}`}>
      <Icon size={variant === 'card' ? 17 : variant === 'filter' ? 13 : 15} strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}
