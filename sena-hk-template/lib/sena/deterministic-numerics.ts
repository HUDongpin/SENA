/**
 * Fixed binary64 numerical kernels, adapted for SENA from stdlib and FDLIBM.
 * Copyright (c) 2018, 2022 The Stdlib Authors. Licensed under Apache-2.0.
 * Copyright (C) 1993, 2004 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunPro, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 *
 * Modified for SENA: TypeScript, local endian-explicit word access, inlined
 * constants/polynomials, canonical NaN, and a private expm1 restricted to the
 * interval used by tanh. No environmental implementation selection.
 * Coefficients and arithmetic grouping follow the pinned sources listed in
 * deterministic-numerics.NOTICE, which contains complete license notices.
 * These kernels define numerical evaluation; they do not change validation
 * tolerances, formula definitions, or statistical interpretation.
 */

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;

// Each call owns its bytes; no shared scratch state or host byte-order assumption.
function highWord(x: number): number {
  const words = new DataView(new ArrayBuffer(8));
  words.setFloat64(0, x, false);
  return words.getUint32(0, false);
}

function withHighWord(x: number, high: number): number {
  const words = new DataView(new ArrayBuffer(8));
  words.setFloat64(0, x, false);
  words.setUint32(0, high, false);
  return words.getFloat64(0, false);
}

function logPolynomial(x: number): number {
  return 0.6666666666666735 + (x * (0.3999999999940942 + (x * (0.2857142874366239 + (x * (0.22222198432149784 + (x * (0.1818357216161805 + (x * (0.15313837699209373 + (x * 0.14798198605116586)))))))))));
}

/** Natural logarithm; signed zeros map to -Infinity, negative inputs to NaN. */
export function senaDeterministicLog(x: number): number {
  if (x === 0) return -Infinity;
  if (Number.isNaN(x) || x < 0) return NaN;
  let hx = highWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    k -= 54;
    x *= 1.80143985094819840000e16;
    hx = highWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHighWord(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) return k === 0 ? 0 : (k * LN2_HI) + (k * LN2_LO);
    const r = f * f * (0.5 - (0.33333333333333333 * f));
    if (k === 0) return f - r;
    return (k * LN2_HI) - ((r - (k * LN2_LO)) - f);
  }
  const s = f / (2.0 + f);
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (0.3999999999940942 + (w * (0.22222198432149784 + (w * 0.15313837699209373))));
  const t2 = z * (0.6666666666666735 + (w * (0.2857142874366239 + (w * (0.1818357216161805 + (w * 0.14798198605116586))))));
  i |= j;
  const r = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - (s * (hfsq + r)));
    return (k * LN2_HI) - (hfsq - ((s * (hfsq + r)) + (k * LN2_LO)) - f);
  }
  if (k === 0) return f - (s * (f - r));
  return (k * LN2_HI) - (((s * (f - r)) - (k * LN2_LO)) - f);
}

/** Natural logarithm of 1+x, retaining small x and both signed zeros. */
export function senaDeterministicLog1p(x: number): number {
  if (x < -1 || Number.isNaN(x)) return NaN;
  if (x === -1) return -Infinity;
  if (x === Infinity || x === 0) return x;
  const y = x < 0 ? -x : x;
  let k = 1;
  let f = 0;
  let hu = 0;
  let c = 0;
  if (y < 4.142135623730950488017e-1) {
    if (y < 1.862645149230957e-9) {
      if (y < 5.551115123125783e-17) return x;
      return x - (x * x * 0.5);
    }
    if (x > -2.928932188134524755992e-1) {
      k = 0;
      f = x;
      hu = 1;
    }
  }
  if (k !== 0) {
    let u: number;
    if (y < 9007199254740992) {
      u = 1.0 + x;
      hu = highWord(u);
      k = (hu >> 20) - 1023;
      c = k > 0 ? 1.0 - (u - x) : x - (u - 1.0);
      c /= u;
    } else {
      u = x;
      hu = highWord(u);
      k = (hu >> 20) - 1023;
      c = 0;
    }
    hu &= 0x000fffff;
    if (hu < 434334) {
      u = withHighWord(u, hu | 0x3ff00000);
    } else {
      k += 1;
      u = withHighWord(u, hu | 0x3fe00000);
      hu = (1048576 - hu) >> 2;
    }
    f = u - 1.0;
  }
  const hfsq = 0.5 * f * f;
  if (hu === 0) {
    if (f === 0) {
      c += k * LN2_LO;
      return (k * LN2_HI) + c;
    }
    const r = hfsq * (1.0 - (6.666666666666666666e-1 * f));
    return (k * LN2_HI) - ((r - ((k * LN2_LO) + c)) - f);
  }
  const s = f / (2.0 + f);
  const z = s * s;
  const r = z * logPolynomial(z);
  if (k === 0) return f - (hfsq - (s * (hfsq + r)));
  return (k * LN2_HI) - ((hfsq - ((s * (hfsq + r)) + ((k * LN2_LO) + c))) - f);
}

