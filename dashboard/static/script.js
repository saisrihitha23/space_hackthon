const MAX_POINTS = 60;

let usingRealML = false;
let systemPhase = "normal";
let phaseTimer = null;

let dynamicThreshold = 0.43;

let selectedPoint = null;

let telemetry = {
    temperature: 32.4,
    voltage: 3.72,
    current: 1.21,
    solar: 4.52,
    anomalyScore: 0.10
};

const NORMAL = {
    temperature: 32.4,
    voltage: 3.72,
    current: 1.21,
    solar: 4.52
};

const history = {
    temperature: [],
    voltage: [],
    current: [],
    solar: [],
    anomalyScore: [],
    timestamps: [],
    anomalyFlags: []
};

const mlData = {
    anomalies: [],
    timeline: [],
    reconstructionErrors: [],
    featureTimeline: [],
    finalResults: []
};

const canvases = {
    temperature: document.getElementById("temperatureChart"),
    voltage: document.getElementById("voltageChart"),
    current: document.getElementById("currentChart"),
    solar: document.getElementById("solarChart"),
    anomalyScore: document.getElementById("anomalyChart")
};


/* =========================================================
   HELPERS
========================================================= */

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function getValue(object, names, fallback = null) {
    if (!object) {
        return fallback;
    }

    for (const name of names) {
        if (
            object[name] !== undefined &&
            object[name] !== null
        ) {
            return object[name];
        }
    }

    return fallback;
}

