import { describe, expect, it } from "vitest";
import { dateSchema, rangeSchema, mealSchema, nutritionBodies, offsetSeconds, filterFor } from "../src/schema.js";

const meal = { requestId: "d3f177c1-0eb4-4c7c-9e31-0360d2dd5a12", at: "2026-10-17T13:00:00+03:00", mealType: "LUNCH", dishes: [{ name: "Chicken", grams: 100, kcal: 165, protein: 31, fat: 3.6, carbs: 0, source: "label" }] };
describe("calendar and nutrition contracts", () => {
  it("rejects non-existent dates and reversed or excessive windows", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(rangeSchema.safeParse({ startDate: "2026-10-17", endDate: "2026-10-16" }).success).toBe(false);
    expect(rangeSchema.safeParse({ startDate: "2026-10-01", endDate: "2026-10-16" }).success).toBe(false);
  });
  it("uses wake dates for sleep, civil dates for daily metrics, and closed-open bounds", () => {
    expect(filterFor("sleep", "2026-10-25", "2026-10-26")).toContain("sleep.interval.civil_end_time");
    expect(filterFor("daily-heart-rate-variability", "2026-10-25", "2026-10-26")).toContain("daily_heart_rate_variability.date");
    expect(filterFor("heart-rate", "2026-10-25", "2026-10-26")).toContain(' < "2026-10-26"');
  });
  it("maps whole-portion macros, including protein in nutrients, without per-100g multiplication", () => {
    const body = nutritionBodies(mealSchema.parse(meal))[0].nutritionLog;
    expect(body.energy.kcal).toBe(165);
    expect(body.nutrients[0]).toEqual({ nutrient: "PROTEIN", quantity: { grams: 31 } });
    expect(body.interval.startUtcOffset).toBe("10800s");
    expect(offsetSeconds("2026-10-17T13:00:00-04:30")).toBe(-16200);
  });
  it("requires finite non-negative nutrition and a real explicit timezone", () => {
    expect(mealSchema.safeParse({ ...meal, at: "2026-10-17T13:00:00" }).success).toBe(false);
    expect(mealSchema.safeParse({ ...meal, dishes: [{ ...meal.dishes[0], kcal: -1 }] }).success).toBe(false);
    expect(mealSchema.safeParse({ ...meal, dishes: [{ ...meal.dishes[0], protein: Infinity }] }).success).toBe(false);
  });
});
