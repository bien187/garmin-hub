"""garth/garminconnect-Client mit Token-Persistenz in der DB.

Token werden AES-GCM-verschlüsselt in `garmin_tokens` abgelegt, damit nicht
bei jedem Cold Start neu eingeloggt wird (häufige Logins triggern Garmin-
Rate-Limits/Captchas).
"""
import os

from garminconnect import Garmin

from . import crypto


class MfaRequired(Exception):
    """Garmin verlangt einen MFA-Code — Setup unter /settings erledigen."""


class LoginFailed(Exception):
    pass


def _load_token(con):
    rows = con.run("SELECT token_enc FROM garmin_tokens WHERE id = 'default'")
    if not rows:
        return None
    try:
        return crypto.decrypt(rows[0][0])
    except Exception:
        return None


def save_token(con, garmin: Garmin):
    token = garmin.garth.dumps()
    enc = crypto.encrypt(token)
    con.run(
        """
        INSERT INTO garmin_tokens (id, token_enc, aktualisiert)
        VALUES ('default', :t, now())
        ON CONFLICT (id) DO UPDATE SET token_enc = :t, aktualisiert = now()
        """,
        t=enc,
    )


def delete_token(con):
    con.run("DELETE FROM garmin_tokens WHERE id = 'default'")


def _resume_from_token(token: str) -> Garmin:
    g = Garmin()
    g.garth.loads(token)
    try:
        g.display_name = g.garth.profile["displayName"]
        g.full_name = g.garth.profile.get("fullName", "")
    except Exception:
        pass
    return g


def _fresh_login(mfa_code=None) -> Garmin:
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        raise LoginFailed("GARMIN_EMAIL/GARMIN_PASSWORD nicht gesetzt")

    def prompt_mfa():
        if mfa_code:
            return mfa_code
        raise MfaRequired("MFA-Code erforderlich")

    try:
        g = Garmin(email=email, password=password, prompt_mfa=prompt_mfa)
        g.login()
        return g
    except MfaRequired:
        raise
    except Exception as e:  # noqa: BLE001
        if "mfa" in str(e).lower():
            raise MfaRequired("MFA-Code erforderlich") from e
        raise LoginFailed(f"Garmin-Login fehlgeschlagen: {e}") from e


def get_client(con, mfa_code=None) -> Garmin:
    """Client aus persistierten Token; bei Bedarf frischer Login."""
    token = _load_token(con)
    if token and not mfa_code:
        try:
            g = _resume_from_token(token)
            # Leichtgewichtiger Validitätscheck (löst ggf. OAuth2-Refresh aus)
            g.garth.connectapi("/userprofile-service/socialProfile")
            save_token(con, g)  # ggf. refreshte Token sichern
            return g
        except Exception:
            pass  # Token ungültig → frischer Login

    g = _fresh_login(mfa_code=mfa_code)
    save_token(con, g)
    return g
