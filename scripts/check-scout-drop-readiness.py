"""Check a live Scout release from the server, with optional Discord test delivery."""
import argparse
import json
from pathlib import Path
import re
import sys
import urllib.request
import uuid

ROOT = "https://spawn.aztlan-eng.com/internal/amazon-browser/"
CHANNEL = "1574782470363160656"
ENGLISH = {"B0HS8RG5C9", "B0HS8R9NPW", "B0HS8R3NH8", "B0HS8VTZ9P"}
SPANISH = {"B0HS8M7T3F", "B0HS8JTYQQ", "B0HS8HXVRC", "B0HS8PWKTF"}


def request(endpoint, headers, method="GET"):
    req = urllib.request.Request(ROOT + endpoint, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--discord-test", action="store_true", help="Send four labeled test alerts")
    args = parser.parse_args()
    config = Path.home() / ".local/share/scout-firefox-test/server/private-config.js"
    credential = re.search(r"""AMAZON_COLLECTOR_TOKEN\s*=\s*['"]([^'"]+)""", config.read_text())
    if not credential:
        parser.error("Scout collector credential unavailable")
    headers = {
        "Authorization": "Bearer " + credential[1],
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
    }
    catalog = request("targets?schema=2", headers)
    expected = ENGLISH | SPANISH
    targets = {row["asin"] for row in catalog["items"] if row["category"] == "flowing_fists"}
    status = request("status", headers)
    observations = {row["asin"]: row for row in status["rows"] if row["asin"] in expected}
    checks = []
    for asin in sorted(expected):
        row = observations.get(asin, {})
        receipt = row.get("latest") or {}
        checks.append({
            "asin": asin, "cataloged": asin in targets, "spanishScoutOnly": asin in SPANISH,
            "receiptId": receipt.get("id"), "observedAt": receipt.get("observedAt"),
            "collector": row.get("collector"), "ageSeconds": row.get("ageSeconds"),
            "freshPageRead": bool(row.get("pageReadFresh")) and row.get("collector") == "server",
        })
    receipt_ready = targets == expected and all(c["receiptId"] and c["freshPageRead"] for c in checks)
    report = {"catalogVersion": catalog["version"], "observationsReady": receipt_ready, "targets": checks}
    if args.discord_test:
        endpoint = "readiness-test?id=" + str(uuid.uuid4())
        first = request(endpoint, headers, "POST").get("results", [])
        replay = request(endpoint, headers, "POST").get("results", [])
        original_ids = {r.get("asin"): r.get("messageId") for r in first}
        replay_ids = {r.get("asin"): r.get("messageId") for r in replay}
        report["discord"] = {
            "passed": len(first) == len(replay) == len(ENGLISH)
            and set(original_ids) == ENGLISH
            and original_ids == replay_ids
            and len(set(original_ids.values())) == len(ENGLISH)
            and all(r.get("messageId") and r.get("channelId") == CHANNEL and r.get("status") == "DELIVERED" for r in first + replay)
            and all(not r.get("replayed") for r in first)
            and all(r.get("replayed") for r in replay),
            "first": first,
            "replay": replay,
        }
    print(json.dumps(report, indent=2))
    return 0 if receipt_ready and report.get("discord", {}).get("passed", True) else 1


if __name__ == "__main__":
    sys.exit(main())
