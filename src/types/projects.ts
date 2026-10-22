/**
 * The project reference other features embed. It lives here (not only in the projects feature) because feature
 * contracts may not import each other: tasks, expenses and shopping items carry a `ProjectRef`, so their rows can
 * show a project chip without loading the projects.
 */
export type ProjectRef = {
  id: string;
  name: string;
  /** `#rrggbb` */
  color: string;
};

/** Link to a project's page. */
export const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;
