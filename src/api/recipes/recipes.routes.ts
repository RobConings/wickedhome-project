import { Router } from "express";
import {
  cookRecipeInputSchema,
  mealPlanDeleteQuerySchema,
  mealPlanExtraInputSchema,
  mealPlanInputSchema,
  mealPlanListQuerySchema,
  mealPlanStepInputSchema,
  mealPlanUseInputSchema,
  recipeCheckQuerySchema,
  recipeCategoryInputSchema,
  recipeCoverInputSchema,
  recipeInputSchema,
  recipeListQuerySchema,
} from "@/features/recipes/types/recipes";
import { idSchema } from "@/types/common";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { deleteRecipeCategory, listRecipeCategories, saveRecipeCategory } from "./recipe-categories.service";
import {
  addExtra,
  checkRecipe,
  cookRecipe,
  createRecipe,
  deleteMealPlanEntry,
  deleteRecipe,
  getCookingState,
  getRecipe,
  listMealPlan,
  listRecipes,
  markCooked,
  planRecipe,
  setRecipeCover,
  setStep,
  startCooking,
  undoUsage,
  updateRecipe,
  useIngredient,
} from "./recipes.service";

/**
 * /api/recipes: recipes, the "To cook" list (`/meal-plan`) and cooking. Everyone in the household reads. Owners
 * and adults change recipes, plan meals and take them off the list (`canManageRecipes`). Cooking is open to
 * children too, like scanning stock: start, "used", undo, extras (not saved to the recipe), step and done.
 */
export const recipesRouter = Router();

recipesRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

// Static category routes must come before /:id.
recipesRouter.get("/categories", async (req, res) => {
  res.json(await listRecipeCategories(currentUser(req).householdId));
});
recipesRouter.post("/categories", canManage, async (req, res) => {
  const input = parse(recipeCategoryInputSchema, req.body);
  res.status(201).json(await saveRecipeCategory(currentUser(req).householdId, input));
});
recipesRouter.put("/categories/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(recipeCategoryInputSchema, req.body);
  res.json(await saveRecipeCategory(currentUser(req).householdId, input, id));
});
recipesRouter.delete("/categories/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteRecipeCategory(currentUser(req).householdId, id);
  res.status(204).end();
});

// The "To cook" list and cooking (before `/:id`).

recipesRouter.get("/meal-plan", async (req, res) => {
  const query = parse(mealPlanListQuerySchema, req.query);
  res.json(await listMealPlan(currentUser(req).householdId, query));
});

recipesRouter.post("/meal-plan", canManage, async (req, res) => {
  const input = parse(mealPlanInputSchema, req.body);
  res.status(201).json(await planRecipe(currentUser(req), input));
});

recipesRouter.get("/meal-plan/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getCookingState(currentUser(req).householdId, id));
});

recipesRouter.delete("/meal-plan/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const query = parse(mealPlanDeleteQuerySchema, req.query);
  res.json(await deleteMealPlanEntry(currentUser(req).householdId, id, query));
});

recipesRouter.post("/meal-plan/:id/start", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await startCooking(currentUser(req), id));
});

recipesRouter.post("/meal-plan/:id/use", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(mealPlanUseInputSchema, req.body);
  res.json(await useIngredient(currentUser(req), id, input));
});

recipesRouter.delete("/meal-plan/:id/use/:usageId", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const usageId = parse(idSchema, req.params.usageId);
  res.json(await undoUsage(currentUser(req), id, usageId));
});

recipesRouter.post("/meal-plan/:id/extras", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(mealPlanExtraInputSchema, req.body);
  res.json(await addExtra(currentUser(req), id, input));
});

recipesRouter.put("/meal-plan/:id/step", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(mealPlanStepInputSchema, req.body);
  res.json(await setStep(currentUser(req).householdId, id, input));
});

recipesRouter.post("/meal-plan/:id/cooked", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await markCooked(currentUser(req).householdId, id));
});

// Recipes.

recipesRouter.get("/", async (req, res) => {
  const query = parse(recipeListQuerySchema, req.query);
  res.json(await listRecipes(currentUser(req).householdId, query));
});

recipesRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getRecipe(currentUser(req).householdId, id));
});

recipesRouter.get("/:id/check", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const { servings } = parse(recipeCheckQuerySchema, req.query);
  res.json(await checkRecipe(currentUser(req).householdId, id, servings));
});

recipesRouter.post("/", canManage, async (req, res) => {
  const input = parse(recipeInputSchema, req.body);
  res.status(201).json(await createRecipe(currentUser(req), input));
});

recipesRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(recipeInputSchema, req.body);
  res.json(await updateRecipe(currentUser(req).householdId, id, input));
});

recipesRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteRecipe(currentUser(req).householdId, id);
  res.status(204).end();
});

recipesRouter.put("/:id/cover", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(recipeCoverInputSchema, req.body);
  res.json(await setRecipeCover(currentUser(req).householdId, id, input));
});

// Start cooking straight from the recipe (children too): continues or creates its meal.
recipesRouter.post("/:id/cook", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(cookRecipeInputSchema, req.body ?? {});
  res.json(await cookRecipe(currentUser(req), id, input));
});
