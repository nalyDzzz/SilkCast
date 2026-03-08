import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { appRouter } from '@/router';
import { type AppTheme, useAppStore } from '@/store/appStore';

const syncDocumentTheme = (theme: AppTheme) => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.classList.toggle('dark', theme === 'dark');
};

syncDocumentTheme(useAppStore.getState().theme);

function App() {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    syncDocumentTheme(theme);
  }, [theme]);

  return <RouterProvider router={appRouter} />;
}

export default App;
