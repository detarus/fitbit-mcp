import { z } from "zod";
export const scopePrefix = "https://www.googleapis.com/auth/googlehealth.";
export const baseScopes = ["activity_and_fitness.readonly", "health_metrics_and_measurements.readonly", "sleep.readonly", "nutrition.readonly", "settings.readonly"];
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Use a real YYYY-MM-DD date");
export const timestampSchema = z.string().datetime({ offset: true });
export const rangeSchema = z.object({ startDate: dateSchema, endDate: dateSchema }).refine(v => v.endDate > v.startDate && (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000 <= 14, "End is exclusive; choose 1–14 calendar days");
export const types = ["steps", "distance", "total-calories", "active-zone-minutes", "sleep", "heart-rate", "daily-resting-heart-rate", "daily-heart-rate-variability", "exercise", "nutrition-log", "hydration-log"] as const;
export type DataType = typeof types[number];
export const typeSchema = z.enum(types);
export const dishesSchema = z.array(z.object({
  name: z.string().trim().min(1).max(160),
  grams: z.number().positive().max(10000),
  kcal: z.number().nonnegative().max(20000),
  protein: z.number().nonnegative().max(2000),
  fat: z.number().nonnegative().max(2000),
  carbs: z.number().nonnegative().max(2000),
  source: z.enum(["photo-estimate", "text-estimate", "label", "user-provided"]),
  assumptions: z.string().max(1000).default(""),
})).min(1).max(20);
export const mealSchema = z.object({
  requestId: z.string().uuid(),
  at: timestampSchema,
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  dishes: dishesSchema,
});
export const waterSchema = z.object({
  requestId: z.string().uuid(), at: timestampSchema, milliliters: z.number().positive().max(10000),
});
export type Meal = z.infer<typeof mealSchema>;
export type Water = z.infer<typeof waterSchema>;
export function civil(date: string) {
  dateSchema.parse(date);
  const [year, month, day] = date.split("-").map(Number);
  return { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0 } };
}
export function filterFor(type: DataType, startDate: string, endDate: string) {
  rangeSchema.parse({ startDate, endDate });
  const member = type.replaceAll("-", "_");
  const field = type === "sleep" ? "sleep.interval.civil_end_time"
    : type.startsWith("daily-") ? member + ".date"
    : type === "heart-rate" ? member + ".sample_time.civil_time"
    : member + ".interval.civil_start_time";
  return field + ' >= "' + startDate + '" AND ' + field + ' < "' + endDate + '"';
}
export function nutritionBodies(meal: Meal) {
  return meal.dishes.map(d => ({
    nutritionLog: {
      interval: { startTime: meal.at, endTime: new Date(Date.parse(meal.at) + 1000).toISOString(), startUtcOffset: offsetSeconds(meal.at) + "s", endUtcOffset: offsetSeconds(meal.at) + "s" },
      foodDisplayName: d.name, mealType: meal.mealType,
      energy: { kcal: d.kcal }, totalFat: { grams: d.fat }, totalCarbohydrate: { grams: d.carbs },
      nutrients: [{ nutrient: "PROTEIN", quantity: { grams: d.protein } }], serving: { amount: 1 },
    },
  }));
}
export function offsetSeconds(at: string) {
  timestampSchema.parse(at);
  if (at.endsWith("Z")) return 0;
  const m = at.match(/([+-])(\d{2}):(\d{2})$/)!;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
}
