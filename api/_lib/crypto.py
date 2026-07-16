"""AES-GCM-Verschlüsselung der garth-Token für die DB."""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key() -> bytes:
    hex_key = os.environ.get("TOKEN_ENC_KEY", "")
    if len(hex_key) != 64:
        raise RuntimeError("TOKEN_ENC_KEY muss 64 Hex-Zeichen (32 Byte) sein")
    return bytes.fromhex(hex_key)


def encrypt(plaintext: str) -> str:
    key = _key()
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt(payload: str) -> str:
    key = _key()
    raw = base64.b64decode(payload)
    nonce, ct = raw[:12], raw[12:]
    return AESGCM(key).decrypt(nonce, ct, None).decode("utf-8")
