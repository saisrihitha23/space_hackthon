from pathlib import Path
import json

import numpy as np
import pandas as pd
import streamlit as st


# ============================================================
# CONFIGURATION
# ============================================================

st.set_page_config(
    page_title="Orbital Sentinel",
    page_icon="🛰️",
    layout="wide",
    initial_sidebar_state="collapsed",
)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


# ============================================================
# DATA LOADING
# ============================================================

def load_json(filename):

    path = DATA_DIR / filename

    if not path.exists():
        return []

    try:
        with open(
            path,
            "r",
            encoding="utf-8"
        ) as file:
            return json.load(file)

    except Exception:
        return []


def first_value(item, keys):

    for key in keys:

        value = item.get(key)

        if value is not None and value != "":
            return value

    return None


# ============================================================
# BUILD TELEMETRY DATAFRAME
# ============================================================

def load_telemetry():

    raw = load_json("ps1_timeline.json")

    if not raw:
        raw = load_json(
            "ps1_feature_timeline.json"
        )

    if isinstance(raw, dict):

        for key in [
            "data",
            "timeline",
            "results",
            "records",
            "telemetry"
        ]:

            if isinstance(
                raw.get(key),
                list
            ):
                raw = raw[key]
                break

    if not isinstance(raw, list):
        return pd.DataFrame()

    rows = []

    for item in raw:

        if not isinstance(item, dict):
            continue

        rows.append(
            {
                "timestamp": first_value(
                    item,
                    [
                        "timestamp",
                        "time",
                        "datetime",
                        "date"
                    ]
                ),

                "Temperature": first_value(
                    item,
                    [
                        "temperature",
                        "temp",
                        "TEMP",
                        "Temperature"
                    ]
                ),

                "Voltage": first_value(
                    item,
                    [
                        "voltage",
                        "battery_voltage",
                        "V",
                        "Voltage"
                    ]
                ),

                "Current": first_value(
                    item,
                    [
                        "current",
                        "CURRENT",
                        "I",
                        "Current"
                    ]
                ),

                "Solar Power": first_value(
                    item,
                    [
                        "solar_power",
                        "solar",
                        "SOLAR",
                        "power",
                        "Solar Power"
                    ]
                ),

                "AI Score": first_value(
                    item,
                    [
                        "ai_score",
                        "anomaly_score",
                        "score",
                        "AI_SCORE",
                        "AI Score"
                    ]
                ),

                "Threshold": first_value(
                    item,
                    [
                        "threshold",
                        "ndt_threshold",
                        "NDT_THRESHOLD",
                        "Threshold"
                    ]
                )
            }
        )

    df = pd.DataFrame(rows)

    if df.empty:
        return df

    df["timestamp"] = pd.to_datetime(
        df["timestamp"],
        errors="coerce"
    )

    numeric_columns = [
        "Temperature",
        "Voltage",
        "Current",
        "Solar Power",
        "AI Score",
        "Threshold"
    ]

    for column in numeric_columns:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    df = df.dropna(
        subset=["timestamp"]
    )

    df = df.sort_values(
        "timestamp"
    )

    df = df.drop_duplicates(
        subset=["timestamp"],
        keep="last"
    )

    return df.reset_index(
        drop=True
    )


# ============================================================
# DEMO DATA
# ============================================================

def create_demo_data():

    timestamps = pd.date_range(
        end=pd.Timestamp.now(),
        periods=40,
        freq="min"
    )

    n = len(timestamps)

    temperature = np.linspace(
        29.8,
        33.5,
        n
    )

    voltage = np.linspace(
        3.61,
        3.47,
        n
    )

    current = np.linspace(
        1.27,
        1.51,
        n
    )

    solar = np.linspace(
        4.10,
        3.59,
        n
    )

    score = np.linspace(
        0.64,
        1.00,
        n
    )

    threshold = np.full(
        n,
        0.90
    )

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "Temperature": temperature,
            "Voltage": voltage,
            "Current": current,
            "Solar Power": solar,
            "AI Score": score,
            "Threshold": threshold
        }
    )


# ============================================================
# LOAD DATA
# ============================================================

df = load_telemetry()

