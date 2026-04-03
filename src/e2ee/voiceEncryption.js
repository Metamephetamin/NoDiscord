import { ensureE2eeDeviceIdentity } from "./chatEncryption";

const DEVICE_IDENTITY_CURVE = "P-256";
const KEY_DIGEST_LABEL = "nd-e2ee-wrap-v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function importPublicKey(publicKeyJwk) {
  const jwk = typeof publicKeyJwk === "string" ? JSON.parse(publicKeyJwk) : publicKeyJwk;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: DEVICE_IDENTITY_CURVE },
    true,
    []
  );
}

async function deriveWrapKey(privateKey, recipientPublicKeyJwk) {
  const publicKey = await importPublicKey(recipientPublicKeyJwk);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(KEY_DIGEST_LABEL + toBase64(derivedBits))
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function createVoiceChannelPassphrase() {
  return toBase64(randomBytes(32));
}

export async function wrapVoiceChannelPassphrase({ passphrase, recipientPublicKeyJwk, senderIdentity }) {
  const wrapKey = await deriveWrapKey(senderIdentity.privateKey, recipientPublicKeyJwk);
  const wrapIv = randomBytes(12);
  const wrappedKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv },
    wrapKey,
    textEncoder.encode(String(passphrase || ""))
  );

  return {
    senderFingerprint: String(senderIdentity.fingerprint || ""),
    senderPublicKeyJwk: JSON.stringify(senderIdentity.publicKeyJwk),
    wrapIv: toBase64(wrapIv),
    wrappedKey: toBase64(wrappedKey),
  };
}

export async function unwrapVoiceChannelPassphrase({ envelope, user }) {
  const identity = await ensureE2eeDeviceIdentity(user);
  const wrapKey = await deriveWrapKey(identity.privateKey, envelope?.senderPublicKeyJwk);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope?.wrapIv) },
    wrapKey,
    fromBase64(envelope?.wrappedKey)
  );

  return textDecoder.decode(plaintext);
}
