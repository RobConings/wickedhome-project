import i18n from "i18next";
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { fetchPlaces, type Place } from "@/features/places";
import { fetchShops, type Shop } from "@/features/shops";
import { ApiRequestError } from "@/lib/api-client";
import { formDataToObject, parseForm, toFormResult, type FormResult } from "@/lib/forms";
import {
  projectExpenseMaterialsInputSchema,
  projectFormSchema,
  projectLinkInputSchema,
  projectPurchaseInputSchema,
  projectStatusInputSchema,
  type ProjectDetail,
  type ProjectsOverview,
} from "../types/projects";
import {
  createProject,
  deleteProject,
  fetchProjectDetail,
  fetchProjects,
  linkToProject,
  recordProjectPurchase,
  setExpenseMaterials,
  setProjectCover,
  setProjectStatus,
  unlinkFromProject,
  updateProject,
} from "./projects-requests";

export const PROJECT_INTENTS = ["create", "update", "delete", "status", "cover", "link", "unlink", "purchase", "materials"] as const;
export type ProjectIntent = (typeof PROJECT_INTENTS)[number];

/** `itemId`: what `link` linked (e.g. to offer "Link materials" for an expense just added). */
export type ProjectActionResult = FormResult & { intent?: ProjectIntent; projectId?: string; itemId?: string };

export type ProjectsPageData = { overview: ProjectsOverview; places: Place[] };
export type ProjectDetailPageData = { detail: ProjectDetail; places: Place[]; habitants: Habitant[]; shops: Shop[] };

export async function projectsLoader(): Promise<ProjectsPageData> {
  const [overview, places] = await Promise.all([fetchProjects(), fetchPlaces()]);
  return { overview, places };
}

export async function projectDetailLoader({ params }: LoaderFunctionArgs): Promise<ProjectDetailPageData> {
  try {
    const [detail, places, household, shops] = await Promise.all([
      fetchProjectDetail(params.projectId ?? ""),
      fetchPlaces(),
      fetchHouseholdOverview(),
      fetchShops().catch(() => [] as Shop[]),
    ]);
    return { detail, places, habitants: household.habitants, shops };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

/** One action for the projects pages; the form's `intent` field says what to do. */
async function handleProjectForm(formData: FormData): Promise<ProjectActionResult> {
  const intent = (formData.get("intent") as ProjectIntent | null) ?? "create";
  const id = String(formData.get("id") ?? "");
  const values = formDataToObject(formData);

  try {
    switch (intent) {
      case "create":
      case "update": {
        const { data: input, errors } = parseForm(projectFormSchema, formData);
        if (errors) return { errors, intent };
        const project = intent === "create" ? await createProject(input) : await updateProject(id, input);
        return { ok: true, intent, projectId: project.id };
      }
      case "delete":
        await deleteProject(id);
        return { ok: true, intent, projectId: id };
      case "status": {
        const parsed = projectStatusInputSchema.safeParse(values);
        if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
        await setProjectStatus(id, parsed.data);
        return { ok: true, intent, projectId: id };
      }
      case "cover":
        await setProjectCover(id, { fileId: typeof values.fileId === "string" ? values.fileId : null });
        return { ok: true, intent, projectId: id };
      case "link":
      case "unlink": {
        const parsed = projectLinkInputSchema.safeParse({ kind: values.kind, id: values.itemId });
        if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
        if (intent === "link") await linkToProject(id, parsed.data);
        else await unlinkFromProject(id, parsed.data);
        return { ok: true, intent, projectId: id, itemId: parsed.data.id };
      }
      case "purchase": {
        const parsed = projectPurchaseInputSchema.safeParse({
          expenseId: values.expenseId,
          itemIds: String(values.itemIds ?? "").split(",").filter(Boolean),
        });
        if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
        await recordProjectPurchase(id, parsed.data);
        return { ok: true, intent, projectId: id };
      }
      case "materials": {
        // The dialog posts its selection as one JSON field.
        let selection: unknown = null;
        try {
          selection = JSON.parse(String(values.selection ?? ""));
        } catch {
          // Stays null: invalid below.
        }
        const parsed = projectExpenseMaterialsInputSchema.safeParse(selection);
        const expenseId = String(values.expenseId ?? "");
        if (!parsed.success || !expenseId) return { formError: i18n.t("common:errors.generic"), intent };
        await setExpenseMaterials(id, expenseId, parsed.data);
        return { ok: true, intent, projectId: id, itemId: expenseId };
      }
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    return {
      ...toFormResult(error, { not_found: i18n.t("projects:errors.notFound"), forbidden: i18n.t("projects:errors.forbidden") }),
      intent,
    };
  }
}

export async function projectsAction({ request }: ActionFunctionArgs): Promise<ProjectActionResult> {
  return handleProjectForm(await request.formData());
}

/** Project page: the same, but deleting goes back to the list. */
export async function projectAction({ request }: ActionFunctionArgs) {
  const result = await handleProjectForm(await request.formData());
  if (result.ok && result.intent === "delete") return redirect("/projects");
  return result;
}
