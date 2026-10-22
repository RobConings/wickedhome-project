import { Router } from "express";
import { weatherSettingsInputSchema } from "@/features/weather/types/weather";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { getHouseholdWeather, getWeatherSettings, saveWeatherSettings } from "./weather.service";

export const weatherRouter = Router();

weatherRouter.use(requireUser);

const canManage = requireRole("owner", "adult");

/** The home's forecast from the chosen provider (cached 30 min, Open-Meteo as fallback). Every member may read it. */
weatherRouter.get("/", async (req, res) => {
  res.json(await getHouseholdWeather(currentUser(req).householdId));
});

weatherRouter.get("/settings", async (req, res) => {
  res.json(await getWeatherSettings(currentUser(req).householdId));
});

weatherRouter.put("/settings", canManage, async (req, res) => {
  res.json(await saveWeatherSettings(currentUser(req).householdId, parse(weatherSettingsInputSchema, req.body)));
});