/** Inverse hyperbolic tangent on [-1,1], with infinite endpoint values. */
export function senaDeterministicAtanh(x: number): number {
  if (Number.isNaN(x) || x < -1 || x > 1) return NaN;
  const hx = highWord(x);
  const sign = (hx & 0x80000000) >>> 0;
  const ix = hx & 0x7fffffff;
  if (ix === 0x3ff00000) return sign === 0 ? Infinity : -Infinity;
  if (ix < 0x3e300000) return x;
  const ax = withHighWord(x, ix);
  let t: number;
  if (ix < 0x3fe00000) {
    t = ax + ax;
    t = 0.5 * senaDeterministicLog1p(t + (t * ax / (1.0 - ax)));
  } else {
    t = 0.5 * senaDeterministicLog1p((ax + ax) / (1.0 - ax));
  }
  return sign === 0 ? t : -t;
}

// The only caller supplies finite x in (-2, 44). This is the stdlib expm1
// reduction/reconstruction with unreachable overflow/non-finite branches
// omitted; it is intentionally private, not a general-purpose expm1 API.
function expm1ForTanh(x: number): number {
  const sign = x < 0;
  const y = sign ? -x : x;
  let k = 0;
  let c = 0;
  if (y > 3.46573590279972654709e-1) {
    let hi: number;
    let lo: number;
    if (y < 1.03972077083991796413) {
      hi = sign ? x + LN2_HI : x - LN2_HI;
      lo = sign ? -LN2_LO : LN2_LO;
      k = sign ? -1 : 1;
    } else {
      k = ((1.44269504088896338700 * x) + (sign ? -0.5 : 0.5)) | 0;
      hi = x - (k * LN2_HI);
      lo = k * LN2_LO;
    }
    x = hi - lo;
    c = (hi - x) - lo;
  } else if (highWord(y) < 0x3c900000) {
    return x;
  }
  const halfX = 0.5 * x;
  const z = x * halfX;
  const polynomial = -0.03333333333333313 + (z * (0.0015873015872548146 + (z * (-0.0000793650757867488 + (z * (0.000004008217827329362 + (z * -2.0109921818362437e-7)))))));
  const r1 = 1.0 + (z * polynomial);
  let t = 3.0 - (r1 * halfX);
  let e = z * ((r1 - t) / (6.0 - (x * t)));
  if (k === 0) return x - ((x * e) - z);
  const twopk = withHighWord(0, (1023 + k) << 20);
  e = (x * (e - c)) - c;
  e -= z;
  if (k === -1) return (0.5 * (x - e)) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5));
    return 1.0 + (2.0 * (x - e));
  }
  if (k <= -2 || k > 56) return ((1.0 - (e - x)) * twopk) - 1.0;
  let result: number;
  if (k < 20) {
    t = withHighWord(1.0, 1072693248 - (0x200000 >> k));
    result = t - (e - x);
  } else {
    t = withHighWord(1.0, (1023 - k) << 20);
    result = x - (e + t);
    result += 1.0;
  }
  return result * twopk;
}

/** Hyperbolic tangent, using the fixed FDLIBM expm1 reduction. */
export function senaDeterministicTanh(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix < 0x3e300000) return x;
  let z: number;
  if (ix < 0x40360000) {
    const ax = x < 0 ? -x : x;
    if (ix >= 0x3ff00000) {
      const t = expm1ForTanh(2.0 * ax);
      z = 1.0 - (2.0 / (t + 2.0));
    } else {
      const t = expm1ForTanh(-2.0 * ax);
      z = -t / (t + 2.0);
    }
  } else {
    z = 1.0;
  }
  return (hx & 0x80000000) === 0 ? z : -z;
}