if df.empty:
    df = create_demo_data()


# ============================================================
# GUARANTEE REQUIRED COLUMNS
# ============================================================

defaults = {
    "Temperature": 33.0,
    "Voltage": 3.6,
    "Current": 1.4,
    "Solar Power": 4.0,
    "AI Score": 0.18,
    "Threshold": 0.43
}

for column, default in defaults.items():

    if column not in df.columns:

        df[column] = default

    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    )

    if df[column].isna().all():

        df[column] = default

    else:

        df[column] = (
            df[column]
            .interpolate()
            .ffill()
            .bfill()
        )


# ============================================================
# ANOMALY
# ============================================================

df["Anomaly"] = (
    df["AI Score"]
    >= df["Threshold"]
)


# ============================================================
# LATEST DATA
# ============================================================

latest = df.iloc[-1]

temperature = float(
    latest["Temperature"]
)

voltage = float(
    latest["Voltage"]
)

current = float(
    latest["Current"]
)

solar = float(
    latest["Solar Power"]
)

score = float(
    latest["AI Score"]
)

threshold = float(
    latest["Threshold"]
)

anomaly = bool(
    latest["Anomaly"]
)


# ============================================================
# HEALTH
# ============================================================

def calculate_health(
    anomaly_score,
    ndt_threshold
):

    if ndt_threshold <= 0:
        return 100

    ratio = (
        anomaly_score
        / ndt_threshold
    )

    if ratio <= 0.40:
        health = 100

    elif ratio <= 0.60:
        health = 98

    elif ratio <= 0.80:
        health = 96

    elif ratio <= 1.00:

        health = (
            96
            - (
                (ratio - 0.80)
                / 0.20
                * 10
            )
        )

    elif ratio <= 1.25:

        health = (
            86
            - (
                (ratio - 1.00)
                / 0.25
                * 18
            )
        )

    elif ratio <= 1.50:

        health = (
            68
            - (
                (ratio - 1.25)
                / 0.25
                * 22
            )
        )

    else:

        health = max(
            20,
            46
            - (
                ratio - 1.50
            ) * 12
        )

    return int(
        np.clip(
            round(health),
            0,
            100
        )
    )


health = calculate_health(
    score,
    threshold
)


if health >= 90:

    health_status = "NOMINAL"

elif health >= 70:

    health_status = "WATCH"

else:

    health_status = "DEGRADED"


# ============================================================
# DETERMINE SIGNALS
# ============================================================

signals = []

if len(df) >= 2:

    previous = df.iloc[-2]

    if temperature > float(
        previous["Temperature"]
    ) + 0.02:

        signals.append(
            "Temperature ↑"
        )

    if voltage < float(
        previous["Voltage"]
    ) - 0.005:

        signals.append(
            "Battery voltage ↓"
        )

    if current > float(
        previous["Current"]
    ) + 0.01:

        signals.append(
            "Current ↑"
        )

    if solar < float(
        previous["Solar Power"]
    ) - 0.01:

        signals.append(
            "Solar power ↓"
        )


# ============================================================
# FALLBACK SIGNALS
# ============================================================

if anomaly and not signals:

    if temperature >= 33:
        signals.append(
            "Temperature ↑"
        )

    if voltage <= 3.55:
        signals.append(
            "Battery voltage ↓"
        )

    if current >= 1.40:
        signals.append(
            "Current ↑"
        )

    if solar <= 3.90:
        signals.append(
            "Solar power ↓"
        )


if not signals:

    signals.append(
        "Telemetry within learned normal range"
    )


# ============================================================
# SUBSYSTEM
# ============================================================

if (
    "Battery voltage ↓" in signals
    or "Current ↑" in signals
    or "Solar power ↓" in signals
):

    subsystem = "⚡ Power Subsystem"

elif "Temperature ↑" in signals:

    subsystem = "🌡️ Thermal Subsystem"

else:

    subsystem = "🛰️ Spacecraft Health"


# ============================================================
# ACTIONS
# ============================================================

actions = []

if "Battery voltage ↓" in signals:

    actions.append(
        "🔋 Check battery voltage and charging state."
    )

