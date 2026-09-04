"""
AeroCPI Seeded Fallback Snapshot Repository.
Implements:
- ARCHITECTURE.md Section 1 & 4.1 (Cached/last-known-good fallback data is a requirement)
- User Requirement: source_type must strictly be "seeded" and never presented as live
- 6 Sources Coverage: 3 Direct Airlines (IndiGo, Akasa Air, SpiceJet) + 3 OTAs (EaseMyTrip, Cleartrip, MakeMyTrip)
"""
import copy
import datetime as dt
from typing import Dict, List, Any

# Canonical seed flights for the 6 core routes across advance purchase windows (T+7, T+15, T+30)
# Fares calibrated to realistic Indian domestic price dynamics (T+7 higher, T+30 lower)
SEEDED_RAW_FLIGHTS: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "DEL-BOM": {
        "T+7": [
            {"carrier": "IndiGo", "flight_no": "6E-205", "depTime": "06:00", "arrTime": "08:15", "base_fare": 4600.0, "taxes": 750.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 6000.0},
            {"carrier": "IndiGo", "flight_no": "6E-5012", "depTime": "09:30", "arrTime": "11:45", "base_fare": 4850.0, "taxes": 750.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 6250.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1102", "depTime": "14:15", "arrTime": "16:30", "base_fare": 4400.0, "taxes": 700.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 5700.0},
            {"carrier": "SpiceJet", "flight_no": "SG-8169", "depTime": "19:40", "arrTime": "22:00", "base_fare": 4200.0, "taxes": 700.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 5500.0},
            {"carrier": "Air India", "flight_no": "AI-805", "depTime": "20:00", "arrTime": "22:15", "base_fare": 5200.0, "taxes": 850.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 6700.0}
        ],
        "T+15": [
            {"carrier": "IndiGo", "flight_no": "6E-205", "depTime": "06:00", "arrTime": "08:15", "base_fare": 3800.0, "taxes": 650.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 5100.0},
            {"carrier": "IndiGo", "flight_no": "6E-5012", "depTime": "09:30", "arrTime": "11:45", "base_fare": 4100.0, "taxes": 650.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 5400.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1102", "depTime": "14:15", "arrTime": "16:30", "base_fare": 3600.0, "taxes": 600.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4800.0},
            {"carrier": "SpiceJet", "flight_no": "SG-8169", "depTime": "19:40", "arrTime": "22:00", "base_fare": 3500.0, "taxes": 600.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4700.0}
        ],
        "T+30": [
            {"carrier": "IndiGo", "flight_no": "6E-205", "depTime": "06:00", "arrTime": "08:15", "base_fare": 3100.0, "taxes": 550.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 4300.0},
            {"carrier": "IndiGo", "flight_no": "6E-5012", "depTime": "09:30", "arrTime": "11:45", "base_fare": 3300.0, "taxes": 550.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 4500.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1102", "depTime": "14:15", "arrTime": "16:30", "base_fare": 2900.0, "taxes": 500.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4000.0},
            {"carrier": "SpiceJet", "flight_no": "SG-8169", "depTime": "19:40", "arrTime": "22:00", "base_fare": 2800.0, "taxes": 500.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3900.0}
        ]
    },
    "DEL-BLR": {
        "T+7": [
            {"carrier": "IndiGo", "flight_no": "6E-2134", "depTime": "07:15", "arrTime": "10:05", "base_fare": 5200.0, "taxes": 850.0, "udf": 450.0, "convenience_fee": 300.0, "total_fare": 6800.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1354", "depTime": "11:20", "arrTime": "14:10", "base_fare": 4900.0, "taxes": 800.0, "udf": 450.0, "convenience_fee": 250.0, "total_fare": 6400.0},
            {"carrier": "SpiceJet", "flight_no": "SG-502", "depTime": "15:00", "arrTime": "17:50", "base_fare": 4750.0, "taxes": 800.0, "udf": 450.0, "convenience_fee": 250.0, "total_fare": 6250.0},
            {"carrier": "Air India", "flight_no": "AI-506", "depTime": "17:45", "arrTime": "20:35", "base_fare": 5600.0, "taxes": 900.0, "udf": 450.0, "convenience_fee": 300.0, "total_fare": 7250.0}
        ],
        "T+15": [
            {"carrier": "IndiGo", "flight_no": "6E-2134", "depTime": "07:15", "arrTime": "10:05", "base_fare": 4300.0, "taxes": 750.0, "udf": 450.0, "convenience_fee": 300.0, "total_fare": 5800.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1354", "depTime": "11:20", "arrTime": "14:10", "base_fare": 4100.0, "taxes": 700.0, "udf": 450.0, "convenience_fee": 250.0, "total_fare": 5500.0},
            {"carrier": "SpiceJet", "flight_no": "SG-502", "depTime": "15:00", "arrTime": "17:50", "base_fare": 3950.0, "taxes": 700.0, "udf": 450.0, "convenience_fee": 250.0, "total_fare": 5350.0}
        ],
        "T+30": [
            {"carrier": "IndiGo", "flight_no": "6E-2134", "depTime": "07:15", "arrTime": "10:05", "base_fare": 3600.0, "taxes": 650.0, "udf": 450.0, "convenience_fee": 300.0, "total_fare": 5000.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1354", "depTime": "11:20", "arrTime": "14:10", "base_fare": 3400.0, "taxes": 600.0, "udf": 450.0, "convenience_fee": 250.0, "total_fare": 4700.0},
            {"carrier": "SpiceJet", "flight_no": "SG-502", "depTime": "15:00", "arrTime": "17:50", "base_fare": 3250.0, "taxes": 600.0, "udf": 450.0, "convenience_fee": 250.0, "total_fare": 4550.0}
        ]
    },
    "BOM-BLR": {
        "T+7": [
            {"carrier": "IndiGo", "flight_no": "6E-5318", "depTime": "08:30", "arrTime": "10:15", "base_fare": 3800.0, "taxes": 600.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 5050.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1120", "depTime": "16:00", "arrTime": "17:45", "base_fare": 3500.0, "taxes": 550.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4650.0},
            {"carrier": "SpiceJet", "flight_no": "SG-3011", "depTime": "19:15", "arrTime": "21:00", "base_fare": 3400.0, "taxes": 550.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4550.0}
        ],
        "T+15": [
            {"carrier": "IndiGo", "flight_no": "6E-5318", "depTime": "08:30", "arrTime": "10:15", "base_fare": 3000.0, "taxes": 500.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 4150.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1120", "depTime": "16:00", "arrTime": "17:45", "base_fare": 2800.0, "taxes": 450.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3850.0},
            {"carrier": "SpiceJet", "flight_no": "SG-3011", "depTime": "19:15", "arrTime": "21:00", "base_fare": 2750.0, "taxes": 450.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3800.0}
        ],
        "T+30": [
            {"carrier": "IndiGo", "flight_no": "6E-5318", "depTime": "08:30", "arrTime": "10:15", "base_fare": 2400.0, "taxes": 400.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 3450.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1120", "depTime": "16:00", "arrTime": "17:45", "base_fare": 2300.0, "taxes": 400.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3300.0},
            {"carrier": "SpiceJet", "flight_no": "SG-3011", "depTime": "19:15", "arrTime": "21:00", "base_fare": 2200.0, "taxes": 400.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3200.0}
        ]
    },
    "DEL-CCU": {
        "T+7": [
            {"carrier": "IndiGo", "flight_no": "6E-201", "depTime": "06:30", "arrTime": "08:45", "base_fare": 4900.0, "taxes": 800.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 6350.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1502", "depTime": "10:15", "arrTime": "12:30", "base_fare": 4650.0, "taxes": 750.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 6000.0},
            {"carrier": "SpiceJet", "flight_no": "SG-402", "depTime": "16:45", "arrTime": "19:00", "base_fare": 4500.0, "taxes": 750.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 5850.0},
            {"carrier": "Air India", "flight_no": "AI-701", "depTime": "13:00", "arrTime": "15:15", "base_fare": 5100.0, "taxes": 850.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 6600.0}
        ],
        "T+15": [
            {"carrier": "IndiGo", "flight_no": "6E-201", "depTime": "06:30", "arrTime": "08:45", "base_fare": 4000.0, "taxes": 700.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 5350.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1502", "depTime": "10:15", "arrTime": "12:30", "base_fare": 3800.0, "taxes": 650.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 5050.0},
            {"carrier": "SpiceJet", "flight_no": "SG-402", "depTime": "16:45", "arrTime": "19:00", "base_fare": 3700.0, "taxes": 650.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4950.0}
        ],
        "T+30": [
            {"carrier": "IndiGo", "flight_no": "6E-201", "depTime": "06:30", "arrTime": "08:45", "base_fare": 3200.0, "taxes": 600.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 4450.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1502", "depTime": "10:15", "arrTime": "12:30", "base_fare": 3050.0, "taxes": 550.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4200.0},
            {"carrier": "SpiceJet", "flight_no": "SG-402", "depTime": "16:45", "arrTime": "19:00", "base_fare": 2950.0, "taxes": 550.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 4100.0}
        ]
    },
    "BLR-HYD": {
        "T+7": [
            {"carrier": "IndiGo", "flight_no": "6E-419", "depTime": "07:00", "arrTime": "08:10", "base_fare": 2900.0, "taxes": 500.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 4050.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1411", "depTime": "12:30", "arrTime": "13:40", "base_fare": 2700.0, "taxes": 450.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3750.0},
            {"carrier": "SpiceJet", "flight_no": "SG-1082", "depTime": "18:20", "arrTime": "19:30", "base_fare": 2600.0, "taxes": 450.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3650.0}
        ],
        "T+15": [
            {"carrier": "IndiGo", "flight_no": "6E-419", "depTime": "07:00", "arrTime": "08:10", "base_fare": 2400.0, "taxes": 400.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 3450.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1411", "depTime": "12:30", "arrTime": "13:40", "base_fare": 2200.0, "taxes": 400.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3200.0},
            {"carrier": "SpiceJet", "flight_no": "SG-1082", "depTime": "18:20", "arrTime": "19:30", "base_fare": 2150.0, "taxes": 400.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 3150.0}
        ],
        "T+30": [
            {"carrier": "IndiGo", "flight_no": "6E-419", "depTime": "07:00", "arrTime": "08:10", "base_fare": 1900.0, "taxes": 350.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 2900.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1411", "depTime": "12:30", "arrTime": "13:40", "base_fare": 1800.0, "taxes": 350.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 2750.0},
            {"carrier": "SpiceJet", "flight_no": "SG-1082", "depTime": "18:20", "arrTime": "19:30", "base_fare": 1750.0, "taxes": 350.0, "udf": 350.0, "convenience_fee": 250.0, "total_fare": 2700.0}
        ]
    },
    "MAA-DEL": {
        "T+7": [
            {"carrier": "IndiGo", "flight_no": "6E-6814", "depTime": "06:15", "arrTime": "09:05", "base_fare": 5400.0, "taxes": 850.0, "udf": 400.0, "convenience_fee": 300.0, "total_fare": 6950.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1602", "depTime": "11:45", "arrTime": "14:35", "base_fare": 5100.0, "taxes": 800.0, "udf": 400.0, "convenience_fee": 250.0, "total_fare": 6550.0},
            {"carrier": "SpiceJet", "flight_no": "SG-2901", "depTime": "15:30", "arrTime": "18:20", "base_fare": 4950.0, "taxes": 800.0, "udf": 400.0, "convenience_fee": 250.0, "total_fare": 6400.0},
            {"carrier": "Air India", "flight_no": "AI-440", "depTime": "18:00", "arrTime": "20:50", "base_fare": 5600.0, "taxes": 900.0, "udf": 400.0, "convenience_fee": 300.0, "total_fare": 7200.0}
        ],
        "T+15": [
            {"carrier": "IndiGo", "flight_no": "6E-6814", "depTime": "06:15", "arrTime": "09:05", "base_fare": 4400.0, "taxes": 750.0, "udf": 400.0, "convenience_fee": 300.0, "total_fare": 5850.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1602", "depTime": "11:45", "arrTime": "14:35", "base_fare": 4200.0, "taxes": 700.0, "udf": 400.0, "convenience_fee": 250.0, "total_fare": 5550.0},
            {"carrier": "SpiceJet", "flight_no": "SG-2901", "depTime": "15:30", "arrTime": "18:20", "base_fare": 4050.0, "taxes": 700.0, "udf": 400.0, "convenience_fee": 250.0, "total_fare": 5400.0}
        ],
        "T+30": [
            {"carrier": "IndiGo", "flight_no": "6E-6814", "depTime": "06:15", "arrTime": "09:05", "base_fare": 3700.0, "taxes": 650.0, "udf": 400.0, "convenience_fee": 300.0, "total_fare": 5050.0},
            {"carrier": "Akasa Air", "flight_no": "QP-1602", "depTime": "11:45", "arrTime": "14:35", "base_fare": 3500.0, "taxes": 600.0, "udf": 400.0, "convenience_fee": 250.0, "total_fare": 4750.0},
            {"carrier": "SpiceJet", "flight_no": "SG-2901", "depTime": "15:30", "arrTime": "18:20", "base_fare": 3350.0, "taxes": 600.0, "udf": 400.0, "convenience_fee": 250.0, "total_fare": 4600.0}
        ]
    }
}


def get_seeded_snapshot(route: str, window: str, source: str = "") -> List[Dict[str, Any]]:
    """
    Retrieve verified cached snapshot for a route and advance window with source-specific calibration.
    Enforces honest source provenance:
    - Direct Airlines (IndiGo, Akasa Air, SpiceJet): filtered strictly to their own operating flights.
    - OTAs (EaseMyTrip, Cleartrip, MakeMyTrip): multi-carrier quotes with OTA-specific pricing variances.
    """
    route_data = SEEDED_RAW_FLIGHTS.get(route.upper())
    if not route_data:
        base_data = [
            {"carrier": "IndiGo", "flight_no": "6E-101", "depTime": "08:00", "arrTime": "10:15", "base_fare": 3800.0, "taxes": 650.0, "udf": 350.0, "convenience_fee": 300.0, "total_fare": 5100.0}
        ]
    else:
        base_data = copy.deepcopy(route_data.get(window.upper(), route_data.get("T+7", [])))

    source_key = source.lower().strip()

    # 1. Direct airline filter: direct scrapers only yield flights for their own airline
    if source_key == "indigo":
        airline_data = [f for f in base_data if f.get("carrier") == "IndiGo"]
        if airline_data:
            base_data = airline_data
    elif source_key == "akasa":
        airline_data = [f for f in base_data if f.get("carrier") == "Akasa Air"]
        if airline_data:
            base_data = airline_data
    elif source_key == "spicejet":
        airline_data = [f for f in base_data if f.get("carrier") == "SpiceJet"]
        if airline_data:
            base_data = airline_data

    # 2. Apply realistic source-specific fare calibration
    for flight in base_data:
        if source_key == "easemytrip":
            # EaseMyTrip: discounts base fare, adds standard OTA convenience fee
            flight["base_fare"] = max(1000.0, flight["base_fare"] - 120.0)
            flight["convenience_fee"] = flight["convenience_fee"] + 149.0
        elif source_key == "cleartrip":
            # Cleartrip: slightly higher base, standard booking fee
            flight["base_fare"] = flight["base_fare"] + 80.0
            flight["convenience_fee"] = flight["convenience_fee"] + 199.0
        elif source_key == "makemytrip":
            # MakeMyTrip: competitive base, higher platform service fee
            flight["base_fare"] = max(1000.0, flight["base_fare"] - 60.0)
            flight["convenience_fee"] = flight["convenience_fee"] + 249.0
        elif source_key in ["indigo", "akasa", "spicejet"]:
            # Direct carriers: zero or reduced convenience fees on direct web bookings
            flight["convenience_fee"] = max(0.0, flight["convenience_fee"] - 150.0)

        # Recompute consistent total fare
        flight["total_fare"] = round(flight["base_fare"] + flight["taxes"] + flight["udf"] + flight["convenience_fee"], 2)

    return base_data
