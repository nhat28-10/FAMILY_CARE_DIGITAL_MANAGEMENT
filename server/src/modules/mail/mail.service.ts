import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Hạ tầng gửi email dùng chung (nodemailer + SMTP). Nếu SMTP chưa được cấu hình
 * (`SMTP_HOST` rỗng — thường ở dev), service KHÔNG gửi mail thật mà ghi nội dung
 * ra log để dev không bị chặn. Mọi lỗi gửi mail đều được nuốt + log, không ném
 * ra ngoài để không làm hỏng luồng nghiệp vụ gọi nó.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const mail = this.config.get<MailConfig>('mail');
    this.from = mail?.from ?? 'Family Care <no-reply@familycare.local>';

    if (mail?.host) {
      this.transporter = nodemailer.createTransport({
        host: mail.host,
        port: mail.port,
        secure: mail.secure,
        auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
      });
    } else {
      this.transporter = null;
      this.logger.warn(
        'SMTP chưa được cấu hình (SMTP_HOST rỗng) — email sẽ được ghi ra log thay vì gửi đi.',
      );
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

  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    if (!this.transporter) {
      // Dev fallback: in nội dung ra log để có thể lấy mã OTP khi test.
      this.logger.log(`[MAIL:DEV] To: ${to} | ${subject}\n${text}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
    } catch (err) {
      this.logger.error(
        `Gửi email tới ${to} thất bại: ${(err as Error).message}`,
      );
    }
  }
}
