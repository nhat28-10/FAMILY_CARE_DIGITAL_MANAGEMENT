import { randomBytes } from 'node:crypto';

/** Alphabet 32 ký tự, bỏ I/O/0/1 để tránh đọc nhầm khi chia sẻ miệng. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

/** Sinh mã mời ngắn crypto-safe (32^8 ≈ 1.1e12 khả năng). */
export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    // 32 ký tự chia hết 256 → lấy modulo không bị lệch phân phối.
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return code;
}
