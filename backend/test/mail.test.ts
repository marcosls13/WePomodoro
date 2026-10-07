import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transporter } from "nodemailer";
import { createSmtpMailer, smtpConfigFromEnv } from "../src/mail/smtp.js";

void test("SMTP settings default to Gmail and are validated", () => {
  assert.equal(smtpConfigFromEnv({}), null);
  assert.deepEqual(
    smtpConfigFromEnv({
      SMTP_USER: "me@gmail.com",
      SMTP_PASSWORD: "abcd efgh ijkl mnop",
    }),
    {
      host: "smtp.gmail.com",
      port: 465,
      user: "me@gmail.com",
      password: "abcdefghijklmnop",
      from: "WePomodoro <me@gmail.com>",
    },
  );
  assert.throws(() => smtpConfigFromEnv({ SMTP_USER: "me@gmail.com" }));
  assert.throws(() =>
    smtpConfigFromEnv({
      SMTP_USER: "me@gmail.com",
      SMTP_PASSWORD: "x",
      SMTP_PORT: "99999",
    }),
  );
});

void test("the SMTP mailer sends plain-text mail from the configured sender", async () => {
  const config = smtpConfigFromEnv({
    SMTP_USER: "me@gmail.com",
    SMTP_PASSWORD: "secret",
  });
  assert.ok(config);
  const sent: unknown[] = [];
  const transport = {
    sendMail: (options: unknown) => {
      sent.push(options);
      return Promise.resolve({});
    },
  } as unknown as Transporter;
  const { mailer } = createSmtpMailer(config, transport);
  await mailer.send("friend@example.test", "Hello", "Your code is 123456.");
  assert.deepEqual(sent, [
    {
      from: "WePomodoro <me@gmail.com>",
      to: "friend@example.test",
      subject: "Hello",
      text: "Your code is 123456.",
    },
  ]);
});
