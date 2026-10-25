# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of FaultKit and the safety of your testing environments seriously.

If you believe you have discovered a security vulnerability in FaultKit, please report it responsibly:

1. **Do not disclose the issue publicly** via GitHub Issues, Discussions, or social media.
2. Email your findings directly to `security@faultkit.local` (or file a private GitHub Advisory once repository hosting is configured).
3. Include the following details:
   - A description of the vulnerability and its potential impact.
   - Step-by-step reproduction instructions, a minimal code snippet, or a proof of concept.
   - The version of Node.js and FaultKit you are running.
   - Any suggested mitigations or patches if available.

### Response Time

You can expect an initial acknowledgment within 48 hours. We will keep you informed of our progress as we investigate and develop a fix.

## Security Principles in FaultKit

- **Zero Telemetry:** FaultKit never sends network telemetry, crash reports, or analytics anywhere.
- **In-Process Only:** FaultKit operates purely in-memory within your test process; it never opens TCP ports or starts background servers.
- **Credential Redaction:** By default, common authorization credentials, tokens, cookies, and secret headers are redacted from diagnostic reports.
- **Safe Sandboxing:** FaultKit rejects malicious, infinite, or dangerous configuration inputs before scenario activation.
