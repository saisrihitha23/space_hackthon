from flask import Flask, render_template, jsonify
from pathlib import Path
import json
import csv

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


# ============================================================
# HELPERS
# ============================================================

def load_json(filename):
    """
    Load a JSON file from dashboard/data.
    Returns an empty list/dict if the file does not exist
    or cannot be decoded.
    """

    path = DATA_DIR / filename

    if not path.exists():
        print(f"[WARNING] Missing file: {path}")
        return []

    try:
        with open(
            path,
            "r",
            encoding="utf-8"
        ) as file:

            return json.load(file)

    except Exception as error:

        print(
            f"[ERROR] Could not load {filename}: {error}"
        )

        return []


def load_csv(filename):
    """
    Load CSV data as a list of dictionaries.
    """

    path = DATA_DIR / filename

    if not path.exists():
        print(f"[WARNING] Missing file: {path}")
        return []

    try:

        with open(
            path,
            "r",
            encoding="utf-8-sig",
            newline=""
        ) as file:

            reader = csv.DictReader(file)

            return list(reader)

    except Exception as error:

        print(
            f"[ERROR] Could not load {filename}: {error}"
        )

        return []


# ============================================================
# HOME PAGE
# ============================================================

@app.route("/")
def index():

    return render_template(
        "index.html"
    )


# ============================================================
# ML RESULTS API
# ============================================================

@app.route("/api/results")
def api_results():

    ps1_results = load_json(
        "PS1_results.json"
    )

    anomalies = load_json(
        "anomalies.json"
    )

    reconstruction_errors = load_json(
        "reconstruction_errors.json"
    )

    timeline = load_json(
        "ps1_timeline.json"
    )

    feature_timeline = load_json(
        "ps1_feature_timeline.json"
    )

    final_results = load_csv(
        "PS1_final_results.csv"
    )


    return jsonify({

        "status": "success",

        "ps1_results":
            ps1_results,

        "anomalies":
            anomalies,

        "reconstruction_errors":
            reconstruction_errors,

        "timeline":
            timeline,

        "feature_timeline":
            feature_timeline,

        "final_results":
            final_results

    })


# ============================================================
# INDIVIDUAL DATA ENDPOINTS
# ============================================================

@app.route("/api/anomalies")
def api_anomalies():

    return jsonify(
        load_json(
            "anomalies.json"
        )
    )


@app.route("/api/reconstruction-errors")
def api_reconstruction_errors():

    return jsonify(
        load_json(
            "reconstruction_errors.json"
        )
    )


@app.route("/api/timeline")
def api_timeline():

    return jsonify(
        load_json(
            "ps1_timeline.json"
        )
    )


@app.route("/api/features")
def api_features():

    return jsonify(
        load_json(
            "ps1_feature_timeline.json"
        )
    )


@app.route("/api/final-results")
def api_final_results():

    return jsonify(
        load_csv(
            "PS1_final_results.csv"
        )
    )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.route("/api/health")
def health():

    return jsonify({

        "status": "online",

        "service":
            "Orbital Sentinel",

        "model":
            "LSTM Autoencoder + NDT",

        "dataset":
            "NASA SMAP / MSL",

        "data_directory":
            str(DATA_DIR),

        "files": {

            "PS1_results.json":
                (DATA_DIR / "PS1_results.json").exists(),

            "PS1_final_results.csv":
                (DATA_DIR / "PS1_final_results.csv").exists(),

            "anomalies.json":
                (DATA_DIR / "anomalies.json").exists(),

            "reconstruction_errors.json":
                (DATA_DIR / "reconstruction_errors.json").exists(),

            "ps1_timeline.json":
                (DATA_DIR / "ps1_timeline.json").exists(),

            "ps1_feature_timeline.json":
                (DATA_DIR / "ps1_feature_timeline.json").exists()

        }

    })


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    print()
    print("=" * 60)
    print("🚀 ORBITAL SENTINEL")
    print("   AI SPACECRAFT HEALTH MONITOR")
    print("=" * 60)
    print()
    print(f"📁 Data directory: {DATA_DIR}")
    print()
    print("🌐 Dashboard:")
    print("   http://127.0.0.1:5000")
    print()
    print("🤖 ML API:")
    print("   http://127.0.0.1:5000/api/results")
    print()
    print("❤️ Health:")
    print("   http://127.0.0.1:5000/api/health")
    print()
    print("=" * 60)
    print()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )