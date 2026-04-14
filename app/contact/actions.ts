"use server";

import { sql } from "@/lib/db";

export async function submitContactForm(formData: {
  name: string;
  email: string;
  company?: string;
  inquiryType: string;
  message: string;
}) {
  try {
    // Parse name into first and last
    const nameParts = formData.name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || null;

    // Create a contact inquiry record
    await sql`
      INSERT INTO outreaches (
        type,
        status,
        subject,
        body,
        recipient_email,
        recipient_name,
        created_at,
        updated_at
      ) VALUES (
        'inbound',
        'pending',
        ${`[${formData.inquiryType}] Contact Form Submission`},
        ${`From: ${formData.name} (${formData.email})${formData.company ? `\nCompany: ${formData.company}` : ''}\n\nMessage:\n${formData.message}`},
        ${formData.email},
        ${formData.name},
        NOW(),
        NOW()
      )
    `;

    return { success: true, message: "Thank you for your message. We'll be in touch shortly." };
  } catch (error) {
    console.error("Error submitting contact form:", error);
    return { success: false, message: "There was an error submitting your message. Please try again." };
  }
}
