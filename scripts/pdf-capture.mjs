import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

try {
  const [mode, directory, input] = process.argv.slice(2);
  if (!directory) throw new Error();
  if (mode === "keys") {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const keys = generateKeyPairSync("rsa", { modulusLength: 3072,
      publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    await writeFile(resolve(directory, "private.pem"), keys.privateKey, { flag: "wx", mode: 0o600 });
    await writeFile(resolve(directory, "public.pem"), keys.publicKey, { flag: "wx", mode: 0o600 });
  } else if (mode === "decrypt") {
    const data = JSON.parse(await readFile(input, "utf8"));
    if (data.version !== 1) throw new Error();
    const key = privateDecrypt({ key: await readFile(resolve(directory, "private.pem")),
      padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(data.key, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(data.iv, "base64"));
    decipher.setAuthTag(Buffer.from(data.tag, "base64"));
    const html = Buffer.concat([decipher.update(Buffer.from(data.data, "base64")), decipher.final()]);
    key.fill(0);
    await writeFile(resolve(directory, "real.html"), html, { flag: "wx", mode: 0o600 });
  } else throw new Error();
  console.info("PDF capture operation completed; no document content logged.");
} catch {
  console.error("PDF capture operation failed; details suppressed.");
  process.exitCode = 1;
}
