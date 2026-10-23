import {
  BaseNode,
  TreeNode,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

import { fs } from '../../wailsjs/go/models';

export const mapFSNode = (fsNode: fs.FSNode): TreeNode => {
  const node: BaseNode = {
    name: fsNode.name,
    path: fsNode.path,
    createdAt: fsNode.createdAt,
    modifiedAt: fsNode.modifiedAt,
  };
  if (fsNode.isDir) {
    return {
      ...node,
      type: 'folder',
      children: fsNode.children ? fsNode.children.map(mapFSNode) : [],
    };
  } else {
    return {
      ...node,
      type: 'file',
      extension: fsNode.extension || '',
      mimeType: fsNode.mimeType || '',
    };
  }
};
