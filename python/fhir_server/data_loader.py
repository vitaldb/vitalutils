"""
VitalDB Data Loader

Fetches and caches data from api.vitaldb.net, provides search/filter
methods for Patient, Encounter, and Observation queries.
"""

import io
import math
import gzip
import requests
import pandas as pd
import numpy as np

API_URL = "https://api.vitaldb.net"


class DataLoader:
    def __init__(self):
        self.df_cases = pd.DataFrame()
        self.df_labs = pd.DataFrame()
        self.df_trks = pd.DataFrame()
        self._cases_dict = {}

    def load(self, max_cases=100, use_sample=False):
        """Load cases, labs, and trks data from VitalDB API or sample data.

        Args:
            max_cases: Maximum number of cases to load.
            use_sample: If True, use built-in sample data instead of API.
        """
        if use_sample:
            self._load_sample(max_cases)
            return

        try:
            self._load_from_api(max_cases)
        except Exception as e:
            print(f"  API fetch failed ({e}), falling back to sample data...")
            self._load_sample(max_cases)

    def _load_from_api(self, max_cases):
        """Load data from VitalDB API."""
        print("  Fetching cases from API...")
        self.df_cases = self._fetch_csv(f"{API_URL}/cases")
        if max_cases and len(self.df_cases) > max_cases:
            self.df_cases = self.df_cases.head(max_cases)

        caseids = set(self.df_cases["caseid"].tolist())

        print("  Fetching labs from API...")
        self.df_labs = self._fetch_csv(f"{API_URL}/labs")
        self.df_labs = self.df_labs[self.df_labs["caseid"].isin(caseids)]

        print("  Fetching trks from API...")
        self.df_trks = self._fetch_csv(f"{API_URL}/trks")
        self.df_trks = self.df_trks[self.df_trks["caseid"].isin(caseids)]

        self._build_lookup()

    def _load_sample(self, max_cases):
        """Load built-in sample data."""
        from sample_data import load_sample_cases, load_sample_labs, load_sample_trks

        print("  Loading sample data...")
        self.df_cases = load_sample_cases()
        if max_cases and len(self.df_cases) > max_cases:
            self.df_cases = self.df_cases.head(max_cases)

        caseids = set(self.df_cases["caseid"].tolist())
        self.df_labs = load_sample_labs()
        self.df_labs = self.df_labs[self.df_labs["caseid"].isin(caseids)]
        self.df_trks = load_sample_trks()
        self.df_trks = self.df_trks[self.df_trks["caseid"].isin(caseids)]

        self._build_lookup()

    def _build_lookup(self):
        """Build case lookup dict."""
        for _, row in self.df_cases.iterrows():
            self._cases_dict[int(row["caseid"])] = row.to_dict()

    def _fetch_csv(self, url):
        """Fetch gzip-compressed CSV from VitalDB API."""
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        try:
            data = gzip.decompress(resp.content)
            return pd.read_csv(io.BytesIO(data))
        except Exception:
            return pd.read_csv(io.BytesIO(resp.content))

    # ─── Case / Patient queries ───────────────────────────────

    def get_case(self, caseid):
        return self._cases_dict.get(caseid)

    def search_cases(self, _id=None, gender=None):
        df = self.df_cases
        if _id is not None:
            try:
                caseid = int(_id)
                df = df[df["caseid"] == caseid]
            except ValueError:
                return []
        if gender is not None:
            sex_map = {"male": "M", "female": "F", "m": "M", "f": "F"}
            sex = sex_map.get(gender.lower(), gender.upper())
            df = df[df["sex"] == sex]
        return [row.to_dict() for _, row in df.iterrows()]

    # ─── Observation queries ──────────────────────────────────

    def get_observation(self, obs_id):
        """Parse observation ID and return the observation data.
        ID format: {caseid}-lab-{index} or {caseid}-preop-{param_name}
        """
        parts = obs_id.split("-", 2)
        if len(parts) < 3:
            return None

        try:
            caseid = int(parts[0])
        except ValueError:
            return None

        obs_type = parts[1]
        key = parts[2]

        if obs_type == "lab":
            return self._get_lab_observation(caseid, int(key))
        elif obs_type == "preop":
            return self._get_preop_observation(caseid, key)
        elif obs_type == "vital":
            return self._get_vital_observation(caseid, key)
        return None

    def _get_lab_observation(self, caseid, index):
        labs = self.df_labs[self.df_labs["caseid"] == caseid]
        if index >= len(labs):
            return None
        row = labs.iloc[index]
        return {
            "id": f"{caseid}-lab-{index}",
            "caseid": caseid,
            "category": "laboratory",
            "name": row["name"],
            "value": row["result"],
            "dt": row.get("dt"),
        }

    def _get_preop_observation(self, caseid, param_name):
        case = self.get_case(caseid)
        if case is None:
            return None
        col = f"preop_{param_name}"
        if col not in case:
            return None
        val = case[col]
        if _is_nan(val):
            return None
        return {
            "id": f"{caseid}-preop-{param_name}",
            "caseid": caseid,
            "category": "laboratory",
            "name": col,
            "value": val,
            "dt": None,  # preop, no specific time
        }

    def _get_vital_observation(self, caseid, param_name):
        case = self.get_case(caseid)
        if case is None:
            return None
        if param_name not in case:
            return None
        val = case[param_name]
        if _is_nan(val):
            return None
        return {
            "id": f"{caseid}-vital-{param_name}",
            "caseid": caseid,
            "category": "vital-signs",
            "name": param_name,
            "value": val,
            "dt": None,
        }

    def search_observations(self, caseid, code=None, category=None,
                            date_params=None, sort="date"):
        """Search observations for a given patient (caseid).

        Returns a list of observation dicts.
        """
        results = []

        # 1) Lab observations
        if category is None or category == "laboratory":
            labs = self.df_labs[self.df_labs["caseid"] == caseid]

            # Apply date filter (dt is seconds from casestart)
            if date_params:
                labs = self._filter_labs_by_date(labs, date_params)

            # Apply code filter
            if code:
                code_name = self._resolve_lab_code(code)
                if code_name:
                    labs = labs[labs["name"] == code_name]

            for i, (_, row) in enumerate(labs.iterrows()):
                results.append({
                    "id": f"{caseid}-lab-{i}",
                    "caseid": caseid,
                    "category": "laboratory",
                    "name": row["name"],
                    "value": row["result"],
                    "dt": row.get("dt"),
                })

        # 2) Preop observations (from cases table)
        if category is None or category == "laboratory":
            case = self.get_case(caseid)
            if case:
                preop_params = [c for c in case if c.startswith("preop_")]
                for param in preop_params:
                    val = case[param]
                    if _is_nan(val):
                        continue
                    short_name = param[len("preop_"):]
                    if code and not self._matches_code(code, param):
                        continue
                    results.append({
                        "id": f"{caseid}-preop-{short_name}",
                        "caseid": caseid,
                        "category": "laboratory",
                        "name": param,
                        "value": val,
                        "dt": None,
                    })

        # 3) Vital sign observations (from cases: intraop_ebl, intraop_uo, etc.)
        if category is None or category == "vital-signs":
            case = self.get_case(caseid)
            if case:
                vital_params = ["intraop_ebl", "intraop_uo", "intraop_rbc",
                                "intraop_ffp", "intraop_crystalloid", "intraop_colloid"]
                for param in vital_params:
                    val = case.get(param)
                    if _is_nan(val):
                        continue
                    if code and not self._matches_code(code, param):
                        continue
                    results.append({
                        "id": f"{caseid}-vital-{param}",
                        "caseid": caseid,
                        "category": "vital-signs",
                        "name": param,
                        "value": val,
                        "dt": None,
                    })

        # Sort
        if sort == "-date":
            results.sort(key=lambda x: x.get("dt") or float("inf"), reverse=True)
        else:
            results.sort(key=lambda x: x.get("dt") or float("inf"))

        return results

    def _filter_labs_by_date(self, labs, date_params):
        """Filter labs by FHIR date parameters (ge, le, gt, lt prefixes).
        dt is in seconds from casestart.
        """
        for dp in date_params:
            if dp.startswith("ge"):
                val = float(dp[2:])
                labs = labs[labs["dt"] >= val]
            elif dp.startswith("le"):
                val = float(dp[2:])
                labs = labs[labs["dt"] <= val]
            elif dp.startswith("gt"):
                val = float(dp[2:])
                labs = labs[labs["dt"] > val]
            elif dp.startswith("lt"):
                val = float(dp[2:])
                labs = labs[labs["dt"] < val]
            else:
                try:
                    val = float(dp)
                    labs = labs[labs["dt"] == val]
                except ValueError:
                    pass
        return labs

    def _resolve_lab_code(self, code):
        """Resolve FHIR code (LOINC or name) to VitalDB lab name."""
        # Check if it's a direct name match
        code_lower = code.lower()
        # Common LOINC -> VitalDB lab name mappings
        loinc_map = {
            "718-7": "hb", "59260-0": "hb",
            "777-3": "plt", "26515-7": "plt",
            "5902-2": "pt", "34714-6": "pt",
            "14979-9": "aptt", "3173-2": "aptt",
            "2951-2": "na", "2823-3": "k",
            "2345-7": "gluc", "1751-7": "alb",
            "1920-8": "ast", "1742-6": "alt",
            "3094-0": "bun", "2160-0": "cr",
            "2744-1": "ph", "1963-8": "hco3",
            "11555-0": "be",
            "2703-7": "pao2", "2019-8": "paco2",
            "2708-6": "sao2",
            "1975-2": "bili",
            "6690-2": "wbc",
        }
        if code_lower in loinc_map:
            return loinc_map[code_lower]
        # Check system|code format
        if "|" in code:
            system, code_val = code.split("|", 1)
            if code_val in loinc_map:
                return loinc_map[code_val]
        # Direct name
        lab_names = self.df_labs["name"].unique() if len(self.df_labs) > 0 else []
        for name in lab_names:
            if name.lower() == code_lower:
                return name
        return None

    def _matches_code(self, code, param_name):
        """Check if a code query matches a parameter name."""
        code_lower = code.lower()
        param_lower = param_name.lower()
        return code_lower in param_lower or param_lower.endswith(code_lower)


def _is_nan(val):
    if val is None:
        return True
    if isinstance(val, float) and math.isnan(val):
        return True
    if isinstance(val, str) and val.strip() == "":
        return True
    return False
