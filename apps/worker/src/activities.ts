export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId: string;
  timestamp: number;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  console.log(`[Mock Email] To: ${input.to} | Subject: ${input.subject} | Body: ${input.body}`);
  return {
    success: true,
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    timestamp: Date.now(),
  };
}
