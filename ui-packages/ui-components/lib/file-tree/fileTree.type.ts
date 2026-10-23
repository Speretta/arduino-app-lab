import { NodeApi } from 'react-arborist';

export interface BaseNode {
  name: string;
  path: string;
  createdAt?: string;
  modifiedAt?: string;
}

export interface FileNode extends BaseNode {
  type: 'file';
  extension: string;
  mimeType: string;
}

export interface FolderNode extends BaseNode {
  type: 'folder';
  // null when folder content has not been listed yet
  children: TreeNode[] | null;
}

export type TreeNode = FileNode | FolderNode;

export type FileTreeApi = {
  handleFileCreate: (path?: string) => void;
  handleFolderCreate: (path?: string) => void;
  handleDrop: (args: {
    dragNodes: NodeApi<TreeNode>[];
    parentNode: NodeApi<TreeNode> | null;
    index: number;
  }) => void;
  handleResourceImport: (params: { isFolder?: boolean }) => void;
};
