import { Skeleton } from '../../../../../skeleton';
import styles from '../../ai-model.module.scss';

// A Hugging Face source is only described by the board once the download
// finishes, so a model installing from a pasted link has neither yet.
export const AiModelDetailsSkeleton: React.FC = () => (
  <div className={styles['ai-model-details-skeleton']}>
    <div className={styles['ai-model-details-skeleton-description']}>
      <Skeleton variant="rounded" />
    </div>
    <div className={styles['ai-model-details-skeleton-tags']}>
      <Skeleton variant="rounded" />
    </div>
  </div>
);
