import { createCipheriv, createHash, createHmac, randomBytes } from 'crypto';

const ENCRYPTION_VERSION = 'v1';
const KEY_MATERIAL_PREFIX = '18ways:key-material';
const MAC_MESSAGE_PREFIX = '18ways:mac';

const toBase64Url = (data: Buffer): string =>
  data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const deriveKeys = (sourceText: string): { encryptionKey: Buffer; macKey: Buffer } => {
  const keyMaterial = createHash('sha512')
    .update(`${KEY_MATERIAL_PREFIX}:${sourceText}`, 'utf8')
    .digest();

  return {
    encryptionKey: keyMaterial.subarray(0, 32),
    macKey: keyMaterial.subarray(32, 64),
  };
};

const buildMacInput = (aad: string, iv: Buffer, ciphertext: Buffer): Buffer =>
  Buffer.concat([Buffer.from(`${MAC_MESSAGE_PREFIX}|${aad}|`, 'utf8'), iv, ciphertext]);

export const encryptTranslationValue = ({
  translatedText,
  sourceText,
  locale,
  key,
  textHash,
}: {
  translatedText: string;
  sourceText: string;
  locale: string;
  key: string;
  textHash: string;
}): string => {
  const { encryptionKey, macKey } = deriveKeys(sourceText);
  const aad = `${ENCRYPTION_VERSION}|${locale}|${key}|${textHash}`;
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(translatedText, 'utf8'), cipher.final()]);
  const mac = createHmac('sha256', macKey)
    .update(buildMacInput(aad, iv, ciphertext))
    .digest();

  return `${ENCRYPTION_VERSION}.${toBase64Url(iv)}.${toBase64Url(mac)}.${toBase64Url(ciphertext)}`;
};
