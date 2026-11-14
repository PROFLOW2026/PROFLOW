"""One-off generator for catalog.default.json (agent 3). Safe to re-run."""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "src/modules/electrical-takeoff/domain/catalog.default.json"

COLORS = [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6",
    "#bcf60c", "#fabebe", "#008080", "#e6beff", "#9a6324", "#fffac8", "#800000", "#aaffc3",
    "#808000", "#ffd8b1", "#000075", "#808080", "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
    "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf", "#393b79", "#637939",
    "#8c6d31", "#843c39", "#7b4173", "#3182bd", "#31a354", "#756bb1", "#636363", "#6baed6",
    "#74c476", "#9e9ac8", "#969696", "#c49c94", "#de9ed6", "#98df8a", "#ff9896", "#c5b0d5",
    "#aec7e8", "#ffbb78", "#dbdb8d", "#c7c7c7", "#f7b6d2", "#c7e9c0", "#fd8d3c", "#6b6ecf",
    "#e7ba52", "#cedb9c", "#ad494a", "#8ca252", "#bd9e39", "#9c755f", "#63717f", "#5254a3",
    "#b5cf6b", "#ced4de", "#e7969c", "#7b6888", "#d6616b", "#8b949e", "#b07aa1", "#59a14f",
    "#edc948", "#76b7b2", "#af7aa1", "#4e79a7", "#f28e2b", "#e15759", "#ab63fa", "#ffa15a",
    "#19d3f3", "#ff6692", "#b6e880", "#6a76fc", "#fb8072", "#80b1d3", "#fdb462", "#8dd3c7",
]

entries: list[dict] = []


def add(key: str, category: str, role: str, name_he: str, keywords: list[str], unit: str = "יח'") -> None:
    entries.append(
        {
            "key": key,
            "category": category,
            "role": role,
            "nameHe": name_he,
            "unit": unit,
            "keywordsHe": keywords,
            "colorHex": COLORS[len(entries) % len(COLORS)],
            "builtIn": True,
            "archived": False,
        }
    )


LIGHTING = [
    ("light.recessed", "גוף תאורה שקוע", ["גוף תאורה שקוע", "תאורה שקועה", 'ג"ת שקוע', "לד שקוע", "פס לד שקוע"]),
    ("light.surface", "גוף תאורה צמוד תקרה", ["גוף תאורה צמוד", "תאורה צמודה", 'ג"ת צמוד', "מנורת תקרה"]),
    ("light.pendant", "גוף תאורה תלוי", ["גוף תאורה תלוי", "תליה", "מנורה תלויה"]),
    ("light.wall", "גוף תאורה קיר", ["גוף תאורה קיר", "קירי", "מנורת קיר", "ברקת"]),
    ("light.linear_led", "פס לד", ["פס לד", "פס תאורה", "לינארי לד", "LED strip", "פס"]),
    ("light.downlight", "דאונלייט", ["דאונלייט", "נקודתי שקוע", "spot", "ספוט"]),
    ("light.track", "פס מסילה", ["פס מסילה", "מסילת תאורה", "track light"]),
    ("light.exit_sign", "שלט יציאה", ["שלט יציאה", "יציאה", "exit sign", "שלט חירום יציאה"]),
    ("light.emergency", "תאורת חירום", ["תאורת חירום", 'ג"ת חירום', "חירום תאורה", "מנורת חירום"]),
    ("light.emergency_combo", "תאורת חירום משולבת", ["חירום משולב", 'ג"ת דו תכליתי', "תאורה ושלט יציאה"]),
    ("light.stair", "תאורת מדרגות", ["תאורת מדרגות", "מדרגות", "דרגן"]),
    ("light.outdoor", "תאורת חוץ", ["תאורת חוץ", "חוץ", "השלמה חיצונית", "עמוד תאורה"]),
    ("light.projector", "פרוזקטור", ["פרוזקטור", "הזרקת אור", "floodlight", "ספוטליט"]),
    ("light.decorative", "תאורה דקורטיבית", ["דקורטיבי", "נברשת", "אביזר תאורה דקורטיבי"]),
]
for k, n, kw in LIGHTING:
    add(k, "lighting", "fixture", n, kw)

add("light.emergency_central", "emergency_lighting", "equipment", "מרכזיית תאורת חירום", ["מרכזיית חירום", "מצבר חירום", "מרכזיה"])
add("light.emergency_battery", "emergency_lighting", "equipment", "סוללת חירום", ["סוללת חירום", "נורת חירום עם סוללה"])

