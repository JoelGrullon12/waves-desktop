#!/usr/bin/env bash
# Check whether the Linux Secret Service (org.freedesktop.secrets) is available
# so that Waves Desktop can store TIDAL tokens via the OS keyring.
#
# Usage: bash scripts/check-keyring.sh   (or)   ./scripts/check-keyring.sh
# Exit code: 0 = Secret Service reachable, 1 = not reachable.

set -uo pipefail

check_secret_service() {
  if command -v gdbus >/dev/null 2>&1; then
    gdbus call --session --dest org.freedesktop.secrets \
      --object-path /org/freedesktop/secrets \
      --method org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1
  elif command -v qdbus6 >/dev/null 2>&1; then
    qdbus6 org.freedesktop.secrets \
      /org/freedesktop/secrets org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1
  else
    dbus-send --session --dest=org.freedesktop.secrets \
      --print-reply /org/freedesktop/secrets \
      org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1
  fi
}

info() { printf '%s\n' "$*"; }
ok()   { printf '[OK]     %s\n' "$*"; }
warn() { printf '[WARN]   %s\n' "$*"; }
fail() { printf '[FAIL]   %s\n' "$*"; }

desktop="${XDG_CURRENT_DESKTOP:-unknown}"
session_type="${XDG_SESSION_TYPE:-unknown}"

info "Desktop environment : $desktop"
info "Session type        : $session_type"
info ""

if check_secret_service; then
  ok "Secret Service (org.freedesktop.secrets) is reachable"
  info ""
  info "Waves Desktop can store TIDAL tokens in your OS keyring."
  exit 0
fi

fail "Secret Service (org.freedesktop.secrets) is NOT reachable"
info ""

case "$desktop" in
  *KDE*|*Plasma*)
    info "It looks like you are using KDE Plasma."
    info "KWallet can expose the Secret Service API, but it is often disabled by default."
    kwalletrc="$HOME/.config/kwalletrc"
    if [ -f "$kwalletrc" ]; then
      api_enabled="$(
        awk -v IN=0 '/^\[org\.freedesktop\.secrets\]/{IN=1; next} /^\[/{IN=0} IN && /^apiEnabled=/{sub(/^apiEnabled=/, ""); print}' "$kwalletrc"
      )"
      if [ "$api_enabled" = "true" ]; then
        warn "kwalletrc says apiEnabled=true but the service still is not reachable."
        info "Restart your session (log out / log in), then re-run this script."
      else
        warn "KWallet Secret Service integration is disabled (apiEnabled=$api_enabled)."
        info "Enable it with:"
        info "  kwriteconfig6 --file kwalletrc --group org.freedesktop.secrets --key apiEnabled --type bool true"
        info "then log out and back in (or restart your session)."
        info ""
        info "GUI alternative: System Settings > KDE Wallet (enable the 'secrets' integration if visible)."
      fi
    else
      warn "No kwalletrc found. On KDE Plasma, create/open a wallet first, then enable the secrets API as above."
    fi
    ;;
  *GNOME*|*Ubuntu*|*Pantheon*|*Budgie*)
    info "It looks like you are using GNOME or a GNOME-based desktop."
    info "GNOME Keyring handles the Secret Service automatically when unlocked at login."
    info "Check that gnome-keyring-daemon is running and unlocked:"
    info "  ps aux | grep gnome-keyring-daemon"
    info "If it is not unlocked at login, install/ensure a 'password: ' login keyring exists."
    ;;
  *)
    info "Unknown desktop environment."
    info "Install and run a Secret Service daemon (GNOME Keyring, KWallet, KeePassXC)"
    info "and make sure it is unlocked while the app runs."
    ;;
esac

info ""
info "After fixing, re-run this script. It should print 'Secret Service is reachable'."
exit 1