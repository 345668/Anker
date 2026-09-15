"use client";
import { Printer, SlidersHorizontal } from "lucide-react";
import { openCookiePreferences } from "@/lib/consent";

export function PrivacyActions({ className }: { className: string }) {
  return <div className={className} aria-label="Privacy document actions">
    <button type="button" onClick={openCookiePreferences}><SlidersHorizontal size={16} aria-hidden="true" />Manage cookie preferences</button>
    <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print policy</button>
  </div>;
}
