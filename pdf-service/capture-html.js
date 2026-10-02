import { createPublicKey, randomBytes, publicEncrypt, createCipheriv, constants } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { isAbsolute } from "node:path";

// Only encrypted bytes reach disk. The private key never belongs on the service.
export function createHtmlCapture(env = process.env, now = Date.now) {
  let used = false;
  const until = Date.parse(env.PDF_CAPTURE_UNTIL || "");
  const output = env.PDF_CAPTURE_OUTPUT;
  let key;
  if (env.PDF_CAPTURE_MODE !== "diagnostic" || !env.PDF_CAPTURE_FILENAME ||
      !output || !isAbsolute(output) || !(until > now() && until - now() <= 15 * 60_000)) return async () => false;
  try {
    key = createPublicKey(env.PDF_CAPTURE_PUBLIC_KEY || "");
    if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 2048) return async () => false;
  } catch { return async () => false; }
  return async (html, filename) => {
    if (used || now() >= until || filename !== env.PDF_CAPTURE_FILENAME) return false;
    used = true; // Reserve before I/O, including concurrent requests and failures.
    try {
      const secret = randomBytes(32), iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", secret, iv);
      const encrypted = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
      const envelope = { version: 1, key: publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, secret).toString("base64"),
        iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
      secret.fill(0);
      await writeFile(output, JSON.stringify(envelope), { flag: "wx", mode: 0o600 });
      const timer = setTimeout(() => { void unlink(output).catch(() => {}); }, Math.max(1, until - now()));
      timer.unref();
      return true;
    } catch { return false; } // No raw exceptions, paths, HTML or credentials in logs.
  };
}
