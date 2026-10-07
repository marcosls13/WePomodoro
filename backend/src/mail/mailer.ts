export interface Mailer {
  send: (to: string, subject: string, text: string) => Promise<void>;
}

// Development mailer: writes the message to the server log instead of sending
// it. Replace it with a real transport (for example SMTP) before deploying,
// since logging reset codes is only acceptable locally.
export const consoleMailer: Mailer = {
  send: (to, subject, text) => {
    console.log(`[dev mail] to=${to} subject=${subject}\n${text}`);
    return Promise.resolve();
  },
};
