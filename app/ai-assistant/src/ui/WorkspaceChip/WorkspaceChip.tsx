import clsx from 'clsx';

import styles from './workspace-chip.module.scss';

interface WorkspaceChipProps {
  name: string;
  className?: string;
}

// Names the workspace a session runs in, next to the session title in the docked panel header
// and in the Agent Mode toolbar.
export const WorkspaceChip: React.FC<WorkspaceChipProps> = ({
  name,
  className,
}) => {
  return <span className={clsx(styles['chip'], className)}>{name}</span>;
};

export default WorkspaceChip;
