import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";

export const resend = new Resend(components.resend, { testMode: false });
export const FROM = "Convalytics <notifications@convalytics.dev>";
export const REPLY_TO = ["dancleary54@gmail.com"];
