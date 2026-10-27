export type MediaCatalogKind = 'live' | 'movie' | 'series';

export type MediaCatalogCopy = {
  title: string;
  singularLabel: string;
  pluralLabel: string;
  allGroupsValue: string;
  favoritesFieldId: string;
  searchPlaceholder: string;
};

export const MEDIA_COPY: Record<MediaCatalogKind, MediaCatalogCopy> = {
  live: {
    title: 'Live TV',
    singularLabel: 'Channel',
    pluralLabel: 'channels',
    allGroupsValue: '__all_live__',
    favoritesFieldId: 'live-favorites-only',
    searchPlaceholder: 'Search channels',
  },
  movie: {
    title: 'Movies',
    singularLabel: 'Movie',
    pluralLabel: 'movies',
    allGroupsValue: '__all_movies__',
    favoritesFieldId: 'movies-favorites-only',
    searchPlaceholder: 'Search movies',
  },
  series: {
    title: 'Series',
    singularLabel: 'Series',
    pluralLabel: 'series',
    allGroupsValue: '__all_series__',
    favoritesFieldId: 'series-favorites-only',
    searchPlaceholder: 'Search series',
  },
};

export const MEDIA_PATH: Record<MediaCatalogKind, string> = {
  live: '/dashboard/live',
  movie: '/dashboard/movies',
  series: '/dashboard/series',
};
