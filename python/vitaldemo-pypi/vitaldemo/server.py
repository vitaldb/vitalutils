#!/usr/bin/env python3
"""
vitaldemo - VitalRecorder Simulator

Downloads sample .vital files from VitalDB and streams HL7 v2.6 data
to a VitalServer via Socket.IO, acting as a VitalRecorder client.

Usage:
    vitaldemo [server_url] [--vrcode CODE]
    vitaldemo https://vitaldb.net
    vitaldemo https://my-server.com --vrcode MY_DEMO
"""

import argparse
import gzip
import math
import os
import sys
import tempfile
import time
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError

import socketio
import vitaldb

# ─── Configuration ───────────────────────────────────────────

SEND_INTERVAL = 1.0
VITAL_URLS = [f"https://api.vitaldb.net/{i}.vital" for i in range(1, 6)]

# montype code -> string mapping (from VitalRecorder REC.h)
MONTYPES = {
    1: "ECG_WAV", 2: "ECG_HR", 3: "ECG_PVC",
    4: "IABP_WAV", 5: "IABP_SBP", 6: "IABP_DBP", 7: "IABP_MBP",
    8: "PLETH_WAV", 9: "PLETH_HR", 10: "PLETH_SPO2",
    11: "RESP_WAV", 12: "RESP_RR",
    13: "CO2_WAV", 14: "CO2_RR", 15: "CO2_CONC",
    16: "NIBP_SBP", 17: "NIBP_DBP", 18: "NIBP_MBP",
    19: "BT",
    20: "CVP_WAV", 21: "CVP_CVP",
    22: "EEG_BIS", 23: "TV", 24: "MV", 25: "PIP",
    26: "AGENT1_NAME", 27: "AGENT1_CONC",
    28: "AGENT2_NAME", 29: "AGENT2_CONC",
    30: "DRUG1_NAME", 31: "DRUG1_CE",
    32: "DRUG2_NAME", 33: "DRUG2_CE",
    34: "CO", 36: "EEG_SEF", 38: "PEEP",
    39: "ECG_ST",
    40: "AGENT3_NAME", 41: "AGENT3_CONC",
    42: "STO2_L", 43: "STO2_R",
    44: "EEG_WAV", 45: "FLUID_RATE", 46: "FLUID_TOTAL",
    47: "SVV",
    49: "DRUG3_NAME", 50: "DRUG3_CE",
    70: "PSI", 71: "PVI", 72: "SPHB", 73: "ORI",
    75: "ASKNA",
    76: "PAP_SBP", 77: "PAP_MBP", 78: "PAP_DBP",
    79: "FEM_SBP", 80: "FEM_MBP", 81: "FEM_DBP",
    82: "EEG_SEFL", 83: "EEG_SEFR", 84: "EEG_SR",
    85: "TOF_RATIO", 86: "TOF_CNT",
}


# ─── File Loading ────────────────────────────────────────────

def download_file(url, dest):
    req = Request(url, headers={"User-Agent": "vitaldemo/1.0"})
    with urlopen(req) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            f.write(chunk)


def load_vital_files(urls):
    files = {}
    for url in urls:
        basename = os.path.basename(url)
        bed_id = int(basename.split(".")[0])
        tmp_path = os.path.join(tempfile.gettempdir(), f"vital_{basename}")

        print(f"Downloading {url} ... ", end="", flush=True)
        try:
            download_file(url, tmp_path)
        except Exception as e:
            print(f"FAILED: {e}")
            continue

        try:
            vf = vitaldb.VitalFile(tmp_path)
            duration = vf.dtend - vf.dtstart
            if duration <= 0:
                print("skipped (invalid duration)")
                continue

            tracks = {}
            for dtname, trk in vf.trks.items():
                if len(trk.recs) == 0:
                    continue
                trk.recs.sort(key=lambda r: r["dt"])
                tracks[dtname] = trk

            files[bed_id] = {
                "vf": vf,
                "duration": duration,
                "tracks": tracks,
                "dtstart": vf.dtstart,
                "dtend": vf.dtend,
            }
            print(f"OK ({len(tracks)} tracks, {duration:.0f}s)")
        except Exception as e:
            print(f"FAILED: {e}")
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return files


# ─── HL7 Generation ─────────────────────────────────────────

def ut_to_hl7(ut):
    return datetime.fromtimestamp(ut).strftime("%Y%m%d%H%M%S")


def fval_str(f):
    if not math.isfinite(f):
        return ""
    return f"{f:g}"


def get_montype(trk):
    return MONTYPES.get(trk.montype, "")


def get_records_in_range(file_info, trk, wall_start, wall_end, start_time):
    results = []
    current_wall = wall_start
    duration = file_info["duration"]
    dtstart = file_info["dtstart"]

    while current_wall < wall_end:
        elapsed = ((current_wall - start_time) % duration + duration) % duration
        mapped_start = dtstart + elapsed
        time_to_loop_end = duration - elapsed
        chunk_end = min(current_wall + time_to_loop_end, wall_end)
        mapped_end = dtstart + (elapsed + (chunk_end - current_wall))

        for rec in trk.recs:
            if rec["dt"] >= mapped_start and rec["dt"] < mapped_end:
                results.append(rec)

        current_wall = chunk_end

    return results


