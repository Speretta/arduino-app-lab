import * as ContextMenu from '@radix-ui/react-context-menu';
import { Fragment } from 'react';

// An item is `false` when it is not shown. A group with no shown item is
// dropped, so no separator is ever first, last or next to another.
type ContextMenuGroupsProps = {
  groups: Array<Array<JSX.Element | false>>;
};

export const ContextMenuGroups: React.FC<ContextMenuGroupsProps> = ({
  groups,
}: ContextMenuGroupsProps) => {
  const shown = groups
    .map((group) => group.filter((item): item is JSX.Element => !!item))
    .filter((group) => group.length > 0);

  return (
    <>
      {shown.map((group, index) => (
        <Fragment key={index}>
          {index > 0 && <ContextMenu.Separator />}
          {group}
        </Fragment>
      ))}
    </>
  );
};