function getNumber(object, names, fallback = null) {
    const value = getValue(object, names, fallback);
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function normalizeArray(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (data && typeof data === "object") {

        for (
            const key of [
                "data",
                "results",
                "records",
                "items"
            ]
        ) {

            if (Array.isArray(data[key])) {
                return data[key];
            }
        }
    }

    return [];
}

function formatTime(value) {

    if (!value) {
        return new Date().toLocaleTimeString();
    }

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString();
    }

    return String(value);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


/* =========================================================
   ML STATUS
========================================================= */

function setMLStatus(message) {
    setText("mlDataStatus", message);
}

function setConnected(connected) {

    const dot =
        document.getElementById("connectionDot");

    const text =
        document.getElementById("connectionText");

    if (connected) {

        dot.style.background = "#34d399";
        dot.style.boxShadow = "0 0 12px #34d399";

        text.textContent = "AI CONNECTED";

    } else {

        dot.style.background = "#facc15";
        dot.style.boxShadow = "0 0 12px #facc15";

        text.textContent = "DEMO MODE";
    }
}


/* =========================================================
   LOAD ML DATA
========================================================= */

async function loadRealMLData() {

    try {

        setMLStatus("🤖 LOADING PS1 RESULTS...");

        const response =
            await fetch(
                "/api/results",
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {
            throw new Error("API failed");
        }

        const data =
            await response.json();

        mlData.anomalies =
            normalizeArray(data.anomalies);

        mlData.timeline =
            normalizeArray(data.timeline);

        mlData.reconstructionErrors =
            normalizeArray(
                data.reconstruction_errors
            );

        mlData.featureTimeline =
            normalizeArray(
                data.feature_timeline
            );

        mlData.finalResults =
            normalizeArray(
                data.final_results
            );

        const rows = getTelemetryRows();

        if (!rows.length) {

            setMLStatus("🛰️ DEMO MODE");

            setConnected(false);

            startDemoMode();

            return;
        }

        usingRealML = true;

        setMLStatus("🧠 REAL ML DATA CONNECTED");

        setConnected(true);

        processRealData();

    } catch (error) {

        console.error(error);

        setMLStatus("🛰️ DEMO MODE");

        setConnected(false);

        startDemoMode();
    }
}


/* =========================================================
   GET TELEMETRY
========================================================= */

function getTelemetryRows() {

    if (mlData.timeline.length) {
        return mlData.timeline;
    }

    if (mlData.finalResults.length) {
        return mlData.finalResults;
    }

    if (mlData.reconstructionErrors.length) {
        return mlData.reconstructionErrors;
    }

    return [];
}


/* =========================================================
   PROCESS REAL DATA
========================================================= */

function processRealData() {

    const rows = getTelemetryRows();

    rows.forEach((row, index) => {

        const temperature =
            getNumber(
                row,
                [
                    "temperature",
                    "Temperature",
                    "temp",
                    "TEMP"
                ]
            );

        const voltage =
            getNumber(
                row,
                [
                    "voltage",
                    "Voltage",
                    "battery_voltage",
                    "V"
                ]
            );

        const current =
            getNumber(
                row,
                [
                    "current",
                    "Current",
                    "battery_current",
                    "I"
                ]
            );

        const solar =
            getNumber(
                row,
                [
                    "solar",
                    "Solar",
                    "solar_power",
                    "SOLAR"
                ]
            );

        const score =
            getNumber(
                row,
                [
                    "anomaly_score",
                    "anomalyScore",
                    "score",
                    "reconstruction_error",
                    "reconstructionError",
                    "error"
                ],
                0
            );

        const timestamp =
            getValue(
                row,
                [
                    "timestamp",
                    "datetime",
                    "time",
                    "date"
                ],
                index
            );

        history.temperature.push(
            temperature ?? NORMAL.temperature
        );

        history.voltage.push(
            voltage ?? NORMAL.voltage
        );

        history.current.push(
            current ?? NORMAL.current
        );

        history.solar.push(
            solar ?? NORMAL.solar
        );

        history.anomalyScore.push(score);

        history.timestamps.push(timestamp);

        history.anomalyFlags.push(
            score > dynamicThreshold
        );
    });

    trimHistory();

    calculateDynamicThreshold();

    updateLatestTelemetry();

    updateUI();

    drawAllCharts();

    processRealAnomalies();

    populateTerminalFromRealData();
}


/* =========================================================
   DYNAMIC NDT
========================================================= */

function calculateDynamicThreshold() {

    const scores =
        history.anomalyScore
            .filter(Number.isFinite);

    if (scores.length < 5) {
        return;
    }

    const sorted =
        [...scores].sort(
            (a, b) => a - b
        );

    const percentileIndex =
        Math.floor(
            sorted.length * 0.90
        );

    dynamicThreshold =
        sorted[
            Math.min(
                percentileIndex,
                sorted.length - 1
            )
        ];

    dynamicThreshold =
        clamp(
            dynamicThreshold,
            0.05,
            0.95
        );
}


/* =========================================================
   HISTORY
========================================================= */

function trimHistory() {

    Object.keys(history).forEach(key => {

        history[key] =
            history[key].slice(-MAX_POINTS);

    });
}


/* =========================================================
   LATEST VALUES
========================================================= */

function updateLatestTelemetry() {

    const last = array =>
        array.length
            ? array[array.length - 1]
            : null;

    telemetry.temperature =
        last(history.temperature)
        ?? telemetry.temperature;

    telemetry.voltage =
        last(history.voltage)
        ?? telemetry.voltage;

    telemetry.current =
        last(history.current)
        ?? telemetry.current;

    telemetry.solar =
        last(history.solar)
        ?? telemetry.solar;

    telemetry.anomalyScore =
        last(history.anomalyScore)
        ?? telemetry.anomalyScore;
}


/* =========================================================
   ANOMALY SEVERITY
========================================================= */

function getSeverity(score) {

    if (score >= 0.75) {
        return "HIGH";
    }

    if (score >= 0.50) {
        return "WARNING";
    }

    if (score >= 0.30) {
        return "WATCH";
    }

    return "LOW";
}


/* =========================================================
   CHANNEL ANALYSIS
========================================================= */

function analyzeChannels(values) {

    const analysis = [];

    const temperature =
        Number(values.temperature);

    const voltage =
        Number(values.voltage);

    const current =
        Number(values.current);

    const solar =
        Number(values.solar);


    const tempDelta =
        temperature - NORMAL.temperature;

    const voltageDelta =
        voltage - NORMAL.voltage;

    const currentDelta =
        current - NORMAL.current;

    const solarDelta =
        solar - NORMAL.solar;


    /*
       Temperature
    */

    if (tempDelta > 1.2) {

        analysis.push({
            key: "temperature",
            label: "Temperature ↑",
            strength: Math.abs(tempDelta),
            direction: "up"
        });

    } else if (tempDelta < -1.2) {

        analysis.push({
            key: "temperature",
            label: "Temperature ↓",
            strength: Math.abs(tempDelta),
            direction: "down"
        });
    }


    /*
       Voltage
    */

    if (voltageDelta < -0.08) {

        analysis.push({
            key: "voltage",
            label: "Battery voltage ↓",
            strength: Math.abs(voltageDelta),
            direction: "down"
        });

    } else if (voltageDelta > 0.08) {

        analysis.push({
            key: "voltage",
            label: "Battery voltage ↑",
            strength: Math.abs(voltageDelta),
            direction: "up"
        });
    }


    /*
       Current
    */

    if (currentDelta > 0.18) {

        analysis.push({
            key: "current",
            label: "Current ↑",
            strength: Math.abs(currentDelta),
            direction: "up"
        });

    } else if (currentDelta < -0.18) {

        analysis.push({
            key: "current",
            label: "Current ↓",
            strength: Math.abs(currentDelta),
            direction: "down"
        });
    }


    /*
       Solar
    */

    if (solarDelta < -0.35) {

        analysis.push({
            key: "solar",
            label: "Solar power ↓",
            strength: Math.abs(solarDelta),
            direction: "down"
        });

    } else if (solarDelta > 0.35) {

        analysis.push({
            key: "solar",
            label: "Solar power ↑",
            strength: Math.abs(solarDelta),
            direction: "up"
        });
    }


    analysis.sort(
        (a, b) =>
            b.strength - a.strength
    );


    return analysis;
}


/* =========================================================
   SUBSYSTEM DETECTION
========================================================= */

function detectSubsystem(contributors) {

    const keys =
        contributors.map(
            item => item.key
        );


    if (
        keys.includes("temperature")
    ) {

        if (
            keys.includes("voltage") ||
            keys.includes("current")
        ) {

            return {
                name: "Power + Thermal Subsystem",
                icon: "⚡🌡️"
            };
        }

        return {
            name: "Thermal Subsystem",
            icon: "🌡️"
        };
    }


    if (
        keys.includes("voltage") ||
        keys.includes("current")
    ) {

        return {
            name: "Power Subsystem",
            icon: "⚡"
        };
    }


    if (
        keys.includes("solar")
    ) {

        return {
            name: "Solar Power Subsystem",
            icon: "☀️"
        };
    }


    return {
        name: "Spacecraft Health",
        icon: "🛰️"
    };
}


/* =========================================================
   DYNAMIC RECOMMENDATION
========================================================= */

function generateRecommendation(
    contributors
) {

    const keys =
        contributors.map(
            item => item.key
        );

    const has =
        key => keys.includes(key);


    /*
       THERMAL
    */

    if (
        has("temperature") &&
        !has("voltage") &&
        !has("solar") &&
        !has("current")
    ) {

        return {

            main:
                "🌡️ Reduce thermal load and monitor the thermal-control subsystem.",

            actions: [
                "🌡️ Monitor the temperature trend continuously.",
                "⚙️ Reduce non-critical subsystem activity.",
                "🛰️ Verify thermal-control subsystem status.",
                "☀️ Check whether solar exposure is contributing to heating.",
                "🚨 Prepare a safe thermal operating mode if the rise continues."
            ],

            reason:
                "Temperature has moved away from its learned normal behavior. Reducing system activity can help limit additional heat generation while the thermal subsystem is checked."
        };
    }


    /*
       SOLAR
    */

    if (
        has("solar") &&
        !has("voltage") &&
        !has("current")
    ) {

        return {

            main:
                "☀️ Verify solar-panel generation and spacecraft orientation.",

            actions: [
                "☀️ Check solar-panel power generation.",
                "🛰️ Verify spacecraft orientation relative to the Sun.",
                "📡 Check solar telemetry for persistent degradation.",
                "🔋 Monitor battery state while generation is reduced.",
                "🚨 Prioritize essential loads if solar generation continues falling."
            ],

            reason:
                "Solar power has deviated from the spacecraft's learned normal behavior. A reduction in generation can eventually affect available spacecraft power."
        };
    }


    /*
       BATTERY
    */

    if (
        has("voltage") &&
        !has("current") &&
        !has("solar")
    ) {

        return {

            main:
                "🔋 Monitor battery health and reduce unnecessary electrical load.",

            actions: [
                "🔋 Check battery voltage and state of charge.",
                "⚡ Reduce non-essential power consumption.",
                "📊 Monitor the battery trend for continued deviation.",
                "🛰️ Verify battery-management telemetry.",
                "🚨 Prepare backup power mode if degradation persists."
            ],

            reason:
                "Battery voltage is outside the learned normal pattern. Continued deviation could indicate abnormal discharge or charging behavior."
        };
    }


    /*
       CURRENT / LOAD
    */

    if (
        has("current") &&
        !has("voltage") &&
        !has("solar")
    ) {

        return {

            main:
                "⚡ Reduce non-critical electrical loads and investigate unusual current demand.",

            actions: [
                "⚡ Reduce non-essential subsystem activity.",
                "🔎 Check which subsystem is drawing additional current.",
                "🔋 Monitor battery voltage during the increased load.",
                "📊 Continue observing the anomaly score.",
                "🚨 Escalate to safe operating mode if the load persists."
            ],

            reason:
                "Current consumption has moved outside the learned normal pattern, which may indicate an unexpected subsystem load."
        };
    }


    /*
       POWER COMBINATION
    */

    if (
        has("voltage") &&
        has("current") &&
        has("solar")
    ) {

        return {

            main:
                "⚡ Reduce non-critical power loads and prioritize battery recovery.",

            actions: [
                "🔋 Check battery voltage and charging state.",
                "☀️ Verify solar-panel power generation.",
                "⚡ Reduce non-essential subsystem power consumption.",
                "🌡️ Continue monitoring temperature for further increase.",
                "🛰️ If the anomaly persists, prepare a safe/backup operating mode."
            ],

            reason:
                "Battery voltage and solar generation are changing while current demand is also deviating. This combination may indicate a power imbalance or changing spacecraft load."
        };
    }


    /*
       THERMAL + POWER
    */

    if (
        has("temperature") &&
        (
            has("voltage") ||
            has("current")
        )
    ) {

        return {

            main:
                "🌡️⚡ Reduce spacecraft load while monitoring thermal and power behavior.",

            actions: [
                "⚡ Reduce non-critical electrical loads.",
                "🌡️ Monitor temperature continuously.",
                "🔋 Check battery voltage and state of charge.",
                "☀️ Verify solar generation.",
                "🛰️ Prepare safe operating mode if both trends continue."
            ],

            reason:
                "Thermal and electrical telemetry are deviating together. This combination can indicate increased system load or a subsystem operating outside its normal regime."
        };
    }


    /*
       GENERIC
    */

    return {

        main:
            "🛰️ Isolate the contributing subsystem and continue monitoring the telemetry trend.",

        actions: [
            "🔎 Inspect the telemetry channels contributing to the anomaly.",
            "📊 Continue monitoring the anomaly score.",
            "⚙️ Reduce non-critical subsystem activity.",
            "🛰️ Verify the affected subsystem health.",
            "🚨 Escalate to safe operating mode if the anomaly persists."
        ],

        reason:
            "The AI detected a multivariate deviation from the spacecraft's learned normal behavior."
    };
}


/* =========================================================
   CREATE ANOMALY EVENT
========================================================= */

function createDynamicEvent(
    score,
    timestamp,
    telemetryValues
) {

    const contributors =
        analyzeChannels(
            telemetryValues
        );


    const subsystem =
        detectSubsystem(
            contributors
        );


    const severity =
        getSeverity(score);


    return {

        score,

        timestamp,

        severity,

        contributors,

        subsystem,

        recommendation:
            generateRecommendation(
                contributors
            )
    };
}


/* =========================================================
   SHOW ANOMALY
========================================================= */

function showDynamicAnomaly(event) {

    setText(
        "latestLocation",
        `${event.subsystem.icon} ${event.subsystem.name}`
    );

    setText(
        "latestTime",
        formatTime(event.timestamp)
    );

    setText(
        "latestSeverity",
        event.severity
    );

    setText(
        "latestScore",
        event.score.toFixed(3)
    );


    const labels =
        event.contributors.length
            ? event.contributors.map(
                item => item.label
            )
            : [
                "Multivariate telemetry deviation"
            ];


    setText(
        "latestExplanation",
        `The AI detected a deviation involving ${labels.join(", ")}.`
    );


    setText(
        "recommendedAction",
        event.recommendation.main
    );


    const list =
        document.getElementById(
            "actionList"
        );

    list.innerHTML = "";


    event.recommendation.actions.forEach(
        action => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "action-item";

            item.textContent =
                action;

            list.appendChild(item);
        }
    );


    setText(
        "actionReason",
        event.recommendation.reason
    );


    document
        .getElementById("actionBox")
        .classList.remove("hidden");


    setText(
        "heroStatus",
        "ANOMALY DETECTED"
    );

    setText(
        "heroMessage",
        `AI detected an unusual pattern in the ${event.subsystem.name}.`
    );

    setText(
        "systemStatus",
        "● ALERT"
    );

    setText(
        "spacecraftState",
        "● ANOMALY"
    );

    setText(
        "riskLevel",
        event.severity
    );


    document.body.classList.remove(
        "warning-mode"
    );

    document.body.classList.add(
        "anomaly-mode"
    );


    const health =
        Math.round(
            clamp(
                100 -
                event.score * 45,
                35,
                99
            )
        );

    setText(
        "healthValue",
        health
    );
}


/* =========================================================
   NORMAL
========================================================= */

function showNormalStatus() {

    setText(
        "heroStatus",
        "SYSTEM NOMINAL"
    );

    setText(
        "heroMessage",
        "All monitored telemetry is within the learned normal pattern."
    );

    setText(
        "systemStatus",
        "● ONLINE"
    );

    setText(
        "spacecraftState",
        "● NOMINAL"
    );

    setText(
        "riskLevel",
        "LOW"
    );

    setText(
        "healthValue",
        "94"
    );

    document.body.classList.remove(
        "warning-mode",
        "anomaly-mode"
    );
}


/* =========================================================
   UI
========================================================= */

function updateUI() {

    setText(
        "temperatureValue",
        `${telemetry.temperature.toFixed(2)} °C`
    );

    setText(
        "voltageValue",
        `${telemetry.voltage.toFixed(3)} V`
    );

    setText(
        "currentValue",
        `${telemetry.current.toFixed(3)} A`
    );

    setText(
        "solarValue",
        `${telemetry.solar.toFixed(3)} W`
    );

    setText(
        "anomalyValue",
        telemetry.anomalyScore.toFixed(3)
    );

    setText(
        "ndtThreshold",
        dynamicThreshold.toFixed(3)
    );

    setText(
        "riskLevel",
        getSeverity(
            telemetry.anomalyScore
        )
    );
}


/* =========================================================
   INTERACTIVE CANVAS CHART
========================================================= */

function drawInteractiveChart(
    canvas,
    values,
    timestamps,
    scores,
    config,
    tooltip
) {

    if (!canvas || values.length < 2) {
        return;
    }


    const rect =
        canvas.getBoundingClientRect();

    const width =
        Math.max(rect.width, 240);

    const height =
        canvas.id === "anomalyChart"
            ? 230
            : 115;

    const dpr =
        window.devicePixelRatio || 1;

    canvas.width =
        width * dpr;

    canvas.height =
        height * dpr;

    const ctx =
        canvas.getContext("2d");

    ctx.setTransform(
        dpr, 0, 0, dpr, 0, 0
    );

    ctx.clearRect(
        0, 0,
        width,
        height
    );


    /*
       Background
    */

    ctx.fillStyle = "#010611";

    ctx.fillRect(
        0, 0,
        width,
        height
    );


    const left = 8;
    const right = 8;
    const top = 8;
    const bottom = 8;

    const graphWidth =
        width - left - right;

    const graphHeight =
        height - top - bottom;


    /*
       Grid
    */

    ctx.strokeStyle =
        "rgba(148,163,184,.08)";

    ctx.lineWidth = 1;

    for (
        let i = 0;
        i <= 3;
        i++
    ) {

        const y =
            top +
            graphHeight *
            i / 3;

        ctx.beginPath();

        ctx.moveTo(
            left,
            y
        );

        ctx.lineTo(
            width - right,
            y
        );

        ctx.stroke();
    }


    /*
       NDT line on anomaly graph
    */

    if (
        canvas.id === "anomalyChart"
    ) {

        const normalized =
            clamp(
                (
                    dynamicThreshold -
                    config.min
                ) /
                (
                    config.max -
                    config.min
                ),
                0,
                1
            );

        const thresholdY =
            top +
            graphHeight *
            (1 - normalized);

        ctx.setLineDash(
            [5,5]
        );

        ctx.strokeStyle =
            "rgba(250,204,21,.7)";

        ctx.beginPath();

        ctx.moveTo(
            left,
            thresholdY
        );

        ctx.lineTo(
            width - right,
            thresholdY
        );

        ctx.stroke();

        ctx.setLineDash([]);
    }


    /*
       Line
    */

    ctx.beginPath();

    values.forEach(
        (value, index) => {

            const normalized =
                clamp(
                    (
                        value -
                        config.min
                    ) /
                    (
                        config.max -
                        config.min
                    ),
                    0,
                    1
                );

            const x =
                left +
                (
                    index /
                    (values.length - 1)
                ) *
                graphWidth;

            const y =
                top +
                graphHeight *
                (1 - normalized);

            if (index === 0) {
                ctx.moveTo(x,y);
            } else {
                ctx.lineTo(x,y);
            }
        }
    );

    ctx.strokeStyle =
        config.color;

    ctx.lineWidth = 2;

    ctx.shadowBlur = 8;

    ctx.shadowColor =
        config.color;

    ctx.stroke();

    ctx.shadowBlur = 0;


    /*
       Anomaly points
    */

    values.forEach(
        (value, index) => {

            const score =
                scores[index] ?? 0;

            if (
                score <= dynamicThreshold
            ) {
                return;
            }

            const normalized =
                clamp(
                    (
                        value -
                        config.min
                    ) /
                    (
                        config.max -
                        config.min
                    ),
                    0,
                    1
                );

            const x =
                left +
                (
                    index /
                    (values.length - 1)
                ) *
                graphWidth;

            const y =
                top +
                graphHeight *
                (1 - normalized);


            ctx.beginPath();

            ctx.arc(
                x,
                y,
                4,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                "#ef4444";

            ctx.shadowBlur = 12;

            ctx.shadowColor =
                "#ef4444";

            ctx.fill();

            ctx.shadowBlur = 0;
        }
    );


    /*
       Hover
    */

    canvas.onmousemove =
        function(event) {

            const bounds =
                canvas.getBoundingClientRect();

            const mouseX =
                event.clientX -
                bounds.left;

            const ratio =
                clamp(
                    (
                        mouseX -
                        left
                    ) /
                    graphWidth,
                    0,
                    1
                );

            const index =
                Math.round(
                    ratio *
                    (values.length - 1)
                );

            const value =
                values[index];

            const score =
                scores[index] ?? 0;

            const timestamp =
                timestamps[index];

            const normalized =
                clamp(
                    (
                        value -
                        config.min
                    ) /
                    (
                        config.max -
                        config.min
                    ),
                    0,
                    1
                );

            const pointX =
                left +
                (
                    index /
                    (values.length - 1)
                ) *
                graphWidth;

            const pointY =
                top +
                graphHeight *
                (1 - normalized);


            let status =
                score >
                dynamicThreshold
                    ? `<div class="tooltip-anomaly">🚨 ANOMALY</div>`
                    : `<div class="tooltip-normal">🟢 NORMAL</div>`;


            tooltip.innerHTML = `

                <div class="tooltip-title">
                    ${config.icon} ${config.label}
                </div>

                <div>
                    🕐 ${formatTime(timestamp)}
                </div>

                <div>
                    Value:
                    <strong>
                        ${Number(value).toFixed(config.decimals)}
                        ${config.unit}
                    </strong>
                </div>

                <div>
                    AI Score:
                    <strong>
                        ${Number(score).toFixed(3)}
                    </strong>
                </div>

                ${status}

            `;


            tooltip.classList.add(
                "visible"
            );


            const tooltipWidth =
                tooltip.offsetWidth || 160;

            const tooltipHeight =
                tooltip.offsetHeight || 100;


            tooltip.style.left =
                `${clamp(
                    pointX - tooltipWidth / 2,
                    0,
                    width - tooltipWidth
                )}px`;


            tooltip.style.top =
                `${clamp(
                    pointY - tooltipHeight - 10,
                    0,
                    height - tooltipHeight
                )}px`;

        };


    canvas.onmouseleave =
        function() {

            tooltip.classList.remove(
                "visible"
            );
        };
}


/* =========================================================
   CHART CONFIG
========================================================= */

const chartConfigs = {

    temperature: {
        min: 20,
        max: 50,
        color: "#38bdf8",
        label: "TEMPERATURE",
        icon: "🌡️",
        unit: "°C",
        decimals: 2
    },

    voltage: {
        min: 3,
        max: 4.2,
        color: "#a78bfa",
        label: "BATTERY VOLTAGE",
        icon: "🔋",
        unit: "V",
        decimals: 3
    },

    current: {
        min: 0,
        max: 2.5,
        color: "#fb923c",
        label: "CURRENT",
        icon: "⚡",
        unit: "A",
        decimals: 3
    },

    solar: {
        min: 0,
        max: 6,
        color: "#facc15",
        label: "SOLAR POWER",
        icon: "☀️",
        unit: "W",
        decimals: 3
    },

    anomalyScore: {
        min: 0,
        max: 1,
        color: "#f87171",
        label: "ANOMALY SCORE",
        icon: "🚨",
        unit: "",
        decimals: 3
    }
};


/* =========================================================
   DRAW ALL
========================================================= */

function drawAllCharts() {

    drawInteractiveChart(
        canvases.temperature,
        history.temperature,
        history.timestamps,
        history.anomalyScore,
        chartConfigs.temperature,
        document.getElementById(
            "temperatureTooltip"
        )
    );


    drawInteractiveChart(
        canvases.voltage,
        history.voltage,
        history.timestamps,
        history.anomalyScore,
        chartConfigs.voltage,
        document.getElementById(
            "voltageTooltip"
        )
    );


    drawInteractiveChart(
        canvases.current,
        history.current,
        history.timestamps,
        history.anomalyScore,
        chartConfigs.current,
        document.getElementById(
            "currentTooltip"
        )
    );


    drawInteractiveChart(
        canvases.solar,
        history.solar,
        history.timestamps,
        history.anomalyScore,
        chartConfigs.solar,
        document.getElementById(
            "solarTooltip"
        )
    );


    drawInteractiveChart(
        canvases.anomalyScore,
        history.anomalyScore,
        history.timestamps,
        history.anomalyScore,
        chartConfigs.anomalyScore,
        document.getElementById(
            "anomalyTooltip"
        )
    );
}


/* =========================================================
   ANOMALY TABLE
========================================================= */

function addAnomalyRow(event) {

    const tbody =
        document.getElementById(
            "anomalyTableBody"
        );

    if (!tbody) {
        return;
    }


    if (
        tbody.children.length === 1 &&
        tbody.textContent.includes(
            "Waiting"
        )
    ) {
        tbody.innerHTML = "";
    }


    const row =
        document.createElement("tr");


    const contributors =
        event.contributors.length
            ? event.contributors.map(
                item => item.label
            ).join(" • ")
            : "Multivariate deviation";


    row.innerHTML = `

        <td>
            ${formatTime(event.timestamp)}
        </td>

        <td>
            ${event.subsystem.icon}
            ${event.subsystem.name}
        </td>

        <td>
            🔴 ${event.severity}
        </td>

        <td>
            ${event.score.toFixed(3)}
        </td>

        <td>
            ${contributors}
        </td>

    `;


    tbody.prepend(row);
}


/* =========================================================
   REAL ANOMALIES
========================================================= */

function processRealAnomalies() {

    const rows =
        mlData.anomalies;


    if (!rows.length) {

        if (
            telemetry.anomalyScore >
            dynamicThreshold
        ) {

            const event =
                createDynamicEvent(
                    telemetry.anomalyScore,
                    history.timestamps[
                        history.timestamps.length - 1
                    ],
                    telemetry
                );

            showDynamicAnomaly(event);

        } else {

            showNormalStatus();
        }

        return;
    }


    const tbody =
        document.getElementById(
            "anomalyTableBody"
        );

    tbody.innerHTML = "";


    rows.forEach(
        anomaly => {

            const score =
                getNumber(
                    anomaly,
                    [
                        "anomaly_score",
                        "score",
                        "reconstruction_error"
                    ],
                    0
                );


            const timestamp =
                getValue(
                    anomaly,
                    [
                        "timestamp",
                        "time",
                        "datetime"
                    ],
                    new Date().toISOString()
                );


            const values = {

                temperature:
                    getNumber(
                        anomaly,
                        [
                            "temperature",
                            "temp"
                        ],
                        telemetry.temperature
                    ),

                voltage:
                    getNumber(
                        anomaly,
                        [
                            "voltage",
                            "battery_voltage"
                        ],
                        telemetry.voltage
                    ),

                current:
                    getNumber(
                        anomaly,
                        [
                            "current",
                            "battery_current"
                        ],
                        telemetry.current
                    ),

                solar:
                    getNumber(
                        anomaly,
                        [
                            "solar",
                            "solar_power"
                        ],
                        telemetry.solar
                    )
            };


            const event =
                createDynamicEvent(
                    score,
                    timestamp,
                    values
                );


            addAnomalyRow(event);

        }
    );


    const latest =
        rows[rows.length - 1];


    const latestScore =
        getNumber(
            latest,
            [
                "anomaly_score",
                "score",
                "reconstruction_error"
            ],
            telemetry.anomalyScore
        );


    const latestTime =
        getValue(
            latest,
            [
                "timestamp",
                "time",
                "datetime"
            ],
            new Date().toISOString()
        );


    const latestValues = {

        temperature:
            getNumber(
                latest,
                ["temperature","temp"],
                telemetry.temperature
            ),

        voltage:
            getNumber(
                latest,
                ["voltage","battery_voltage"],
                telemetry.voltage
            ),

        current:
            getNumber(
                latest,
                ["current","battery_current"],
                telemetry.current
            ),

        solar:
            getNumber(
                latest,
                ["solar","solar_power"],
                telemetry.solar
            )
    };


    const event =
        createDynamicEvent(
            latestScore,
            latestTime,
            latestValues
        );


    showDynamicAnomaly(event);
}


/* =========================================================
   DEMO MODE
========================================================= */

function initializeDemoHistory() {

    if (history.temperature.length) {
        return;
    }


    for (
        let i = 0;
        i < MAX_POINTS;
        i++
    ) {

        history.temperature.push(
            NORMAL.temperature +
            (
                Math.random() - .5
            ) * 1.2
        );

        history.voltage.push(
            NORMAL.voltage +
            (
                Math.random() - .5
            ) * .06
        );

        history.current.push(
            NORMAL.current +
            (
                Math.random() - .5
            ) * .15
        );

        history.solar.push(
            NORMAL.solar +
            (
                Math.random() - .5
            ) * .4
        );

        history.anomalyScore.push(
            .07 +
            Math.random() * .06
        );

        history.timestamps.push(
            new Date(
                Date.now() -
                (
                    MAX_POINTS - i
                ) * 1000
            ).toISOString()
        );

        history.anomalyFlags.push(false);
    }
}


function startDemoMode() {

    initializeDemoHistory();

    dynamicThreshold = .43;

    drawAllCharts();

    updateUI();

    startNormalPhase();
}


/* =========================================================
   DEMO PHASES
========================================================= */

function startNormalPhase() {

    systemPhase = "normal";

    showNormalStatus();

    clearTimeout(phaseTimer);

    phaseTimer =
        setTimeout(
            startWarningPhase,
            15000
        );
}


function startWarningPhase() {

    systemPhase = "warning";

    setText(
        "heroStatus",
        "EARLY WARNING"
    );

    setText(
        "heroMessage",
        "AI detected a growing deviation from nominal telemetry."
    );

    setText(
        "systemStatus",
        "● WARNING"
    );

    setText(
        "spacecraftState",
        "● WARNING"
    );

    setText(
        "riskLevel",
        "WARNING"
    );

    document.body.classList.add(
        "warning-mode"
    );

    document.body.classList.remove(
        "anomaly-mode"
    );

    clearTimeout(phaseTimer);

    phaseTimer =
        setTimeout(
            startAnomalyPhase,
            8000
        );
}


function startAnomalyPhase() {

    systemPhase = "anomaly";

    /*
       Create a realistic POWER anomaly.
       The recommendation is generated from
       the actual changing channels.
    */

    const event =
        createDynamicEvent(
            telemetry.anomalyScore,
            new Date().toISOString(),
            telemetry
        );


    showDynamicAnomaly(event);

    addAnomalyRow(event);

    clearTimeout(phaseTimer);

    phaseTimer =
        setTimeout(
            startRecoveryPhase,
            10000
        );
}


function startRecoveryPhase() {

    systemPhase = "recovery";

    setText(
        "heroStatus",
        "SYSTEM RECOVERY"
    );

    setText(
        "heroMessage",
        "Telemetry is returning toward nominal conditions."
    );

    setText(
        "systemStatus",
        "● RECOVERING"
    );

    setText(
        "spacecraftState",
        "● RECOVERING"
    );

    setText(
        "riskLevel",
        "WATCH"
    );

    document.body.classList.add(
        "warning-mode"
    );

    document.body.classList.remove(
        "anomaly-mode"
    );

    clearTimeout(phaseTimer);

    phaseTimer =
        setTimeout(
            startNormalPhase,
            10000
        );
}


/* =========================================================
   DEMO TELEMETRY
========================================================= */

function updateDemoTelemetry() {

    if (usingRealML) {
        return;
    }


    if (systemPhase === "normal") {

        telemetry.temperature +=
            (
                Math.random() - .5
            ) * .15;

        telemetry.voltage +=
            (
                Math.random() - .5
            ) * .008;

        telemetry.current +=
            (
                Math.random() - .5
            ) * .02;

        telemetry.solar +=
            (
                Math.random() - .5
            ) * .06;

        telemetry.anomalyScore +=
            (
                Math.random() - .5
            ) * .01;

        telemetry.anomalyScore =
            clamp(
                telemetry.anomalyScore,
                .04,
                .18
            );
    }


    else if (systemPhase === "warning") {

        telemetry.temperature += .09;

        telemetry.voltage -= .008;

        telemetry.current += .018;

        telemetry.solar -= .05;

        telemetry.anomalyScore += .025;

        telemetry.anomalyScore =
            clamp(
                telemetry.anomalyScore,
                .10,
                .55
            );
    }


    else if (systemPhase === "anomaly") {

        telemetry.temperature += .05;

        telemetry.voltage -= .006;

        telemetry.current += .014;

        telemetry.solar -= .04;

        telemetry.anomalyScore += .022;

        telemetry.anomalyScore =
            clamp(
                telemetry.anomalyScore,
                .30,
                .95
            );
    }


    else if (systemPhase === "recovery") {

        telemetry.temperature +=
            (
                NORMAL.temperature -
                telemetry.temperature
            ) * .15;

        telemetry.voltage +=
            (
                NORMAL.voltage -
                telemetry.voltage
            ) * .15;

        telemetry.current +=
            (
                NORMAL.current -
                telemetry.current
            ) * .15;

        telemetry.solar +=
            (
                NORMAL.solar -
                telemetry.solar
            ) * .15;

        telemetry.anomalyScore +=
            (
                .10 -
                telemetry.anomalyScore
            ) * .20;
    }


    history.temperature.push(
        telemetry.temperature
    );

    history.voltage.push(
        telemetry.voltage
    );

    history.current.push(
        telemetry.current
    );

    history.solar.push(
        telemetry.solar
    );

    history.anomalyScore.push(
        telemetry.anomalyScore
    );

    history.timestamps.push(
        new Date().toISOString()
    );

    history.anomalyFlags.push(
        telemetry.anomalyScore >
        dynamicThreshold
    );


    trimHistory();

    updateUI();

    drawAllCharts();
}


/* =========================================================
   TERMINAL
========================================================= */

function addTerminalLine() {

    const terminal =
        document.getElementById(
            "terminalLog"
        );

    if (!terminal) {
        return;
    }


    const isAnomaly =
        telemetry.anomalyScore >
        dynamicThreshold ||
        systemPhase === "anomaly";


    const line =
        document.createElement("div");


    line.className =
        "telemetry-line";


    if (isAnomaly) {

        line.classList.add(
            "anomaly-line"
        );
    }


    line.textContent =

        `[${new Date().toLocaleTimeString()}] ` +

        `TEMP=${telemetry.temperature.toFixed(2)}°C ` +

        `V=${telemetry.voltage.toFixed(3)}V ` +

        `I=${telemetry.current.toFixed(3)}A ` +

        `SOLAR=${telemetry.solar.toFixed(3)}W ` +

        `AI_SCORE=${telemetry.anomalyScore.toFixed(3)}`;


    terminal.appendChild(line);


    line.addEventListener(
        "click",
        () => {

            const event =
                createDynamicEvent(
                    telemetry.anomalyScore,
                    new Date().toISOString(),
                    telemetry
                );

            showDynamicAnomaly(event);
        }
    );


    while (
        terminal.children.length > 35
    ) {

        terminal.removeChild(
            terminal.firstChild
        );
    }


    terminal.scrollTop =
        terminal.scrollHeight;
}


/* =========================================================
   REAL TERMINAL
========================================================= */

function populateTerminalFromRealData() {

    const terminal =
        document.getElementById(
            "terminalLog"
        );

    if (!terminal) {
        return;
    }

    terminal.innerHTML = "";


    const rows =
        getTelemetryRows().slice(-25);


    rows.forEach(row => {

        const temperature =
            getNumber(
                row,
                [
                    "temperature",
                    "Temperature",
                    "temp",
                    "TEMP"
                ],
                0
            );

        const voltage =
            getNumber(
                row,
                [
                    "voltage",
                    "Voltage",
                    "V"
                ],
                0
            );

        const current =
            getNumber(
                row,
                [
                    "current",
                    "Current",
                    "I"
                ],
                0
            );

        const solar =
            getNumber(
                row,
                [
                    "solar",
                    "Solar",
                    "solar_power",
                    "SOLAR"
                ],
                0
            );

        const score =
            getNumber(
                row,
                [
                    "anomaly_score",
                    "score",
                    "reconstruction_error"
                ],
                0
            );

        const timestamp =
            getValue(
                row,
                [
                    "timestamp",
                    "time",
                    "datetime"
                ],
                "--"
            );


        const line =
            document.createElement("div");


        line.className =
            "telemetry-line";


        if (
            score >
            dynamicThreshold
        ) {

            line.classList.add(
                "anomaly-line"
            );
        }


        line.textContent =

            `[${formatTime(timestamp)}] ` +

            `TEMP=${Number(
                temperature
            ).toFixed(2)}°C ` +

            `V=${Number(
                voltage
            ).toFixed(3)}V ` +

            `I=${Number(
                current
            ).toFixed(3)}A ` +

            `SOLAR=${Number(
                solar
            ).toFixed(3)}W ` +

            `AI_SCORE=${Number(
                score
            ).toFixed(3)}`;


        line.addEventListener(
            "click",
            () => {

                const event =
                    createDynamicEvent(
                        score,
                        timestamp,
                        {
                            temperature,
                            voltage,
                            current,
                            solar
                        }
                    );

                showDynamicAnomaly(event);
            }
        );


        terminal.appendChild(line);
    });


    terminal.scrollTop =
        terminal.scrollHeight;
}


/* =========================================================
   TIMER
========================================================= */

setInterval(
    updateDemoTelemetry,
    1000
);

setInterval(
    () => {

        if (!usingRealML) {
            addTerminalLine();
        }

    },
    1000
);


/* =========================================================
   RESIZE
========================================================= */

window.addEventListener(
    "resize",
    drawAllCharts
);


/* =========================================================
   START
========================================================= */

async function initializeDashboard() {

    initializeDemoHistory();

    drawAllCharts();

    updateUI();

    await loadRealMLData();
}

initializeDashboard();