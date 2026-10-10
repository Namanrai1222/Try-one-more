import type { ComponentProps } from 'react';

/** The single-title build never navigates into the Next.js platform. */
export default function Link(props: ComponentProps<'a'>) {
  return <a {...props} />;
}
