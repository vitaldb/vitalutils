"""VitalDB MCP Server - Model Context Protocol server for VitalDB Python library."""

import json
from mcp.server.fastmcp import FastMCP

import vitaldb

mcp = FastMCP("vitaldb")


@mcp.tool()
def find_cases(track_names: str) -> str:
    """Return a list of caseIDs for cases with the given track names from VitalDB open dataset.

    Args:
        track_names: Track names separated by comma (e.g., "SNUADC/ECG_II,Solar8000/HR")

    Returns:
        JSON array of caseIDs (integers from 1 to 6388)
    """
    result = vitaldb.find_cases(track_names)
    return json.dumps(result)


@mcp.tool()
def load_case(caseid: int, track_names: str, interval: float = 1.0) -> str:
    """Load case data with the given track names from VitalDB open dataset.

    Args:
        caseid: Case ID from 1 to 6388
        track_names: Track names separated by comma (e.g., "SNUADC/ECG_II,Solar8000/HR")
        interval: Time interval in seconds (= 1 / sample rate). Defaults to 1.0

    Returns:
        JSON object with shape info and flattened data array
    """
    data = vitaldb.load_case(caseid, track_names, interval)
    if data is None:
        return json.dumps({"error": "Failed to load case data"})
    return json.dumps({
        "shape": list(data.shape),
        "columns": track_names.split(","),
        "data": data.tolist()
    })


@mcp.tool()
def load_clinical_data(caseids: str = "", params: str = "") -> str:
    """Load clinical information for specified caseIDs from VitalDB open dataset.

    Args:
        caseids: Comma-separated caseIDs (e.g., "1,2,3"). Empty string for all cases.
        params: Comma-separated parameter names to filter. Empty string for all parameters.

    Returns:
        JSON array of clinical data records
    """
    caseid_list = [int(x.strip()) for x in caseids.split(",") if x.strip()] if caseids else []
    param_list = [x.strip() for x in params.split(",") if x.strip()] if params else []

    df = vitaldb.load_clinical_data(caseid_list, param_list)
    return df.to_json(orient="records")


@mcp.tool()
def load_lab_data(caseids: str = "", params: str = "") -> str:
    """Load lab results for specified caseIDs from VitalDB open dataset.

    Args:
        caseids: Comma-separated caseIDs (e.g., "1,2,3"). Empty string for all cases.
        params: Comma-separated parameter names to filter. Empty string for all parameters.

    Returns:
        JSON array of lab data records
    """
    caseid_list = [int(x.strip()) for x in caseids.split(",") if x.strip()] if caseids else []
    param_list = [x.strip() for x in params.split(",") if x.strip()] if params else []

    df = vitaldb.load_lab_data(caseid_list, param_list)
    return df.to_json(orient="records")


@mcp.tool()
def get_track_names() -> str:
    """Get all available track names from VitalDB open dataset.

    Returns:
        JSON array of track names
    """
    result = vitaldb.get_track_names()
    return json.dumps(result)


@mcp.tool()
def filelist(bedname: str = "", dtstart: str = "", dtend: str = "") -> str:
    """Get list of vital files from VitalDB server (requires login).

    Args:
        bedname: Filter by bed name (optional)
        dtstart: Start datetime string (optional)
        dtend: End datetime string (optional)

    Returns:
        JSON array of file information
    """
    result = vitaldb.filelist(
        bedname=bedname if bedname else None,
        dtstart=dtstart if dtstart else None,
        dtend=dtend if dtend else None
    )
    if result is None:
        return json.dumps({"error": "Failed to get file list. Login may be required."})
    return json.dumps(result)


@mcp.tool()
def tracklist(bedname: str = "", dtstart: str = "", dtend: str = "") -> str:
    """Get list of available tracks from VitalDB server (requires login).

    Args:
        bedname: Filter by bed name (optional)
        dtstart: Start datetime string (optional)
        dtend: End datetime string (optional)

    Returns:
        JSON array of track information
    """
    result = vitaldb.tracklist(
        bedname=bedname if bedname else None,
        dtstart=dtstart if dtstart else None,
        dtend=dtend if dtend else None
    )
    if result is None:
        return json.dumps({"error": "Failed to get track list. Login may be required."})
    return json.dumps(result)


