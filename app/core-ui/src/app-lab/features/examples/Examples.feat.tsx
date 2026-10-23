import {
  AppLabExamples,
  PageLayout,
  TopBar,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback } from 'react';

import { createUseExamplesLogic } from './examples.logic';
import styles from './examples.module.scss';

const Examples: React.FC = () => {
  const examplesLogic = useCallback(() => createUseExamplesLogic()(), []);

  return (
    <PageLayout header={<TopBar pathItems={['examples']} />}>
      <div className={styles['content']}>
        <AppLabExamples examplesLogic={examplesLogic} />
      </div>
    </PageLayout>
  );
};
export default Examples;
