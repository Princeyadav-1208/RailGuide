/* ==========================================
      RailGuide
========================================== */

const API_BASE_URL = "http://127.0.0.1:5000";

// Page Load Initializations
document.addEventListener("DOMContentLoaded", () => {
    // Set Today's Date as Default
    const today = new Date().toISOString().split('T')[0];
    const liveDateEl = document.getElementById('live-train-date');
    const betweenDateEl = document.getElementById('between-date');
    
    if (liveDateEl) liveDateEl.value = today;
    if (betweenDateEl) betweenDateEl.value = today;

    // 1. Live Train Input (Train Autocomplete)
    attachAutocomplete('live-train-input', '/train/search/', (item) => {
        return `${item.number} - ${item.name}`;
    });

    // 2. Between Stations - Source Station
    attachAutocomplete('between-source', '/station/search/', (item) => {
        return `${item.name} (${item.code})`;
    });

    // 3. Between Stations - Destination Station
    attachAutocomplete('between-dest', '/station/search/', (item) => {
        return `${item.name} (${item.code})`;
    });

    // 4. Station Board Input
    attachAutocomplete('board-station', '/station/search/', (item) => {
        return `${item.name} (${item.code})`;
    });
});

/* ==========================================
      Tab Switcher Helper
========================================== */
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Deactivate all nav buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show target tab and highlight active button
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');

    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }
}