SOCKETS = [
    ("power.socket.single", "שקע יחיד", ["שקע יחיד", "שקע חשמל", "שקע כח", "נקודת כח", 'מ"ז יחיד']),
    ("power.socket.double", "שקע כפול", ["שקע כפול", 'ח"ק כפול', 'שקע כפול תה"ט']),
    ("power.socket.triple", "שקע משולש", ["שקע משולש", "שקע שלושה"]),
    ("power.socket.ip", "שקע מוגן מים", ["שקע מוגן מים", 'שקע תה"ט מוגן מים', "IP", "מוגן מים", "ןפ-55"]),
    ("power.socket.floor", "שקע רצפה", ["שקע רצפה", "שקע בלטי רצפה", "רצפתי"]),
    ("power.socket.dedicated", "שקע ייעודי", ["שקע ייעודי", "שקע למכשיר", "שקע מקרר", "שקע מייבש"]),
    ("power.socket.three_phase", "שקע תלת פאזי", ["שקע תלת פאזי", "תלת פאזי", "32A", "63A"]),
    ("power.socket.ups", "שקע UPS", ["שקע ups", "שקע גיבוי", "שקע ללא הפרעה"]),
    ("power.socket.island", "עמדת עבודה", ["עמדת עבודה", "עדאפלסט", "עמדה עם שקעים"]),
]
for k, n, kw in SOCKETS:
    add(k, "power", "device", n, kw)

add("power.outlet.commercial", "power", "device", "נקודת כוח מסחרית", ["נקודת כוח", "שקע כוח", "שקע כח", "כוח"])
add("power.heavy", "power", "device", "נקודת עומס", ["עומס כבד", "מנוע", "מזגן"])

CONTROLS = [
    ("control.switch.single", "מפסק יחיד", ["מפסק יחיד", "מפסק תאורה", "מפסק חד אורי"]),
    ("control.switch.double", "מפסק כפול", ["מפסק כפול", "שני אורות"]),
    ("control.switch.two_way", "מפסק חילוף", ["מפסק חילוף", "חילוף", "two way", "שתי נקודות"]),
    ("control.switch.intermediate", "מפסק ביניים", ["מפסח ביניים", "intermediate"]),
    ("control.dimmer", "דימר", ["דימר", "עמעום", "dimmer"]),
    ("control.shutter", "מפסק תריס", ["מפסק תריס", "תריס", "shutter", "מסך נגלל"]),
    ("control.knx", "לחצן KNX", ["knx", "בקר knx", "חיישן knx"]),
    ("control.timer", "טיימר", ["טיימר", "שעון שבת"]),
    ("control.photocell", "פוטוסל", ["פוטוסל", "חיישן אור", "twilight"]),
    ("control.motion_light", "חיישן תנועה לתאורה", ["חיישן תנועה תאורה", "PIR תאורה"]),
    ("control.fan", "מפסק מאוורר", ["מפסק מאוורר", "מאוורר תקרה"]),
]
for k, n, kw in CONTROLS:
    add(k, "control", "device", n, kw)

COMMS = [
    ("comm.data", "נקודת תקשורת", ["נקודת תקשורת", "נק תקשורת", 'לנ"א', "data", "RJ45", "UTP"]),
    ("comm.data_quad", "נקודת תקשורת רבעית", ["4 נקודת תקשורת", "רבעית תקשורת"]),
    ("comm.phone", "נקודת טלפון", ["טלפון", "נקודת טלפון", "RJ11"]),
    ("comm.tv", "נקודת TV", ["טלוויזיה", "טלויזיה", "אנטנה", "coax", "TV"]),
    ("comm.intercom", "אינטרקום", ["אינטרקום", "אינטרפון", "דלת כניסה"]),
    ("comm.wifi_ap", "נקודת WiFi", ["wifi", "נקודת גישה", "access point", "WI-FI"]),
    ("comm.rack", "ארון תקשורת", ["ארון תקשורת", "ארון רשת", "rack", '19"']),
    ("comm.patch_panel", "פאנל פצ'", ["פאנל פצ'", "patch panel"]),
]
for k, n, kw in COMMS:
    role = "equipment" if k in ("comm.rack", "comm.patch_panel") else "device"
    add(k, "communication", role, n, kw)

LOWV = [
    ("lowv.cctv", "מצלמת CCTV", ["מצלמה", "cctv", "מעגל סגור", "מצלמת אבטחה"]),
    ("lowv.access_control", "קורא כרטיסים", ["בקר כניסה", "access control", "קורא כרטיס", "בקר דלת"]),
    ("lowv.pir_sensor", "חיישן נוכחות", ["חיישן נוכחות", "PIR", "חיישן תנועה"]),
    ("lowv.speaker", "רמקול", ["רמקול", "שמע", "הגברה", "speaker"]),
    ("lowv.alarm_sensor", "גלאי אזעקה", ["אזעקה", "מגע", "גלאי מגע", "חיישן פריצה"]),
    ("lowv.intercom_panel", "לוח אינטרקום", ["לוח אינטרקום", "מסך כניסה"]),
    ("lowv.bell", "פעמון", ["פעמון", "צלצול"]),
]
for k, n, kw in LOWV:
    add(k, "low_voltage", "device", n, kw)