if "Solar power ↓" in signals:

    actions.append(
        "☀️ Verify solar-panel power generation."
    )

if "Current ↑" in signals:

    actions.append(
        "⚡ Reduce non-essential subsystem power consumption."
    )

if "Temperature ↑" in signals:

    actions.append(
        "🌡️ Continue monitoring temperature for further increase."
    )

if anomaly:

    actions.append(
        "🛰️ Prepare a safe/backup operating mode if the condition persists."
    )

if not actions:

    actions = [
        "🛰️ Continue normal spacecraft operations.",
        "📡 Continue monitoring multivariate telemetry."
    ]


# ============================================================
# EXPLANATION
# ============================================================

reasons = []

if "Battery voltage ↓" in signals:

    reasons.append(
        "Battery voltage is decreasing compared with the recent baseline."
    )

if "Solar power ↓" in signals:

    reasons.append(
        "Solar power generation is below its recent normal behaviour."
    )

if "Current ↑" in signals:

    reasons.append(
        "Current demand is increasing, which may indicate additional subsystem load."
    )

if "Temperature ↑" in signals:

    reasons.append(
        "Temperature is increasing compared with recent operation."
    )

if len(signals) >= 2:

    reasons.append(
        "The combined telemetry trend suggests a possible power imbalance."
    )

if not reasons:

    reasons.append(
        "Current telemetry remains close to the learned normal spacecraft behaviour."
    )


# ============================================================
# CSS
# ============================================================

st.markdown(
    """
<style>

.stApp {

    background:
        radial-gradient(
            circle at 10% 10%,
            rgba(25,75,140,.22),
            transparent 30%
        ),
        radial-gradient(
            circle at 90% 20%,
            rgba(90,40,150,.16),
            transparent 30%
        ),
        #020711;

    color: #edf5ff;
}

.block-container {

    max-width: 1500px;
    padding-top: 1.5rem;
}

.header {

    background:
        linear-gradient(
            135deg,
            #071b35,
            #030a18
        );

    border: 1px solid #214d7a;
    border-radius: 18px;

    padding: 28px;

    margin-bottom: 18px;

    box-shadow:
        0 0 35px rgba(0,120,255,.08);
}

.title {

    font-size: 38px;
    font-weight: 900;
    letter-spacing: 2px;
}

.subtitle {

    color: #8ba9cb;
    margin-top: 5px;
}

.model {

    color: #557594;
    font-size: 12px;
    margin-top: 6px;
}

.alert {

    padding: 15px 20px;
    border-radius: 12px;
    margin-bottom: 18px;
    font-weight: 800;
}

.alert-danger {

    background: rgba(255,40,60,.12);
    border: 1px solid rgba(255,60,80,.45);
    color: #ff6877;
}

.alert-good {

    background: rgba(0,220,125,.08);
    border: 1px solid rgba(0,220,125,.35);
    color: #55e9a6;
}

.card {

    background:
        linear-gradient(
            145deg,
            #0b203b,
            #040c1b
        );

    border: 1px solid #1d4268;
    border-radius: 15px;

    padding: 20px;

    min-height: 135px;
}

.label {

    color: #7894b6;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
}

.value {

    color: #f1f7ff;
    font-size: 31px;
    font-weight: 900;

    margin-top: 12px;
}

.small {

    color: #5d7999;
    font-size: 11px;
    margin-top: 5px;
}

.panel {

    background:
        linear-gradient(
            145deg,
            rgba(7,19,37,.97),
            rgba(3,9,19,.98)
        );

    border: 1px solid #1a385a;
    border-radius: 17px;

    padding: 22px;

    margin-top: 18px;
}

.panel-title {

    font-size: 22px;
    font-weight: 800;
}

.panel-subtitle {

    color: #617d9e;
    font-size: 12px;
    margin-top: 4px;
}

.satellite {

    text-align: center;
    font-size: 90px;

    margin-top: 15px;

    filter:
        drop-shadow(
            0 0 15px
            rgba(70,170,255,.65)
        );
}

.satellite-name {

    text-align: center;
    font-size: 21px;
    font-weight: 800;
}

.satellite-description {

    text-align: center;
    color: #7590af;
}

.health {

    text-align: center;

    font-size: 58px;
    font-weight: 900;

    color: #4cefa5;

    margin-top: 12px;
}

.health-label {

    text-align: center;

    color: #6280a1;
    font-size: 11px;
    letter-spacing: 1px;
}

.status {

    text-align: center;

    color: #4cefa5;

    font-weight: 800;

    margin-top: 10px;
}

.explanation {

    background: #071a31;

    border-left:
        4px solid #379bff;

    padding: 18px;

    border-radius: 10px;
}

.action {

    background: #08182b;

    border: 1px solid #173654;

    border-radius: 9px;

    padding: 11px 15px;

    margin: 7px 0;
}

.event {

    padding: 9px 13px;

    margin: 5px 0;

    border-radius: 8px;

    font-family: Consolas, monospace;

    font-size: 12px;
}

.event-anomaly {

    background: rgba(255,40,60,.11);

    border-left:
        4px solid #ff5062;
}

.event-normal {

    background: rgba(0,210,120,.05);

    border-left:
        3px solid #39d991;
}

.footer {

    text-align: center;

    color: #526d8d;

    font-size: 11px;

    padding: 35px 0 10px;
}

</style>
""",
    unsafe_allow_html=True
)


# ============================================================
# HEADER
# ============================================================

st.markdown(
    """
<div class="header">

<div class="title">
🛰️ ORBITAL SENTINEL
</div>

<div class="subtitle">
AI SPACECRAFT HEALTH MONITOR
</div>

<div class="model">
LSTM Autoencoder + Nonparametric Dynamic Thresholding
</div>

</div>
""",
    unsafe_allow_html=True
)


# ============================================================
# STATUS
# ============================================================

if anomaly:

    st.markdown(
        f"""
<div class="alert alert-danger">

🚨 ANOMALY DETECTED

&nbsp;&nbsp;|&nbsp;&nbsp;

AI SCORE = <b>{score:.3f}</b>

&nbsp;&nbsp;|&nbsp;&nbsp;

NDT THRESHOLD = <b>{threshold:.3f}</b>

</div>
""",
        unsafe_allow_html=True
    )

else:

    st.markdown(
        """
<div class="alert alert-good">

● SYSTEM NOMINAL

&nbsp;&nbsp;

All monitored telemetry is within the learned normal pattern.

</div>
""",
        unsafe_allow_html=True
    )


# ============================================================
# METRIC CARDS
# ============================================================

c1, c2, c3, c4 = st.columns(4)


with c1:

    st.markdown(
        f"""
<div class="card">

<div class="label">
🌡️ TEMPERATURE
</div>

<div class="value">
{temperature:.2f} °C
</div>

<div class="small">
SPACECRAFT TEMPERATURE
</div>

</div>
""",
        unsafe_allow_html=True
    )


with c2:

    st.markdown(
        f"""
<div class="card">

<div class="label">
🔋 BATTERY VOLTAGE
</div>

<div class="value">
{voltage:.2f} V
</div>

<div class="small">
BATTERY VOLTAGE
</div>

</div>
""",
        unsafe_allow_html=True
    )


with c3:

    st.markdown(
        f"""
<div class="card">

<div class="label">
⚡ CURRENT
</div>

<div class="value">
{current:.2f} A
</div>

<div class="small">
CURRENT DRAW
</div>

</div>
""",
        unsafe_allow_html=True
    )


with c4:

    st.markdown(
        f"""
<div class="card">

<div class="label">
☀️ SOLAR POWER
</div>

<div class="value">
{solar:.2f} W
</div>

<div class="small">
SOLAR GENERATION
</div>

</div>
""",
        unsafe_allow_html=True
    )


# ============================================================
# SPACECRAFT STATUS
# ============================================================

st.markdown(
    """
<div class="panel">

<div class="panel-title">
🛰️ SPACECRAFT STATUS
</div>

<div class="panel-subtitle">
Mission control / PS1
</div>

<div class="satellite">
🛰️
</div>

<div class="satellite-name">
ORBITAL SENTINEL
</div>

<div class="satellite-description">
Multivariate spacecraft health monitoring
</div>

</div>
""",
    unsafe_allow_html=True
)


