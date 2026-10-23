import styles from './release-note-field.module.scss';

export interface ReleaseNoteFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optionalLabel?: string;
}

export const ReleaseNoteField: React.FC<ReleaseNoteFieldProps> = ({
  id,
  label,
  value,
  onChange,
  optionalLabel,
}: ReleaseNoteFieldProps) => {
  return (
    <div className={styles['container']}>
      <label className={styles['label']} htmlFor={id}>
        {label}
        {optionalLabel ? (
          <span className={styles['label-optional']}>{optionalLabel}</span>
        ) : null}
      </label>
      <textarea
        id={id}
        className={styles['editor']}
        value={value}
        rows={4}
        onChange={(e): void => onChange(e.target.value)}
      />
    </div>
  );
};

ReleaseNoteField.displayName = 'ReleaseNoteField';