@mcp.tool()
def receive(bedname: str = "", track_names: str = "", dtstart: str = "", dtend: str = "") -> str:
    """Receive vital signs data from VitalDB server (requires login).

    Args:
        bedname: Bed name to receive data from
        track_names: Comma-separated track names to receive
        dtstart: Start datetime string (optional)
        dtend: End datetime string (optional)

    Returns:
        JSON object with received data
    """
    track_list = [x.strip() for x in track_names.split(",") if x.strip()] if track_names else None

    result = vitaldb.receive(
        bedname=bedname if bedname else None,
        track_names=track_list,
        dtstart=dtstart if dtstart else None,
        dtend=dtend if dtend else None
    )
    if result is None:
        return json.dumps({"error": "Failed to receive data. Login may be required."})

    # Convert numpy array to JSON-serializable format
    if hasattr(result, 'tolist'):
        return json.dumps({"data": result.tolist()})
    return json.dumps(result)


@mcp.tool()
def login(userid: str, password: str) -> str:
    """Login to VitalDB server for accessing private data.

    Args:
        userid: VitalDB user ID
        password: VitalDB password

    Returns:
        Login result message
    """
    try:
        vitaldb.login(userid, password)
        return json.dumps({"status": "success", "message": "Logged in successfully"})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


@mcp.tool()
def read_vital(filepath: str, track_names: str = "", interval: float = 1.0) -> str:
    """Read a local .vital file and extract track data.

    Args:
        filepath: Path to the .vital file
        track_names: Comma-separated track names to extract. Empty for all tracks.
        interval: Time interval in seconds for resampling. Defaults to 1.0

    Returns:
        JSON object with track data
    """
    try:
        vf = vitaldb.VitalFile(filepath)

        if track_names:
            track_list = [x.strip() for x in track_names.split(",") if x.strip()]
        else:
            track_list = vf.get_track_names()

        result = {
            "track_names": track_list,
            "tracks": {}
        }

        for track_name in track_list:
            samples = vf.get_samples(track_name, interval)
            if samples is not None:
                result["tracks"][track_name] = samples.tolist()

        return json.dumps(result)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def get_vital_track_names(filepath: str) -> str:
    """Get all track names from a local .vital file.

    Args:
        filepath: Path to the .vital file

    Returns:
        JSON array of track names in the file
    """
    try:
        vf = vitaldb.VitalFile(filepath)
        track_names = vf.get_track_names()
        return json.dumps(track_names)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def vital_to_csv(filepath: str, output_path: str, track_names: str = "", interval: float = 1.0) -> str:
    """Convert a .vital file to CSV format.

    Args:
        filepath: Path to the input .vital file
        output_path: Path for the output CSV file
        track_names: Comma-separated track names to include. Empty for all tracks.
        interval: Time interval in seconds for resampling. Defaults to 1.0

    Returns:
        Result message
    """
    try:
        vf = vitaldb.VitalFile(filepath)

        if track_names:
            track_list = [x.strip() for x in track_names.split(",") if x.strip()]
        else:
            track_list = None

        vf.to_csv(output_path, track_names=track_list, interval=interval)
        return json.dumps({"status": "success", "output": output_path})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def download_vital(filename: str, localpath: str = "") -> str:
    """Download a .vital file from VitalDB server.

    Args:
        filename: Name of the file to download
        localpath: Local path to save the file (optional)

    Returns:
        Result message with download path
    """
    try:
        result = vitaldb.download(filename, localpath if localpath else None)
        return json.dumps({"status": "success", "path": result})
    except Exception as e:
        return json.dumps({"error": str(e)})


def run():
    """Run the VitalDB MCP server."""
    mcp.run()
