import { DocumentCoverChooser, type DocumentCoverChooserProps } from "@/features/documents";

type RecipeCoverChooserProps = Omit<DocumentCoverChooserProps, "entityType" | "entityId" | "namespace"> & { recipeId: string };

/** Pick one of the images attached to the recipe as its cover (shown on its tile and page). */
export function RecipeCoverChooser({ recipeId, ...props }: RecipeCoverChooserProps) {
  return <DocumentCoverChooser entityType="recipe" entityId={recipeId} namespace="recipes" {...props} />;
}