h1, h2 = st.columns([2, 1])


with h1:

    st.markdown(
        f"""
<div class="panel">

<div class="panel-title">
SPACECRAFT HEALTH
</div>

<div class="health">
{health}%
</div>

<div class="health-label">
MISSION CONTROL / PS1
</div>

<div class="status">
● {health_status}
</div>

</div>
""",
        unsafe_allow_html=True
    )


with h2:

    st.markdown(
        f"""
<div class="panel">

<div class="panel-title">
SYSTEM STATUS
</div>

<br>

<h2>
{"🚨 ABNORMAL BEHAVIOUR" if anomaly else "🟢 SYSTEM NOMINAL"}
</h2>

<p>
{
    "Multiple telemetry channels are deviating from learned normal spacecraft behaviour."
    if anomaly
    else
    "All monitored telemetry is within the learned normal pattern."
}
</p>

</div>
""",
        unsafe_allow_html=True
    )


# ============================================================
# AI ENGINE
# ============================================================

st.markdown(
    """
<div class="panel">

<div class="panel-title">
🧠 AI ANOMALY ENGINE
</div>

<div class="panel-subtitle">
Reconstruction error + Nonparametric Dynamic Thresholding
</div>

</div>
""",
    unsafe_allow_html=True
)


a1, a2, a3 = st.columns(3)


with a1:
    st.metric(
        "ANOMALY SCORE",
        f"{score:.3f}"
    )


with a2:
    st.metric(
        "NDT THRESHOLD",
        f"{threshold:.3f}"
    )


with a3:

    ratio = (
        score / threshold
        if threshold > 0
        else 0
    )

    if ratio >= 1.5:
        risk = "HIGH"
    elif ratio >= 1:
        risk = "MEDIUM"
    else:
        risk = "LOW"

    st.metric(
        "RISK",
        risk
    )


# ============================================================
# GRAPHS
# ============================================================

st.markdown(
    """
<div class="panel">

<div class="panel-title">
📈 TELEMETRY VISUALIZATION
</div>

<div class="panel-subtitle">
Multivariate spacecraft telemetry
</div>

</div>
""",
    unsafe_allow_html=True
)


plot_df = (
    df
    .set_index("timestamp")
    .copy()
)


g1, g2 = st.columns(2)


with g1:

    st.markdown(
        "### 🌡️ Temperature"
    )

    st.line_chart(
        plot_df[
            ["Temperature"]
        ],
        height=280,
        width="stretch"
    )


with g2:

    st.markdown(
        "### 🔋 Voltage"
    )

    st.line_chart(
        plot_df[
            ["Voltage"]
        ],
        height=280,
        width="stretch"
    )


g3, g4 = st.columns(2)


with g3:

    st.markdown(
        "### ⚡ Current"
    )

    st.line_chart(
        plot_df[
            ["Current"]
        ],
        height=280,
        width="stretch"
    )


with g4:

    st.markdown(
        "### ☀️ Solar Power"
    )

    st.line_chart(
        plot_df[
            ["Solar Power"]
        ],
        height=280,
        width="stretch"
    )


st.markdown(
    "### 🤖 AI SCORE + NDT THRESHOLD"
)


st.line_chart(
    plot_df[
        [
            "AI Score",
            "Threshold"
        ]
    ],
    height=300,
    width="stretch"
)


# ============================================================
# AI EXPLANATION
# ============================================================

st.markdown(
    """
<div class="panel">

<div class="panel-title">
🔎 AI EXPLANATION
</div>

</div>
""",
    unsafe_allow_html=True
)


signal_text = " • ".join(
    signals
)


st.markdown(
    f"""
<div class="explanation">

<h3>
{subsystem}
</h3>

<p>
The AI detected a deviation involving:
</p>

<b>
{signal_text}
</b>

</div>
""",
    unsafe_allow_html=True
)


# ============================================================
# TIME / SCORE
# ============================================================

x1, x2 = st.columns(2)


with x1:

    st.markdown(
        "### 🕐 TIME"
    )

    st.code(
        str(
            latest["timestamp"]
        )
    )


