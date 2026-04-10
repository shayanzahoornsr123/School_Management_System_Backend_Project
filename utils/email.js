const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_EMAIL,       // Your Gmail
    pass: process.env.GMAIL_APP_PASSWORD // App password
  }
});

const sendEmail = async ({ to, subject, text, html }) => {
  const mailOptions = {
    from: process.env.GMAIL_EMAIL,
    to,
    subject,
    text,
    html,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
