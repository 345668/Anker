// Ambient declarations for optional runtime-only dependencies.
// These packages are lazily imported with webpackIgnore/turbopackIgnore
// (see lib/email/imap-poller.ts) and may not be installed. Declaring them
// as `any` keeps typechecking clean without forcing the dependency.
declare module "imapflow"
declare module "mailparser"
