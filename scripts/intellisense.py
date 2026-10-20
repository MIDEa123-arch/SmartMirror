"""Expose ESP32 SDK response-file includes to PlatformIO's IDE metadata."""

import shlex
from pathlib import Path

Import("env")

if env.IsIntegrationDump():
    package = env.PioPlatform().get_package_dir(
        "framework-arduinoespressif32-esp32-libs"
    )
    if package:
        sdk = Path(package)
        flags = sdk / "flags" / "includes"
        if flags.is_file():
            tokens = shlex.split(flags.read_text())
            paths = [
                str(sdk / "include" / tokens[index + 1])
                for index, token in enumerate(tokens[:-1])
                if token == "-iwithprefixbefore"
            ]
            env.AppendUnique(CPPPATH=paths)
