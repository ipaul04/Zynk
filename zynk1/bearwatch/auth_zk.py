from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

def verify_zk_proof(pub_key_hex: str, proof_r: str, proof_s: str) -> bool:
    """
    Verify ZK proof: standard ed25519 signature where the signed message is the public key.
    Compatible with @noble/curves ed25519 implementation used in the Zynk1 extension.
    """
    try:
        pub_key_bytes = bytes.fromhex(pub_key_hex)
        signature_bytes = bytes.fromhex(proof_r + proof_s)
        public_key = Ed25519PublicKey.from_public_bytes(pub_key_bytes)
        public_key.verify(signature_bytes, pub_key_bytes)
        return True
    except (InvalidSignature, ValueError, Exception):
        return False
