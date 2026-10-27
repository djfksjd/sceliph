"""Independent Decimal oracle for the 128-point bore; stdlib only.

Uses Machin's pi identity and direct Taylor recurrences, not the engine's
range-reduced Horner implementation or the host's transcendental functions.
"""
import argparse
import json
from decimal import Decimal, localcontext
from pathlib import Path


def reference(precision):
    with localcontext() as context:
        context.prec = precision
        epsilon = Decimal(10) ** (-precision + 8)

        def atan(x):
            power, total, square = x, x, x * x
            for n in range(1, 4096):
                power *= -square
                term = power / (2 * n + 1)
                total += term
                if abs(term) < epsilon:
                    return total
            raise RuntimeError("Oracle atan budget exceeded")

        pi = 16 * atan(Decimal(1) / 5) - 4 * atan(Decimal(1) / 239)

        def sincos(x):
            if x < -pi:
                x += 2 * pi
            sine, cosine, sterm, cterm = x, Decimal(1), x, Decimal(1)
            square = x * x
            for n in range(1, 512):
                sterm *= -square / ((2 * n) * (2 * n + 1))
                cterm *= -square / ((2 * n - 1) * (2 * n))
                sine += sterm
                cosine += cterm
                if abs(sterm) < epsilon and abs(cterm) < epsilon:
                    return sine, cosine
            raise RuntimeError("Oracle trig budget exceeded")

        circle = []
        for i in range(128):
            sine, cosine = sincos(-2 * pi * i / 128)
            circle.append((cosine, sine))
        return circle, 1 / sincos(pi / 128)[1]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    low, secant = reference(90)
    high, high_secant = reference(140)
    drift = max(abs(a - b) for first, second in zip(low, high) for a, b in zip(first, second))
    if drift > Decimal("1e-80") or abs(secant - high_secant) > Decimal("1e-80"):
        raise RuntimeError("Independent precision convergence failed")
    result = {"method": "Decimal Machin pi + Taylor recurrence", "precision": 140,
              "precisionConvergenceMaximum": str(drift), "units": "unit circle; scale in millimetres",
              "circle": [[float(x), float(y)] for x, y in high], "bevelSecant": float(high_secant)}
    with args.output.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(result, indent=2) + "\n")
