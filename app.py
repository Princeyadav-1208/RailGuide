import os
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
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

# Frontend connect
CORS(app)

load_dotenv()


# ==========================================================
#                   PURANE ROUTES (unchanged)
# ==========================================================

# Home API
@app.route("/")
def home():
    return jsonify({
        "message": "Rail Guide Backend Running"
    })



# Train Live Status
# Train Live Status Route (FIXED)
@app.route("/train/live/<train>")
def live_train_api(train):
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


# ==========================================================
#                   AI ASSISTANT (Gemini)
#  .env me add karo:
#      GEMINI_API_KEY=your_key_here
#      GEMINI_MODEL=gemini-3.5-flash   (optional)
# ==========================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

MAX_TOOL_ROUNDS = 5
MAX_HISTORY = 10


def _hhmm(value):
    """'2026-10-04T14:35:00+05:30' -> '14:35'"""
    if isinstance(value, str) and len(value) >= 16 and "T" in value:
        return value[11:16]
    return value


def _tool_live_status(args):
    train_input = str(args.get("train", "")).strip()

    # Agar user ne train ka naam diya hai to pehle number nikalo
    if not train_input.isdigit():
        matches = train_lookup(train_input)
        if isinstance(matches, dict):  # {"error": ...}
            return matches
        unique = {m["number"]: m for m in matches}
        if len(unique) > 1:
            return {
                "multiple_matches": list(unique.values())[:5],
                "note": "Ask the user which train they mean.",
            }
        train_input = next(iter(unique))

    data = train_live(train_input, args.get("date") or None)
    if "error" in data:
        return data

    train = data.get("train", {})
    current = data.get("currentLocation", {})
    route = data.get("route", [])

    next_halts = [
        {
            "station": s.get("stationName"),
            "code": s.get("stationCode"),
            "arrival": _hhmm(s.get("scheduledArrival")),
            "departure": _hhmm(s.get("scheduledDeparture")),
            "platform": s.get("platform"),
        }
        for s in route
        if s.get("isHalt") and s.get("status") != "departed"
    ][:5]

    return {
        "train_number": train.get("number"),
        "train_name": train.get("name"),
        "from": train.get("source", {}).get("name"),
        "to": train.get("destination", {}).get("name"),
        "status": data.get("status"),
        "delay_minutes": data.get("delayMinutes"),
        "current_station_code": current.get("stationCode"),
        "current_station_status": current.get("status"),
        "last_updated": data.get("lastUpdatedAt"),
        "next_halts": next_halts,
    }


def _tool_trains_between(args):
    result = between_station(
        args.get("source", ""),
        args.get("destination", ""),
        args.get("date") or None,
    )
    if not result.get("success"):
        return {"error": result.get("error", "Could not fetch trains")}

    found = []
    for t in result.get("trains", [])[:10]:
        tr = t.get("train", {})
        found.append(
            {
                "number": tr.get("number"),
                "name": tr.get("name"),
                "departure": t.get("from", {}).get("departure"),
                "arrival": t.get("to", {}).get("arrival"),
                "duration_minutes": t.get("duration"),
                "run_days": tr.get("runDays"),
            }
        )
    return {"total_trains": result.get("count", len(found)), "showing": found}


def _tool_train_details(args):
    matches = train_lookup(args.get("train", ""))
    if isinstance(matches, dict):  # {"error": ...}
        return matches

    # duplicate numbers hatao
    unique, seen = [], set()
    for m in matches:
        if m["number"] not in seen:
            seen.add(m["number"])
            unique.append(m)

    if len(unique) > 1:
        return {
            "multiple_matches": unique[:5],
            "note": "Ask the user which train they mean.",
        }

    train = unique[0]
    data = train_live(train["number"])
    if "error" in data:
        return {"train": train, "note": "Route details not available right now."}

    info = data.get("train", {})
    halts = [
        {
            "station": s.get("stationName"),
            "code": s.get("stationCode"),
            "arrival": _hhmm(s.get("scheduledArrival")),
            "departure": _hhmm(s.get("scheduledDeparture")),
        }
        for s in data.get("route", [])
        if s.get("isHalt")
    ][:40]

    return {
        "number": train["number"],
        "name": train["name"],
        "from": info.get("source", {}).get("name"),
        "to": info.get("destination", {}).get("name"),
        "run_days": info.get("runDays"),
        "total_halts": len(halts),
        "halts": halts,
    }


def _tool_station_board(args):
    data = station_board(args.get("station", ""))
    if "error" in data:
        return data
    return {
        "station_code": data.get("station"),
        "total_trains": len(data.get("trains", [])),
        "trains": data.get("trains", [])[:15],
    }


TOOLS = {
    "get_live_train_status": _tool_live_status,
    "get_trains_between_stations": _tool_trains_between,
    "get_train_details": _tool_train_details,
    "get_station_board": _tool_station_board,
}

