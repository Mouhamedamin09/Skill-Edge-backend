import nodemailer from "nodemailer";

const createTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.AUTH_EMAIL,
      pass: process.env.AUTH_PASS,
    },
  });
};

export const sendVerificationEmail = async (email: string, code: string) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"SkillEdge" <${process.env.AUTH_EMAIL}>`,
    to: email,
    subject: "Verify Your Email - SkillEdge",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">SkillEdge</h1>
          <p style="color: #6b7280; margin: 10px 0 0 0;">AI Interview Assistant</p>
        </div>
        
        <div style="background: #f8fafc; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; text-align: center;">Verify Your Email Address</h2>
          <p style="color: #4b5563; margin: 0 0 20px 0; line-height: 1.6;">
            Thank you for signing up with SkillEdge! To complete your registration and start your interview preparation journey, please verify your email address.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background: #2563eb; color: white; padding: 15px 30px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 3px;">
              ${code}
            </div>
          </div>
          
          <p style="color: #6b7280; margin: 20px 0 0 0; font-size: 14px; text-align: center;">
            This code will expire in 15 minutes.
          </p>
        </div>
        
        <div style="text-align: center; color: #6b7280; font-size: 14px;">
          <p>If you didn't create an account with SkillEdge, please ignore this email.</p>
          <p style="margin: 20px 0 0 0;">
            © 2024 SkillEdge. All rights reserved.
          </p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Email sending failed:", error);
    return { success: false, error };
  }
};

export const sendTestEmail = async (to: string) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"SkillEdge" <${process.env.AUTH_EMAIL}>`,
    to: to,
    subject: "Test Email - SkillEdge",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #2563eb;">Test Email from SkillEdge</h1>
        <p>This is a test email to verify that the email configuration is working correctly.</p>
        <p>If you received this email, the email service is properly configured!</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Test email sending failed:", error);
    return { success: false, error };
  }
};
