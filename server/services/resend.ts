// Resend email service for password reset and transactional emails
// Uses Replit Resend connector integration

import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email
  };
}

// Get a fresh Resend client (never cache - tokens expire)
export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || 'noreply@resend.dev'
  };
}

// Send password reset email
export async function sendPasswordResetEmail(
  toEmail: string, 
  resetLink: string,
  userName?: string
) {
  const { client, fromEmail } = await getResendClient();
  
  const displayName = userName || 'there';
  
  const { data, error } = await client.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: 'Reset Your Password - Anker',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #121212; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, rgba(142,132,247,0.1) 0%, rgba(251,194,213,0.1) 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px;">
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 24px 0; text-align: center;">
                Reset Your Password
              </h1>
              
              <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Hi ${displayName},
              </p>
              
              <p style="color: rgba(255,255,255,0.7); font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                We received a request to reset your password for your Anker account. Click the button below to create a new password:
              </p>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, rgb(142,132,247) 0%, rgb(251,194,213) 100%); color: #000000; font-weight: 600; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">
                  Reset Password
                </a>
              </div>
              
              <p style="color: rgba(255,255,255,0.5); font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
              
              <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 32px 0;">
              
              <p style="color: rgba(255,255,255,0.4); font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetLink}" style="color: rgb(142,132,247); word-break: break-all;">${resetLink}</a>
              </p>
            </div>
            
            <p style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; margin-top: 24px;">
              Anker Venture Capital Platform
            </p>
          </div>
        </body>
      </html>
    `,
  });
  
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
  
  return data;
}
