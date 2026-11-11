//! The `get_route_guards` view (ADR 0016 section 6): every guard of a route with its verdict, so a
//! client can explain a refusal instead of guessing.

use crate::{Contract, ContractExt};
use near_sdk::near;

/// One line of the guard breakdown: what was checked, whether it passed, and the detail.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
pub struct GuardCheck {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
pub struct RouteGuards {
    pub executable: bool,
    pub checks: Vec<GuardCheck>,
    /// The effective fee for `amount_in` when given and the route is otherwise open.
    pub fee_bps: Option<u16>,
    pub skew_bps: Option<u16>,
    pub degraded: bool,
}

pub(crate) fn check_line(name: &str, passed: bool, detail: impl Into<String>) -> GuardCheck {
    GuardCheck {
        name: name.to_string(),
        passed,
        detail: detail.into(),
    }
}

#[near]
impl Contract {
    /// Every guard of the route `from -> to` with its verdict, so a client can explain a refusal.
    /// Checks are independent: a failure does not hide later ones. With `amount_in` the
    /// amount-dependent checks and the effective fee are included.
    pub fn get_route_guards(
        &self,
        from_id: String,
        to_id: String,
        amount_in: Option<near_sdk::json_types::U128>,
    ) -> RouteGuards {
        let mut checks = Vec::new();
        let route = self.check_route(&from_id, &to_id);
        checks.push(match &route {
            Ok(_) => check_line("route", true, "executable"),
            Err(r) => check_line("route", false, format!("{r:?}")),
        });
        checks.extend(self.action_lifecycle_checks(&from_id, &to_id));
        checks.extend(self.reserve_guard_checks(&from_id, &to_id));
        let pair = crate::compatibility::pair_key(&from_id, &to_id);
        let guard = self.guards.get(&pair);
        checks.push(check_line(
            "guard",
            guard.is_some(),
            if guard.is_some() {
                "configured"
            } else {
                "unguarded"
            },
        ));
        if let Some(g) = guard {
            let now = crate::now_ms();
            for id in [&from_id, &to_id] {
                checks.push(match self.reference_price(id) {
                    None => check_line("price_freshness", false, format!("{id}: no price")),
                    Some(p) => {
                        let age = now.saturating_sub(p.as_of_ms);
                        check_line(
                            "price_freshness",
                            age <= g.max_price_age_ms,
                            format!("{id}: {age} ms old, limit {} ms", g.max_price_age_ms),
                        )
                    }
                });
            }
            let breaker = self.breakers.get(&pair);
            checks.push(check_line(
                "circuit_breaker",
                !breaker.is_some_and(|b| b.tripped),
                match breaker {
                    Some(b) => format!(
                        "{} violations, {} trips",
                        b.consecutive_violations, b.trip_count
                    ),
                    None => "no violations".to_string(),
                },
            ));
        }
        let mut fee_bps = None;
        let mut skew = None;
        if let (Ok(terms), Some(amount)) = (&route, amount_in) {
            let amount = amount.0;
            let limits = self.check_guard_limits(&from_id, &to_id, amount);
            checks.push(check_line(
                "amount_limits",
                limits.is_ok(),
                match limits {
                    Ok(()) => "within limits".to_string(),
                    Err(reason) => format!("{reason:?}"),
                },
            ));
            let fee = self.effective_fee_bps(&from_id, &to_id, terms, amount);
            let base = self.fee_bps + terms.extra_fee_bps;
            fee_bps = Some(fee);
            skew = Some(fee - base);
            if let Some(a) = crate::math::compute_amounts(amount, terms.ratio, fee) {
                let inventory = self.get_inventory(to_id.clone()).0;
                checks.push(check_line(
                    "vault_inventory",
                    a.net > 0 && inventory >= a.net,
                    format!("needs {}, holds {inventory}", a.net),
                ));
            }
        }
        RouteGuards {
            executable: checks.iter().all(|c| c.passed || c.name == "guard"),
            checks,
            fee_bps,
            skew_bps: skew,
            degraded: matches!(&route, Ok(t) if t.extra_fee_bps > 0),
        }
    }
}