FIRE = [
    ("fire.smoke_detector", "גלאי עשן", ["גלאי עשן", "גלאי עשן אופטי", "עשן"]),
    ("fire.heat_detector", "גלאי חום", ["גלאי חום", "חום"]),
    ("fire.multi_detector", "גלאי מרובה", ["גלאי משולב", "מרובה חיישנים"]),
    ("fire.call_point", "כפתור מפוצץ", ["כפתור מפוצץ", "כפתור ידני", "ידני", "מפוצץ"]),
    ("fire.siren", "סירנה", ["סירנה", "אזעקת שריפה", "horn"]),
    ("fire.strobe", "נצנץ", ["נצנץ", "strobe", "אור מהבהב"]),
    ("fire.panel", "לוח בקרת אש", ["לוח אש", "פאנל אש", "בקר שריפה"]),
    ("fire.sprinkler_flow", "שסתום זרימה", ["שסתום זרימה", "sprinkler flow", "ספרינקלר"]),
    ("fire.sprinkler_head", "ראש ספרינקלר", ["ראש ספרינקלר", "מתז"]),
    ("fire.damper", "בלם עשן", ["בלם עשן", "smoke damper", "פתיחת עשן"]),
]
for k, n, kw in FIRE:
    role = "equipment" if "panel" in k else "device"
    add(k, "fire_detection", role, n, kw)

PANELS = [
    ("panel.main", "לוח ראשי", ["לוח ראשי", "לוח מבוא", "לוח חשמל ראשי", "MSB"]),
    ("panel.sub", "לוח משני", ["לוח משני", "לוח חלוקה", "תת לוח", "SDP"]),
    ("panel.floor", "לוח קומתי", ["לוח קומה", "לוח קומתי"]),
    ("panel.meter", "לוח מדידה", ["לוח מונים", "מדידה", "מונה"]),
]
for k, n, kw in PANELS:
    add(k, "panels_distribution", "equipment", n, kw)

EQUIP = [
    ("equipment.ups", "ספק כוח חירום UPS", ["ups", "ספק ללא הפסקה", "ייבוי חשמלי"]),
    ("equipment.generator", "גנרטור", ["גנרטור", "גיבוי דיזל"]),
    ("equipment.transformer", "שנאי", ["שנאי", "transformer"]),
    ("equipment.capacitor", "בנק קבלים", ["בנק קבלים", "קבלים", "תיקון מקדם"]),
    ("equipment.ats", "מעבר אוטומטי", ["ATS", "מעבר אוטומטי", "מעבר גנרטור"]),
]
for k, n, kw in EQUIP:
    add(k, "panels_distribution", "equipment", n, kw)

LINEAR = [
    ("linear.tray", "פס צבירה", ["פס צבירה", "תעלה", "cable tray", "צבירה"]),
    ("linear.tray_ladder", "סולם כבלים", ["סולם כבלים", "ladder tray"]),
    ("linear.conduit", "צנור", ["צנור", "conduit", "צנור פלסטיק", "צנור מתכת"]),
    ("linear.conduit_emt", "צנור EMT", ["emt", "צנור דק"]),
    ("linear.cable", "כבל", ["כבל", "מוליך", "כבל חשמל"]),
    ("linear.busbar", "פסי הזנה", ["פס הזנה", "busbar", "פס שוקולד"]),
    ("linear.underfloor", "מערכת רצפה טכנית", ["רצפה טכנית", "רצפה מוגבהת", "underfloor"]),
]
for k, n, kw in LINEAR:
    add(k, "conduit_tray", "linear", n, kw, 'מ"א')

OTHER = [
    ("other.junction_box", "קופסת חיבור", ["קופסת חיבור", "קופסה", "junction box"]),
    ("other.grounding", "נקודת הארקה", ["הארקה", "נקודת הארקה", "ארקה"]),
    ("other.equipment_mark", "סימון ציוד", ["סימון ציוד", "ציוד כללי"]),
    ("unknown.unclassified", "לא מסווג", ["לא מסווג", "אחר"]),
]
for k, n, kw in OTHER:
    cat = "unknown" if k.startswith("unknown") else "other"
    add(k, cat, "device", n, kw)

assert len(entries) >= 80
keys = [e["key"] for e in entries]
assert len(keys) == len(set(keys)), "duplicate keys"

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {len(entries)} catalog types -> {OUT}")