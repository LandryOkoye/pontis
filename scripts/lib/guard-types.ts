/** The arguments of `set_route_guard.guard`; amounts are decimal strings, as on the wire. */
export interface RouteGuardArgs {
  max_deviation_bps: number;
  hard_deviation_bps: number;
  trip_after: number;
  max_price_age_ms: number;
  stale_policy: "fail_closed" | { fail_open_with_wider_fee: { extra_fee_bps: number } };
  min_amount_in: string;
  max_amount_in: string;
  window_ms: number;
  max_window_amount_in: string;
  skew_max_bps: number;
}
