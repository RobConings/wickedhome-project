import { computeProjectBudget, type BudgetExpense, type BudgetMaterial } from "@/features/projects/types/project-budget";
import type {
  Project,
  ProjectBudgetsSummaryData,
  ProjectCandidates,
  ProjectDetail,
  ProjectExpense,
  ProjectInvoiceReading,
  ProjectMaterial,
  ProjectsOverview,
} from "@/features/projects/types/projects";
import type { ShoppingItem } from "@/features/shopping/types/shopping";
import type { Task, TasksOverview } from "@/features/tasks/types/tasks";
import { householdOverviewFixture } from "../household/fixtures";
import { placeFixtures } from "../places/fixtures";
import { shopListFixture } from "../shops/fixtures";
import { itemFixtures, productListFixture } from "../shopping/fixtures";
import { adultViewer, taskFixtures, taskPlaces } from "../tasks/fixtures";

/** Example data for stories, pinned to the same day as the other features. */
export const projectsToday = "2026-10-02";

const placeRef = (place: (typeof placeFixtures)[keyof typeof placeFixtures]) => ({
  id: place.id,
  name: place.name,
  kind: place.kind,
  color: place.color,
  icon: place.icon,
});

type Seed = Pick<Project, "id" | "name"> & Partial<Project> & { expenses?: BudgetExpense[]; materials?: BudgetMaterial[] };

const project = ({ expenses = [], materials = [], ...seed }: Seed): Project => {
  const budgetCents = seed.budgetCents ?? null;
  return {
    icon: "folder",
    color: "#124734",
    tag: null,
    description: null,
    startDate: null,
    endDate: null,
    budgetCents,
    status: "active",
    coverFileId: null,
    places: [],
    tasks: { total: 0, open: 0, done: 0 },
    createdAt: "2026-09-01T08:00:00.000Z",
    ...seed,
    budget: computeProjectBudget(budgetCents, expenses, materials),
  };
};

export const projectFixtures = {
  /** In budget, with tasks in a chain and materials. */
  bathroom: project({
    id: "pr-bathroom",
    name: "Bathroom renovation",
    icon: "bath",
    color: "#3b82b6",
    tag: "Renovation",
    description: "New tiles, a walk-in shower and a new sink cabinet.",
    startDate: "2026-10-10",
    endDate: "2026-11-30",
    budgetCents: 800_000,
    places: [placeRef(placeFixtures.bathroom)],
    tasks: { total: 4, open: 3, done: 1 },
    expenses: [
      { amountCents: 185_000, paid: true },
      { amountCents: 120_000, paid: false },
    ],
    materials: [
      { bought: true, lineCents: 42_000, loggedAsExpense: false },
      { bought: false, lineCents: 96_000, loggedAsExpense: false },
      { bought: false, lineCents: null, loggedAsExpense: false },
    ],
  }),
  /** Above 90 % of the budget. */
  christmas: project({
    id: "pr-christmas",
    name: "Christmas presents",
    icon: "christmas",
    color: "#d4573b",
    tag: "Christmas",
    startDate: "2026-11-15",
    endDate: "2026-12-25",
    budgetCents: 60_000,
    status: "planned",
    expenses: [
      { amountCents: 32_000, paid: true },
      { amountCents: 24_500, paid: false },
    ],
  }),
  /** Over budget. */
  skiTrip: project({
    id: "pr-ski",
    name: "Ski trip Les Arcs",
    icon: "plane",
    color: "#7c5cc4",
    tag: "Holiday",
    startDate: "2027-02-13",
    endDate: "2027-02-20",
    budgetCents: 300_000,
    tasks: { total: 2, open: 1, done: 1 },
    expenses: [
      { amountCents: 245_000, paid: true },
      { amountCents: 89_000, paid: false },
    ],
  }),
  /** No budget: only tracks what it costs. */
  garden: project({
    id: "pr-garden",
    name: "Vegetable garden",
    icon: "garden",
    color: "#5f7d3a",
    tag: "Garden",
    places: [placeRef(placeFixtures.garden)],
    expenses: [{ amountCents: 4_750, paid: true }],
    materials: [{ bought: false, lineCents: 2_990, loggedAsExpense: false }],
  }),
  done: project({
    id: "pr-party",
    name: "Lena's 10th birthday party",
    icon: "party",
    color: "#c2508a",
    tag: "Party",
    startDate: "2026-06-14",
    endDate: "2026-06-14",
    budgetCents: 40_000,
    status: "done",
    tasks: { total: 3, open: 0, done: 3 },
    expenses: [{ amountCents: 36_420, paid: true }],
  }),
} satisfies Record<string, Project>;

export const projectListFixture: Project[] = Object.values(projectFixtures);

export const projectPlacesFixture = Object.values(placeFixtures).map(placeRef);

export const projectsOverviewFixture: ProjectsOverview = {
  today: projectsToday,
  projects: projectListFixture,
  tags: ["Christmas", "Garden", "Holiday", "Party", "Renovation"],
};

