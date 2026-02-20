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
    <main className="phase1-layout">
      <section className="pane channels-pane">
        <section className="card">
          <h2>{title}</h2>
          <p className="muted">{detail}</p>
        </section>
      </section>
    </main>
  );
}
