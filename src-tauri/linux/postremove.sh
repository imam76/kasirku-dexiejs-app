#!/bin/sh
# Debian/RPM post-removal hook for frayukti.
#
# Wipes per-user local application data so a fresh reinstall starts clean.
# Runs as root during package removal, so we sweep every real home directory.
#
# NOTE: PostgreSQL data is intentionally NOT touched. It lives on a separate
# database server and must be reset deliberately by an admin, not as a side
# effect of uninstalling a client.

set -e

case "$1" in
  remove|purge|0|1)
    for home in /root /home/*; do
      [ -d "$home" ] || continue
      rm -rf "$home/.local/share/com.asepimamnawawi-imam76.frayukti-app"
      rm -rf "$home/.config/frayukti"
    done
    ;;
esac

exit 0