FUNCTION_DECLARATIONS = [
    {
        "name": "get_live_train_status",
        "description": "Get the live running status of a train: delay, current station and upcoming stops.",
        "parameters": {
            "type": "object",
            "properties": {
                "train": {"type": "string", "description": "Train number or train name"},
                "date": {"type": "string", "description": "Journey start date YYYY-MM-DD (optional, default today)"},
            },
            "required": ["train"],
        },
    },
    {
        "name": "get_trains_between_stations",
        "description": "Find trains running between two stations on a date.",
        "parameters": {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "Source station name or code"},
                "destination": {"type": "string", "description": "Destination station name or code"},
                "date": {"type": "string", "description": "Journey date YYYY-MM-DD (optional)"},
            },
            "required": ["source", "destination"],
        },
    },
    {
        "name": "get_train_details",
        "description": "Get details of one particular train: route, halts with timings and running days.",
        "parameters": {
            "type": "object",
            "properties": {
                "train": {"type": "string", "description": "Train number or train name"},
            },
            "required": ["train"],
        },
    },
    {
        "name": "get_station_board",
        "description": "Get the list of trains that stop at a station (station board).",
        "parameters": {
            "type": "object",
            "properties": {
                "station": {"type": "string", "description": "Station name or code"},
            },
            "required": ["station"],
        },
    },
]


def build_system_prompt():
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    return f"""You are RailGuide AI, a friendly assistant inside the RailGuide Indian Railways app.
Today's date (IST): {ist.strftime('%Y-%m-%d, %A')}. Current time: {ist.strftime('%H:%M')}.

You help with:
1. Live train status - always call get_live_train_status. Never guess live data.
2. Trains between two stations - always call get_trains_between_stations.
3. Details about one particular train (route, halts, timings, running days) - call get_train_details.
4. Details about any railway station or its city - famous places to visit, why it is famous,
   famous local food, best time to visit, how to reach, nearby attractions, shopping, etc.
   Answer this from your own knowledge in a helpful, well-organised way. You may also call
   get_station_board to show which trains stop there.

Rules:
- Reply in the same language the user writes in (Hindi, Hinglish or English).
- If the user says "today", "aaj" or "kal", convert it to a YYYY-MM-DD date using today's date above.
- If a tool returns an error, tell the user clearly and suggest what to check (train number, station name, date).
- If key info is missing (for example the second station), ask one short question.
- Keep answers short and easy to read on a phone. Use short bullet points for lists.
- Only help with trains, stations, railway travel and places around stations. Politely decline other topics.
- Do not invent train numbers, timings or delays. For tourist and food info, say it is general guidance when unsure."""


def ask_gemini(history, message):
    contents = []
    for h in history[-MAX_HISTORY:]:
        if not isinstance(h, dict):
            continue
        role = "user" if h.get("role") == "user" else "model"
        text = str(h.get("text", ""))[:1500]
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    headers = {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
    }

    for _ in range(MAX_TOOL_ROUNDS):
        payload = {
            "systemInstruction": {"parts": [{"text": build_system_prompt()}]},
            "contents": contents,
            "tools": [{"functionDeclarations": FUNCTION_DECLARATIONS}],
        }

        response = requests.post(GEMINI_URL, headers=headers, json=payload, timeout=60)
        if response.status_code != 200:
            raise RuntimeError(f"Gemini {response.status_code}: {response.text[:300]}")

        candidates = response.json().get("candidates") or []
        if not candidates:
            return "Sorry, I could not answer that. Please try again."

        parts = candidates[0].get("content", {}).get("parts", [])
        calls = [p["functionCall"] for p in parts if "functionCall" in p]

        if not calls:
            text = "".join(p.get("text", "") for p in parts).strip()
            return text or "Sorry, I could not answer that. Please try again."

        # model ka function-call turn as-is wapas bhejna (thought signatures ke liye zaroori)
        contents.append({"role": "model", "parts": parts})

        results = []
        for call in calls:
            name = call.get("name")
            tool = TOOLS.get(name)
            try:
                output = tool(call.get("args", {})) if tool else {"error": "Unknown tool"}
            except Exception as e:
                print("Tool error:", name, e)
                output = {"error": "Could not fetch this data right now."}
            results.append(
                {"functionResponse": {"name": name, "response": {"result": output}}}
            )
        contents.append({"role": "user", "parts": results})

    return "Sorry, this is taking too long. Please ask again with more details."


# AI Health Check
@app.route("/ai/health")
def ai_health():
    return jsonify({
        "ai_route": True,
        "gemini_key_loaded": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
    })


# AI Chat
@app.route("/ai/chat", methods=["POST"])
def ai_chat():
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY server par missing hai (.env check karo)."}), 500

    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()[:500]
    history = body.get("history", [])

    if not message:
        return jsonify({"error": "Message is empty."}), 400
    if not isinstance(history, list):
        history = []

    try:
        reply = ask_gemini(history, message)

    except requests.exceptions.RequestException as e:
        print("AI Chat Network Error:", e)
        return jsonify({"error": "Gemini se connect nahi ho pa raha. Internet check karke dobara try karo."}), 502

    except Exception as e:
        print("AI Chat Error:", e)
        err = str(e)
        if "Gemini 404" in err:
            msg = "AI model available nahi hai. .env me GEMINI_MODEL badlo."
        elif "Gemini 429" in err:
            msg = "AI ka limit khatam ho gaya. Thodi der baad try karo."
        elif "Gemini 400" in err or "Gemini 403" in err:
            msg = "Gemini API key galat hai ya allowed nahi hai. .env me key check karo."
        else:
            msg = "AI service abhi busy hai. Thodi der baad try karo."
        return jsonify({"error": msg}), 502

    return jsonify({"reply": reply})


if __name__ == "__main__":

    app.run(
        debug=True
    )
