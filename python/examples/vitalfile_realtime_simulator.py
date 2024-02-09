# Import necessary modules from Flask and vitaldb library
from flask import Flask, jsonify
import vitaldb
import copy
import time

# Define the path to the vital file
file = './vitalfiles/101_231023_074744.vital'

# Create a VitalFile object from the specified file path
vf = vitaldb.VitalFile(file)

# Dictionary mapping track types to their respective names
trk_types = {
    1:'wav',
    2:'num',
    5:'str'
}

# Create a Flask web application instance
app = Flask(__name__)

# Record the start time of the Flask application
appstart = time.time()

# Define a route for the "/receive" endpoint with POST method
@app.route("/receive", methods=['POST'])
def receive():
    # Initialize an empty dictionary for the response
    res = dict()

    # Calculate end time based on the start time and current time
    dtend = vf.dtstart + (time.time() - appstart) % (vf.dtend - vf.dtstart)
    
    # Calculate start time 10 seconds before the end time
    dtstart = dtend - 10

    # Create a deep copy of the VitalFile object and crop the data between start and end times
    vf_cropped = copy.deepcopy(vf)
    vf_cropped.crop(dtstart, dtend)

    # Extract device information from the cropped VitalFile object
    devs = []
    for dname in vf_cropped.devs:
        dev = vf_cropped.devs[dname]
        devs.append({
            'name': dev.name,
            'type': dev.type,
            'port': dev.port
        })

    # Extract track information from the cropped VitalFile object
    trks = []
    track_names = vf_cropped.get_track_names()
    for i in range(len(track_names)):
        trk = vf_cropped.trks[track_names[i]]
        # Check if the track has records and its type is 1 (wav)
        if len(trk.recs) > 0 and trk.type == 1:
            for j in range(len(trk.recs)):
                trk.recs[j]['val'] = trk.recs[j]['val'].tolist()
        # Append track information to the trks list
        trks.append({
            'name': trk.name,
            'type': trk_types[trk.type],
            'srate': trk.srate,
            'unit': trk.unit,
            'recs': trk.recs
        })
    
    # Construct the response dictionary with room information and return as JSON
    res['rooms'] = [{
        'roomname': file,
        'dtstart': dtstart,
        'dtend': dtend,
        'devs': devs, 
        'trks': trks,
        'evts': [],
        'ptcon': 1,
        'recording': 1
    }]
    return jsonify(res)

# Run the Flask application if the script is executed directly
if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=8080)
