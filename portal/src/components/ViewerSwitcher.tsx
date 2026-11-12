import type { Viewer } from '../viewer/types';

interface Props {
  viewers: readonly Viewer[];
  currentId: string;
  onChange: (id: string) => void;
}

export function ViewerSwitcher({ viewers, currentId, onChange }: Props) {
  return (
    <div className="viewer-switcher" role="radiogroup" aria-label="デモ利用者の切り替え">
      <span className="viewer-switcher__label">デモ利用者</span>
      <div className="segmented">
        {viewers.map((viewer) => (
          <button
            key={viewer.id}
            type="button"
            role="radio"
            aria-checked={viewer.id === currentId}
            className={viewer.id === currentId ? 'segmented__item is-active' : 'segmented__item'}
            onClick={() => onChange(viewer.id)}
          >
            {viewer.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
