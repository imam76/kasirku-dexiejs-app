#!/bin/sh
# Debian/RPM post-removal hook for frayukti.
#
# Wipes per-user local application data only on a real uninstall/purge so a
# fresh reinstall starts clean. Package upgrades must preserve this data.
# Runs as root during package removal, so we sweep every real home directory.
#
# NOTE: PostgreSQL data is intentionally NOT touched. It lives on a separate
# database server and must be reset deliberately by an admin, not as a side
# effect of uninstalling a client.

set -e

case "$1" in
  remove|purge|0)
    for home in /root /home/*; do
      [ -d "$home" ] || continue
      rm -rf "$home/.local/share/com.asepimamnawawi-imam76.frayukti-app"
      rm -rf "$home/.config/frayukti"
    done
    ;;
  upgrade|1)
    # Debian passes "upgrade" and RPM passes "1" during package upgrades.
    # Keep database_url.txt, Dexie data, localStorage, and caches intact.
    ;;
esac

exit 0
