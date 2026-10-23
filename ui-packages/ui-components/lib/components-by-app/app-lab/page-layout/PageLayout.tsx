import clsx from 'clsx';
import React from 'react';

import styles from './page-layout.module.scss';

interface PageLayoutProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  // for pages that scroll inside their own children: drops the content's top
  // inset so their scrollbars start at the header instead of 16px below it
  flushTop?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  header,
  children,
  flushTop = false,
}) => {
  return (
    <section className={styles['main']}>
      {header && (
        <div className={styles['header']}>
          <div className={styles['header-content']}>{header}</div>
        </div>
      )}
      <div
        className={clsx(styles['content'], {
          [styles['flush-top']]: flushTop,
        })}
      >
        {children}
      </div>
    </section>
  );
};

export default PageLayout;
