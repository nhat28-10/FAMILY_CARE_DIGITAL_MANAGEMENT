import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface MailConfig {
  /** 'resend' | 'brevo' | 'smtp' | '' (auto-detect khi rỗng). */
  provider: string;
  from: string;
  resendApiKey: string;
  brevoApiKey: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

type Provider = 'resend' | 'brevo' | 'smtp' | 'none';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Hạ tầng gửi email dùng chung. Hỗ trợ 3 kênh:
 *  - **Resend HTTP API** (cổng 443) — chạy được trên VPS chặn cổng SMTP (vd AZDIGI).
 *  - **Brevo HTTP API** (cổng 443) — lựa chọn thay thế.
 *  - **SMTP** (nodemailer) — tiện cho dev local (Gmail/Mailtrap).
 *
 * Chọn kênh tự động: có `RESEND_API_KEY` → resend; `BREVO_API_KEY` → brevo;
 * `SMTP_HOST` → smtp; không có gì → ghi nội dung ra log (dev không bị chặn).
 * Có thể ép kênh bằng `MAIL_PROVIDER`. Mọi lỗi gửi đều được nuốt + log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: Provider;
  private readonly cfg: MailConfig;
  private readonly transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.cfg = {
      provider: this.config.get<string>('mail.provider', ''),
      from: this.config.get<string>(
        'mail.from',
        'Family Care <onboarding@resend.dev>',
      ),
      resendApiKey: this.config.get<string>('mail.resendApiKey', ''),
      brevoApiKey: this.config.get<string>('mail.brevoApiKey', ''),
      host: this.config.get<string>('mail.host', ''),
      port: this.config.get<number>('mail.port', 587),
      secure: this.config.get<boolean>('mail.secure', false),
      user: this.config.get<string>('mail.user', ''),
      pass: this.config.get<string>('mail.pass', ''),
    };

    this.provider = this.resolveProvider();

    // Cảnh báo cấu hình: provider ép nhưng thiếu credential.
    if (this.provider === 'resend' && !this.cfg.resendApiKey) {
      this.logger.warn(
        'MAIL_PROVIDER=resend nhưng thiếu RESEND_API_KEY — gửi mail sẽ thất bại (bị nuốt lỗi).',
      );
    }
    if (this.provider === 'brevo' && !this.cfg.brevoApiKey) {
      this.logger.warn(
        'MAIL_PROVIDER=brevo nhưng thiếu BREVO_API_KEY — gửi mail sẽ thất bại (bị nuốt lỗi).',
      );
    }
    // Cảnh báo dùng sender mặc định resend.dev — chỉ gửi được tới email chủ tài khoản Resend.
    if (this.provider === 'resend' && this.cfg.from.includes('onboarding@resend.dev')) {
      this.logger.warn(
        'Đang dùng sender mặc định onboarding@resend.dev — Resend chỉ gửi tới email chủ tài khoản. Đặt MAIL_FROM bằng domain đã verify cho production.',
      );
    }

    if (this.provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: this.cfg.host,
        port: this.cfg.port,
        secure: this.cfg.secure,
        auth: this.cfg.user
          ? { user: this.cfg.user, pass: this.cfg.pass }
          : undefined,
      });
    } else if (this.provider === 'none') {
      this.logger.warn(
        'Chưa cấu hình kênh gửi mail (RESEND_API_KEY / BREVO_API_KEY / SMTP_HOST đều rỗng) — email sẽ được ghi ra log thay vì gửi đi.',
      );
    } else {
      this.logger.log(`MailService dùng kênh ${this.provider}.`);
    }
  }

  /** Gửi mã OTP xác thực tài khoản (6 số). */
  async sendVerificationOtp(to: string, code: string): Promise<void> {
    const subject = 'Mã xác thực tài khoản Family Care';
    const text =
      `Mã xác thực tài khoản của bạn là: ${code}\n` +
      `Mã có hiệu lực trong vài phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.`;
    const html =
      `<p>Mã xác thực tài khoản của bạn là:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>` +
      `<p>Mã có hiệu lực trong vài phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>`;

    await this.send(to, subject, text, html);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private resolveProvider(): Provider {
    const explicit = this.cfg.provider.toLowerCase();
    if (explicit === 'resend') return 'resend';
    if (explicit === 'brevo') return 'brevo';
    if (explicit === 'smtp') return 'smtp';
    if (this.cfg.resendApiKey) return 'resend';
    if (this.cfg.brevoApiKey) return 'brevo';
    if (this.cfg.host) return 'smtp';
    return 'none';
  }

  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    try {
      if (this.provider === 'resend') {
        await this.sendViaResend(to, subject, text, html);
      } else if (this.provider === 'brevo') {
        await this.sendViaBrevo(to, subject, text, html);
      } else if (this.provider === 'smtp') {
        await this.sendViaSmtp(to, subject, text, html);
      } else {
        // Dev fallback: in nội dung ra log để lấy được mã OTP khi test.
        this.logger.log(`[MAIL:DEV] To: ${to} | ${subject}\n${text}`);
      }
    } catch (err) {
      this.logger.error(
        `Gửi email tới ${to} thất bại: ${(err as Error).message}`,
      );
    }
  }

  private async sendViaResend(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.cfg.resendApiKey}`,
        'content-type': 'application/json',
      },
      // Resend nhận trực tiếp chuỗi "Tên <email>" cho `from`.
      body: JSON.stringify({
        from: this.cfg.from,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend API ${res.status}: ${body}`);
    }
  }

  private async sendViaBrevo(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const sender = this.parseFrom(this.cfg.from);
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': this.cfg.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo API ${res.status}: ${body}`);
    }
  }

  private async sendViaSmtp(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP transporter chưa được khởi tạo');
    }
    await this.transporter.sendMail({
      from: this.cfg.from,
      to,
      subject,
      text,
      html,
    });
  }

  /** Tách "Tên <email>" thành { name, email } cho Brevo. */
  private parseFrom(from: string): { name: string; email: string } {
    const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    if (match) {
      return { name: match[1] || 'Family Care', email: match[2].trim() };
    }
    return { name: 'Family Care', email: from.trim() };
  }
}
