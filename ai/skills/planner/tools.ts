import { contactProjectLinkSchema } from "@/features/contacts/types/contacts";
import { PROJECT_COLORS, projectInputSchema } from "@/features/projects/types/projects";
import { PROJECT_PLAN_KIND } from "@/features/projects/types/project-plan";
import { shoppingItemCreateSchema } from "@/features/shopping/types/shopping";
import { taskInputSchema } from "@/features/tasks/types/tasks";
import { todayIn } from "@/types/dates";
import { linkContactToProject, listContacts, unlinkContactFromProject } from "@/api/contacts/contacts.service";
import { HttpError, badRequest } from "@/api/lib/http";
import { createProject, deleteProject, getProjectDetail, listProjects, updateProject } from "@/api/projects/projects.service";
import { createItem, deleteItem } from "@/api/shopping/shopping.service";
import { addTaskLink } from "@/api/tasks/task-links";
import { notifyAssigned } from "@/api/tasks/task-notifications";
import { createTask, deleteTask } from "@/api/tasks/tasks.service";
import { money, registerAssistantSkill, registerAssistantTool, say, type AssistantToolContext } from "@ai/core/kit";
import { PlanApplyError, applyPlan, checkPlan, describePlan, draftOf, planInput, planPreviewData, resultLine, type PlanDraft, type PlanInput, type PlanOps } from "./plan";

/**
 * Skill "planner": talking a home project through (a bathroom renovation, a new garden) and turning it into
 * one plan the person reviews on a card: the project, its tasks in order with "waits for", people, rooms and
 * dates, its materials and the budget. One Apply creates everything through the projects, tasks and shopping
 * services (guide: guide.md). Its own skill so the planning guide is only in the prompt while planning; the
 * tool keeps the projects name (`projects.plan`). `projects.save` stays the way to create or edit the project
 * itself without tasks.
 */

registerAssistantSkill({
  id: "planner",
  title: { en: "Project planner", nl: "Projectplanner" },
  summary: "Plan a home project (renovation, garden, move) with the person, then create project, ordered tasks, materials and budget in one go.",
  // Planning words and the verbs of a home project; the nouns (renovatie, verbouwing) stay with projects, whose
  // guide points here, so "120 euro verf voor de badkamer renovatie" is still a projects question.
  keywords: {
    nl: [
      "plan", "planning", "projectplan", "projectplanning", "project plannen", "plannen we", "verbouwing plannen", "renovatie plannen", "stappenplan", "plan opmaken",
      "plan maken", "maak een plan", "maak het plan", "maak een planning", "werkplan", "materiaallijst", "materialenlijst", "offerte vragen", "offerte aanvragen", "verbouwen",
      "renoveren", "opknappen", "aanleggen", "zelf doen", "doe het zelf",
    ],
    en: [
      "planning", "project plan", "plan the", "plan a", "plan our", "plan it", "make a plan", "make the plan", "step by step plan", "renovation plan", "materials list",
      "material list", "request a quote", "ask for a quote", "renovate", "refurbish", "diy",
    ],
  },
  // A contractor or "doing it ourselves" points here, but other areas (contacts, mail) use those words too.
  hints: { nl: ["aannemer", "loodgieter", "tegelzetter", "schilder"], en: ["contractor", "plumber", "tiler", "painter"] },
});

/** Checks the arguments (refusing with every problem at once) and loads what the plan builds on. */
async function draftFor(ctx: AssistantToolContext, input: PlanInput): Promise<{ draft: PlanDraft; warnings: string[] }> {
  const check = checkPlan(input, todayIn());
  if (check.errors.length) throw badRequest(check.errors.join(" "));
  let existing = null;
  let color: string = PROJECT_COLORS[0];
  if (input.project) {
    const [{ project }, contacts] = await Promise.all([
      getProjectDetail(ctx.householdId, input.project.id),
      input.contact ? listContacts(ctx.householdId, { projectId: input.project.id }) : [],
    ]);
    existing = {
      id: project.id,
      name: project.name,
      color: project.color,
      budgetCents: project.budgetCents,
      usedCents: project.budget.spentCents + project.budget.committedCents,
      start: project.startDate,
      end: project.endDate,
      places: project.places.map((place) => ({ id: place.id, name: place.name })),
      description: project.description,
      contactIds: contacts.map((contact) => contact.id),
    };
  } else {
    const { projects } = await listProjects(ctx.householdId);
    color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length] ?? color;
  }
  const draft = draftOf(input, existing, color);
  // Dates of an existing project count too (a task after its deadline).
  const warnings = existing ? checkPlan({ ...input, start: existing.start ?? undefined, end: existing.end ?? undefined, project: undefined, name: existing.name }, todayIn()).warnings : check.warnings;
  return { draft, warnings: warnings.map(([en, nl]) => say(ctx.locale, en, nl)) };
}

