"""
Canadian Forest Fire Danger Rating System (CFFDRS) — open equations.
Source: Van Wagner (1987); standard FFMC/DMC/DC/ISI/BUI/FWI/DSR pipeline.

Inputs: ERA5-style daily fields (tas °C, pr mm/day, sfcWind km/h, hurs %, month).
Outputs: FFMC, DMC, DC, ISI, BUI, FWI, DSR — ready for India grid processing.
"""
import numpy as np
import warnings

warnings.filterwarnings("ignore")


def ffmc_calc(tas, pr, sfcWind, hurs, ffmc0: np.ndarray = 85.0) -> np.ndarray:
    ro = np.copy(pr)
    mo = 147.2 * (101.0 - ffmc0) / (59.5 + ffmc0)
    rf = np.copy(ro)
    rf[ro > 0.5] = rf[ro > 0.5] - 0.5

    mr = np.copy(mo)
    mr = np.where(
        (ro > 0.5) & (mo <= 150.0),
        mo + 42.5 * rf * (np.exp(-100.0 / (251.0 - mo))) * (1.0 - np.exp(-6.93 / rf)),
        mr,
    )
    mr = np.where(
        (ro > 0.5) & (mo > 150.0),
        mo
        + 42.5 * rf * (np.exp(-100.0 / (251.0 - mo))) * (1.0 - np.exp(-6.93 / rf))
        + 0.0015 * (mo - 150.0) ** 2.0 * np.sqrt(rf),
        mr,
    )
    mr[mr > 250.0] = 250.0

    Ed = (
        0.942 * hurs**0.679
        + 11.0 * np.exp((hurs - 100.0) / 10.0)
        + 0.18 * (21.1 - tas) * (1.0 - 1.0 / np.exp(hurs * 0.115))
    )
    Ew = (
        0.618 * hurs**0.753
        + 10.0 * np.exp((hurs - 100.0) / 10.0)
        + 0.18 * (21.1 - tas) * (1.0 - 1.0 / np.exp(hurs * 0.115))
    )

    kd = (
        0.424 * (1.0 - (hurs / 100.0) ** 1.7)
        + 0.0694 * np.sqrt(sfcWind) * (1.0 - (hurs / 100.0) ** 8.0)
    ) * 0.581 * np.exp(0.0365 * tas)
    kw = (
        0.424 * (1.0 - ((100.0 - hurs) / 100.0) ** 1.7)
        + 0.0694 * np.sqrt(sfcWind) * (1.0 - ((100.0 - hurs) / 100.0) ** 8)
    ) * 0.581 * np.exp(0.0365 * tas)

    m = np.copy(mr)
    m = np.where(mr > Ed, Ed + (mr - Ed) * 10**-kd, m)
    m = np.where(mr < Ew, Ew - (Ew - mr) * 10**-kw, m)

    ffmc = 59.5 * (250.0 - m) / (147.2 + m)
    return np.where(ffmc > 101.0, 101.0, ffmc)


def dmc_calc(tas, pr, hurs, mon, dmc0: np.ndarray = 6.0) -> np.ndarray:
    ro = np.copy(pr)
    Po = np.copy(dmc0)
    tas = np.where(tas < -1.1, -1.1, tas)

    Le = np.array([6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0])
    re = np.where(ro > 1.5, 0.92 * ro - 1.27, ro)
    Mo = 20.0 + np.exp(5.6348 - Po / 43.43)

    b = 100.0 / (0.5 + 0.3 * Po)
    b = np.where((Po > 33.0) & (Po <= 65.0), 14 - 1.3 * np.log(Po), b)
    b = np.where(Po > 65.0, 6.2 * np.log(Po) - 17.2, b)

    Mr = np.where(ro > 1.5, Mo + 1000.0 * re / (48.77 + b * re), 0.0)
    Pr = np.where(ro > 1.5, 244.72 - 43.43 * np.log(Mr - 20.0), Po)
    Pr[Pr < 0.0] = 0.0

    K = 1.894 * (tas + 1.1) * (100.0 - hurs) * Le[mon] * 1e-06
    return Pr + 100.0 * K


