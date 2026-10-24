#!/usr/bin/env python3
"""Add a drop to the site and rebuild the index.

Usage:
  python3 tools/add_drop.py path/to/new-drop.json          # append (error if id exists)
  python3 tools/add_drop.py path/to/new-drop.json --replace  # replace a drop with the same id
  python3 tools/add_drop.py --rebuild                      # just validate and rebuild data/index.json

The site root is the parent folder of this tools/ directory unless --site is given.
"""
import argparse, datetime, json, os, re, sys

VOICES = ("william", "ryan", "alba")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def fail(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)


def check_date(s, where):
    if not isinstance(s, str) or not DATE.match(s):
        fail(f"{where}: expected YYYY-MM-DD, got {s!r}")
    try:
        datetime.date.fromisoformat(s)
    except ValueError:
        fail(f"{where}: invalid date {s!r}")


def validate(drop, site, allow_missing_audio):
    for k in ("id", "title", "start", "end", "issues", "audio"):
        if k not in drop:
            fail(f"drop is missing required field '{k}'")
    if not ID.match(drop["id"]):
        fail("drop id must be lowercase letters, digits, dash, underscore")
    check_date(drop["start"], "start")
    check_date(drop["end"], "end")
    if drop["start"] > drop["end"]:
        fail("start is after end")
    if not drop["issues"]:
        fail("drop has no issues")
    seen = set()
    for i, issue in enumerate(drop["issues"]):
        w = f"issues[{i}]"
        for k in ("id", "label", "sections"):
            if k not in issue:
                fail(f"{w} is missing '{k}'")
        check_date(issue["id"], w + ".id")
        if issue["id"] in seen:
            fail(f"{w}: duplicate issue id {issue['id']}")
        seen.add(issue["id"])
        if not issue["sections"]:
            fail(f"{w} has no sections")
        for j, sec in enumerate(issue["sections"]):
            ws = f"{w}.sections[{j}]"
            if not str(sec.get("icon", "")).strip():
                fail(f"{ws} ({sec.get('name')}) has no icon emoji")
            if not str(sec.get("name", "")).strip():
                fail(f"{ws} has no name")
            if not sec.get("bullets"):
                fail(f"{ws} has no bullets")
            for k, b in enumerate(sec["bullets"]):
                if not isinstance(b, dict) or not str(b.get("h", "")).strip():
                    fail(f"{ws}.bullets[{k}] needs an 'h' headline")
    audio = drop["audio"]
    for v in VOICES:
        p = audio.get(v)
        if not p:
            if allow_missing_audio:
                continue
            fail(f"audio is missing voice '{v}'")
        if not os.path.isfile(os.path.join(site, p)):
            if allow_missing_audio:
                print(f"WARNING: audio file not found: {p}")
            else:
                fail(f"audio file not found: {p}")
    blob = json.dumps(drop, ensure_ascii=False)
    if "\u2014" in blob:
        fail("text contains an em dash; rewrite it with a comma, colon, or period")
    if "\u2013" in blob:
        print("WARNING: text contains an en dash")
    if "http://" in blob or "https://" in blob:
        print("WARNING: text contains a URL")


def load_list(path):
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        fail(f"{path} must contain a JSON list")
    return data


def write_json(path, obj, indent=None):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent, separators=(",", ":") if indent is None else None)
        f.write("\n")
    os.replace(tmp, path)


def build_index(drops):
    out = []
    for d in drops:
        out.append({
            "id": d["id"], "title": d["title"], "start": d["start"], "end": d["end"],
            "month": d["end"][:7], "intro": d.get("intro", ""),
            "issues": [{"id": i["id"], "label": i["label"], "weekday": i.get("weekday", ""), "top": i.get("top", "")}
                       for i in d["issues"]],
        })
    return {"drops": out}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("drop_file", nargs="?")
    ap.add_argument("--site", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    ap.add_argument("--replace", action="store_true")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--allow-missing-audio", action="store_true")
    a = ap.parse_args()
    site = os.path.abspath(a.site)
    dpath = os.path.join(site, "data", "drops.json")
    os.makedirs(os.path.join(site, "data"), exist_ok=True)
    drops = load_list(dpath)
    if a.drop_file:
        with open(a.drop_file, encoding="utf-8") as f:
            new = json.load(f)
        validate(new, site, a.allow_missing_audio)
        existing = [i for i, d in enumerate(drops) if d["id"] == new["id"]]
        if existing and not a.replace:
            fail(f"drop id '{new['id']}' already exists (use --replace)")
        if existing:
            drops[existing[0]] = new
        else:
            drops.append(new)
        print(("Replaced" if existing else "Added") + f" {new['id']} ({len(new['issues'])} issues)")
    elif not a.rebuild:
        ap.print_help()
        sys.exit(2)
    for d in drops:
        validate(d, site, a.allow_missing_audio)
    drops.sort(key=lambda d: (d["end"], d["id"]), reverse=True)
    write_json(dpath, drops, indent=1)
    write_json(os.path.join(site, "data", "index.json"), build_index(drops))
    print(f"data/drops.json: {len(drops)} drop(s); data/index.json rebuilt")


if __name__ == "__main__":
    main()
