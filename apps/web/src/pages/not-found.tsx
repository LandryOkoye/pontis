import { Span } from "../components/span.tsx";
import { ButtonLink } from "../components/ui/button.tsx";

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <Span from="here" to="404" state="NONE" className="mb-6 max-w-md" />
      <h1 className="display text-5xl">No route to this page</h1>
      <p className="mt-3 text-muted">The address does not match anything in the app.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/app">Open the app</ButtonLink>
        <ButtonLink to="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
