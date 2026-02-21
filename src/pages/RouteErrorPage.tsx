import { isRouteErrorResponse, useRouteError } from 'react-router';

export function RouteErrorPage() {
  const error = useRouteError();

  let title = 'Unexpected error';
  let detail = 'Something went wrong while rendering this view.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = typeof error.data === 'string' ? error.data : detail;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <main>
      <section>
        <section>
          <h2>{title}</h2>
          <p className="text-muted-foreground">{detail}</p>
        </section>
      </section>
    </main>
  );
}
