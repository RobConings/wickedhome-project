import { DocumentCoverChooser, type DocumentCoverChooserProps } from "@/features/documents";

type ProjectCoverChooserProps = Omit<DocumentCoverChooserProps, "entityType" | "entityId" | "namespace"> & { projectId: string };

/** Pick one of the images attached to the project as its cover (shown on its tile and page). */
export function ProjectCoverChooser({ projectId, ...props }: ProjectCoverChooserProps) {
  return <DocumentCoverChooser entityType="project" entityId={projectId} namespace="projects" {...props} />;
}
