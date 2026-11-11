//! A small unsigned 256-bit integer for the guard arithmetic (ADR 0016). Hand-written, with only
//! the operations the guards need, to avoid a dependency and keep the wasm small. Every operation
//! that can overflow returns `None`; callers treat that as a refusal, never as a pass.

use std::cmp::Ordering;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct U256 {
    hi: u128,
    lo: u128,
}

const MASK: u128 = u64::MAX as u128;

/// Full 128 x 128 -> 256 bit product, as `(hi, lo)`.
fn widening_mul(a: u128, b: u128) -> (u128, u128) {
    let (a1, a0) = (a >> 64, a & MASK);
    let (b1, b0) = (b >> 64, b & MASK);
    let p00 = a0 * b0;
    let p01 = a0 * b1;
    let p10 = a1 * b0;
    let p11 = a1 * b1;
    let mid = (p00 >> 64) + (p01 & MASK) + (p10 & MASK);
    let lo = (p00 & MASK) | (mid << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    (hi, lo)
}

impl U256 {
    pub const ZERO: U256 = U256 { hi: 0, lo: 0 };

    pub fn from_u128(v: u128) -> U256 {
        U256 { hi: 0, lo: v }
    }

    pub fn mul(a: u128, b: u128) -> U256 {
        let (hi, lo) = widening_mul(a, b);
        U256 { hi, lo }
    }

    pub fn is_zero(&self) -> bool {
        self.hi == 0 && self.lo == 0
    }

    /// `self * m`, or `None` on overflow of 256 bits.
    pub fn checked_mul_u128(self, m: u128) -> Option<U256> {
        let (c, lo) = widening_mul(self.lo, m);
        let (overflow, hi_part) = widening_mul(self.hi, m);
        if overflow != 0 {
            return None;
        }
        Some(U256 {
            hi: hi_part.checked_add(c)?,
            lo,
        })
    }

    /// `self - other`, or `None` if `other > self`.
    pub fn checked_sub(self, other: U256) -> Option<U256> {
        if self < other {
            return None;
        }
        let (lo, borrow) = self.lo.overflowing_sub(other.lo);
        let hi = self.hi - other.hi - u128::from(borrow);
        Some(U256 { hi, lo })
    }

    pub fn abs_diff(self, other: U256) -> U256 {
        if self >= other {
            self.checked_sub(other).unwrap_or(U256::ZERO)
        } else {
            other.checked_sub(self).unwrap_or(U256::ZERO)
        }
    }

    fn shl1(self) -> (U256, bool) {
        let carry = self.hi >> 127 == 1;
        (
            U256 {
                hi: (self.hi << 1) | (self.lo >> 127),
                lo: self.lo << 1,
            },
            carry,
        )
    }

    fn bit(&self, i: u32) -> bool {
        if i >= 128 {
            (self.hi >> (i - 128)) & 1 == 1
        } else {
            (self.lo >> i) & 1 == 1
        }
    }

    /// `(self / divisor, self % divisor)`, or `None` if `divisor` is zero. Shift-subtract: 256
    /// iterations, only used on the refusal and view paths and for breaker details.
    pub fn div_rem(self, divisor: U256) -> Option<(U256, U256)> {
        if divisor.is_zero() {
            return None;
        }
        let mut quotient = U256::ZERO;
        let mut rem = U256::ZERO;
        for i in (0..256).rev() {
            // rem < divisor <= 2^256 - 1, so rem * 2 + 1 can reach 2^257 only if the top bit of
            // rem is set; that carry means rem >= divisor after the shift, so subtract.
            let (shifted, carry) = rem.shl1();
            rem = U256 {
                hi: shifted.hi,
                lo: shifted.lo | u128::from(self.bit(i)),
            };
            let (q, _) = quotient.shl1();
            quotient = q;
            if carry || rem >= divisor {
                // With a carry the true value is 2^256 + rem; the wrapping subtraction is exact.
                rem = rem.wrapping_sub(divisor);
                quotient.lo |= 1;
            }
        }
        Some((quotient, rem))
    }

    fn wrapping_sub(self, other: U256) -> U256 {
        let (lo, borrow) = self.lo.overflowing_sub(other.lo);
        let hi = self
            .hi
            .wrapping_sub(other.hi)
            .wrapping_sub(u128::from(borrow));
        U256 { hi, lo }
    }

    /// The value as `u128`, saturating at `u128::MAX`.
    pub fn saturating_u128(self) -> u128 {
        if self.hi != 0 {
            u128::MAX
        } else {
            self.lo
        }
    }

    /// `ceil(self / divisor)` saturated to `u128`, or `None` if `divisor` is zero.
    pub fn div_ceil_u128(self, divisor: U256) -> Option<u128> {
        let (q, r) = self.div_rem(divisor)?;
        let q = q.saturating_u128();
        Some(if r.is_zero() { q } else { q.saturating_add(1) })
    }
}

impl PartialOrd for U256 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for U256 {
    fn cmp(&self, other: &Self) -> Ordering {
        self.hi.cmp(&other.hi).then(self.lo.cmp(&other.lo))
    }
}

/// `10^exp` for `exp <= 38`.
pub fn pow10(exp: u32) -> Option<u128> {
    10u128.checked_pow(exp)
}

#[cfg(test)]
mod tests {
    use super::*;

    impl U256 {
        /// Only the round-trip property test needs addition.
        pub fn checked_add(self, other: U256) -> Option<U256> {
            let (lo, carry) = self.lo.overflowing_add(other.lo);
            let hi = self
                .hi
                .checked_add(other.hi)?
                .checked_add(u128::from(carry))?;
            Some(U256 { hi, lo })
        }
    }

    use proptest::prelude::*;

    fn to_big(a: U256) -> (u128, u128) {
        (a.hi, a.lo)
    }

    #[test]
    fn multiplies_past_u128() {
        let p = U256::mul(u128::MAX, u128::MAX);
        // (2^128 - 1)^2 = 2^256 - 2^129 + 1
        assert_eq!(to_big(p), (u128::MAX - 1, 1));
        assert_eq!(to_big(U256::mul(10, 10)), (0, 100));
    }

    #[test]
    fn mul_by_u128_overflows_to_none() {
        let big = U256::mul(u128::MAX, u128::MAX);
        assert_eq!(big.checked_mul_u128(2), None);
        assert_eq!(
            U256::from_u128(5).checked_mul_u128(7),
            Some(U256::from_u128(35))
        );
    }

    #[test]
    fn divides_a_wide_number() {
        // (2^128) / 2 = 2^127
        let two128 = U256 { hi: 1, lo: 0 };
        let (q, r) = two128.div_rem(U256::from_u128(2)).unwrap();
        assert_eq!((to_big(q), to_big(r)), ((0, 1u128 << 127), (0, 0)));
        assert_eq!(U256::from_u128(1).div_rem(U256::ZERO), None);
    }

    proptest! {
        #[test]
        fn mul_matches_u128_when_it_fits(a in any::<u64>(), b in any::<u64>()) {
            let wide = U256::mul(u128::from(a), u128::from(b));
            prop_assert_eq!(to_big(wide), (0, u128::from(a) * u128::from(b)));
        }

        #[test]
        fn div_rem_matches_u128(a in any::<u128>(), d in 1u128..) {
            let (q, r) = U256::from_u128(a).div_rem(U256::from_u128(d)).unwrap();
            prop_assert_eq!((to_big(q), to_big(r)), ((0, a / d), (0, a % d)));
        }

        #[test]
        fn product_then_divide_returns_the_factor(a in any::<u128>(), b in 1u128..) {
            let p = U256::mul(a, b);
            let (q, r) = p.div_rem(U256::from_u128(b)).unwrap();
            prop_assert_eq!((to_big(q), to_big(r)), ((0, a), (0, 0)));
        }

        #[test]
        fn add_sub_round_trip(a in any::<u128>(), b in any::<u128>(), c in any::<u128>(), d in any::<u128>()) {
            let x = U256::mul(a, b);
            let y = U256::mul(c, d);
            if let Some(sum) = x.checked_add(y) {
                prop_assert_eq!(sum.checked_sub(y), Some(x));
            }
            prop_assert_eq!(x.abs_diff(y), y.abs_diff(x));
        }
    }
}