with x2:

    st.markdown(
        "### 🤖 ANOMALY SCORE"
    )

    st.metric(
        "AI Score",
        f"{score:.3f}"
    )


# ============================================================
# ACTIONS
# ============================================================

st.markdown(
    "### 🛠️ WHAT TO DO"
)

for action in actions:

    st.markdown(
        f"""
<div class="action">
{action}
</div>
""",
        unsafe_allow_html=True
    )


# ============================================================
# WHY
# ============================================================

st.markdown(
    "### 💡 WHY THIS ACTION?"
)

for reason in reasons:

    st.markdown(
        f"""
<div class="action">
{reason}
</div>
""",
        unsafe_allow_html=True
    )


# ============================================================
# ANOMALY EVENT LOG
# ============================================================

st.markdown(
    """
<div class="panel">

<div class="panel-title">
🚨 ANOMALY EVENT LOG
</div>

<div class="panel-subtitle">
Detected abnormal spacecraft behavior
</div>

</div>
""",
    unsafe_allow_html=True
)


anomalies = df[
    df["Anomaly"]
].tail(30).iloc[::-1]


if anomalies.empty:

    st.success(
        "No anomaly events detected."
    )

else:

    for _, row in anomalies.iterrows():

        event_score = float(
            row["AI Score"]
        )

        event_threshold = float(
            row["Threshold"]
        )

        ratio = (
            event_score / event_threshold
            if event_threshold > 0
            else 0
        )

        if ratio >= 1.5:
            severity = "HIGH"
        elif ratio >= 1:
            severity = "WATCH"
        else:
            severity = "LOW"

        st.markdown(
            f"""
<div class="event event-anomaly">

🚨

<b>
{row["timestamp"]}
</b>

&nbsp; | &nbsp;

{subsystem}

&nbsp; | &nbsp;

🔴 {severity}

&nbsp; | &nbsp;

AI SCORE =
<b>
{event_score:.3f}
</b>

&nbsp; | &nbsp;

{signal_text}

</div>
""",
            unsafe_allow_html=True
        )


# ============================================================
# LIVE TELEMETRY
# ============================================================

st.markdown(
    """
<div class="panel">

<div class="panel-title">
📡 LIVE TELEMETRY STREAM
</div>

<div class="panel-subtitle">
Latest spacecraft telemetry
</div>

</div>
""",
    unsafe_allow_html=True
)


for _, row in (
    df.tail(30)
    .iloc[::-1]
    .iterrows()
):

    row_score = float(
        row["AI Score"]
    )

    row_threshold = float(
        row["Threshold"]
    )

    row_anomaly = (
        row_score >= row_threshold
    )

    if row_anomaly:

        icon = "🚨"
        class_name = "event-anomaly"
        state = "ANOMALY"

    else:

        icon = "🟢"
        class_name = "event-normal"
        state = "NORMAL"

    st.markdown(
        f"""
<div class="event {class_name}">

{icon}

<b>
{row["timestamp"]}
</b>

&nbsp; | &nbsp;

TEMP=
{float(row["Temperature"]):.2f}°C

&nbsp; | &nbsp;

V=
{float(row["Voltage"]):.2f}V

&nbsp; | &nbsp;

I=
{float(row["Current"]):.2f}A

&nbsp; | &nbsp;

SOLAR=
{float(row["Solar Power"]):.2f}W

&nbsp; | &nbsp;

AI_SCORE=
<b>
{row_score:.3f}
</b>

&nbsp; | &nbsp;

<b>
{state}
</b>

</div>
""",
        unsafe_allow_html=True
    )


# ============================================================
# FOOTER
# ============================================================

st.markdown(
    """
<div class="footer">

🛰️ ORBITAL SENTINEL

<br>

AI-Driven Spacecraft Health Monitoring

<br>

NASA SMAP / MSL • LSTM Autoencoder • NDT

</div>
""",
    unsafe_allow_html=True
)


# ============================================================
# MAIN FUNCTION
# ============================================================

def main():
    """
    Dashboard is rendered during module execution.
    This function exists so app.py can safely import it.
    """
    pass