#!/usr/bin/env python3
"""Wstrzykuje moduł głosowy/GPS do index.html (idempotentnie)."""
import sys, os
path = sys.argv[1] if len(sys.argv) > 1 else "www/index.html"
mod = open(os.path.join(os.path.dirname(__file__), "voice-module.js"), encoding="utf-8").read()
s = open(path, encoding="utf-8").read().replace("\r\n", "\n")
if "RAPID VOICE MODULE" in s:
    print("Moduł głosowy już wstrzyknięty — pomijam."); sys.exit(0)
if "</body>" not in s or "function boot()" not in s:
    sys.exit("BŁĄD: to nie jest oryginalny index.html RAPID·OBD.")
s = s.replace("</body>", "<script>\n" + mod + "\n</script>\n</body>", 1)
open(path, "w", encoding="utf-8").write(s)
print("OK: moduł głosowy wstrzyknięty.")
