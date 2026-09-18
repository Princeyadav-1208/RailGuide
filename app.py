from flask import Flask, jsonify, request
from trains import (
    train_live,
    PNR,
    station_board,
    between_station,
    train_lookup,
    all_trains,
    all_station_name
)

from flask_cors import CORS


app = Flask(__name__)

# Frontend connect ke liye
CORS(app)



# Home API
@app.route("/")
def home():
    return jsonify({
        "message": "Rail Guide AI Backend Running"
    })



# Train Live Status
# Train Live Status Route (FIXED)
@app.route("/train/live/<train>")
def live_train_api(train):  # <-- Yahan 'train' parameter add karna zaroori hai
    # Journey date query string se lo (e.g. ?date=2026-08-03)
    journey_date = request.args.get("date")

    result = train_live(train, journey_date)

    return jsonify(result)


# PNR Status
@app.route("/pnr/<pnr_no>")
def pnr_status(pnr_no):

    result = PNR(pnr_no)

    return jsonify(result)



# Station Board
@app.route("/station/<station>")
def station_trains(station):

    result = station_board(station)

    return jsonify(result)



# Between Station Train
@app.route("/between", methods=["GET"])
def trains_between():

    source = request.args.get("source")
    destination = request.args.get("destination")
    date = request.args.get("date")

    result = between_station(
        source,
        destination,
        date
    )

    return jsonify(result)

# Train Search
@app.route("/train/search/<name>")
def search_train(name):

    result = train_lookup(name)

    return jsonify(result)

@app.route("/trains")
def trains():

    return jsonify(all_trains())

# All Stations
@app.route("/stations")
def stations():

    return jsonify(all_station_name())


# Station Search (Autocomplete ke liye)
@app.route("/station/search/<query>")
def search_station(query):
    query = query.strip().upper()
    stations = all_station_name()
    
    matched_stations = []
    for s in stations:
        # Code ya Name me query matching check karein
        if query in s["code"].upper() or query in s["name"].upper():
            matched_stations.append(s)
            
    return jsonify(matched_stations[:10])  # Top 10 results return karein


if __name__ == "__main__":

    app.run(
        debug=True
    )
