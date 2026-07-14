import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
} from './invite-code.util';

describe('generateInviteCode', () => {
  it('sinh mã đúng độ dài 8', () => {
    expect(generateInviteCode()).toHaveLength(INVITE_CODE_LENGTH);
  });

  it('chỉ dùng ký tự trong alphabet (không I/O/0/1)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      for (const ch of code) {
        expect(INVITE_CODE_ALPHABET).toContain(ch);
      }
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('các mã sinh ra khác nhau (xác suất trùng cực thấp)', () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => generateInviteCode()),
    );
    expect(codes.size).toBe(1000);
  });
});
