# Security

Do not include OAuth credentials, tokens or health data in public issues.

Use GitHub's private vulnerability reporting on the repository Security tab if it is enabled. If unavailable, open a public issue containing only a request for a private contact channel; do not disclose exploit details or sensitive data there.

Only local stdio is implemented. The local directory contains tokens and meal-operation records; file permissions/ACLs restrict access but do not encrypt them. Demo mode uses synthetic data.

Revoke a compromised grant in Google Account settings, run disconnect, and reauthorize with trusted credentials. Tests and CI never require personal credentials.
