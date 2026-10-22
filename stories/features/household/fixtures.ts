import type { Habitant, HouseholdOverview } from "@/features/household/types/household";

/** Example data for stories and tests. */
export const habitantFixtures = {
  owner: { id: "h1", name: "Rob", type: "adult", color: "#124734", emoji: null, birthday: "1986-05-14", hasAccount: true },
  partner: { id: "h2", name: "Sofie", type: "adult", color: "#c2508a", emoji: null, birthday: "1988-09-02", hasAccount: false },
  child: { id: "h3", name: "Lena", type: "child", color: "#d9912b", emoji: "🦄", birthday: "2016-03-21", hasAccount: false },
  pet: { id: "h4", name: "Bram", type: "pet", color: "#7d9a3c", emoji: "🐶", birthday: null, hasAccount: false },
} satisfies Record<string, Habitant>;

export const householdOverviewFixture: HouseholdOverview = {
  household: { id: "hh1", name: "Wicked Home" },
  habitants: Object.values(habitantFixtures),
};
