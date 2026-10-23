import {
  getReferenceCategoriesTree,
  getReferenceItemTemplate,
  searchReferenceItem,
} from '@cloud-editor-mono/domain';
import { useQuery } from '@tanstack/react-query';

import {
  UseGetReferenceCategories,
  UseGetReferenceItem,
  UseSearchReferenceItem,
} from './reference.type';

export const useGetReferenceCategories: UseGetReferenceCategories = function (
  langCode = 'en',
): ReturnType<UseGetReferenceCategories> {
  const { isLoading, data } = useQuery({
    queryKey: ['reference', langCode],

    queryFn: () => getReferenceCategoriesTree(),
  });

  const categoryTree = data ? data[0] : undefined;
  const allEntries = data ? data[1] : undefined;

  return {
    categoryTree,
    allEntries,
    isLoading,
  };
};

export const useGetReferenceItem: UseGetReferenceItem = function (
  { path, langCode = 'en' },
  enabled,
): ReturnType<UseGetReferenceItem> {
  const { isLoading, data: referenceItem } = useQuery({
    queryKey: ['reference', langCode, path.category, ...(path.itemPath || [])],
    queryFn: () => getReferenceItemTemplate(path, langCode),
    enabled,
  });

  return {
    referenceItem,
    isLoading,
  };
};

export const useSearchReferenceItem: UseSearchReferenceItem = function (
  { query },
  enabled,
): ReturnType<UseSearchReferenceItem> {
  const { isLoading, data: searchResult } = useQuery({
    queryKey: ['reference', 'search', query],
    queryFn: () => searchReferenceItem(query),
    enabled,
  });

  return {
    searchResult,
    isLoading: isLoading && enabled,
  };
};
