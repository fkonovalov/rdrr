# Security Policy

## Supported versions

Only the latest minor release of `rdrr` receives security fixes.

| Version                | Supported |
| ---------------------- | --------- |
| Latest published minor | yes       |
| Older minors           | no        |

## Reporting a vulnerability

Please do **not** open public issues for security reports.

Use GitHub's private vulnerability reporting:

1. Go to https://github.com/fkonovalov/rdrr/security/advisories/new
2. Fill in the advisory with a clear reproducer, affected versions, and suggested mitigation if known.

Alternatively, email the maintainer through the address on the GitHub profile at
https://github.com/fkonovalov with subject prefix `[rdrr security]`.

You can expect an initial acknowledgement within 72 hours. Fix timelines depend on severity:

- **Critical** (remote code execution, credential leak): patch within 7 days.
- **High** (SSRF bypass, XSS via markdown output): patch within 14 days.
- **Medium / low**: next scheduled release.

## Scope

### In scope

- SSRF / private-network access via `parse()` or CLI (see `allowPrivateNetworks` option).
- Script injection through markdown output consumed by AI pipelines.
- Dangerous URL schemes surviving sanitisation (`javascript:`, `vbscript:`, `data:text/html`, etc.).
- Authentication credential leakage (`GITHUB_TOKEN`, `githubToken` option).
- Redirect-based attacks (protocol downgrade, open redirect chains).
- Unexpected file access during HTML ingestion.

### Out of scope

- Rate limiting by remote servers (YouTube, GitHub, FxTwitter).
- Content-farm or copyright concerns of extracted pages.
- Denial of service via legitimately large pages within documented limits.
- Bugs in transitive dependencies that do not affect `rdrr` usage.

## Using `rdrr` as a service

If you expose `rdrr` through an HTTP or queue-based service:

- Leave `allowPrivateNetworks: false` (the default). Enable only when you can validate the input domain.
- Run the process with a restricted outbound firewall (deny RFC1918, link-local, loopback, and metadata endpoints).
- Apply a wall-clock timeout on top of the built-in per-fetch timeouts.
- Isolate extraction of untrusted HTML in a worker process when serving multiple tenants. The 20 MiB input limit is not a total memory or CPU limit. PDF parsing is not supported.
- Never forward user-supplied `githubToken` values without validating the caller.

Protected requests validate DNS results in the connection lookup and check each redirect. Cross-origin redirects drop credentials. HTTP/HTML input is bounded to 20 MiB, including decompressed responses. rdrr uses a private Undici dispatcher without changing the global dispatcher. It does not inherit custom global proxy dispatchers; use deployment-level egress controls where needed.
