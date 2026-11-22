import { Transform } from "class-transformer";
import { IsIn, IsISO31661Alpha2, IsOptional } from "class-validator";

import {
  INTERVALS,
  Interval,
  PAID_PLAN_KEYS,
  PaidPlanKey,
} from "./plans/plans.catalog";

const upper = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toUpperCase() : value;

export class PlansQueryDto {
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2()
  country?: string;
}

export class CheckoutDto {
  @IsIn(PAID_PLAN_KEYS)
  planKey!: PaidPlanKey;

  @IsIn(INTERVALS)
  interval!: Interval;

  @Transform(upper)
  @IsISO31661Alpha2()
  billingCountry!: string;
}

export class ChangePlanDto {
  @IsIn(PAID_PLAN_KEYS)
  planKey!: PaidPlanKey;

  @IsIn(INTERVALS)
  interval!: Interval;
}
