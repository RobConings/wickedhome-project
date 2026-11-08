import type { HomeMapData } from "@/features/dashboard/data/home-map-loader";
import { placesOverviewFixture, placeFixtures } from "../places/fixtures";
import { devicesOverviewFixture, housePlansFixture, deviceAppliancesFixture } from "../devices/fixtures";
import { projectsOverviewFixture } from "../projects/fixtures";
import { tasksOverviewFixture } from "../tasks/fixtures";

export const homeMapFixture: HomeMapData = {
  places: placesOverviewFixture,
  plans: housePlansFixture,
  devices: devicesOverviewFixture,
  appliances: deviceAppliancesFixture,
  projects: { ...projectsOverviewFixture, projects: projectsOverviewFixture.projects.map((project, index) => index === 0 ? { ...project, name: "Living room refresh", places: [placeFixtures.living] } : project) },
  tasks: { ...tasksOverviewFixture, tasks: tasksOverviewFixture.tasks.map((task, index) => index === 0 ? { ...task, title: "Choose the wall colour", place: { ...placeFixtures.living, floorLevel: 0 }, status: "open" } : task) },
  plansUnavailable: false,
};
