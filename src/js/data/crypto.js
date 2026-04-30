// ── Web Crypto utilities for encryption/decryption ──────────────────────────
import { saveToIndexDB, loadFromIndexDB } from './indexdb.js';

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_DERIVATION_ALGORITHM = 'PBKDF2';
const HASH_ALGORITHM = 'SHA-256';

function uint8ToBase64(u8) {
   let binary = '';
   const chunkSize = 0x8000;

   for (let i = 0; i < u8.length; i += chunkSize) {
      binary += String.fromCharCode(...u8.subarray(i, i + chunkSize));
   }

   return btoa(binary);
}

function base64ToUint8(base64) {
   const binary = atob(base64);
   const len = binary.length;
   const bytes = new Uint8Array(len);

   for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
   }

   return bytes;
}

/**
 * Hash a passphrase using SHA-256 (for GitHub filename)
 */
export async function hashPassphrase(passphrase) {
   const encoder = new TextEncoder();
   const data = encoder.encode(passphrase);
   const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, data);

   // Convert to hex string
   const hashArray = Array.from(new Uint8Array(hashBuffer));
   return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive an encryption key from passphrase using PBKDF2
 */
export async function deriveKey(passphrase, salt) {
   const encoder = new TextEncoder();
   const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      KEY_DERIVATION_ALGORITHM,
      false,
      ['deriveBits', 'deriveKey']
   );

   return crypto.subtle.deriveKey(
      {
         name: KEY_DERIVATION_ALGORITHM,
         salt: salt,
         iterations: 100000,
         hash: HASH_ALGORITHM,
      },
      passphraseKey,
      {
         name: ENCRYPTION_ALGORITHM,
         length: 256,
      },
      true, // extractable -- If you don’t actually need to export the key, put false
      ['encrypt', 'decrypt']
   );
}

/**
 * Encrypt data with passphrase
 * Returns { iv, ciphertext, salt } all base64-encoded
 */
export async function encrypt(plaintext, passphrase) {
   try {
      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Derive key
      const key = await deriveKey(passphrase, salt);

      // Encrypt
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);
      const ciphertext = await crypto.subtle.encrypt(
         {
            name: ENCRYPTION_ALGORITHM,
            iv: iv,
         },
         key,
         data
      );

      // Return base64-encoded
      return {
         iv: uint8ToBase64(iv),
         ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
         salt: uint8ToBase64(salt),
      };
   } catch (error) {
      console.error('Encryption error:', error);
      throw error;
   }
}

/**
 * Decrypt data with passphrase
 */
export async function decrypt(encrypted, passphrase) {
   try {
      // Decode from base64
      const salt = base64ToUint8(encrypted.salt);
      const iv = base64ToUint8(encrypted.iv);
      const ciphertext = base64ToUint8(encrypted.ciphertext);

      // Derive key
      const key = await deriveKey(passphrase, salt);

      // Decrypt
      const plaintext = await crypto.subtle.decrypt(
         {
            name: ENCRYPTION_ALGORITHM,
            iv: iv,
         },
         key,
         ciphertext
      );

      // Decode to string
      const decoder = new TextDecoder();
      return decoder.decode(plaintext);
   } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Decryption failed - incorrect passphrase or corrupted data');
   }
}