/* ==========================================
      Autocomplete Functionality
========================================== */
function attachAutocomplete(inputId, apiEndpoint, formatDisplayFn) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    const parent = inputEl.parentNode;
    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    let suggBox = parent.querySelector('.autocomplete-box');
    if (!suggBox) {
        suggBox = document.createElement('div');
        suggBox.className = 'autocomplete-box';
        parent.appendChild(suggBox);
    }

    let debounceTimer;

    inputEl.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            suggBox.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE_URL}${apiEndpoint}${encodeURIComponent(query)}`);
                if (!res.ok) {
                    suggBox.style.display = 'none';
                    return;
                }
                
                const list = await res.json();

                if (!Array.isArray(list) || list.length === 0 || list.error) {
                    suggBox.style.display = 'none';
                    return;
                }

                suggBox.innerHTML = '';
                list.slice(0, 8).forEach(item => {
                    const btn = document.createElement('div');
                    btn.className = 'suggestion-item';
                    
                    const fullText = formatDisplayFn(item);
                    btn.textContent = fullText;
                    
                    btn.onclick = () => {
                        inputEl.value = fullText;
                        suggBox.style.display = 'none';
                    };
                    suggBox.appendChild(btn);
                });

                suggBox.style.display = suggBox.children.length > 0 ? 'block' : 'none';

            } catch (err) {
                console.error("Autocomplete Fetch Error:", err);
                suggBox.style.display = 'none';
            }
        }, 250);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!parent.contains(e.target)) {
            suggBox.style.display = 'none';
        }
    });
}

/* Helper to Extract Code/Number from Selected Text (e.g., "JAIPUR (JP)" -> "JP") */
function extractCodeOrNumber(val) {
    if (!val) return "";
    const match = val.match(/\(([^)]+)\)/);
    if (match) return match[1];
    return val.split(' ')[0].trim();
}

/* Route Grouping Helper */
function groupRoute(route) {
    if (!Array.isArray(route)) return [];
    
    const grouped = [];
    let lastHalt = null;

    route.forEach(station => {
        if (station.isHalt) {
            if (lastHalt) {
                grouped.push(lastHalt);
            }
            lastHalt = {
                halt: station,
                moreStations: []
            };
        } else {
            if (lastHalt) {
                lastHalt.moreStations.push(station);
            }
        }
    });

    if (lastHalt) {
        grouped.push(lastHalt);
    }

    return grouped;
}

/* ==========================================
      API Actions & Form Handlers
========================================== */

// 1. Get Live Train Status
async function getLiveStatus(e) {
    e.preventDefault();

    const rawTrain = document.getElementById("live-train-input").value;
    const train = extractCodeOrNumber(rawTrain);
    const journeyDate = document.getElementById("live-train-date").value;
    const loader = document.getElementById("loader-live");
    const resultBox = document.getElementById("result-live");

    loader.style.display = "block";
    resultBox.innerHTML = "";

    try {
        const response = await fetch(
            `${API_BASE_URL}/train/live/${encodeURIComponent(train)}?date=${journeyDate}`
        );
        const data = await response.json();
        loader.style.display = "none";

        if (data.error) {
            resultBox.innerHTML = `
                <div class="error-msg">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    ${data.error}
                </div>`;
            return;
        }

        const current = data.currentLocation || {};
        const route = data.route || [];
        const groupedRoute = groupRoute(route);

        resultBox.innerHTML = `
            ${renderTrainHeader(data)}
            ${renderSummary(data)}
            ${renderProgressBar(route, current)}
            <div class="timeline-card">
                <h3>
                    <i class="fa-solid fa-route"></i> Journey Timeline
                </h3>
                <div id="timeline-container">
                    ${renderTimeline(groupedRoute, current)}
                </div>
            </div>`;

    } catch (err) {
        loader.style.display = "none";
        console.error(err);
        resultBox.innerHTML = `
            <div class="error-msg">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Unable to connect backend.
            </div>`;
    }
}

// TRAIN HEADER
function renderTrainHeader(data) {
    const train = data.train || {};
    return `
    <div class="train-header-card">
        <div class="header-top">
            <div>
                <h2>${train.number || ''} - ${train.name || ''}</h2>
                <p>${train.source?.name || ''} → ${train.destination?.name || ''}</p>
            </div>
            <div>
                <span class="status-badge">${(data.status || 'running').toUpperCase()}</span>
            </div>
        </div>
    </div>`;
}

// SUMMARY CARD
function renderSummary(data) {
    const train = data.train || {};
    const current = data.currentLocation || {};
    return `
    <div class="summary-card">
        <div class="summary-grid">
            <div>
                <h4>Current Station</h4>
                <p>${current.stationCode || "--"}</p>
            </div>
            <div>
                <h4>Delay</h4>
                <p>${formatDelay(data.delayMinutes)}</p>
            </div>
            <div>
                <h4>Platform</h4>
                <p>${current.platform || "--"}</p>
            </div>
            <div>
                <h4>Last Update</h4>
                <p>${data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toLocaleString() : '--'}</p>
            </div>
            <div>
                <h4>Coach Position</h4>
                <p>${train.coachPosition || "--"}</p>
            </div>
        </div>
    </div>`;
}

// PROGRESS BAR
function renderProgressBar(route, current) {
    if (!Array.isArray(route) || route.length === 0) return '';
    
    let total = route.length;
    let currentIndex = 0;

    route.forEach((st, index) => {
        if (st.stationCode === current.stationCode) {
            currentIndex = index;
        }
    });

    let percent = ((currentIndex + 1) / total) * 100;

    return `
    <div class="progress-card">
        <div class="progress-text">
            Journey Progress
            <span>${Math.round(percent)}%</span>
        </div>
        <div class="progress">
            <div class="progress-fill" style="width:${percent}%"></div>
        </div>
    </div>`;
}

// JOURNEY TIMELINE
function renderTimeline(groupedRoute, current) {

    if (!groupedRoute) return "";

    let html = "";

    groupedRoute.forEach(group => {

        const station = group.halt;

        let status = "upcoming";
        let color = "#9E9E9E";

        if (station.status === "departed") {
            status = "completed";
        }

        if (station.stationCode === current.stationCode) {

            status = "current";

            if (current.status === "departed") {

                color = "#00C853";      // GREEN

            } else {

                color = "#F44336";      // RED

            }
        }

        html += createStationCard(station, status, color);

        if (group.moreStations.length) {

            html += createMoreStations(group.moreStations, current);

        }

    });

    return html;
}

function createStationCard(station, status, iconColor) {

    const arr = formatTime(station.scheduledArrival);
    const dep = formatTime(station.scheduledDeparture);

    const arrDelay = Number(station.arrivalDelay || station.delayArrival || 0);
    const depDelay = Number(station.departureDelay || station.delayDeparture || 0);

    const actualArr =
        station.actualArrival
            ? formatTime(station.actualArrival)
            : (arrDelay > 0 ? addMinutes(arr, arrDelay) : "");
            

    const actualDep =
        station.actualDeparture
            ? formatTime(station.actualDeparture)
            : (depDelay > 0 ? addMinutes(dep, depDelay) : "");

    const trainIcon =
        status === "current"
            ? `<i class="fa-solid fa-train train-icon"
                   style="color:${iconColor};"></i>`
            : `<div class="station-dot ${status}"></div>`;

    return `

