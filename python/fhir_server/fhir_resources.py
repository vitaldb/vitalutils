"""
FHIR R4 Resource Builder

Converts VitalDB data structures into HL7 FHIR R4 compliant resources.
"""

import math


# LOINC code mappings for VitalDB lab parameters
LAB_LOINC = {
    "hb":    {"code": "718-7",    "display": "Hemoglobin", "unit": "g/dL"},
    "plt":   {"code": "777-3",   "display": "Platelet count", "unit": "10*3/uL"},
    "pt":    {"code": "5902-2",  "display": "Prothrombin time", "unit": "s"},
    "aptt":  {"code": "14979-9", "display": "aPTT", "unit": "s"},
    "na":    {"code": "2951-2",  "display": "Sodium", "unit": "mmol/L"},
    "k":     {"code": "2823-3",  "display": "Potassium", "unit": "mmol/L"},
    "gluc":  {"code": "2345-7",  "display": "Glucose", "unit": "mg/dL"},
    "alb":   {"code": "1751-7",  "display": "Albumin", "unit": "g/dL"},
    "ast":   {"code": "1920-8",  "display": "AST", "unit": "U/L"},
    "alt":   {"code": "1742-6",  "display": "ALT", "unit": "U/L"},
    "bun":   {"code": "3094-0",  "display": "BUN", "unit": "mg/dL"},
    "cr":    {"code": "2160-0",  "display": "Creatinine", "unit": "mg/dL"},
    "ph":    {"code": "2744-1",  "display": "pH", "unit": "pH"},
    "hco3":  {"code": "1963-8",  "display": "Bicarbonate", "unit": "mmol/L"},
    "be":    {"code": "11555-0", "display": "Base excess", "unit": "mmol/L"},
    "pao2":  {"code": "2703-7",  "display": "PaO2", "unit": "mmHg"},
    "paco2": {"code": "2019-8",  "display": "PaCO2", "unit": "mmHg"},
    "sao2":  {"code": "2708-6",  "display": "SaO2", "unit": "%"},
    "bili":  {"code": "1975-2",  "display": "Bilirubin total", "unit": "mg/dL"},
    "wbc":   {"code": "6690-2",  "display": "WBC", "unit": "10*3/uL"},
    "crp":   {"code": "1988-5",  "display": "CRP", "unit": "mg/L"},
    "ca":    {"code": "17861-6", "display": "Calcium", "unit": "mg/dL"},
    "mg":    {"code": "19123-9", "display": "Magnesium", "unit": "mg/dL"},
    "p":     {"code": "2777-1",  "display": "Phosphorus", "unit": "mg/dL"},
    "lactate": {"code": "2524-7", "display": "Lactate", "unit": "mmol/L"},
}

# Intraop parameter display names and units
VITAL_PARAMS = {
    "intraop_ebl":         {"display": "Estimated blood loss", "unit": "mL"},
    "intraop_uo":          {"display": "Urine output", "unit": "mL"},
    "intraop_rbc":         {"display": "RBC transfusion", "unit": "units"},
    "intraop_ffp":         {"display": "FFP transfusion", "unit": "units"},
    "intraop_crystalloid": {"display": "Crystalloid infusion", "unit": "mL"},
    "intraop_colloid":     {"display": "Colloid infusion", "unit": "mL"},
}


