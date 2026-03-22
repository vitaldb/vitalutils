"""
VitalDB FHIR R4 Demo Server

Provides HL7 FHIR R4 compatible REST API endpoints for VitalDB open dataset.
Supports Patient, Encounter, and Observation resources.

Resources mapping:
  - Patient     <- cases (caseid, subjectid, age, sex, height, weight, bmi)
  - Encounter   <- cases (opname, department, ane_type, asa, opstart/opend, casestart/caseend)
  - Observation <- labs (lab results) + cases (preop vitals/labs)

Usage:
  python app.py [--port 8080] [--host 0.0.0.0]
"""

import argparse
from flask import Flask, request, jsonify
from data_loader import DataLoader
from fhir_resources import FHIRResourceBuilder

app = Flask(__name__)
loader = DataLoader()
builder = FHIRResourceBuilder()

# FHIR base URL (set dynamically)
FHIR_BASE = None


def get_fhir_base():
    global FHIR_BASE
    if FHIR_BASE is None:
        FHIR_BASE = request.url_root.rstrip("/") + "/fhir"
    return FHIR_BASE


# ─── FHIR Metadata (CapabilityStatement) ──────────────────────

@app.route("/fhir/metadata", methods=["GET"])
def capability_statement():
    return jsonify({
        "resourceType": "CapabilityStatement",
        "status": "active",
        "date": "2026-03-22",
        "kind": "instance",
        "fhirVersion": "4.0.1",
        "format": ["json"],
        "rest": [{
            "mode": "server",
            "resource": [
                {
                    "type": "Patient",
                    "interaction": [{"code": "read"}, {"code": "search-type"}],
                    "searchParam": [
                        {"name": "_id", "type": "token"},
                        {"name": "gender", "type": "token"},
                    ]
                },
                {
                    "type": "Encounter",
                    "interaction": [{"code": "read"}, {"code": "search-type"}],
                    "searchParam": [
                        {"name": "_id", "type": "token"},
                        {"name": "patient", "type": "reference"},
                    ]
                },
                {
                    "type": "Observation",
                    "interaction": [{"code": "read"}, {"code": "search-type"}],
                    "searchParam": [
                        {"name": "patient", "type": "reference"},
                        {"name": "code", "type": "token"},
                        {"name": "category", "type": "token"},
                        {"name": "date", "type": "date"},
                        {"name": "_count", "type": "number"},
                        {"name": "_sort", "type": "string"},
                    ]
                },
            ]
        }]
    })


# ─── Patient ──────────────────────────────────────────────────

@app.route("/fhir/Patient/<caseid>", methods=["GET"])
def read_patient(caseid):
    try:
        caseid = int(caseid)
    except ValueError:
        return _operation_outcome("error", "invalid", f"Invalid caseid: {caseid}"), 400

    case = loader.get_case(caseid)
    if case is None:
        return _operation_outcome("error", "not-found", f"Patient/{caseid} not found"), 404

    return jsonify(builder.build_patient(case, get_fhir_base()))


@app.route("/fhir/Patient", methods=["GET"])
def search_patient():
    _id = request.args.get("_id")
    gender = request.args.get("gender")
    count = min(int(request.args.get("_count", 20)), 100)
    offset = int(request.args.get("_offset", 0))

    cases = loader.search_cases(_id=_id, gender=gender)
    total = len(cases)
    page = cases[offset:offset + count]

    entries = []
    for case in page:
        resource = builder.build_patient(case, get_fhir_base())
        entries.append({
            "fullUrl": f"{get_fhir_base()}/Patient/{case['caseid']}",
            "resource": resource,
            "search": {"mode": "match"}
        })

    bundle = _make_bundle("searchset", entries, total, count, offset, "Patient", request.args)
    return jsonify(bundle)


# ─── Encounter ────────────────────────────────────────────────

@app.route("/fhir/Encounter/<caseid>", methods=["GET"])
def read_encounter(caseid):
    try:
        caseid = int(caseid)
    except ValueError:
        return _operation_outcome("error", "invalid", f"Invalid caseid: {caseid}"), 400

    case = loader.get_case(caseid)
    if case is None:
        return _operation_outcome("error", "not-found", f"Encounter/{caseid} not found"), 404

    return jsonify(builder.build_encounter(case, get_fhir_base()))


