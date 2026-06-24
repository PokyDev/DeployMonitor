import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';

type DirectoryPathFieldProps = {
  path: string;
  onChange: (path: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

/** Locked path input + native folder picker button, shared by Scripts' own
 * directory field and Historial's logs-directory field — both just need to
 * show an absolute path and let the user replace it via the native dialog. */
export default function DirectoryPathField({
  path,
  onChange,
  placeholder = 'Ningún directorio seleccionado',
  className,
  ariaLabel,
}: DirectoryPathFieldProps) {
  const handlePick = async () => {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === 'string') onChange(result);
  };

  return (
    <div className={`dm-input-row${className ? ` ${className}` : ''}`}>
      <input
        className="dm-input dm-input--readonly"
        value={path}
        readOnly
        placeholder={placeholder}
        spellCheck={false}
        aria-label={ariaLabel}
      />
      <button type="button" className="dm-btn" onClick={() => void handlePick()} aria-label="Seleccionar carpeta">
        <FolderOpen size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