export const emptyProjectsOverviewFixture: ProjectsOverview = { today: projectsToday, projects: [], tags: [] };

export const projectDetailFixture: ProjectDetail = {
  today: projectsToday,
  project: projectFixtures.bathroom,
  expenses: [
    { id: "x-tiles", payee: "Tegelhandel Vandenberghe", amountCents: 120_000, dueDate: "2026-10-20", paidOn: null, recurringExpenseId: null },
    { id: "x-deposit", payee: "Loodgieter Peeters (voorschot)", amountCents: 185_000, dueDate: "2026-09-25", paidOn: "2026-09-26", recurringExpenseId: null },
  ],
  recurring: [],
  materials: [
    { id: "m-glue", name: "Tile adhesive 25 kg", quantity: 4, unit: "bags", bought: true, lineCents: 42_000, priceSource: "item", expenseId: null, taskId: "t-buy-materials" },
    { id: "m-shower", name: "Walk-in shower glass", quantity: 1, unit: null, bought: false, lineCents: 96_000, priceSource: "product", expenseId: null, taskId: null },
    { id: "m-silicone", name: "Sanitary silicone", quantity: 2, unit: null, bought: false, lineCents: null, priceSource: null, expenseId: null, taskId: "t-buy-materials" },
  ],
  invoiceReader: true,
};

export const overBudgetDetailFixture: ProjectDetail = {
  today: projectsToday,
  project: projectFixtures.skiTrip,
  expenses: [
    { id: "x-chalet", payee: "Chalet Les Arcs", amountCents: 180_000, dueDate: "2026-09-01", paidOn: "2026-09-01", recurringExpenseId: null },
    { id: "x-skipass", payee: "Ski passes", amountCents: 65_000, dueDate: "2026-09-15", paidOn: "2026-09-14", recurringExpenseId: null },
    { id: "x-rental", payee: "Ski rental", amountCents: 89_000, dueDate: "2027-02-01", paidOn: null, recurringExpenseId: null },
  ],
  recurring: [{ id: "r-insurance", payee: "Travel insurance", amountCents: 1_250, rrule: "FREQ=MONTHLY", status: "active" }],
  materials: [],
  invoiceReader: false,
};

/** A spa shop's invoice, paid, with the project's six materials still open (the double-count case). */
export const invoiceExpenseFixture: ProjectExpense = {
  id: "x-spa",
  payee: "Spa Center",
  amountCents: 169_845,
  dueDate: "2026-10-09",
  paidOn: "2026-10-09",
  recurringExpenseId: null,
};

const spaMaterial = (id: string, name: string, lineCents: number): ProjectMaterial => ({
  id,
  name,
  quantity: 1,
  unit: null,
  bought: false,
  lineCents,
  priceSource: "item",
  expenseId: null,
  taskId: null,
});

export const invoiceMaterialsFixture: ProjectMaterial[] = [
  spaMaterial("m-heatpump", "Spa heat pump", 79_900),
  spaMaterial("m-cover", "Spa cover", 53_900),
  spaMaterial("m-lift", "Cover lift", 14_900),
  spaMaterial("m-bypass", "Bypass kit", 7_995),
  spaMaterial("m-salt", "Bath salt", 2_250),
  spaMaterial("m-aqua", "Water care pack", 11_900),
];

/** What "Read invoice with AI" proposes for it: five matches (one unsure), a discount and a delivery line. */
export const invoiceReadingFixture: ProjectInvoiceReading = {
  source: { fileId: "f-invoice", name: "invoice-2026-1042.pdf", kind: "pdf" },
  lines: [
    { description: "Heat pump 7 kW for spa", quantity: 1, totalCents: 78_900 },
    { description: "Thermo cover 220 x 220", quantity: 1, totalCents: 53_900 },
    { description: "Cover lift basic", quantity: 1, totalCents: 14_900 },
    { description: "Bypass set 50 mm", quantity: 1, totalCents: 7_995 },
    { description: "Water care starter pack", quantity: 1, totalCents: 11_900 },
    { description: "Delivery", quantity: 1, totalCents: 2_250 },
  ],
  matches: [
    { itemId: "m-heatpump", lineIndex: 0, priceCents: 78_900, confidence: 0.92 },
    { itemId: "m-cover", lineIndex: 1, priceCents: 53_900, confidence: 0.9 },
    { itemId: "m-lift", lineIndex: 2, priceCents: 14_900, confidence: 0.88 },
    { itemId: "m-bypass", lineIndex: 3, priceCents: 7_995, confidence: 0.85 },
    { itemId: "m-aqua", lineIndex: 4, priceCents: 11_900, confidence: 0.62 },
  ],
  unmatchedLines: [5],
};