def get_track_hl7(file_info, trk, wall_from, wall_to, start_time):
    montype = get_montype(trk)
    identifier = trk.dtname

    if trk.type == 1:
        srate = trk.srate or 100
        if montype in ("AWP_WAV", "CO2_WAV"):
            srate = 25
        elif srate > 100:
            srate = 100

        recs = get_records_in_range(file_info, trk, wall_from, wall_to, start_time)
        if not recs:
            return ""

        all_samples = []
        orig_srate = trk.srate or 100
        for rec in recs:
            val = rec.get("val")
            if val is None:
                continue
            try:
                samples = list(val)
            except TypeError:
                continue
            if not samples:
                continue
            if orig_srate > srate:
                ratio = orig_srate / srate
                i = 0.0
                while i < len(samples):
                    all_samples.append(samples[int(i)])
                    i += ratio
            else:
                all_samples.extend(samples)

        if not all_samples:
            return ""

        vals = "^".join(fval_str(v) if math.isfinite(v) else "" for v in all_samples)
        refrange = ""
        if trk.mindisp != trk.maxdisp:
            refrange = f"{fval_str(trk.mindisp)}^{fval_str(trk.maxdisp)}"
        return f"NA|{montype}^{identifier}@{srate:g}||{vals}|{trk.unit or ''}|{refrange}"

    elif trk.type == 2:
        recs = get_records_in_range(file_info, trk, wall_from, wall_to, start_time)
        last_val = float("nan")
        for rec in recs:
            v = rec.get("val")
            if v is not None and math.isfinite(v):
                last_val = v
        if not math.isfinite(last_val):
            return ""

        refrange = ""
        if trk.mindisp != trk.maxdisp:
            refrange = f"{fval_str(trk.mindisp)}^{fval_str(trk.maxdisp)}"
        return f"NM|{montype}^{identifier}||{fval_str(last_val)}|{trk.unit or ''}|{refrange}"

    elif trk.type == 5:
        recs = get_records_in_range(file_info, trk, wall_from, wall_to, start_time)
        if not recs:
            return ""
        return f"ST|EVENT^^||{recs[-1].get('val', '')}||"

    return ""


def build_hl7_payload(files, wall_from, wall_to, vrcode_str, start_time, seq_id):
    payload = ""
    for bed_id, fi in files.items():
        obx_lines = ""
        obx_idx = 1

        for dtname, trk in fi["tracks"].items():
            obx_content = get_track_hl7(fi, trk, wall_from, wall_to, start_time)
            if not obx_content:
                continue
            obx_lines += f"OBX|{obx_idx}|{obx_content}||||R\r"
            obx_idx += 1

        if obx_idx == 1:
            continue

        seq_id[0] += 1
        payload += f"MSH|^~\\&|VitalRecorder|{vrcode_str}|||{ut_to_hl7(wall_to)}||ORU^R01|{seq_id[0]}|P|2.6\r"
        payload += "PID|||\r"
        payload += f"PV1||I|BED-{bed_id}\r"
        payload += f"OBR|1|||VITAL_SIGNS|||{ut_to_hl7(wall_from)}|{ut_to_hl7(wall_to)}\r"
        payload += obx_lines

    return payload


# ─── Main ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="vitaldemo",
        description="VitalRecorder simulator - streams HL7 vital signs data to a VitalServer"
    )
    parser.add_argument("server", nargs="?", default="https://vitaldb.net",
                        help="VitalServer URL (default: https://vitaldb.net)")
    parser.add_argument("--vrcode", default="VITALDEMO",
                        help="VitalRecorder code (default: VITALDEMO)")
    args = parser.parse_args()

    print("=== vitaldemo - VitalRecorder Simulator ===\n")
    print(f"Loading {len(VITAL_URLS)} vital files...\n")

    files = load_vital_files(VITAL_URLS)

    if not files:
        print("\nNo files loaded. Exiting.")
        sys.exit(1)

    print(f"\nConnecting to {args.server} as vrcode={args.vrcode} ...")

    sio = socketio.Client(reconnection=True, reconnection_delay=3)
    start_time = time.time()
    last_send = [start_time]
    seq_id = [0]
    send_timer = [None]

    @sio.event
    def connect():
        print(f"Connected (sid={sio.sid})")
        sio.emit("join_vr", args.vrcode)
        print(f"Joined room as {args.vrcode}")
        print(f"Streaming HL7 data for {len(files)} beds every {SEND_INTERVAL}s ...\n")
        last_send[0] = time.time()

    @sio.event
    def disconnect():
        print("Disconnected")

    @sio.event
    def connect_error(data):
        print(f"Connection error: {data}")

    @sio.on("*")
    def catch_all(event, *event_args):
        if event in ("send_data", "connect", "disconnect"):
            return
        print(f"Server event: {event}", event_args[0] if event_args else "")

    try:
        sio.connect(args.server, transports=["websocket"])
    except Exception as e:
        print(f"Failed to connect: {e}")
        sys.exit(1)

    try:
        while True:
            time.sleep(SEND_INTERVAL)
            if not sio.connected:
                continue

            now = time.time()
            wall_from = last_send[0]
            wall_to = now
            last_send[0] = now

            hl7 = build_hl7_payload(files, wall_from, wall_to, args.vrcode, start_time, seq_id)
            if not hl7:
                continue

            compressed = gzip.compress(hl7.encode("utf-8"), compresslevel=1)
            sio.emit("send_data", compressed)
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        sio.disconnect()