<div class="timeline-row ${status}">

    <div class="arrival-box">

        <div class="title">Arrival</div>

        <div class="time">${arr}</div>

        ${
            actualArr
                ? `<div class="actual-time">${actualArr}</div>`
                : ""
        }

    </div>

    <div class="track-column">

        ${trainIcon}

    </div>

    <div class="station-box">

        <div class="station-name">

            ${station.stationName}

            <span>(${station.stationCode})</span>

        </div>

        <div class="station-info">

            Platform ${station.platform || "--"}

            &nbsp;&nbsp;&nbsp;

            Day ${station.dayCount || 1}

        </div>

    </div>

    <div class="departure-box">

        <div class="title">Departure</div>

        <div class="time">${dep}</div>

        ${
            actualDep
                ? `<div class="actual-time">${actualDep}</div>`
                : ""
        }

    </div>

</div>

`;
}

function createMoreStations(stations, current) {

    let html = `
    <div class="more-wrapper">
        <button class="more-btn" onclick="toggleMoreStations(this)">
            ▼ More Stations (${stations.length})
        </button>

        <div class="more-list">
    `;

    stations.forEach(station => {

        const arr = formatTime(station.scheduledArrival);
        const dep = formatTime(station.scheduledDeparture);

        const arrDelay = Number(station.arrivalDelay || station.delayArrival || 0);
        const depDelay = Number(station.departureDelay || station.delayDeparture || 0);

        const actualArr =
            station.actualArrival
                ? formatTime(station.actualArrival)
                : (arrDelay > 0 ? addMinutes(arr, arrDelay) : "");

        const actualDep =
            station.actualDeparture
                ? formatTime(station.actualDeparture)
                : (depDelay > 0 ? addMinutes(dep, depDelay) : "");

        let icon = `<div class="station-dot upcoming"></div>`;

        if (station.stationCode === current.stationCode) {

            if (current.status === "departed") {

                icon = `<i class="fa-solid fa-train train-icon" style="color:#00C853"></i>`;

            } else {

                icon = `<i class="fa-solid fa-train train-icon" style="color:#F44336"></i>`;

            }
        }

        html += `
        <div class="timeline-row more-station">

            <div class="arrival-box">
                <div class="title">Arrival</div>
                <div class="time">${arr}</div>
                ${actualArr ? `<div class="actual-time">${actualArr}</div>` : ""}
            </div>

            <div class="track-column">
                ${icon}
            </div>

            <div class="station-box">
                <div class="station-name">
                    ${station.stationName}
                    <span>(${station.stationCode})</span>
                </div>

                <div class="station-info">
                    Platform ${station.platform || "--"}
                    &nbsp;&nbsp;
                    Day ${station.dayCount || 1}
                </div>
            </div>

            <div class="departure-box">
                <div class="title">Departure</div>
                <div class="time">${dep}</div>
                ${actualDep ? `<div class="actual-time">${actualDep}</div>` : ""}
            </div>

        </div>
        `;

    });

    html += `
        </div>
    </div>`;

    return html;
}

function toggleMoreStations(btn) {
    const list = btn.nextElementSibling;
    if (list.style.display === "block") {
        list.style.display = "none";
        btn.innerHTML = `▼ More Stations (${list.children.length})`;
    } else {
        list.style.display = "block";
        btn.innerHTML = `▲ Hide Stations`;
    }
}

/* ==========================================
      FORMAT HELPERS
========================================== */

function formatTime(dateTime) {
    if (!dateTime) return "--";
    try {
        return new Date(dateTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return "--";
    }
}

function addMinutes(time, mins) {

    if (!time || mins <= 0) return "";

    const p = time.split(":");

    if (p.length < 2) return "";

    let h = parseInt(p[0]);
    let m = parseInt(p[1]);

    let total = h * 60 + m + mins;

    h = Math.floor(total / 60) % 24;
    m = total % 60;

    return (
        String(h).padStart(2, "0") +
        ":" +
        String(m).padStart(2, "0")
    );
}

function formatDate(dateTime) {
    if (!dateTime) return "--";
    try {
        return new Date(dateTime).toLocaleDateString([], {
            day: "2-digit",
            month: "short"
        });
    } catch {
        return "--";
    }
}

function formatDateTime(dateTime) {
    if (!dateTime) return "--";
    try {
        return new Date(dateTime).toLocaleString();
    } catch {
        return "--";
    }
}

function getDelayText(delay) {
    if (delay == null) return "--";
    if (delay === 0) return "Right Time";
    if (delay > 0) return delay + " Min Late";
    return Math.abs(delay) + " Min Early";
}

function formatDelay(minutes) {

    minutes = Number(minutes || 0);

    if (minutes === 0)
        return "On Time";

    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hrs > 0) {
        return `${String(hrs).padStart(2, "0")} Hr : ${String(mins).padStart(2, "0")} Min`;
    }

    return `00 Hr : ${String(mins).padStart(2, "0")} Min`;
}

function getStatusClass(status) {
    if (!status) return "";
    status = status.toLowerCase();
    if (status === "departed" || status === "completed") return "completed";
    if (status === "at-station" || status === "arrived") return "current";
    return "upcoming";
}

// 2. Get Between Stations Trains
async function getBetweenStations(e) {

    e.preventDefault();

    const rawSource =
        document.getElementById("between-source").value;

    const rawDest =
        document.getElementById("between-dest").value;

    const journeyDate =
        document.getElementById("between-date").value;

    const source =
        extractCodeOrNumber(rawSource);

    const destination =
        extractCodeOrNumber(rawDest);

    const loader =
        document.getElementById("loader-between");

    const resultBox =
        document.getElementById("result-between");

    loader.style.display = "block";
    resultBox.innerHTML = "";

    try {

        const res = await fetch(
            `${API_BASE_URL}/between?source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}&date=${journeyDate}`
        );

        const data = await res.json();

        console.log("BETWEEN RESPONSE:", data);

        loader.style.display = "none";

        if (data.error) {

            resultBox.innerHTML = `
                <div class="error-msg">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    ${data.error}
                </div>
            `;

            return;
        }

        const trains =
            data.trains ||
            data.data?.trains ||
            [];

        if (trains.length === 0) {

            resultBox.innerHTML = `
                <div class="card">
                    <h3>No Train Found</h3>
                </div>
            `;

            return;
        }

        let html = "";

        trains.forEach(train => {

            html += renderTrainCard(
                train,
                journeyDate
            );

        });

        resultBox.innerHTML = html;

    } catch (err) {

        loader.style.display = "none";

        console.error(
            "Between Station Error:",
            err
        );

        resultBox.innerHTML = `
            <div class="error-msg">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Unable to connect backend.
            </div>
        `;
    }
}

function formatDuration(minutes) {

    minutes = Number(minutes);

    if (isNaN(minutes) || minutes <= 0)
        return "--";

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    if (h > 0 && m > 0)
        return `${h}h ${m}m`;

    if (h > 0)
        return `${h}h`;

    return `${m}m`;
}

function renderTrainCard(t, selectedDate) {

    const train = t.train || {};

    const trainNo = train.number || "--";
    const trainName = train.name || "--";
    const trainType = train.type || "Express";

    const dep = t.from?.departure || "--";
    const arr = t.to?.arrival || "--";

    const duration = formatDuration(t.duration);

    const runDays = train.runDays || [];

    const selectedDay = new Date(selectedDate + "T00:00:00")
        .toLocaleDateString("en-US", {
            weekday: "short"
        })
        .toLowerCase()
        .slice(0, 3);

    const days = [
        { k: "mon", l: "M" },
        { k: "tue", l: "T" },
        { k: "wed", l: "W" },
        { k: "thu", l: "T" },
        { k: "fri", l: "F" },
        { k: "sat", l: "S" },
        { k: "sun", l: "S" }
    ];

    let dayHTML = "";

    days.forEach(d => {

        const active = runDays.includes(d.k);
        const selected = selectedDay === d.k;

        dayHTML += `
            <span class="
                between-day
                ${active ? "active" : ""}
                ${selected ? "selected" : ""}
            ">
                ${d.l}
            </span>
        `;
    });

    const runsToday = runDays.includes(selectedDay);

    return `
        <div class="between-train-card">

            <div class="between-main-row">

                <div class="between-train-number">
                    ${trainNo}
                </div>

                <div class="between-time-block">
                    <div class="between-time">
                        ${dep}
                    </div>
                    <div class="between-label">
                        Departure
                    </div>
                </div>

                <div class="between-duration">
                    ${duration}
                </div>

                <div class="between-time-block">
                    <div class="between-time">
                        ${arr}
                    </div>
                    <div class="between-label">
                        Arrival
                    </div>
                </div>

            </div>

            <div class="between-train-name">
                ${trainName}
            </div>

            <div class="between-train-type">
                ${trainType}
            </div>

            <div class="between-date">
                Journey Date : ${selectedDate}
            </div>

            <div class="between-days">
                ${dayHTML}
            </div>

            <div class="between-run-status">
                ${
                    runsToday
                    ? "Runs on Selected Date"
                    : "Not Running on Selected Date"
                }
            </div>

        </div>
    `;
}

async function openTrainRoute(trainNo, selectedDate, card) {

    // Sabhi open route tables band karo
    document.querySelectorAll(".train-route-container").forEach(box => {
        box.innerHTML = "";
    });

    const routeBox = card.nextElementSibling;

    routeBox.innerHTML = `
        <div class="route-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading route...
        </div>
    `;

    try {

        const response = await fetch(
            `${API_BASE_URL}/train/live/${encodeURIComponent(trainNo)}?date=${selectedDate}`
        );

        const data = await response.json();

        if (!response.ok || data.error) {
            routeBox.innerHTML = `
                <div class="route-error">
                    Unable to load train route.
                </div>
            `;
            return;
        }

        /*
         * API ke response se route nikalna
         */
        const route =
            data.route ||
            data.data?.route ||
            data.data?.stations ||
            data.stations ||
            [];

        if (!route.length) {

            routeBox.innerHTML = `
                <div class="route-error">
                    Route information not available.
                </div>
            `;

            return;
        }

        let tableHTML = `
            <div class="train-route-table">

                <div class="route-title">
                    <i class="fa-solid fa-route"></i>
                    Train Route
                </div>

                <div class="route-table-wrapper">

                    <table>

                        <thead>
                            <tr>
                                <th>Station</th>
                                <th>Code</th>
                                <th>Arrival</th>
                                <th>Departure</th>
                                <th>Platform</th>
                                <th>Day</th>
                            </tr>
                        </thead>

                        <tbody>
        `;

        route.forEach(station => {

            const stationName =
                station.stationName ||
                station.name ||
                station.station?.name ||
                "--";

            const stationCode =
                station.stationCode ||
                station.code ||
                station.station?.code ||
                "--";

            const arrival =
                station.scheduledArrival ||
                station.arrival ||
                "--";

            const departure =
                station.scheduledDeparture ||
                station.departure ||
                "--";

            const platform =
                station.platform ||
                station.platformNumber ||
                "--";

            const day =
                station.day ||
                "--";

            tableHTML += `
                <tr>

                    <td>
                        <b>${stationName}</b>
                    </td>

                    <td>
                        ${stationCode}
                    </td>

                    <td>
                        ${arrival}
                    </td>

                    <td>
                        ${departure}
                    </td>

                    <td>
                        ${platform}
                    </td>

                    <td>
                        ${day}
                    </td>

                </tr>
            `;
        });

        tableHTML += `
                        </tbody>

                    </table>

                </div>

            </div>
        `;

        routeBox.innerHTML = tableHTML;

    } catch (error) {

        console.error(error);

        routeBox.innerHTML = `
            <div class="route-error">
                Unable to connect to backend.
            </div>
        `;
    }
}

// 3. Get Station Board
async function getStationBoard(e) {
    e.preventDefault();
    const rawStation = document.getElementById('board-station').value;
    const station = extractCodeOrNumber(rawStation);

    const loader = document.getElementById('loader-board');
    const resultBox = document.getElementById('result-board');

    loader.style.display = 'block';
    resultBox.innerHTML = '';

    try {
        const res = await fetch(`${API_BASE_URL}/station/${encodeURIComponent(station)}`);
        const data = await res.json();
        loader.style.display = 'none';

        if (data.error) {
            resultBox.innerHTML = `<div class="error-msg"><i class="fa-solid fa-circle-exclamation"></i> ${data.error}</div>`;
            return;
        }

        const trains = data.trains || [];
        if (trains.length === 0) {
            resultBox.innerHTML = `<div class="card"><p>No trains found for station ${station}.</p></div>`;
            return;
        }

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Train No.</th>
                        <th>Name</th>
                        <th>Runs On</th>
                        <th>Arr / Dep</th>
                        <th>PF</th>
                    </tr>
                </thead>
                <tbody>
        `;

        trains.forEach(t => {
            html += `
                <tr>
                    <td><b>${t.number}</b></td>
                    <td>${t.name}</td>
                    <td>${t.days}</td>
                    <td>${t.arrival} / ${t.departure}</td>
                    <td><span class="platform-tag">PF ${t.platform}</span></td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        resultBox.innerHTML = html;

    } catch (err) {
        loader.style.display = 'none';
        resultBox.innerHTML = `<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to retrieve station board.</div>`;
    }
}

// 4. Get PNR Status
async function getPNRStatus(e) {
    e.preventDefault();

    const pnr = document.getElementById('pnr-input').value.trim();

    const loader = document.getElementById('loader-pnr');
    const resultBox = document.getElementById('result-pnr');

    // Basic validation
    if (!pnr || !/^\d{10}$/.test(pnr)) {
        resultBox.innerHTML = `
            <div class="error-msg">
                <i class="fa-solid fa-circle-exclamation"></i>
                Please enter a valid 10 digit PNR number.
            </div>
        `;
        return;
    }

    loader.style.display = 'block';
    resultBox.innerHTML = '';

    try {
        const res = await fetch(
            `${API_BASE_URL}/pnr/${encodeURIComponent(pnr)}`
        );

        const data = await res.json();

        loader.style.display = 'none';

        if (!res.ok || data.error) {
            resultBox.innerHTML = `
                <div class="error-msg">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    ${data.error || 'PNR NOT FOUND'}
                </div>
            `;
            return;
        }

        // -------------------------
        // Date Formatter
        // -------------------------
        function formatDate(dateString) {
            if (!dateString) return 'N/A';

            const date = new Date(dateString);

            if (isNaN(date.getTime())) {
                return dateString;
            }

            return date.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        }

        // -------------------------
        // Data
        // -------------------------
        const pnrNumber = data.pnrNumber || pnr;

        const journeyDate = formatDate(data.dateOfJourney);

        const trainNumber = data.trainNumber || 'N/A';
        const trainName = data.trainName || 'N/A';

        const fromStation = data.sourceStation || 'N/A';
        const toStation = data.destinationStation || 'N/A';

        const distance = data.distance || 0;

        const fare =
            data.bookingFare ??
            data.ticketFare ??
            0;

        const chartStatus = data.chartStatus || 'N/A';

        const passengers = Array.isArray(data.passengerList)
            ? data.passengerList
            : [];

        // -------------------------
        // Passenger HTML
        // -------------------------
        let passengerHTML = '';

        if (passengers.length > 0) {

            passengerHTML = passengers.map((passenger, index) => {

                const passengerNo =
                    passenger.passengerSerialNumber || index + 1;

                const status =
                    passenger.bookingStatusDetails ||
                    passenger.bookingStatus ||
                    'N/A';

                return `
                    <div class="pnr-passenger-row">

                        <div class="pnr-passenger-left">

                            <span class="pnr-passenger-number">
                                ${passengerNo}
                            </span>

                            <div>
                                <div class="pnr-passenger-name">
                                    Passenger ${passengerNo}
                                </div>

                                <div class="pnr-passenger-sub">
                                    ${data.journeyClass || ''}
                                </div>
                            </div>

                        </div>

                        <div class="pnr-berth ${
                            String(passenger.bookingStatus || '').includes('WL')
                                ? 'pnr-berth-wl'
                                : ''
                        }">
                            ${status}
                        </div>

                    </div>
                `;
            }).join('');

        } else {

            passengerHTML = `
                <div class="pnr-no-passenger">
                    No passenger details available
                </div>
            `;
        }

        // -------------------------
        // Final PNR UI
        // -------------------------
        resultBox.innerHTML = `

            <div class="pnr-card">

                <!-- HEADER -->
                <div class="pnr-header">

                    <div class="pnr-header-left">

                        <span class="pnr-label">
                            PNR NO:
                        </span>

                        <span class="pnr-value">
                            ${pnrNumber}
                        </span>

                    </div>

                    <div class="pnr-header-right">

                        <span class="pnr-label">
                            <i class="fa-regular fa-calendar"></i>
                            DATE
                        </span>

                        <span class="pnr-value pnr-date">
                            ${journeyDate}
                        </span>

                    </div>

                </div>


                <!-- TRAIN -->
                <div class="pnr-train">

                    <div class="pnr-section-label">
                        Train Number/Name
                    </div>

                    <div class="pnr-train-name">

                        <span class="pnr-train-number">
                            ${trainNumber}
                        </span>

                        ${trainName}

                    </div>

                </div>


                <!-- FROM / TO -->
                <div class="pnr-route">

                    <div class="pnr-route-top">

                        <div class="pnr-station">

                            <div class="pnr-section-label">
                                FROM
                            </div>

                            <div class="pnr-station-name">
                                ${fromStation}
                            </div>

                        </div>


                        <div class="pnr-station pnr-station-right">

                            <div class="pnr-section-label">
                                TO
                            </div>

                            <div class="pnr-station-name">
                                ${toStation}
                            </div>

                        </div>

                    </div>


                    <!-- RAILWAY TRACK -->
                    <div class="pnr-track">

                        <div class="pnr-track-line"></div>

                        <!-- Train icon ON railway track -->
                        <div class="pnr-train-marker">
                            <i class="fa-solid fa-train"></i>
                        </div>

                        <!-- Distance -->
                        <div class="pnr-distance">
                            ${distance} KM
                        </div>

                        <!-- STOP at end of track -->
                        <div class="pnr-stop-marker">
                            STOP
                        </div>

                    </div>

                </div>


                <!-- FARE + CHART -->
                <div class="pnr-summary">

                    <div class="pnr-summary-item">

                        <div class="pnr-section-label">
                            Fare:
                        </div>

                        <div class="pnr-fare">
                            ₹${fare}
                        </div>

                    </div>


                    <div class="pnr-summary-item">

                        <div class="pnr-section-label">
                            Chart:
                        </div>

                        <div class="pnr-chart-status">
                            ${chartStatus}
                        </div>

                    </div>

                </div>


                <!-- PASSENGERS -->
                <div class="pnr-passengers">

                    <div class="pnr-passenger-header">

                        <span>
                            <i class="fa-solid fa-user-group"></i>
                            Passenger Details
                        </span>

                        <span>
                            Berth / Coach
                        </span>

                    </div>

                    ${passengerHTML}

                </div>

            </div>
        `;

    } catch (err) {

        console.error('PNR Error:', err);

        loader.style.display = 'none';

        resultBox.innerHTML = `
            <div class="error-msg">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Failed to fetch PNR status.
            </div>
        `;
    }
}