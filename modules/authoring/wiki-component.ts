import type { ReactElement } from "react";

/** Registry-injected identity transported through the server/client boundary. */
export const WIKI_COMPONENT_NAME_PROPERTY = "data-wiki-component";

type IdentifiedWikiComponent = {
  [WIKI_COMPONENT_NAME_PROPERTY]?: string;
};

type IdentifiedWikiProps = {
  [WIKI_COMPONENT_NAME_PROPERTY]?: string;
};

/** Whether an element came from the registry entry with this component name. */
export function hasWikiComponentName(
  element: ReactElement,
  name: string
): boolean {
  const props = element.props as IdentifiedWikiProps;
  const component = element.type as unknown as IdentifiedWikiComponent;
  return (
    props[WIKI_COMPONENT_NAME_PROPERTY] === name ||
    component[WIKI_COMPONENT_NAME_PROPERTY] === name
  );
}