/** The real service calls, as the person (the services check the household and the roles like the UI). */
function servicesFor(ctx: AssistantToolContext): PlanOps {
  return {
    createProject: (input) => createProject(ctx.householdId, projectInputSchema.parse(input)),
    setProjectDescription: async (projectId, description) => {
      const { project } = await getProjectDetail(ctx.householdId, projectId);
      await updateProject(
        ctx.householdId,
        projectId,
        projectInputSchema.parse({
          name: project.name,
          icon: project.icon,
          color: project.color,
          tag: project.tag,
          description,
          startDate: project.startDate,
          endDate: project.endDate,
          budgetCents: project.budgetCents,
          status: project.status,
          placeIds: project.places.map((place) => place.id),
        }),
      );
    },
    linkContact: async (projectId, contactId, role) => {
      await linkContactToProject(ctx.householdId, contactId, projectId, contactProjectLinkSchema.parse({ role }));
    },
    unlinkContact: async (projectId, contactId) => {
      await unlinkContactFromProject(ctx.householdId, contactId, projectId);
    },
    createTask: (input) => createTask(ctx.householdId, taskInputSchema.parse(input)),
    linkTasks: async (taskId, otherTaskId) => {
      await addTaskLink(ctx.user, taskId, { otherTaskId, kind: "blocked_by" });
    },
    createItem: (input) => createItem(ctx.user, shoppingItemCreateSchema.parse(input)),
    deleteItem: (id) => deleteItem(ctx.user, id),
    deleteTask: (id) => deleteTask(ctx.householdId, id),
    deleteProject: (id) => deleteProject(ctx.householdId, id),
  };
}

/** The model-facing message of a plan that failed halfway. */
export function failureMessage(error: PlanApplyError): string {
  const reason = error.failure instanceof HttpError ? error.failure.message : "an error in the app";
  return error.undone
    ? `Nothing was saved: ${error.step} failed (${reason}); everything created before it was removed again. Tell the person, fix the plan if the reason says how, or try again.`
    : `${error.step} failed (${reason}) and removing what was already created failed too: check the projects page for leftovers and tell the person.`;
}

registerAssistantTool({
  name: "projects.plan",
  skill: "planner",
  description:
    "Create a whole home project plan in one go after talking it through: new project (or an existing one to add to) with ordered tasks (people, room, due date, waitsFor), materials (for a task, shop, link, price) and budget. The person reviews it on one card; call again with fixes for 'change X'.",
  input: planInput,
  permission: "write",
  confirm: "always",
  activity: { en: "Planned a project", nl: "Project gepland" },
  describe: (ctx, input) => describePlan(ctx.locale, input),
  preview: async (ctx, input) => {
    const { draft, warnings } = await draftFor(ctx, input);
    return { kind: PROJECT_PLAN_KIND, title: draft.project.name, data: planPreviewData(draft, warnings) };
  },
  run: async (ctx, input) => {
    const { draft } = await draftFor(ctx, input);
    try {
      const result = await applyPlan(draft, servicesFor(ctx));
      for (const task of result.tasks) notifyAssigned(ctx.user, task);
      return {
        done: resultLine(draft, result, money),
        id: result.projectId,
        next: "Offer: mail the contractor (quote/questions), dates in the calendar, materials per shop.",
      };
    } catch (error) {
      if (!(error instanceof PlanApplyError)) throw error;
      if (!(error.failure instanceof HttpError)) console.error("[assistant] projects.plan failed", error.failure);
      throw new HttpError(error.undone ? 409 : 500, "plan_failed", failureMessage(error));
    }
  },
});