@app.route("/fhir/Encounter", methods=["GET"])
def search_encounter():
    _id = request.args.get("_id")
    patient = request.args.get("patient")
    count = min(int(request.args.get("_count", 20)), 100)
    offset = int(request.args.get("_offset", 0))

    cases = loader.search_cases(_id=_id or patient)
    total = len(cases)
    page = cases[offset:offset + count]

    entries = []
    for case in page:
        resource = builder.build_encounter(case, get_fhir_base())
        entries.append({
            "fullUrl": f"{get_fhir_base()}/Encounter/{case['caseid']}",
            "resource": resource,
            "search": {"mode": "match"}
        })

    bundle = _make_bundle("searchset", entries, total, count, offset, "Encounter", request.args)
    return jsonify(bundle)


# ─── Observation ──────────────────────────────────────────────

@app.route("/fhir/Observation/<obs_id>", methods=["GET"])
def read_observation(obs_id):
    obs = loader.get_observation(obs_id)
    if obs is None:
        return _operation_outcome("error", "not-found", f"Observation/{obs_id} not found"), 404

    return jsonify(builder.build_observation(obs, get_fhir_base()))


@app.route("/fhir/Observation", methods=["GET"])
def search_observation():
    patient = request.args.get("patient")
    code = request.args.get("code")
    category = request.args.get("category")
    date_params = request.args.getlist("date")
    count = min(int(request.args.get("_count", 50)), 200)
    offset = int(request.args.get("_offset", 0))
    sort = request.args.get("_sort", "date")

    if not patient:
        return _operation_outcome("error", "required", "patient parameter is required"), 400

    try:
        caseid = int(patient)
    except ValueError:
        return _operation_outcome("error", "invalid", f"Invalid patient id: {patient}"), 400

    observations = loader.search_observations(
        caseid=caseid, code=code, category=category,
        date_params=date_params, sort=sort
    )

    total = len(observations)
    page = observations[offset:offset + count]

    entries = []
    for obs in page:
        resource = builder.build_observation(obs, get_fhir_base())
        entries.append({
            "fullUrl": f"{get_fhir_base()}/Observation/{obs['id']}",
            "resource": resource,
            "search": {"mode": "match"}
        })

    bundle = _make_bundle("searchset", entries, total, count, offset, "Observation", request.args)
    return jsonify(bundle)


# ─── Helper functions ─────────────────────────────────────────

def _operation_outcome(severity, code, diagnostics):
    return jsonify({
        "resourceType": "OperationOutcome",
        "issue": [{
            "severity": severity,
            "code": code,
            "diagnostics": diagnostics
        }]
    })


def _make_bundle(bundle_type, entries, total, count, offset, resource_type, params):
    base = get_fhir_base()
    bundle = {
        "resourceType": "Bundle",
        "type": bundle_type,
        "total": total,
        "entry": entries,
        "link": [
            {"relation": "self", "url": f"{base}/{resource_type}?{_encode_params(params)}"}
        ]
    }

    if offset + count < total:
        next_params = dict(params)
        next_params["_offset"] = str(offset + count)
        bundle["link"].append({
            "relation": "next",
            "url": f"{base}/{resource_type}?{_encode_params(next_params)}"
        })

    return bundle


def _encode_params(params):
    parts = []
    for k, v in params.items():
        if isinstance(v, list):
            for item in v:
                parts.append(f"{k}={item}")
        else:
            parts.append(f"{k}={v}")
    return "&".join(parts)


# ─── Main ─────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VitalDB FHIR R4 Demo Server")
    parser.add_argument("--port", type=int, default=8080, help="Port (default: 8080)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host (default: 0.0.0.0)")
    parser.add_argument("--max-cases", type=int, default=100,
                        help="Max cases to load on startup (default: 100)")
    parser.add_argument("--sample", action="store_true",
                        help="Use built-in sample data (no API access needed)")
    args = parser.parse_args()

    print(f"Loading VitalDB data (max {args.max_cases} cases)...")
    loader.load(max_cases=args.max_cases, use_sample=args.sample)
    print(f"Loaded {len(loader.df_cases)} cases, {len(loader.df_labs)} lab records")
    print(f"\nFHIR R4 server starting on http://{args.host}:{args.port}")
    print(f"  Metadata:     http://{args.host}:{args.port}/fhir/metadata")
    print(f"  Patient:      http://{args.host}:{args.port}/fhir/Patient/1")
    print(f"  Encounter:    http://{args.host}:{args.port}/fhir/Encounter/1")
    print(f"  Observation:  http://{args.host}:{args.port}/fhir/Observation?patient=1")
    app.run(host=args.host, port=args.port, debug=False)