class FHIRResourceBuilder:
    """Builds FHIR R4 resources from VitalDB data."""

    def build_patient(self, case, base_url):
        """Build a FHIR Patient resource from a VitalDB case row."""
        caseid = int(case["caseid"])

        resource = {
            "resourceType": "Patient",
            "id": str(caseid),
            "meta": {
                "profile": ["http://hl7.org/fhir/StructureDefinition/Patient"]
            },
            "identifier": [{
                "system": "https://vitaldb.net/cases",
                "value": str(caseid)
            }],
        }

        # Gender
        sex = case.get("sex")
        if sex == "M":
            resource["gender"] = "male"
        elif sex == "F":
            resource["gender"] = "female"
        else:
            resource["gender"] = "unknown"

        # Age as extension (VitalDB doesn't provide birth date, only age at surgery)
        age = case.get("age")
        if not _is_nan(age):
            resource["extension"] = [{
                "url": "https://vitaldb.net/fhir/StructureDefinition/age-at-surgery",
                "valueQuantity": {
                    "value": _safe_number(age),
                    "unit": "years",
                    "system": "http://unitsofmeasure.org",
                    "code": "a"
                }
            }]

        # Physical characteristics as extensions
        extensions = resource.get("extension", [])

        height = case.get("height")
        if not _is_nan(height):
            extensions.append({
                "url": "http://hl7.org/fhir/StructureDefinition/patient-bodyHeight",
                "valueQuantity": {
                    "value": _safe_number(height),
                    "unit": "cm",
                    "system": "http://unitsofmeasure.org",
                    "code": "cm"
                }
            })

        weight = case.get("weight")
        if not _is_nan(weight):
            extensions.append({
                "url": "http://hl7.org/fhir/StructureDefinition/patient-bodyWeight",
                "valueQuantity": {
                    "value": _safe_number(weight),
                    "unit": "kg",
                    "system": "http://unitsofmeasure.org",
                    "code": "kg"
                }
            })

        bmi = case.get("bmi")
        if not _is_nan(bmi):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/bmi",
                "valueQuantity": {
                    "value": _safe_number(bmi),
                    "unit": "kg/m2",
                    "system": "http://unitsofmeasure.org",
                    "code": "kg/m2"
                }
            })

        if extensions:
            resource["extension"] = extensions

        # Subject ID (for reoperation identification)
        subjectid = case.get("subjectid")
        if not _is_nan(subjectid):
            resource["identifier"].append({
                "system": "https://vitaldb.net/subjects",
                "value": str(int(subjectid))
            })

        return resource

    def build_encounter(self, case, base_url):
        """Build a FHIR Encounter resource from a VitalDB case row."""
        caseid = int(case["caseid"])

        resource = {
            "resourceType": "Encounter",
            "id": str(caseid),
            "meta": {
                "profile": ["http://hl7.org/fhir/StructureDefinition/Encounter"]
            },
            "status": "finished",
            "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "IMP",
                "display": "inpatient encounter"
            },
            "subject": {
                "reference": f"Patient/{caseid}"
            },
            "identifier": [{
                "system": "https://vitaldb.net/cases",
                "value": str(caseid)
            }],
        }

        # Type: surgical procedure
        opname = case.get("opname")
        if not _is_nan(opname):
            resource["type"] = [{
                "coding": [{
                    "system": "https://vitaldb.net/operations",
                    "display": str(opname)
                }],
                "text": str(opname)
            }]

        # Service type: department
        dept = case.get("department")
        if not _is_nan(dept):
            resource["serviceType"] = {
                "coding": [{
                    "system": "https://vitaldb.net/departments",
                    "display": str(dept)
                }],
                "text": str(dept)
            }

        # Period (casestart/caseend in seconds, but we express as relative)
        casestart = case.get("casestart", 0)
        caseend = case.get("caseend")
        if not _is_nan(caseend):
            duration_sec = _safe_number(caseend) - _safe_number(casestart or 0)
            resource["length"] = {
                "value": round(duration_sec / 60, 1),
                "unit": "minutes",
                "system": "http://unitsofmeasure.org",
                "code": "min"
            }

        # Extensions for surgical details
        extensions = []

        ane_type = case.get("ane_type")
        if not _is_nan(ane_type):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/anesthesia-type",
                "valueString": str(ane_type)
            })

        asa = case.get("asa")
        if not _is_nan(asa):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/asa-classification",
                "valueInteger": int(asa)
            })

        emop = case.get("emop")
        if not _is_nan(emop):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/emergency-operation",
                "valueBoolean": bool(int(emop))
            })

        dx = case.get("dx")
        if not _is_nan(dx):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/diagnosis",
                "valueString": str(dx)
            })

        position = case.get("position")
        if not _is_nan(position):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/surgical-position",
                "valueString": str(position)
            })

        approach = case.get("approach")
        if not _is_nan(approach):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/surgical-approach",
                "valueString": str(approach)
            })

        # Preop conditions
        preop_htn = case.get("preop_htn")
        if not _is_nan(preop_htn) and int(preop_htn) == 1:
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/preop-hypertension",
                "valueBoolean": True
            })

        preop_dm = case.get("preop_dm")
        if not _is_nan(preop_dm) and int(preop_dm) == 1:
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/preop-diabetes",
                "valueBoolean": True
            })

        # Outcome data
        death_inhosp = case.get("death_inhosp")
        if not _is_nan(death_inhosp):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/death-in-hospital",
                "valueBoolean": bool(int(death_inhosp))
            })

        icu_days = case.get("icu_days")
        if not _is_nan(icu_days):
            extensions.append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/icu-days",
                "valueQuantity": {
                    "value": _safe_number(icu_days),
                    "unit": "days",
                    "system": "http://unitsofmeasure.org",
                    "code": "d"
                }
            })

        if extensions:
            resource["extension"] = extensions

        return resource

    def build_observation(self, obs, base_url):
        """Build a FHIR Observation resource from an observation dict."""
        resource = {
            "resourceType": "Observation",
            "id": obs["id"],
            "status": "final",
            "subject": {
                "reference": f"Patient/{obs['caseid']}"
            },
            "encounter": {
                "reference": f"Encounter/{obs['caseid']}"
            },
        }

        # Category
        if obs["category"] == "laboratory":
            resource["category"] = [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": "laboratory",
                    "display": "Laboratory"
                }]
            }]
        elif obs["category"] == "vital-signs":
            resource["category"] = [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": "vital-signs",
                    "display": "Vital Signs"
                }]
            }]

        # Code (try LOINC mapping)
        name = obs["name"]
        # Strip preop_ prefix for LOINC lookup
        lookup_name = name.replace("preop_", "")
        loinc = LAB_LOINC.get(lookup_name)
        vital_info = VITAL_PARAMS.get(name)

        if loinc:
            resource["code"] = {
                "coding": [{
                    "system": "http://loinc.org",
                    "code": loinc["code"],
                    "display": loinc["display"]
                }],
                "text": loinc["display"]
            }
        elif vital_info:
            resource["code"] = {
                "coding": [{
                    "system": "https://vitaldb.net/parameters",
                    "code": name,
                    "display": vital_info["display"]
                }],
                "text": vital_info["display"]
            }
        else:
            resource["code"] = {
                "coding": [{
                    "system": "https://vitaldb.net/parameters",
                    "code": name,
                    "display": name
                }],
                "text": name
            }

        # Value
        value = obs.get("value")
        if value is not None and not _is_nan(value):
            try:
                numeric_val = float(value)
                unit_info = (loinc or vital_info or {})
                resource["valueQuantity"] = {
                    "value": round(numeric_val, 4),
                    "unit": unit_info.get("unit", ""),
                    "system": "http://unitsofmeasure.org",
                }
            except (ValueError, TypeError):
                resource["valueString"] = str(value)

        # Effective time
        dt = obs.get("dt")
        if dt is not None and not _is_nan(dt):
            # dt is seconds from casestart; store as relative seconds
            resource["effectiveDateTime"] = f"T+{_safe_number(dt)}s"
            resource["extension"] = [{
                "url": "https://vitaldb.net/fhir/StructureDefinition/seconds-from-casestart",
                "valueDecimal": _safe_number(dt)
            }]

        # Mark preop observations
        if name.startswith("preop_"):
            resource.setdefault("extension", []).append({
                "url": "https://vitaldb.net/fhir/StructureDefinition/observation-timing",
                "valueString": "preoperative"
            })

        return resource


def _is_nan(val):
    if val is None:
        return True
    if isinstance(val, float) and math.isnan(val):
        return True
    if isinstance(val, str) and val.strip() == "":
        return True
    return False


def _safe_number(val):
    """Convert to a JSON-safe number (no NaN/Inf)."""
    if val is None:
        return 0
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return 0
        if f == int(f) and abs(f) < 1e15:
            return int(f)
        return round(f, 4)
    except (ValueError, TypeError):
        return 0
