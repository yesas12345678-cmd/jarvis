#!/usr/bin/env python3
"""
World Clock CLI
Consult current time in Tokyo, Madrid, and New York.
"""

from datetime import datetime
import sys

# Supported target timezones with IANA identifiers
CITIES = {
    "Madrid": "Europe/Madrid",
    "Nueva York": "America/New_York",
    "Tokio": "Asia/Tokyo",
}

def get_time_zoneinfo(tz_name: str) -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        return None

def get_time_pytz(tz_name: str) -> datetime:
    try:
        import pytz
        tz = pytz.timezone(tz_name)
        return datetime.now(tz)
    except Exception:
        return None

def get_time_online(tz_name: str) -> datetime:
    """Fallback using public world time API if local tzdata is unavailable on Windows."""
    import json
    import urllib.request
    url = f"https://worldtimeapi.org/api/timezone/{tz_name}"
    req = urllib.request.Request(url, headers={"User-Agent": "WorldClockScript/1.0"})
    with urllib.request.urlopen(req, timeout=5) as response:
        data = json.loads(response.read().decode("utf-8"))
        # Parse ISO datetime
        dt_str = data["datetime"]
        return datetime.fromisoformat(dt_str)

def get_city_time(city: str, tz_name: str) -> datetime:
    # 1. Try Python 3.9+ standard zoneinfo
    dt = get_time_zoneinfo(tz_name)
    if dt is not None:
        return dt

    # 2. Try pytz if installed
    dt = get_time_pytz(tz_name)
    if dt is not None:
        return dt

    # 3. Try online API fallback
    try:
        dt = get_time_online(tz_name)
        if dt is not None:
            return dt
    except Exception:
        pass

    # 4. Fallback con UTC offsets conocidos (estándar offline)
    from datetime import timezone, timedelta
    utc_now = datetime.now(timezone.utc)
    fallback_offsets = {
        "Europe/Madrid": timedelta(hours=2 if 3 <= utc_now.month <= 10 else 1),
        "America/New_York": timedelta(hours=-4 if 3 <= utc_now.month <= 11 else -5),
        "Asia/Tokyo": timedelta(hours=9),
    }
    if tz_name in fallback_offsets:
        return utc_now.astimezone(timezone(fallback_offsets[tz_name]))

    raise RuntimeError(f"No se pudo obtener la hora para {city} ({tz_name}).")

def display_world_clock():
    print("=" * 60)
    print(f"{'RELOJ MUNDIAL - CIUDADES SELECCIONADAS':^60}")
    print("=" * 60)
    print(f"{'Ciudad':<15} | {'Zona Horaria':<20} | {'Fecha y Hora':<20}")
    print("-" * 60)

    for city, tz_name in CITIES.items():
        try:
            city_time = get_city_time(city, tz_name)
            formatted_time = city_time.strftime("%Y-%m-%d %H:%M:%S (%Z)")
            print(f"{city:<15} | {tz_name:<20} | {formatted_time:<20}")
        except Exception as e:
            print(f"{city:<15} | {tz_name:<20} | Error: {e}")

    print("=" * 60)

if __name__ == "__main__":
    display_world_clock()
