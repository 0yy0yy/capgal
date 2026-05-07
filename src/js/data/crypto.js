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

   return utf8ToBase64(binary);
}

function base64ToUint8(base64) {
   const binary = base64ToUtf8(base64);
   const len = binary.length;
   const bytes = new Uint8Array(len);

   for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
   }

   return bytes;
}

function utf8ToBase64(str) {
   const bytes = new TextEncoder().encode(str);

   let binary = '';
   const chunkSize = 0x8000;

   for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(
         ...bytes.subarray(i, i + chunkSize)
      );
   }

   return btoa(binary);
}

function base64ToUtf8(base64) {
   const binary = atob(base64);
   const bytes = new Uint8Array(binary.length);

   for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
   }

   return new TextDecoder().decode(bytes);
}

/**
 * Hash a passphrase using SHA-256 (for GitHub filename)
 */
export async function hashPassphrase(passphrase) {
   const encoder = new TextEncoder();
   const data = encoder.encode(passphrase);
   const hashBuffer = await window.crypto.subtle.digest(HASH_ALGORITHM, data);

   // Convert to hex string
   const hashArray = Array.from(new Uint8Array(hashBuffer));
   return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive an encryption key from passphrase using PBKDF2
 */
export async function deriveKey(passphrase, salt) {
   const encoder = new TextEncoder();
   const passphraseKey = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      KEY_DERIVATION_ALGORITHM,
      false,
      ['deriveBits', 'deriveKey']
   );

   return window.crypto.subtle.deriveKey(
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
      false, // extractable if true -- If you don’t actually need to export the key, put false
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
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      // Derive key
      const key = await deriveKey(passphrase, salt);

      // Encrypt
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);
      const ciphertext = await window.crypto.subtle.encrypt(
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

      /* console.log({
         saltLen: encrypted.salt?.length,
         ivLen: encrypted.iv?.length,
         ciphertextLen: encrypted.ciphertext?.length,
         hasNewlines: encrypted.ciphertext?.includes('\n'),
         hasSpaces: encrypted.ciphertext?.includes(' '),
      });
      console.log(typeof encrypted, encrypted); */

      // Decrypt
      const plaintext = await window.crypto.subtle.decrypt(
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