def dc_calc(tas, pr, mon, dc0: np.ndarray = 150.0) -> np.ndarray:
    ro = np.copy(pr)
    Do = np.copy(dc0)
    tas = np.where(tas < -2.8, -2.8, tas)

    Lf = np.array([-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6])
    rd = np.where(ro > 2.8, 0.83 * ro - 1.27, 0.0)
    Qo = 800.0 * np.exp(-Do / 400.0)
    Qr = Qo + 3.937 * rd
    Dr = np.where(ro <= 2.8, Do, 400.0 * np.log(800.0 / Qr))
    Dr[Dr < 0.0] = 0.0

    V = np.where(0.36 * (tas + 2.8) + Lf[mon] < 0.0, 0.0, 0.36 * (tas + 2.8) + Lf[mon])
    return Dr + V / 2


def isi_calc(ffmc, sfcWind) -> np.ndarray:
    m = 147.2 * (101.0 - ffmc) / (59.5 + ffmc)
    fW = np.exp(0.05039 * sfcWind)
    fF = 91.9 * np.exp(-0.1386 * m) * (1.0 + (m**5.31) / (4.93 * 1e7))
    return 0.208 * fW * fF


def bui_calc(dmc, dc) -> np.ndarray:
    P = np.copy(dmc)
    D = np.copy(dc)
    P[P < 0.001] = 0.0

    bui = np.where(
        P <= 0.4 * D,
        0.8 * P * D / (P + 0.4 * D),
        P - (1.0 - 0.8 * D / (P + 0.4 * D)) * (0.92 + (0.0114 * P) ** 1.7),
    )
    bui = np.where((P == 0.0) & (D == 0.0), 0.0, bui)
    bui[bui < 0.0] = 0.0
    return bui


def fwi_calc(isi, bui) -> np.ndarray:
    R = np.copy(isi)
    U = np.copy(bui)
    fD = np.where(
        U <= 80.0,
        0.626 * U**0.809 + 2.0,
        1000.0 / (25.0 + 108.64 * np.exp(-0.0203 * U)),
    )
    B = 0.1 * R * fD
    return np.where(B > 1.0, np.exp(2.72 * (0.434 * np.log(B)) ** 0.647), B)


def dsr_calc(fwi) -> np.ndarray:
    return 0.0272 * fwi**1.77


def cffdrs_calc(
    tas: np.ndarray,
    pr: np.ndarray,
    sfcWind: np.ndarray,
    hurs: np.ndarray,
    mon,
    ffmc0: np.ndarray = 85.0,
    dmc0: np.ndarray = 6.0,
    dc0: np.ndarray = 150.0,
) -> dict:
    arr_shape = tas.shape
    ffmc = np.zeros(arr_shape)
    dmc = np.zeros(arr_shape)
    dc = np.zeros(arr_shape)
    isi = np.zeros(arr_shape)
    bui = np.zeros(arr_shape)
    fwi = np.zeros(arr_shape)
    dsr = np.zeros(arr_shape)

    mon = np.asarray(mon)
    ndays = mon.size

    for i in range(ndays):
        ffmc[i, ...] = ffmc_calc(tas[i, ...], pr[i, ...], sfcWind[i, ...], hurs[i, ...], ffmc0)
        dmc[i, ...] = dmc_calc(tas[i, ...], pr[i, ...], hurs[i, ...], mon[i] - 1, dmc0)
        dc[i, ...] = dc_calc(tas[i, ...], pr[i, ...], mon[i] - 1, dc0)
        isi[i, ...] = isi_calc(ffmc[i, ...], sfcWind[i, ...])
        bui[i, ...] = bui_calc(dmc[i, ...], dc[i, ...])
        fwi[i, ...] = fwi_calc(isi[i, ...], bui[i, ...])
        dsr[i, ...] = dsr_calc(fwi[i, ...])
        ffmc0, dmc0, dc0 = ffmc[i, ...], dmc[i, ...], dc[i, ...]

    return {"ffmc": ffmc, "dmc": dmc, "dc": dc, "isi": isi, "bui": bui, "fwi": fwi, "dsr": dsr}
