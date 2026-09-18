import requests
import os
from dotenv import load_dotenv

load_dotenv()

# live Train
api_key = os.getenv("Train_api")
           
# Pnr
My_Api = os.getenv("PNR_api")
         


def load_train_data():
    response = requests.get(
        "https://api.railradar.in/v1/legacy/trains/all-kvs",
        headers={"Authorization": api_key},
    )

    return response.json().get("data", [])


import difflib

train_data = load_train_data()

train_dict = {}

for train in train_data:
    number = train[0]
    name = train[1].upper()

    # User train number dale
    train_dict[number] = number

    # User train name dale
    train_dict[name] = number

def get_train_number(user_input):
    user_input = str(user_input).strip().upper()

    if user_input in train_dict:
        return train_dict[user_input]

    matches = difflib.get_close_matches(
        user_input,
        train_dict.keys(),
        n=5,
        cutoff=0.5
    )

    if matches:
        print("Did you mean:")
        for m in matches:
            print(m)

    return None

# Train Live
# Live Train Status (Updated Function)
def train_live(train, journey_date=None):
    if not api_key:
        return {"error": "API Key missing in trains.py"}

    # Train input se exact number extract karna
    train_number = get_train_number(train)
    if not train_number:
        train_number = str(train).strip().split()[0]  # First word/number extract karein

    print("FETCHING LIVE STATUS FOR TRAIN NUMBER:", train_number)

    url = f"https://api.railradar.in/v1/trains/{train_number}/live"

    # Journey Date handle karna
    if journey_date:
        url += f"?date={journey_date}"

    headers = {
        "Authorization": api_key
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        print("STATUS CODE:", response.status_code)

        if response.status_code == 200:
            raw = response.json()
            data = raw.get("data", {})

            if not data:
                return {"error": "No live status available for this train right now."}

            route = data.get("route", [])
            current_location = data.get("currentLocation", {})
            current_station = current_location.get("stationCode", "")
            current_status = current_location.get("status", "")

            # 🟢 FRONTEND FIX: Ensure 'train' object is properly structured
            if "train" not in data or not data["train"]:
                data["train"] = {
                    "number": data.get("trainNumber", train_number),
                    "name": data.get("trainName", f"Train {train_number}"),
                    "source": {"name": data.get("source", "--")},
                    "destination": {"name": data.get("destination", "--")}
                }

            # 🟢 FRONTEND FIX: Process route stations for UI timeline
            for station in route:
                st_code = station.get("stationCode", "")
                st_status = station.get("status", "")

                station["current"] = (st_code == current_station)
                station["completed"] = (st_status == "departed")
                station["upcoming"] = (st_status not in ["departed", "arrived"])
                
                # Halt handling for timeline grouping
                if "isHalt" not in station:
                    station["isHalt"] = station.get("halt", 0) > 0

            data["currentStation"] = current_station
            data["isRunning"] = (current_status == "departed")
            data["journeyDate"] = data.get("startDate", journey_date)

            return data

        else:
            return {"error": f"Train live status not found (API Response: {response.status_code})"}

    except Exception as e:
        print("Live Train Error:", e)
        return {"error": "Server connection error while fetching live status."}
# pnR
def PNR(pnr_no):
    
    url = f"https://irctc-indian-railway-pnr-status.p.rapidapi.com/getPNRStatus/{pnr_no}"
    
    headers = {
    	"x-rapidapi-key": My_Api,
    	"x-rapidapi-host": "irctc-indian-railway-pnr-status.p.rapidapi.com",
    	"Content-Type": "application/json"
    }
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        response_data = response.json()
        return response_data.get("data", {})
    
    else:
        return {"error": "PNR NOT FOUND PLEASE ENTER A VALID PNR"}



# Station name and code

from difflib import get_close_matches


# All stations convert into dictionary
# station name -> station code
# station code -> station code

def build_station_dict():

    response = requests.get(
        "https://api.railradar.in/v1/legacy/stations/all-kvs",
        headers={"Authorization": api_key},
    )

    if response.status_code == 200:

        data = response.json().get("data", [])

        station_dict = {}

        for station in data:

            code = station[0].upper().strip()
            name = station[1].upper().strip()

            # User enters station name
            station_dict[name] = code

            # User enters station code
            station_dict[code] = code

        return station_dict

    else:
        return {}


# Load station dictionary once
station_dict = build_station_dict()



# Smart station lookup

def get_station_code(user_input: str):

    user_input = user_input.strip().upper()


    # Exact match
    if user_input in station_dict:
        return station_dict[user_input]


    # Partial match
    for name in station_dict:

        if name.startswith(user_input):
            return station_dict[name]


    # Spelling mistake match
    match = get_close_matches(
        user_input,
        station_dict.keys(),
        n=1,
        cutoff=0.8
    )


    if match:

        print(f"Did you mean: {match[0]} ?")
        return station_dict[match[0]]


    return None

# station board
def station_board(station_name_or_code):
    station = get_station_code(station_name_or_code)

    if station is None:
        return {"error": "Station not found"}

    url = f"https://api.railradar.in/v1/stations/{station}/trains"
    headers = {"Authorization": api_key}
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        response_data = response.json()
        data = response_data.get("data", {})
        all_days = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

        trains_list = []
        for train in data.get("trains", []):
            run_days = set(train["train"]["runDays"])
            if run_days == all_days:
                days = "Daily"
            else:
                days = ", ".join(sorted(run_days))

            trains_list.append({

                "number": train["train"]["number"],

                "name": train["train"]["name"],

                "days": days,

                "arrival": train.get("arrival", "--"),

                "departure": train.get("departure", "--"),

                "platform": train.get("platform", "--")

            })

        return {"station": station, "trains": trains_list}
    else:
        return {"error": "Not found station"}


def between_station(source: str, destination: str, date: str = None):

    Source = get_station_code(source)
    Destination = get_station_code(destination)

    if not Source or not Destination:
        return {
            "success": False,
            "error": "Invalid source or destination station"
        }

    url = f"https://api.railradar.in/v1/trains/between/{Source}/{Destination}"

    headers = {
        "Authorization": api_key
    }

    params = {}

    if date:
        params["date"] = date

    try:

        response = requests.get(
            url,
            headers=headers,
            params=params
        )

        print("RailRadar Status:", response.status_code)
        print("RailRadar Response:", response.json())

        data = response.json()

        # RailRadar API error
        if response.status_code != 200:

            error = data.get("error", "RailRadar API Error")

            if isinstance(error, dict):
                error = error.get(
                    "message",
                    "RailRadar API Error"
                )

            return {
                "success": False,
                "error": error
            }

       
        trains = data.get("data", {}).get("trains", [])

        return {
            "success": True,
            "count": len(trains),
            "trains": trains
        }

    except Exception as e:

        print("Between Station Error:", e)

        return {
            "success": False,
            "error": str(e)
        }

    
def get_train(user_input: str, trains: list):
    user_input = user_input.strip().upper()

    # Exact match by number
    for t in trains:
        if t["number"] == user_input:
            return t

    # Exact match by name
    for t in trains:
        if t["name"] == user_input:
            return t

    # Startswith match (partial input)
    for t in trains:
        if t["name"].startswith(user_input) or t["number"].startswith(user_input):
            return t

    # Fuzzy match (spelling mistakes)
    names = [t["name"] for t in trains]
    match = get_close_matches(user_input, names, n=1, cutoff=0.8)
    if match:
        print(f"Did you mean: {match[0]} ?")
        for t in trains:
            if t["name"] == match[0]:
                return t

    return None



def all_trains():

    trains = []

    for train in train_data:

        number = train[0].strip()
        name = train[1].upper().strip()

        trains.append({
            "number": number,
            "name": name
        })

    return trains

def all_station_name():

    stations = []

    added = set()

    for name, code in station_dict.items():

        if name == code:
            continue

        if code not in added:

            stations.append({
                "code": code,
                "name": name
            })

            added.add(code)

    return stations

def train_lookup(user_input: str):
    trains = all_trains()
    if not trains:
        return {"error": "Unable to fetch train list"}

    user_input = user_input.strip().upper()
    matched_trains = []

    # ✅ Exact match by number
    for t in trains:
        if t["number"] == user_input:
            matched_trains.append(t)

    # ✅ Exact match by name
    for t in trains:
        if t["name"] == user_input:
            matched_trains.append(t)

    # ✅ Startswith match (partial input)
    for t in trains:
        if t["name"].startswith(user_input) or t["number"].startswith(user_input):
            matched_trains.append(t)

    # ✅ Fuzzy match (spelling mistakes)
    if not matched_trains:
        names = [t["name"] for t in trains]
        match = get_close_matches(user_input, names, n=1, cutoff=0.8)
        if match:
            print(f"Did you mean: {match[0]} ?")
            for t in trains:
                if t["name"] == match[0]:
                    matched_trains.append(t)

    return matched_trains if matched_trains else {"error": "Train not found"}
