# 13. Virus scanning: runbook

*Closes the gap "attachments get no virus scanning" (question 15). Built and tested against a stand-in for the daemon (`lib/investor/scan.ts`, `ops/clamav/docker-compose.yml`). **Not yet run against a real ClamAV.***

## What it does
Before any file is stored, whether a message attachment or a passport document, the application streams it to a ClamAV daemon you run (the `INSTREAM` protocol over TCP). An infected file is refused with a plain message. Files are never sent to a third party. The scanner keeps nothing.

## Settings (environment)
| Variable | Meaning |
| --- | --- |
| `INVESTOR_SCAN` | `off` (default): no scanning. `optional`: scan when a scanner is configured; an infected file is always refused; if the scanner cannot be reached the file is accepted and a warning is logged. **`required`: if the scanner is missing or unreachable the upload is refused (fail closed).** |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Where the daemon listens (port default 3310). |
The conversation screen says "Files are scanned for viruses before they are stored" only when scanning is actually on and a scanner is configured; otherwise it says Anker is not a virus scanner.

## Running ClamAV
1. On a small private server in the EU, `docker compose -f ops/clamav/docker-compose.yml up -d` (the file binds the daemon to localhost; publish it only to a private interface). The daemon has **no authentication**: allow connections only from the application's egress addresses.
2. Wait for the first signature update (a few minutes), then `echo PING | nc <host> 3310` should answer `PONG`.
3. Set `CLAMAV_HOST` (and the port if not 3310) in the hosting environment and `INVESTOR_SCAN=optional`. Test by sending the standard EICAR test file as an attachment: it must be refused.
4. When satisfied, set `INVESTOR_SCAN=required` so that an outage stops uploads rather than letting files through unscanned.
5. Monitor the daemon's health (the compose file has a health check) and keep it updated (the image refreshes signatures itself).

## Limits, stated plainly
A signature scanner misses new or targeted malware. The existing content checks (type read from the bytes, active-content PDFs refused) stay. Serverless hosting must be able to reach the daemon; a daemon on a private network may need a tunnel or an allow-list of the platform's egress addresses. Large files cost time: the limit is 4 MB.