const projectRef = { id: projectFixtures.bathroom.id, name: projectFixtures.bathroom.name, color: projectFixtures.bathroom.color };
const bathroomPlace = taskPlaces.find((place) => place.id === "p-bathroom");
const taskPlace = bathroomPlace
  ? { id: bathroomPlace.id, name: bathroomPlace.name, kind: bathroomPlace.kind, color: bathroomPlace.color, icon: bathroomPlace.icon, floorId: bathroomPlace.floorId, floorName: "First floor", floorLevel: 1 }
  : null;

const projectTask = (seed: Pick<Task, "id" | "title"> & Partial<Task>): Task => ({
  ...taskFixtures.invoice,
  type: "job",
  place: taskPlace,
  dueDate: null,
  commentCount: 0,
  project: projectRef,
  ...seed,
});

/** "Buy materials" → "Remove the old tiles" → "Start tiling": a chain, plus one done. */
export const projectTasksOverviewFixture: TasksOverview = {
  today: projectsToday,
  viewer: adultViewer,
  completedToday: [],
  tasks: [
    projectTask({ id: "t-buy-materials", title: "Buy materials at the DIY store", type: "errand", dueDate: "2026-10-05", readiness: "waiting", materials: { total: 2, bought: 1 } }),
    projectTask({
      id: "t-old-tiles",
      title: "Remove the old tiles",
      dueDate: "2026-10-10",
      waitingFor: [{ id: "t-buy-materials", title: "Buy materials at the DIY store", status: "open", dueDate: "2026-10-05" }],
    }),
    projectTask({
      id: "t-tiling",
      title: "Start tiling",
      dueDate: "2026-10-17",
      waitingFor: [{ id: "t-old-tiles", title: "Remove the old tiles", status: "open", dueDate: "2026-10-10" }],
    }),
    projectTask({ id: "t-measure", title: "Measure the walls", status: "done", closedAt: "2026-09-28T10:00:00.000Z", readiness: "done" }),
  ],
};

export const projectTaskHabitants = householdOverviewFixture.habitants;

const materialItem = (item: ShoppingItem, patch: Partial<ShoppingItem>): ShoppingItem => ({ ...item, project: projectRef, ...patch });

export const projectMaterialsFixture = {
  items: [
    materialItem(itemFixtures.nailGun, { id: "m-glue", name: "Tile adhesive 25 kg", quantity: 4, unit: "bags", priceCents: 10_500, status: "bought", boughtByName: "Sofie", taskId: "t-buy-materials" }),
    materialItem(itemFixtures.sheeting, { id: "m-shower", name: "Walk-in shower glass", quantity: 1, unit: null, priceCents: 96_000, taskId: null, source: "task" }),
    materialItem(itemFixtures.sheeting, { id: "m-silicone", name: "Sanitary silicone", quantity: 2, unit: null, priceCents: null, taskId: "t-buy-materials" }),
  ],
  products: productListFixture,
  shops: shopListFixture,
};

export const projectCandidatesFixture: ProjectCandidates = {
  tasks: [
    { id: "t-paint", title: "Paint the hallway", dueDate: "2026-10-12" },
    { id: "t-lamp", title: "Hang the new lamp", dueDate: null },
  ],
  expenses: [
    { id: "x-gamma", payee: "Gamma", amountCents: 8_430, dueDate: "2026-09-30", paidOn: "2026-09-30" },
    { id: "x-electrician", payee: "Electrician Janssens", amountCents: 64_000, dueDate: "2026-10-15", paidOn: null },
  ],
  recurring: [{ id: "r-container", payee: "Container rental", amountCents: 9_500, rrule: "FREQ=WEEKLY" }],
};

export const projectBudgetsSummaryFixture: ProjectBudgetsSummaryData = {
  month: "2026-10",
  projects: [projectFixtures.bathroom, projectFixtures.christmas, projectFixtures.skiTrip, projectFixtures.garden].map((item) => ({
    project: {
      id: item.id,
      name: item.name,
      icon: item.icon,
      color: item.color,
      status: item.status,
      budgetCents: item.budgetCents,
      startDate: item.startDate,
      endDate: item.endDate,
    },
    budget: item.budget,
    spentInMonthCents: item.id === "pr-bathroom" ? 42_000 : item.id === "pr-garden" ? 4_750 : 0,
    dueInMonthCents: item.id === "pr-bathroom" ? 120_000 : 0,
  })),
  totals: { spentInMonthCents: 46_750, dueInMonthCents: 120_000, overBudget: 1, atRisk: 1 },
};

export const emptyProjectBudgetsSummaryFixture: ProjectBudgetsSummaryData = {
  month: "2026-10",
  projects: [],
  totals: { spentInMonthCents: 0, dueInMonthCents: 0, overBudget: 0, atRisk: 0 },
};

export const projectSelectionsFixture = { favoriteIds: ["pr-bathroom"], recentIds: ["pr-christmas", "pr-ski"] };

export const projectCoverImagesFixture = [
  {
    id: "f-inspiration",
    name: "inspiration.jpg",
    mimeType: "image/jpeg",
  },
];
