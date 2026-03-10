import { useEffect, useMemo, useState } from 'react';

type UseMediaCatalogFiltersArgs = {
  allGroupsValue: string;
};

export function useMediaCatalogFilters({
  allGroupsValue,
}: UseMediaCatalogFiltersArgs) {
  const [selectedGroup, setSelectedGroup] = useState(allGroupsValue);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const selectedGroupName = useMemo(
    () => (selectedGroup === allGroupsValue ? null : selectedGroup),
    [allGroupsValue, selectedGroup]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  return {
    selectedGroup,
    setSelectedGroup,
    query,
    setQuery,
    debouncedQuery,
    favoritesOnly,
    setFavoritesOnly,
    selectedGroupName,
  };
}
