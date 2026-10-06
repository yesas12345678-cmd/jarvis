"""
screen_grabber.py - Captura aislada de pantalla para Windows.
Se ejecuta en su propio proceso independiente para garantizar acceso libre de conflictos
a winsta0 y al escritorio interactivo activo del usuario.
"""

import sys
import os
import ctypes
from PIL import ImageGrab


def grab_screen(output_path: str = "pantalla_actual.jpg") -> bool:
    try:
        user32 = ctypes.windll.user32
        hwinsta = user32.OpenWindowStationW("winsta0", False, 0xF037F)
        if hwinsta:
            user32.SetProcessWindowStation(hwinsta)
            hdesk = user32.OpenDesktopW("default", 0, False, 0x1FF)
            if hdesk:
                user32.SetThreadDesktop(hdesk)

        img = None
        try:
            img = ImageGrab.grab(all_screens=True)
        except Exception:
            try:
                img = ImageGrab.grab()
            except Exception:
                pass

        if img is not None:
            # Redimensionar para optimizar transmision
            w, h = img.size
            if w > 1280:
                img = img.resize((1280, int(h * 1280 / w)))
            img.convert("RGB").save(output_path, "JPEG", quality=85)
            print(f"SUCCESS:{output_path}")
            return True

        print("ERROR:Failed to capture screen image")
        return False
    except Exception as e:
        print(f"ERROR:{e}")
        return False


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "pantalla_actual.jpg")
    success = grab_screen(out)
    sys.exit(0 if success else 1)
